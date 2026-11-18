const db = require('../../infrastructure/database/db.client');

const DEVICE_WITH_EVENT_SELECT = `
  SELECT
    d.id,
    d.mac_address,
    d.name,
    d.hardware,
    d.status,
    d.pairing_code,
    d.claim_token_hash,
    d.pairing_expires_at,
    d.secret_hash,
    d.pending_secret_plain,
    d.pending_secret_expires_at,
    d.assigned_event_id,
    d.assigned_gate_id,
    COALESCE(eg.name, d.assigned_gate) AS assigned_gate,
    d.auto_confirm,
    d.config_version,
    d.firmware_version,
    d.last_ip,
    d.last_rssi,
    d.last_free_heap,
    d.last_uptime_sec,
    d.last_seen_at,
    d.created_at,
    d.updated_at,
    e.slug AS event_code,
    e.title AS event_name
  FROM checkin_devices d
  LEFT JOIN events e ON e.id = d.assigned_event_id AND e.deleted_at IS NULL
  LEFT JOIN event_gates eg ON eg.id = d.assigned_gate_id
`;

class IotRepository {
  async findByMac(macAddress) {
    const { rows } = await db.query(
      `${DEVICE_WITH_EVENT_SELECT} WHERE d.mac_address = $1 LIMIT 1`,
      [macAddress],
    );
    return rows[0] || null;
  }

  async findById(deviceId) {
    const { rows } = await db.query(
      `${DEVICE_WITH_EVENT_SELECT} WHERE d.id = $1 LIMIT 1`,
      [deviceId],
    );
    return rows[0] || null;
  }

  async pairingCodeExists(code) {
    const { rows } = await db.query(
      `
      SELECT 1
      FROM checkin_devices
      WHERE pairing_code = $1
        AND status = 'PENDING'
        AND (pairing_expires_at IS NULL OR pairing_expires_at > now())
      LIMIT 1
      `,
      [code],
    );
    return rows.length > 0;
  }

  async upsertPendingDevice({
    macAddress,
    hardware,
    firmwareVersion,
    pairingCode,
    claimTokenHash,
    pairingExpiresAt,
    lastIp,
  }) {
    const { rows } = await db.query(
      `
      INSERT INTO checkin_devices (
        mac_address,
        hardware,
        firmware_version,
        status,
        pairing_code,
        claim_token_hash,
        pairing_expires_at,
        secret_hash,
        pending_secret_plain,
        pending_secret_expires_at,
        last_ip,
        last_seen_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, NULL, NULL, NULL, $7, now(), now())
      ON CONFLICT (mac_address)
      DO UPDATE SET
        hardware = COALESCE(EXCLUDED.hardware, checkin_devices.hardware),
        firmware_version = COALESCE(EXCLUDED.firmware_version, checkin_devices.firmware_version),
        status = 'PENDING',
        pairing_code = EXCLUDED.pairing_code,
        claim_token_hash = EXCLUDED.claim_token_hash,
        pairing_expires_at = EXCLUDED.pairing_expires_at,
        secret_hash = NULL,
        pending_secret_plain = NULL,
        pending_secret_expires_at = NULL,
        assigned_event_id = CASE
          WHEN checkin_devices.status = 'REVOKED' THEN NULL
          ELSE checkin_devices.assigned_event_id
        END,
        assigned_gate_id = CASE
          WHEN checkin_devices.status = 'REVOKED' THEN NULL
          ELSE checkin_devices.assigned_gate_id
        END,
        assigned_gate = CASE
          WHEN checkin_devices.status = 'REVOKED' THEN NULL
          ELSE checkin_devices.assigned_gate
        END,
        auto_confirm = CASE
          WHEN checkin_devices.status = 'REVOKED' THEN false
          ELSE checkin_devices.auto_confirm
        END,
        last_ip = COALESCE(EXCLUDED.last_ip, checkin_devices.last_ip),
        last_seen_at = now(),
        updated_at = now()
      RETURNING *
      `,
      [
        macAddress,
        hardware || null,
        firmwareVersion || null,
        pairingCode,
        claimTokenHash,
        pairingExpiresAt,
        lastIp || null,
      ],
    );
    return rows[0];
  }

  async claimPendingSecretAtomic(deviceId, lastIp) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `
        SELECT
          d.*,
          COALESCE(eg.name, d.assigned_gate) AS assigned_gate,
          e.slug AS event_code,
          e.title AS event_name
        FROM checkin_devices d
        LEFT JOIN events e ON e.id = d.assigned_event_id AND e.deleted_at IS NULL
        LEFT JOIN event_gates eg ON eg.id = d.assigned_gate_id
        WHERE d.id = $1
        FOR UPDATE OF d
        `,
        [deviceId],
      );

      const device = lockRes.rows[0];
      if (!device || device.status !== 'ACTIVE' || !device.pending_secret_plain) {
        await client.query('ROLLBACK');
        return { state: 'UNAVAILABLE' };
      }

      if (
        device.pending_secret_expires_at
        && new Date(device.pending_secret_expires_at).getTime() <= Date.now()
      ) {
        await client.query(
          `
          UPDATE checkin_devices
          SET pending_secret_plain = NULL,
              pending_secret_expires_at = NULL,
              claim_token_hash = NULL,
              updated_at = now()
          WHERE id = $1
          `,
          [deviceId],
        );
        await client.query('COMMIT');
        return { state: 'EXPIRED' };
      }

      const plainSecret = device.pending_secret_plain;

      await client.query(
        `
        UPDATE checkin_devices
        SET pending_secret_plain = NULL,
            pending_secret_expires_at = NULL,
            claim_token_hash = NULL,
            pairing_code = NULL,
            pairing_expires_at = NULL,
            last_ip = COALESCE($2, last_ip),
            last_seen_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [deviceId, lastIp || null],
      );

      await client.query('COMMIT');
      return {
        state: 'CLAIMED',
        device,
        deviceSecret: plainSecret,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateHeartbeat(deviceId, { rssi, ip, freeHeap, uptimeSec, firmwareVersion }) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices d
      SET last_seen_at = now(),
          last_ip = COALESCE($2, d.last_ip),
          last_rssi = COALESCE($3, d.last_rssi),
          last_free_heap = COALESCE($4, d.last_free_heap),
          last_uptime_sec = COALESCE($5, d.last_uptime_sec),
          firmware_version = COALESCE($6, d.firmware_version),
          updated_at = now()
      WHERE d.id = $1
      RETURNING d.id
      `,
      [
        deviceId,
        ip || null,
        rssi ?? null,
        freeHeap ?? null,
        uptimeSec ?? null,
        firmwareVersion || null,
      ],
    );

    if (!rows[0]) return null;
    return this.findById(deviceId);
  }

  async updateHeartbeatWithAutoConfirm(
    deviceId,
    { rssi, ip, freeHeap, uptimeSec, firmwareVersion, autoConfirm, expectedConfigVersion },
  ) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `
        UPDATE checkin_devices d
        SET auto_confirm = $2,
            config_version = d.config_version + 1,
            last_seen_at = now(),
            last_ip = COALESCE($3, d.last_ip),
            last_rssi = COALESCE($4, d.last_rssi),
            last_free_heap = COALESCE($5, d.last_free_heap),
            last_uptime_sec = COALESCE($6, d.last_uptime_sec),
            firmware_version = COALESCE($7, d.firmware_version),
            updated_at = now()
        WHERE d.id = $1
          AND d.config_version = $8
          AND d.status = 'ACTIVE'
        RETURNING d.id
        `,
        [
          deviceId,
          Boolean(autoConfirm),
          ip || null,
          rssi ?? null,
          freeHeap ?? null,
          uptimeSec ?? null,
          firmwareVersion || null,
          expectedConfigVersion,
        ],
      );

      let applied = Boolean(updateRes.rows[0]);

      if (!applied) {
        await client.query(
          `
          UPDATE checkin_devices d
          SET last_seen_at = now(),
              last_ip = COALESCE($2, d.last_ip),
              last_rssi = COALESCE($3, d.last_rssi),
              last_free_heap = COALESCE($4, d.last_free_heap),
              last_uptime_sec = COALESCE($5, d.last_uptime_sec),
              firmware_version = COALESCE($6, d.firmware_version),
              updated_at = now()
          WHERE d.id = $1
          `,
          [
            deviceId,
            ip || null,
            rssi ?? null,
            freeHeap ?? null,
            uptimeSec ?? null,
            firmwareVersion || null,
          ],
        );
      }

      const freshRes = await client.query(
        `${DEVICE_WITH_EVENT_SELECT} WHERE d.id = $1 LIMIT 1`,
        [deviceId],
      );

      await client.query('COMMIT');
      const freshDevice = freshRes.rows[0] || null;
      if (
        !applied
        && freshDevice
        && freshDevice.status === 'ACTIVE'
        && Boolean(freshDevice.auto_confirm) === Boolean(autoConfirm)
      ) {
        applied = true;
      }

      return {
        applied,
        device: freshDevice,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordScanLog({
    deviceId,
    eventId,
    ticketId,
    ticketCode,
    qrCodeRaw,
    action,
    result,
    success,
    message,
    attendeeName,
    gateId = null,
    gateName = null,
  }) {
    const { rows } = await db.query(
      `
      INSERT INTO checkin_device_logs (
        device_id,
        event_id,
        ticket_id,
        ticket_code,
        qr_code_raw,
        action,
        result,
        success,
        message,
        attendee_name,
        gate_id,
        gate_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, scanned_at
      `,
      [
        deviceId,
        eventId || null,
        ticketId || null,
        ticketCode || null,
        qrCodeRaw || null,
        action || 'auto',
        result,
        Boolean(success),
        message || null,
        attendeeName || null,
        gateId || null,
        gateName || null,
      ],
    );
    return rows[0];
  }

  async queryDeviceHistory(
    deviceId,
    {
      page = 1,
      limit = 20,
      result = 'ALL',
      source = 'ALL',
      search = '',
      eventId = '',
      includeSharedGate = false,
      assignedEventId = null,
      assignedGateId = null,
      assignedGate = null,
    } = {},
  ) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;
    const normalizedResult = String(result || 'ALL').trim().toUpperCase();
    const normalizedSource = ['STAFF', 'IOT'].includes(String(source || 'ALL').trim().toUpperCase())
      ? String(source).trim().toUpperCase()
      : 'ALL';
    const trimmedSearch = String(search || '').trim();

    const useSharedGate = Boolean(
      includeSharedGate
      && assignedEventId
      && (assignedGateId || (assignedGate && String(assignedGate).trim())),
    );

    if (useSharedGate) {
      const params = [
        deviceId,
        assignedEventId,
        assignedGateId || null,
        assignedGate ? String(assignedGate).trim() : null,
      ];
      const conditions = [];

      if (normalizedResult === 'SUCCESS') {
        conditions.push('combined.success = true');
      } else if (normalizedResult === 'FAILED') {
        conditions.push('combined.success = false');
      } else if (normalizedResult && normalizedResult !== 'ALL') {
        params.push(normalizedResult);
        conditions.push(`combined.result = $${params.length}`);
      }

      if (eventId) {
        params.push(eventId);
        conditions.push(`combined.event_id = $${params.length}`);
      }

      if (normalizedSource !== 'ALL') {
        params.push(normalizedSource);
        conditions.push(`combined.source = $${params.length}`);
      }

      if (trimmedSearch) {
        params.push(`%${trimmedSearch}%`);
        const p = `$${params.length}`;
        conditions.push(
          `(COALESCE(combined.ticket_code, '') ILIKE ${p} OR COALESCE(combined.attendee_name, '') ILIKE ${p} OR COALESCE(combined.qr_code_raw, '') ILIKE ${p} OR COALESCE(combined.message, '') ILIKE ${p} OR COALESCE(combined.actor_name, '') ILIKE ${p})`,
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const combinedCte = `
        WITH combined AS (
          SELECT
            l.id,
            l.device_id,
            CASE
              WHEN l.source = 'STAFF' OR (l.device_id IS NULL AND l.staff_id IS NOT NULL) THEN 'STAFF'::text
              ELSE 'IOT'::text
            END AS source,
            CASE
              WHEN l.source = 'STAFF' OR (l.device_id IS NULL AND l.staff_id IS NOT NULL)
                THEN COALESCE(staff_u.full_name, staff_u.email, 'Staff')
              ELSE COALESCE(dev.name, dev.mac_address)
            END AS actor_name,
            COALESCE(lg.name, l.gate_name, deg.name, dev.assigned_gate, log_es_gate.name, log_es.gate) AS gate_name,
            COALESCE(l.event_id, dev.assigned_event_id) AS event_id,
            l.ticket_id,
            COALESCE(l.ticket_code, t.ticket_code, l.qr_code_raw) AS ticket_code,
            l.qr_code_raw,
            l.action,
            l.result,
            l.success,
            l.message,
            COALESCE(l.attendee_name, t.attendee_name, o.buyer_name) AS attendee_name,
            COALESCE(t.attendee_email, o.buyer_email) AS attendee_email,
            tt.name AS ticket_type_name,
            CASE
              WHEN s.row_label IS NOT NULL OR s.seat_number IS NOT NULL
                THEN CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, ''))
              ELSE NULL
            END AS seat_label,
            e.title AS event_title,
            e.slug AS event_code,
            l.scanned_at
          FROM checkin_device_logs l
          LEFT JOIN checkin_devices dev ON dev.id = l.device_id
          LEFT JOIN users staff_u ON staff_u.id = l.staff_id
          LEFT JOIN event_staffs log_es ON log_es.event_id = COALESCE(l.event_id, dev.assigned_event_id) AND log_es.staff_id = l.staff_id
          LEFT JOIN event_gates log_es_gate ON log_es_gate.id = log_es.gate_id
          LEFT JOIN event_gates deg ON deg.id = dev.assigned_gate_id
          LEFT JOIN event_gates lg ON lg.id = l.gate_id
          LEFT JOIN events e ON e.id = COALESCE(l.event_id, dev.assigned_event_id)
          LEFT JOIN tickets t ON t.id = l.ticket_id
          LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
          LEFT JOIN order_items oi ON oi.id = t.order_item_id
          LEFT JOIN orders o ON o.id = oi.order_id
          LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
          LEFT JOIN seats s ON s.id = ss.seat_id
          WHERE l.device_id = $1
             OR (
               COALESCE(l.event_id, dev.assigned_event_id) = $2::uuid
               AND (
                 ($3::uuid IS NOT NULL AND COALESCE(l.gate_id, dev.assigned_gate_id, log_es.gate_id) = $3::uuid)
                 OR ($4::text IS NOT NULL AND LOWER(TRIM(COALESCE(lg.name, l.gate_name, deg.name, dev.assigned_gate, log_es_gate.name, log_es.gate, ''))) = LOWER(TRIM($4::text)))
               )
             )

          UNION ALL

          SELECT
            t.id,
            NULL::uuid AS device_id,
            'STAFF'::text AS source,
            COALESCE(u.full_name, u.email, 'Staff') AS actor_name,
            COALESCE(tg.name, t.checked_in_gate, esg.name, es.gate) AS gate_name,
            t.event_id,
            t.id AS ticket_id,
            t.ticket_code,
            NULL::varchar AS qr_code_raw,
            LOWER(COALESCE(t.checkin_method, 'QR')) AS action,
            'OK'::varchar AS result,
            true AS success,
            ('Staff check-in: ' || COALESCE(u.full_name, u.email, 'Staff'))::varchar AS message,
            COALESCE(t.attendee_name, o.buyer_name) AS attendee_name,
            COALESCE(t.attendee_email, o.buyer_email) AS attendee_email,
            tt.name AS ticket_type_name,
            CASE
              WHEN s.row_label IS NOT NULL OR s.seat_number IS NOT NULL
                THEN CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, ''))
              ELSE NULL
            END AS seat_label,
            e.title AS event_title,
            e.slug AS event_code,
            COALESCE(t.checked_in_at, t.created_at) AS scanned_at
          FROM tickets t
          JOIN events e ON e.id = t.event_id
          LEFT JOIN users u ON u.id = t.checked_in_by
          LEFT JOIN event_staffs es ON es.event_id = t.event_id AND es.staff_id = t.checked_in_by
          LEFT JOIN event_gates esg ON esg.id = es.gate_id
          LEFT JOIN event_gates tg ON tg.id = t.checked_in_gate_id
          LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
          LEFT JOIN order_items oi ON oi.id = t.order_item_id
          LEFT JOIN orders o ON o.id = oi.order_id
          LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
          LEFT JOIN seats s ON s.id = ss.seat_id
          WHERE t.event_id = $2::uuid
            AND t.status = 'USED'
            AND t.checked_in_by IS NOT NULL
            AND t.checked_in_device_id IS NULL
            AND (
              ($3::uuid IS NOT NULL AND COALESCE(t.checked_in_gate_id, es.gate_id) = $3::uuid)
              OR ($4::text IS NOT NULL AND LOWER(TRIM(COALESCE(tg.name, t.checked_in_gate, esg.name, es.gate, ''))) = LOWER(TRIM($4::text)))
            )
            AND NOT EXISTS (
              SELECT 1
              FROM checkin_device_logs cl
              WHERE cl.ticket_id = t.id
                AND cl.result = 'OK'
                AND (cl.source = 'STAFF' OR cl.staff_id IS NOT NULL)
            )
        )
      `;

      const countQuery = `${combinedCte} SELECT COUNT(*)::int AS total FROM combined ${whereClause}`;
      const listParams = [...params, safeLimit, offset];
      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;
      const listQuery = `
        ${combinedCte}
        SELECT *
        FROM combined
        ${whereClause}
        ORDER BY combined.scanned_at DESC NULLS LAST
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const [countRes, listRes] = await Promise.all([
        db.query(countQuery, params),
        db.query(listQuery, listParams),
      ]);

      const total = countRes.rows[0]?.total || 0;
      return {
        items: listRes.rows,
        total,
        page: safePage,
        limit: safeLimit,
        total_pages: Math.max(1, Math.ceil(total / safeLimit)),
      };
    }

    const conditions = ['l.device_id = $1'];
    const params = [deviceId];

    if (normalizedResult === 'SUCCESS') {
      conditions.push('l.success = true');
    } else if (normalizedResult === 'FAILED') {
      conditions.push('l.success = false');
    } else if (normalizedResult && normalizedResult !== 'ALL') {
      params.push(normalizedResult);
      conditions.push(`l.result = $${params.length}`);
    }

    if (eventId) {
      params.push(eventId);
      conditions.push(`l.event_id = $${params.length}`);
    }

    if (trimmedSearch) {
      params.push(`%${trimmedSearch}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(COALESCE(l.ticket_code, t.ticket_code, '') ILIKE ${p} OR COALESCE(l.attendee_name, t.attendee_name, o.buyer_name, '') ILIKE ${p} OR COALESCE(l.qr_code_raw, '') ILIKE ${p} OR COALESCE(l.message, '') ILIKE ${p})`,
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM checkin_device_logs l
      LEFT JOIN tickets t ON t.id = l.ticket_id
      LEFT JOIN order_items oi ON oi.id = t.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id
      ${whereClause}
    `;

    const listParams = [...params, safeLimit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const listQuery = `
      SELECT
        l.id,
        l.device_id,
        'IOT'::text AS source,
        COALESCE(dev.name, dev.mac_address) AS actor_name,
        COALESCE(lg.name, l.gate_name, deg.name, dev.assigned_gate) AS gate_name,
        l.event_id,
        l.ticket_id,
        COALESCE(l.ticket_code, t.ticket_code) AS ticket_code,
        l.qr_code_raw,
        l.action,
        l.result,
        l.success,
        l.message,
        COALESCE(l.attendee_name, t.attendee_name, o.buyer_name) AS attendee_name,
        COALESCE(t.attendee_email, o.buyer_email) AS attendee_email,
        tt.name AS ticket_type_name,
        CASE
          WHEN s.row_label IS NOT NULL OR s.seat_number IS NOT NULL
            THEN CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, ''))
          ELSE NULL
        END AS seat_label,
        e.title AS event_title,
        e.slug AS event_code,
        l.scanned_at
      FROM checkin_device_logs l
      LEFT JOIN checkin_devices dev ON dev.id = l.device_id
      LEFT JOIN event_gates deg ON deg.id = dev.assigned_gate_id
      LEFT JOIN event_gates lg ON lg.id = l.gate_id
      LEFT JOIN events e ON e.id = l.event_id
      LEFT JOIN tickets t ON t.id = l.ticket_id
      LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN order_items oi ON oi.id = t.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      ${whereClause}
      ORDER BY l.scanned_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const [countRes, listRes] = await Promise.all([
      db.query(countQuery, params),
      db.query(listQuery, listParams),
    ]);

    const total = countRes.rows[0]?.total || 0;
    return {
      items: listRes.rows,
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async getDeviceHistoryStats(
    deviceId,
    {
      includeSharedGate = false,
      assignedEventId = null,
      assignedGateId = null,
      assignedGate = null,
    } = {},
  ) {
    const useSharedGate = Boolean(
      includeSharedGate
      && assignedEventId
      && (assignedGateId || (assignedGate && String(assignedGate).trim())),
    );

    if (useSharedGate) {
      const { rows } = await db.query(
        `
        WITH combined AS (
          SELECT l.result, l.success
          FROM checkin_device_logs l
          LEFT JOIN checkin_devices dev ON dev.id = l.device_id
          LEFT JOIN event_staffs log_es ON log_es.event_id = COALESCE(l.event_id, dev.assigned_event_id) AND log_es.staff_id = l.staff_id
          LEFT JOIN event_gates log_es_gate ON log_es_gate.id = log_es.gate_id
          LEFT JOIN event_gates deg ON deg.id = dev.assigned_gate_id
          LEFT JOIN event_gates lg ON lg.id = l.gate_id
          WHERE l.device_id = $1
             OR (
               COALESCE(l.event_id, dev.assigned_event_id) = $2::uuid
               AND (
                 ($3::uuid IS NOT NULL AND COALESCE(l.gate_id, dev.assigned_gate_id, log_es.gate_id) = $3::uuid)
                 OR ($4::text IS NOT NULL AND LOWER(TRIM(COALESCE(lg.name, l.gate_name, deg.name, dev.assigned_gate, log_es_gate.name, log_es.gate, ''))) = LOWER(TRIM($4::text)))
               )
             )
          UNION ALL
          SELECT 'OK'::varchar AS result, true AS success
          FROM tickets t
          LEFT JOIN event_staffs es ON es.event_id = t.event_id AND es.staff_id = t.checked_in_by
          LEFT JOIN event_gates esg ON esg.id = es.gate_id
          LEFT JOIN event_gates tg ON tg.id = t.checked_in_gate_id
          WHERE t.event_id = $2::uuid
            AND t.status = 'USED'
            AND t.checked_in_by IS NOT NULL
            AND t.checked_in_device_id IS NULL
            AND (
              ($3::uuid IS NOT NULL AND COALESCE(t.checked_in_gate_id, es.gate_id) = $3::uuid)
              OR ($4::text IS NOT NULL AND LOWER(TRIM(COALESCE(tg.name, t.checked_in_gate, esg.name, es.gate, ''))) = LOWER(TRIM($4::text)))
            )
            AND NOT EXISTS (
              SELECT 1
              FROM checkin_device_logs cl
              WHERE cl.ticket_id = t.id
                AND cl.result = 'OK'
                AND (cl.source = 'STAFF' OR cl.staff_id IS NOT NULL)
            )
        )
        SELECT
          COUNT(*)::int AS total_scans,
          COUNT(*) FILTER (WHERE result = 'OK')::int AS ok_count,
          COUNT(*) FILTER (WHERE result = 'VERIFIED')::int AS verified_count,
          COUNT(*) FILTER (WHERE success = false)::int AS failed_count
        FROM combined
        `,
        [
          deviceId,
          assignedEventId,
          assignedGateId || null,
          assignedGate ? String(assignedGate).trim() : null,
        ],
      );
      return rows[0] || {
        total_scans: 0,
        ok_count: 0,
        verified_count: 0,
        failed_count: 0,
      };
    }

    const { rows } = await db.query(
      `
      SELECT
        COUNT(*)::int AS total_scans,
        COUNT(*) FILTER (WHERE result = 'OK')::int AS ok_count,
        COUNT(*) FILTER (WHERE result = 'VERIFIED')::int AS verified_count,
        COUNT(*) FILTER (WHERE success = false)::int AS failed_count
      FROM checkin_device_logs
      WHERE device_id = $1
      `,
      [deviceId],
    );
    return rows[0] || {
      total_scans: 0,
      ok_count: 0,
      verified_count: 0,
      failed_count: 0,
    };
  }
}

module.exports = new IotRepository();

