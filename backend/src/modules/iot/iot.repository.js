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
          e.slug AS event_code,
          e.title AS event_name
        FROM checkin_devices d
        LEFT JOIN events e ON e.id = d.assigned_event_id AND e.deleted_at IS NULL
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
}

module.exports = new IotRepository();

