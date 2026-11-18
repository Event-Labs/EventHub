const db = require('../../infrastructure/database/db.client');
const { DEVICE_ONLINE_THRESHOLD_SEC } = require('../iot/iot.utils');

// ---------------------------------------------------------------------------
// Helpers – Invitation stored inside `notifications` table
// ---------------------------------------------------------------------------
// We use the `notifications` table as a backing store for staff invitations
// because the `staff_invitations` table does not exist in the current schema.
// Each invitation is a row in `notifications` where:
//   - user_id      = the invited user
//   - event_id     = the target event
//   - type         = 'EVENT'
//   - title        = 'STAFF_INVITATION'  (sentinel value – used to filter)
//   - content      = JSON string with all invitation metadata
//   - is_read      = notification read state only; invitation state lives in content.status
//
// content JSON shape:
// {
//   "status": "PENDING" | "ACCEPTED" | "DECLINED",
//   "organizer_id": uuid,
//   "invited_email": string,
//   "staff_role": string | null,
//   "gate": string | null,
//   "zone": string | null,
//   "invited_by": uuid,
//   "expires_at": ISO string,
//   "responded_at": ISO string | null
// }
// ---------------------------------------------------------------------------

const INVITE_TITLE = 'STAFF_INVITATION';

function parseInvitation(row) {
  if (!row) return null;
  let meta = {};
  try {
    meta = JSON.parse(row.content);
  } catch (_) {
    // fallback – treat as opaque
  }
  const sessionIds = Array.isArray(meta.session_ids)
    ? meta.session_ids
    : meta.session_id
      ? [meta.session_id]
      : null;

  return {
    id: row.id,
    event_id: row.event_id,
    event_slug: row.event_slug || null,
    event_title: row.event_title || null,
    event_start_time: row.event_start_time || null,
    event_end_time: row.event_end_time || null,
    organization_name: row.organization_name || null,
    invited_user_id: row.user_id,
    invited_user_name: row.invited_user_name || null,
    invited_email: meta.invited_email || null,
    staff_role: meta.staff_role || null,
    gate_id: meta.gate_id || null,
    gate: meta.gate || null,
    zone: meta.zone || null,
    session_ids: sessionIds,
    session_id: sessionIds?.[0] || null,
    session_name: meta.session_name || null,
    organizer_id: meta.organizer_id || null,
    invited_by: meta.invited_by || null,
    status: meta.status || 'PENDING',
    expires_at: meta.expires_at || null,
    responded_at: meta.responded_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

class OperationsRepository {
  async findOrganizerByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id, user_id, organization_name, status
      FROM organizers
      WHERE user_id = $1 AND status = 'ACTIVE'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async findOrganizerCurrentPlan(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        os.id,
        os.organizer_id,
        os.subscription_id,
        os.start_date,
        os.end_date,
        os.status,
        s.name,
        s.staff_limit,
        s.max_staff_per_event,
        s.event_limit,
        s.analytics_enabled,
        s.priority_support
      FROM organizer_subscriptions os
      JOIN subscriptions s ON s.id = os.subscription_id
      WHERE os.organizer_id = $1
        AND os.status = 'ACTIVE'
        AND os.start_date <= now()
        AND os.end_date >= now()
        AND s.deleted_at IS NULL
      ORDER BY os.start_date DESC
      LIMIT 1
      `,
      [organizerId],
    );
    return rows[0];
  }

  async findOrganizerEvents(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.thumbnail_url,
        e.banner_url,
        e.status,
        e.approval_status,
        e.start_time,
        e.end_time,
        COALESCE(staff_count_summary.staff_count, 0)::int AS staff_count,
        COALESCE(session_summary.sessions, '[]'::json) AS sessions,
        COALESCE(gate_summary.gates, '[]'::json) AS gates,
        COALESCE(device_summary.devices, '[]'::json) AS devices
      FROM events e
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT es.staff_id)::int AS staff_count
        FROM event_staffs es
        WHERE es.event_id = e.id
      ) staff_count_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time,
            'checkin_start_time', sess.checkin_start_time
          )
          ORDER BY sess.start_time ASC
        ) AS sessions
        FROM event_sessions sess
        WHERE sess.event_id = e.id
      ) session_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', eg.id,
            'event_id', eg.event_id,
            'name', eg.name,
            'description', eg.description,
            'sort_order', eg.sort_order,
            'staff_count', (
              SELECT COUNT(*)::int
              FROM event_staffs es2
              WHERE es2.event_id = eg.event_id
                AND (es2.gate_id = eg.id OR (es2.gate_id IS NULL AND LOWER(TRIM(COALESCE(es2.gate, ''))) = LOWER(TRIM(eg.name))))
            ),
            'device_count', (
              SELECT COUNT(*)::int
              FROM checkin_devices cd2
              WHERE cd2.assigned_event_id = eg.event_id
                AND cd2.status IN ('ACTIVE', 'DISABLED')
                AND (cd2.assigned_gate_id = eg.id OR (cd2.assigned_gate_id IS NULL AND LOWER(TRIM(COALESCE(cd2.assigned_gate, ''))) = LOWER(TRIM(eg.name))))
            )
          )
          ORDER BY eg.sort_order ASC, eg.created_at ASC
        ) AS gates
        FROM event_gates eg
        WHERE eg.event_id = e.id
      ) gate_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'name', d.name,
            'mac_address', d.mac_address,
            'hardware', d.hardware,
            'status', d.status,
            'assigned_event_id', d.assigned_event_id,
            'assigned_gate_id', d.assigned_gate_id,
            'assigned_gate', COALESCE(deg.name, d.assigned_gate),
            'auto_confirm', d.auto_confirm,
            'last_seen_at', d.last_seen_at,
            'is_online', (d.status = 'ACTIVE' AND d.last_seen_at IS NOT NULL AND d.last_seen_at >= now() - ($2::int * interval '1 second'))
          )
          ORDER BY d.created_at ASC
        ) AS devices
        FROM checkin_devices d
        LEFT JOIN event_gates deg ON deg.id = d.assigned_gate_id
        WHERE d.assigned_event_id = e.id
          AND d.status IN ('ACTIVE', 'DISABLED')
      ) device_summary ON true
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
      ORDER BY e.start_time DESC
      LIMIT 200
      `,
      [organizerId, DEVICE_ONLINE_THRESHOLD_SEC],
    );
    return rows;
  }

  async listEventGates(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        eg.id,
        eg.event_id,
        eg.name,
        eg.description,
        eg.sort_order,
        eg.created_at,
        eg.updated_at,
        (
          SELECT COUNT(*)::int
          FROM event_staffs es
          WHERE es.event_id = eg.event_id
            AND (es.gate_id = eg.id OR (es.gate_id IS NULL AND LOWER(TRIM(COALESCE(es.gate, ''))) = LOWER(TRIM(eg.name))))
        ) AS staff_count,
        (
          SELECT COUNT(*)::int
          FROM checkin_devices cd
          WHERE cd.assigned_event_id = eg.event_id
            AND cd.status IN ('ACTIVE', 'DISABLED')
            AND (cd.assigned_gate_id = eg.id OR (cd.assigned_gate_id IS NULL AND LOWER(TRIM(COALESCE(cd.assigned_gate, ''))) = LOWER(TRIM(eg.name))))
        ) AS device_count
      FROM event_gates eg
      WHERE eg.event_id = $1
      ORDER BY eg.sort_order ASC, eg.created_at ASC
      `,
      [eventId],
    );
    return rows;
  }

  async findEventGateById(eventId, gateId) {
    const { rows } = await db.query(
      `
      SELECT id, event_id, name, description, sort_order, created_at, updated_at
      FROM event_gates
      WHERE event_id = $1 AND id = $2
      LIMIT 1
      `,
      [eventId, gateId],
    );
    return rows[0] || null;
  }

  async findEventGateByName(eventId, name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const { rows } = await db.query(
      `
      SELECT id, event_id, name, description, sort_order, created_at, updated_at
      FROM event_gates
      WHERE event_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
      LIMIT 1
      `,
      [eventId, trimmed],
    );
    return rows[0] || null;
  }

  async createEventGate(eventId, { name, description = null }) {
    const { rows } = await db.query(
      `
      INSERT INTO event_gates (event_id, name, description, sort_order)
      VALUES (
        $1,
        $2,
        $3,
        COALESCE((SELECT MAX(sort_order) + 1 FROM event_gates WHERE event_id = $1), 0)
      )
      RETURNING id, event_id, name, description, sort_order, created_at, updated_at
      `,
      [eventId, name.trim(), description ? description.trim() : null],
    );
    return { ...rows[0], staff_count: 0, device_count: 0 };
  }

  async updateEventGate(eventId, gateId, { name, description, sortOrder }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const existingRes = await client.query(
        'SELECT id, event_id, name, description, sort_order FROM event_gates WHERE event_id = $1 AND id = $2 FOR UPDATE',
        [eventId, gateId],
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return null;
      }

      const nextName = name !== undefined ? name.trim() : existing.name;
      const nextDesc = description !== undefined ? (description ? description.trim() : null) : existing.description;
      const nextSort = sortOrder !== undefined ? sortOrder : existing.sort_order;

      const { rows } = await client.query(
        `
        UPDATE event_gates
        SET name = $3,
            description = $4,
            sort_order = $5,
            updated_at = NOW()
        WHERE event_id = $1 AND id = $2
        RETURNING id, event_id, name, description, sort_order, created_at, updated_at
        `,
        [eventId, gateId, nextName, nextDesc, nextSort],
      );

      if (nextName !== existing.name) {
        await client.query(
          `UPDATE event_staffs SET gate = $2 WHERE event_id = $1 AND gate_id = $3`,
          [eventId, nextName, gateId],
        );
        await client.query(
          `
          UPDATE checkin_devices
          SET assigned_gate = $2,
              config_version = config_version + 1,
              updated_at = NOW()
          WHERE assigned_event_id = $1 AND assigned_gate_id = $3
          `,
          [eventId, nextName, gateId],
        );
      }

      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteEventGate(eventId, gateId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE event_staffs SET gate_id = NULL, gate = NULL WHERE event_id = $1 AND gate_id = $2`,
        [eventId, gateId],
      );

      await client.query(
        `
        UPDATE checkin_devices
        SET assigned_gate_id = NULL,
            assigned_gate = NULL,
            config_version = config_version + 1,
            updated_at = NOW()
        WHERE assigned_event_id = $1 AND assigned_gate_id = $2
        `,
        [eventId, gateId],
      );

      const { rowCount } = await client.query(
        `DELETE FROM event_gates WHERE event_id = $1 AND id = $2`,
        [eventId, gateId],
      );

      await client.query('COMMIT');
      return rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findEventDevice(eventId, deviceId) {
    const { rows } = await db.query(
      `
      SELECT
        d.id,
        d.name,
        d.mac_address,
        d.status,
        d.assigned_event_id,
        d.assigned_gate_id,
        COALESCE(eg.name, d.assigned_gate) AS assigned_gate,
        d.auto_confirm,
        d.config_version,
        d.last_seen_at
      FROM checkin_devices d
      LEFT JOIN event_gates eg ON eg.id = d.assigned_gate_id
      WHERE d.id = $1 AND d.assigned_event_id = $2
      LIMIT 1
      `,
      [deviceId, eventId],
    );
    return rows[0] || null;
  }

  async updateEventDeviceGate(eventId, deviceId, { gateId, gateName }) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET assigned_gate_id = $3,
          assigned_gate = $4,
          config_version = config_version + 1,
          updated_at = NOW()
      WHERE id = $1 AND assigned_event_id = $2
      RETURNING id, name, mac_address, status, assigned_event_id, assigned_gate_id, assigned_gate, auto_confirm, config_version, last_seen_at
      `,
      [deviceId, eventId, gateId || null, gateName || null],
    );
    return rows[0] || null;
  }

  async findEventSessions(eventId, sessionIds = null) {
    const params = [eventId];
    let sessionFilter = '';
    if (Array.isArray(sessionIds) && sessionIds.length > 0) {
      params.push(sessionIds);
      sessionFilter = `AND id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await db.query(
      `
      SELECT id, event_id, session_name, start_time, end_time, checkin_start_time
      FROM event_sessions
      WHERE event_id = $1
        ${sessionFilter}
      ORDER BY start_time ASC
      `,
      params,
    );
    return rows;
  }

  async findOrganizerEvent(eventId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.organizer_id,
        e.status,
        e.approval_status,
        e.start_time,
        e.end_time,
        o.user_id AS organizer_user_id
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      WHERE e.id = $1
        AND e.organizer_id = $2
        AND e.deleted_at IS NULL
      LIMIT 1
      `,
      [eventId, organizerId],
    );
    return rows[0];
  }

  async findStaffUsers(search = '') {
    const params = [];
    let searchClause = '';

    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const { rows } = await db.query(
      `
      SELECT DISTINCT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.status
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r      ON r.id = ur.role_id
      WHERE r.name IN ('CUSTOMER', 'STAFF')
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        ${searchClause}
      ORDER BY u.full_name ASC
      LIMIT 100
      `,
      params,
    );
    return rows;
  }

  async findActiveUserByEmail(email) {
    const { rows } = await db.query(
      `
      SELECT id, full_name, email, phone, avatar_url, status
      FROM users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [email],
    );
    return rows[0];
  }

  async findActiveUserById(userId) {
    const { rows } = await db.query(
      `
      SELECT id, full_name, email, phone, avatar_url, status
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // Invitation helpers (backed by notifications table)
  // ---------------------------------------------------------------------------

  /** Returns the PENDING invitation notification for a given event + email */
  async findPendingInvitation(eventId, email) {
    const { rows } = await db.query(
      `
      SELECT n.*
      FROM notifications n
      WHERE n.event_id = $1
        AND n.title    = $2
        AND n.content::json->>'invited_email' = lower($3)
        AND n.content::json->>'status'        = 'PENDING'
      LIMIT 1
      `,
      [eventId, INVITE_TITLE, email.toLowerCase()],
    );
    return rows[0] ? parseInvitation(rows[0]) : undefined;
  }

  async findStaffUser(staffId) {
    const { rows } = await db.query(
      `
      SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.status
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r       ON r.id = ur.role_id
      WHERE u.id = $1
        AND r.name = 'STAFF'
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
      LIMIT 1
      `,
      [staffId],
    );
    return rows[0];
  }

  async countEventStaff(eventId) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM event_staffs WHERE event_id = $1',
      [eventId],
    );
    return rows[0]?.total || 0;
  }

  /** Count PENDING invitations for an event */
  async countPendingInvitations(eventId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notifications
      WHERE event_id = $1
        AND title    = $2
        AND content::json->>'status' = 'PENDING'
      `,
      [eventId, INVITE_TITLE],
    );
    return rows[0]?.total || 0;
  }

  async findEventStaffAssignment(eventId, staffId) {
    const { rows } = await db.query(
      `
      SELECT
        es.id,
        es.event_id,
        es.staff_id,
        es.staff_role,
        es.gate_id,
        COALESCE(eg.name, es.gate) AS gate,
        es.zone,
        es.session_ids,
        es.assigned_by,
        es.assigned_at
      FROM event_staffs es
      LEFT JOIN event_gates eg ON eg.id = es.gate_id
      WHERE es.event_id = $1 AND es.staff_id = $2
      LIMIT 1
      `,
      [eventId, staffId],
    );
    return rows[0];
  }

  async findStaffScheduleConflict(staffId, targetEventId, targetSessionIds = null) {
    const normalizedTargetSessions = Array.isArray(targetSessionIds) && targetSessionIds.length > 0
      ? targetSessionIds
      : null;

    const { rows } = await db.query(
      `
      WITH target_time AS (
        SELECT
          COALESCE(
            CASE WHEN $3::uuid[] IS NOT NULL THEN (
              SELECT MIN(sess.start_time)
              FROM event_sessions sess
              WHERE sess.event_id = target.id AND sess.id = ANY($3::uuid[])
            ) END,
            target.start_time
          ) AS start_time,
          COALESCE(
            CASE WHEN $3::uuid[] IS NOT NULL THEN (
              SELECT MAX(sess.end_time)
              FROM event_sessions sess
              WHERE sess.event_id = target.id AND sess.id = ANY($3::uuid[])
            ) END,
            target.end_time,
            target.start_time
          ) AS end_time
        FROM events target
        WHERE target.id = $2
      )
      SELECT
        e.id AS event_id,
        e.title AS event_title,
        COALESCE(conflict_sess.session_name, e.title) AS conflict_session_name,
        COALESCE(conflict_sess.start_time, e.start_time) AS start_time,
        COALESCE(conflict_sess.end_time, e.end_time, e.start_time) AS end_time
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      CROSS JOIN target_time tt
      LEFT JOIN LATERAL (
        SELECT sess.session_name, sess.start_time, sess.end_time
        FROM event_sessions sess
        WHERE sess.event_id = e.id
          AND es.session_ids IS NOT NULL
          AND es.session_ids @> to_jsonb(sess.id::text)
          AND sess.start_time < tt.end_time
          AND sess.end_time > tt.start_time
        ORDER BY sess.start_time ASC
        LIMIT 1
      ) conflict_sess ON true
      WHERE es.staff_id = $1
        AND e.id <> $2
        AND e.deleted_at IS NULL
        AND e.status IN ('PUBLISHED', 'COMPLETED')
        AND (
          (es.session_ids IS NOT NULL AND conflict_sess.start_time IS NOT NULL)
          OR
          (
            (es.session_ids IS NULL OR jsonb_array_length(es.session_ids) = 0)
            AND e.start_time < tt.end_time
            AND COALESCE(e.end_time, e.start_time) > tt.start_time
          )
        )
      ORDER BY COALESCE(conflict_sess.start_time, e.start_time) ASC
      LIMIT 1
      `,
      [staffId, targetEventId, normalizedTargetSessions],
    );
    return rows[0];
  }

  async getStaffEventIds(staffId) {
    const { rows } = await db.query(
      `
      SELECT es.event_id
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      WHERE es.staff_id = $1
        AND e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
      `,
      [staffId],
    );
    return rows.map(r => r.event_id);
  }

  async assignStaff({ eventId, staffId, staffRole, gateId, gate, zone, sessionIds, assignedBy }) {
    const formattedSessionIds = sessionIds && sessionIds.length > 0 ? JSON.stringify(sessionIds) : null;
    const { rows } = await db.query(
      `
      INSERT INTO event_staffs (event_id, staff_id, staff_role, gate_id, gate, zone, session_ids, assigned_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (event_id, staff_id)
      DO UPDATE SET
        staff_role  = EXCLUDED.staff_role,
        gate_id     = EXCLUDED.gate_id,
        gate        = EXCLUDED.gate,
        zone        = EXCLUDED.zone,
        session_ids = EXCLUDED.session_ids,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now()
      RETURNING id, event_id, staff_id, staff_role, gate_id, gate, zone, session_ids, assigned_by, assigned_at
      `,
      [eventId, staffId, staffRole || null, gateId || null, gate || null, zone || null, formattedSessionIds, assignedBy],
    );
    return rows[0];
  }

  async updateStaffAssignment(eventId, staffId, { staffRole, gateId, gate, zone, sessionIds }) {
    const formattedSessionIds = sessionIds !== undefined
      ? (sessionIds && sessionIds.length > 0 ? JSON.stringify(sessionIds) : null)
      : undefined;

    const params = [
      eventId,
      staffId,
      staffRole,
      gateId !== undefined ? gateId : null,
      gate !== undefined ? gate : null,
      zone !== undefined ? zone : null,
    ];
    let sessionUpdate = '';
    if (formattedSessionIds !== undefined) {
      params.push(formattedSessionIds);
      sessionUpdate = `, session_ids = $${params.length}`;
    }

    const { rows } = await db.query(
      `
      UPDATE event_staffs
      SET
        staff_role = COALESCE($3, staff_role),
        gate_id = $4,
        gate = $5,
        zone = $6
        ${sessionUpdate}
      WHERE event_id = $1 AND staff_id = $2
      RETURNING id, event_id, staff_id, staff_role, gate_id, gate, zone, session_ids, assigned_by, assigned_at
      `,
      params,
    );
    return rows[0];
  }

  /**
   * Creates a staff invitation as a notification row.
   * Returns a normalised invitation object.
   */
  async createStaffInvitation({ eventId, organizerId, invitedUserId, email, staffRole, gateId, gate, zone, sessionIds, sessionName, invitedBy }) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const meta = JSON.stringify({
      status: 'PENDING',
      organizer_id: organizerId,
      invited_email: email.toLowerCase(),
      staff_role: staffRole || null,
      gate_id: gateId || null,
      gate: gate || null,
      zone: zone || null,
      session_ids: sessionIds && sessionIds.length > 0 ? sessionIds : null,
      session_id: sessionIds && sessionIds.length === 1 ? sessionIds[0] : null,
      session_name: sessionName || null,
      invited_by: invitedBy,
      expires_at: expiresAt,
      responded_at: null,
    });

    const { rows } = await db.query(
      `
      INSERT INTO notifications (user_id, event_id, title, content, type, is_read)
      VALUES ($1, $2, $3, $4, 'EVENT', false)
      RETURNING id, user_id, event_id, title, content, is_read, created_at
      `,
      [invitedUserId, eventId, INVITE_TITLE, meta],
    );
    return parseInvitation(rows[0]);
  }

  /** Find a specific invitation belonging to an organizer */
  async findInvitationForOrganizer(invitationId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        n.*,
        e.title AS event_title,
        e.slug AS event_slug,
        e.organizer_id
      FROM notifications n
      JOIN events e ON e.id = n.event_id
      WHERE n.id = $1
        AND n.title = $2
        AND n.content::json->>'organizer_id' = $3
      LIMIT 1
      `,
      [invitationId, INVITE_TITLE, organizerId],
    );
    return rows[0] ? parseInvitation(rows[0]) : undefined;
  }

  async deleteStaffInvitation(invitationId) {
    const { rowCount } = await db.query(
      'DELETE FROM notifications WHERE id = $1 AND title = $2',
      [invitationId, INVITE_TITLE],
    );
    return rowCount > 0;
  }

  /** List all invitations sent by an organizer (optionally filtered by event) */
  async listOrganizerInvitations(organizerId, eventId = null) {
    const params = [organizerId, INVITE_TITLE];
    const eventClause = eventId ? `AND n.event_id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        n.*,
        e.title AS event_title,
        e.slug AS event_slug,
        u.full_name AS invited_user_name
      FROM notifications n
      JOIN events e ON e.id = n.event_id
      LEFT JOIN users u ON u.id = n.user_id
      WHERE n.content::json->>'organizer_id' = $1
        AND n.title = $2
        ${eventClause}
      ORDER BY n.created_at DESC
      `,
      params,
    );
    return rows.map(parseInvitation);
  }

  /** List all invitations received by a user (matched by user_id OR email) */
  async listInvitationsForUser(userId, email) {
    const { rows } = await db.query(
      `
      SELECT
        n.*,
        e.title      AS event_title,
        e.slug       AS event_slug,
        e.start_time AS event_start_time,
        e.end_time   AS event_end_time,
        o.organization_name
      FROM notifications n
      JOIN events    e ON e.id = n.event_id
      JOIN organizers o ON o.id = (n.content::json->>'organizer_id')::uuid
      WHERE n.title = $1
        AND (
          n.user_id = $2
          OR n.content::json->>'invited_email' = lower($3)
        )
      ORDER BY
        CASE (n.content::json->>'status') WHEN 'PENDING' THEN 0 ELSE 1 END,
        n.created_at DESC
      `,
      [INVITE_TITLE, userId, email.toLowerCase()],
    );
    return rows.map(parseInvitation);
  }

  /** Find a specific invitation that belongs to a user */
  async findInvitationForUser(invitationId, userId, email) {
    const { rows } = await db.query(
      `
      SELECT
        n.*,
        e.title AS event_title,
        e.slug AS event_slug
      FROM notifications n
      JOIN events e ON e.id = n.event_id
      WHERE n.id    = $1
        AND n.title = $2
        AND (
          n.user_id = $3
          OR n.content::json->>'invited_email' = lower($4)
        )
      LIMIT 1
      `,
      [invitationId, INVITE_TITLE, userId, email.toLowerCase()],
    );
    return rows[0] ? parseInvitation(rows[0]) : undefined;
  }

  /**
   * Accept invitation:
   *   1. Mark notification as read + update content status → ACCEPTED
   *   2. Add STAFF role to user
   *   3. Insert into event_staffs (with staff_role, gate, and zone)
   * All in one transaction.
   */
  async acceptInvitation({ invitationId, userId, staffRole, gateId, gate, zone, acceptedBy }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Lock the notification row
      const notifResult = await client.query(
        `SELECT * FROM notifications WHERE id = $1 AND title = $2 FOR UPDATE`,
        [invitationId, INVITE_TITLE],
      );
      const notif = notifResult.rows[0];
      if (!notif) {
        await client.query('ROLLBACK');
        return { notFound: true };
      }

      let meta = {};
      try { meta = JSON.parse(notif.content); } catch (_) {}

      if (meta.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return { invalidStatus: true, invitation: parseInvitation(notif) };
      }

      // Update content → ACCEPTED
      meta.status       = 'ACCEPTED';
      meta.responded_at = new Date().toISOString();
      await client.query(
        `UPDATE notifications SET content = $1, is_read = true WHERE id = $2`,
        [JSON.stringify(meta), invitationId],
      );

      // Grant STAFF role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'STAFF'
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId],
      );

      // Resolve gate if still present in event_gates
      let resolvedGateId = gateId || meta.gate_id || null;
      let resolvedGateName = gate || meta.gate || null;
      if (resolvedGateId) {
        const gateCheck = await client.query(
          `SELECT id, name FROM event_gates WHERE id = $1 AND event_id = $2 LIMIT 1`,
          [resolvedGateId, notif.event_id],
        );
        if (gateCheck.rows[0]) {
          resolvedGateId = gateCheck.rows[0].id;
          resolvedGateName = gateCheck.rows[0].name;
        } else {
          resolvedGateId = null;
        }
      } else if (resolvedGateName) {
        const gateCheck = await client.query(
          `SELECT id, name FROM event_gates WHERE event_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1`,
          [notif.event_id, resolvedGateName],
        );
        if (gateCheck.rows[0]) {
          resolvedGateId = gateCheck.rows[0].id;
          resolvedGateName = gateCheck.rows[0].name;
        }
      }

      // Assign to event
      const sessionIds = meta.session_ids || (meta.session_id ? [meta.session_id] : null);
      const formattedSessionIds = sessionIds && sessionIds.length > 0 ? JSON.stringify(sessionIds) : null;

      const assignmentResult = await client.query(
        `
        INSERT INTO event_staffs (event_id, staff_id, staff_role, gate_id, gate, zone, session_ids, assigned_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (event_id, staff_id)
        DO UPDATE SET
          staff_role  = EXCLUDED.staff_role,
          gate_id     = EXCLUDED.gate_id,
          gate        = EXCLUDED.gate,
          zone        = EXCLUDED.zone,
          session_ids = EXCLUDED.session_ids,
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = now()
        RETURNING id, event_id, staff_id, staff_role, gate_id, gate, zone, session_ids, assigned_by, assigned_at
        `,
        [notif.event_id, userId, staffRole || meta.staff_role || null, resolvedGateId, resolvedGateName, zone || meta.zone || null, formattedSessionIds, acceptedBy],
      );

      await client.query('COMMIT');
      return {
        invitation: { ...parseInvitation(notif), status: 'ACCEPTED', responded_at: meta.responded_at },
        assignment: assignmentResult.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Decline invitation: update content status → DECLINED, mark as read */
  async declineInvitation(invitationId, userId) {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE id = $1 AND title = $2 LIMIT 1`,
      [invitationId, INVITE_TITLE],
    );
    const notif = rows[0];
    if (!notif) return null;

    let meta = {};
    try { meta = JSON.parse(notif.content); } catch (_) {}

    meta.status       = 'DECLINED';
    meta.responded_at = new Date().toISOString();

    const { rows: updated } = await db.query(
      `UPDATE notifications SET content = $1, is_read = true WHERE id = $2 RETURNING *`,
      [JSON.stringify(meta), invitationId],
    );
    return updated[0] ? parseInvitation(updated[0]) : null;
  }

  async removeStaff(eventId, staffId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        'DELETE FROM event_staffs WHERE event_id = $1 AND staff_id = $2',
        [eventId, staffId],
      );

      const remainingResult = await client.query(
        'SELECT COUNT(*) FROM event_staffs WHERE staff_id = $1',
        [staffId],
      );
      const remainingCount = parseInt(remainingResult.rows[0].count, 10);

      if (remainingCount === 0) {
        await client.query(
          `DELETE FROM user_roles
           WHERE user_id = $1
             AND role_id = (SELECT id FROM roles WHERE name = 'STAFF')`,
          [staffId],
        );
      }

      await client.query('COMMIT');
      return rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listEventStaff(eventId = null, organizerId) {
    const params = [organizerId];
    const eventClause = eventId ? `AND e.id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        es.id,
        es.event_id,
        e.title        AS event_title,
        e.start_time   AS event_start_time,
        es.staff_id,
        u.full_name    AS staff_name,
        u.email        AS staff_email,
        u.phone        AS staff_phone,
        es.staff_role,
        es.gate_id,
        COALESCE(eg.name, es.gate) AS gate,
        es.zone,
        es.session_ids,
        COALESCE(staff_sessions.sessions, '[]'::json) AS assigned_sessions,
        es.assigned_at,
        assigner.full_name AS assigned_by_name
      FROM event_staffs es
      JOIN events e   ON e.id = es.event_id
      JOIN users  u   ON u.id = es.staff_id
      LEFT JOIN event_gates eg ON eg.id = es.gate_id
      LEFT JOIN users assigner ON assigner.id = es.assigned_by
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time
          )
          ORDER BY sess.start_time ASC
        ) AS sessions
        FROM event_sessions sess
        WHERE sess.event_id = es.event_id
          AND es.session_ids IS NOT NULL
          AND es.session_ids @> to_jsonb(sess.id::text)
      ) staff_sessions ON true
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventClause}
      ORDER BY es.assigned_at DESC
      `,
      params,
    );
    return rows;
  }

  async listStaffAssignedEvents(staffId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.thumbnail_url,
        e.banner_url,
        e.status,
        e.start_time,
        e.end_time,
        es.staff_role,
        es.gate_id,
        COALESCE(eg.name, es.gate) AS gate,
        es.zone,
        es.session_ids,
        es.assigned_at,
        session_checkin.checkin_start_time,
        COALESCE(venue_summary.venue_name,   '') AS venue_name,
        COALESCE(venue_summary.address_line, '') AS address_line,
        COALESCE(venue_summary.district,     '') AS district,
        COALESCE(venue_summary.city,         '') AS city,
        COALESCE(assigned_sessions.sessions, '[]'::json) AS assigned_sessions,
        COALESCE(checkin_summary.checked_in,  0)::int AS checked_in,
        COALESCE(checkin_summary.total_valid, 0)::int AS total_valid
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN event_gates eg ON eg.id = es.gate_id
      LEFT JOIN LATERAL (
        SELECT MIN(COALESCE(sess.checkin_start_time, sess.start_time)) AS checkin_start_time
        FROM event_sessions sess
        WHERE sess.event_id = e.id
      ) session_checkin ON true
      LEFT JOIN LATERAL (
        SELECT v.name AS venue_name, v.address_line, v.district, v.city
        FROM event_sessions sess
        JOIN venues v ON v.id = sess.venue_id
        WHERE sess.event_id = e.id
        ORDER BY sess.start_time ASC
        LIMIT 1
      ) venue_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time
          )
          ORDER BY sess.start_time ASC
        ) AS sessions
        FROM event_sessions sess
        WHERE sess.event_id = e.id
          AND es.session_ids IS NOT NULL
          AND es.session_ids @> to_jsonb(sess.id::text)
      ) assigned_sessions ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE t.status = 'USED')                    AS checked_in,
          COUNT(*) FILTER (WHERE t.status IN ('VALID', 'USED'))        AS total_valid
        FROM tickets t
        WHERE t.event_id = e.id
      ) checkin_summary ON true
      WHERE es.staff_id = $1
        AND e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
      ORDER BY e.start_time ASC
      `,
      [staffId],
    );
    return rows;
  }

  async findStaffAssignedEvent(staffId, eventId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.short_description,
        e.thumbnail_url,
        e.banner_url,
        e.status,
        e.start_time,
        e.end_time,
        es.staff_role,
        es.gate_id,
        COALESCE(eg.name, es.gate) AS gate,
        es.zone,
        es.session_ids,
        es.assigned_at,
        venue_summary.venue_name,
        venue_summary.address_line,
        venue_summary.ward,
        venue_summary.district,
        venue_summary.city,
        COALESCE(assigned_sessions.sessions, '[]'::json) AS assigned_sessions,
        COALESCE(session_summary.sessions, '[]'::json) AS sessions
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN event_gates eg ON eg.id = es.gate_id
      LEFT JOIN LATERAL (
        SELECT v.name AS venue_name, v.address_line, v.ward, v.district, v.city
        FROM event_sessions sess
        JOIN venues v ON v.id = sess.venue_id
        WHERE sess.event_id = e.id
        ORDER BY sess.start_time ASC
        LIMIT 1
      ) venue_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time
          )
          ORDER BY sess.start_time ASC
        ) AS sessions
        FROM event_sessions sess
        WHERE sess.event_id = e.id
          AND es.session_ids IS NOT NULL
          AND es.session_ids @> to_jsonb(sess.id::text)
      ) assigned_sessions ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time,
            'seat_map_id', sess.seat_map_id
          )
          ORDER BY sess.start_time ASC
        ) AS sessions
        FROM event_sessions sess
        WHERE sess.event_id = e.id
      ) session_summary ON true
      WHERE es.staff_id = $1
        AND e.id = $2
        AND e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
      LIMIT 1
      `,
      [staffId, eventId],
    );
    return rows[0];
  }

  async getStaffCheckInReport(staffId, eventId = null) {
    const params = [staffId, eventId];
    const scope = `
      JOIN events e ON e.id = t.event_id
      JOIN event_staffs staff_scope
        ON staff_scope.event_id = e.id
       AND staff_scope.staff_id = $1
      WHERE e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
        AND ($2::uuid IS NULL OR e.id = $2::uuid)
    `;

    const [summaryResult, ticketTypesResult, recentResult, hourlyResult, staffResult] = await Promise.all([
      db.query(
        `
        SELECT
          COUNT(t.id) FILTER (WHERE t.status IN ('VALID', 'USED'))::int AS total_valid,
          COUNT(t.id) FILTER (WHERE t.status = 'USED')::int AS checked_in,
          COUNT(t.id) FILTER (WHERE t.status = 'VALID')::int AS remaining,
          COUNT(t.id) FILTER (WHERE t.status = 'CANCELLED')::int AS cancelled
        FROM tickets t
        ${scope}
        `,
        params,
      ),
      db.query(
        `
        SELECT
          tt.id,
          tt.name,
          COUNT(t.id) FILTER (WHERE t.status IN ('VALID', 'USED'))::int AS total_valid,
          COUNT(t.id) FILTER (WHERE t.status = 'USED')::int AS checked_in
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        ${scope}
        GROUP BY tt.id, tt.name
        ORDER BY tt.name ASC
        `,
        params,
      ),
      db.query(
        `
        SELECT
          t.id,
          t.ticket_code,
          COALESCE(t.attendee_name, o.buyer_name, 'Không rõ') AS attendee_name,
          tt.name AS ticket_type_name,
          COALESCE(t.checkin_method, 'MANUAL') AS method,
          t.checked_in_at,
          COALESCE(checker.full_name, dev.name, dev.mac_address) AS checked_in_by_name,
          CASE WHEN t.checked_in_device_id IS NOT NULL THEN 'IOT' ELSE 'STAFF' END AS checkin_source,
          COALESCE(checked_gate.name, t.checked_in_gate, dev_gate.name, dev.assigned_gate, checker_gate.name, checker_es.gate) AS checked_in_gate,
          e.id AS event_id,
          e.title AS event_title
        FROM tickets t
        JOIN order_items oi ON oi.id = t.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        LEFT JOIN users checker ON checker.id = t.checked_in_by
        LEFT JOIN event_staffs checker_es ON checker_es.event_id = t.event_id AND checker_es.staff_id = t.checked_in_by
        LEFT JOIN event_gates checker_gate ON checker_gate.id = checker_es.gate_id
        LEFT JOIN checkin_devices dev ON dev.id = t.checked_in_device_id
        LEFT JOIN event_gates dev_gate ON dev_gate.id = dev.assigned_gate_id
        LEFT JOIN event_gates checked_gate ON checked_gate.id = t.checked_in_gate_id
        ${scope}
          AND t.status = 'USED'
        ORDER BY t.checked_in_at DESC NULLS LAST
        LIMIT 20
        `,
        params,
      ),
      db.query(
        `
        SELECT
          date_trunc('hour', t.checked_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS hour,
          COUNT(*)::int AS count
        FROM tickets t
        ${scope}
          AND t.status = 'USED'
          AND t.checked_in_at IS NOT NULL
        GROUP BY date_trunc('hour', t.checked_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        ORDER BY hour DESC
        LIMIT 12
        `,
        params,
      ),
      eventId
        ? db.query(
            `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.avatar_url,
              es.staff_role,
              es.gate_id,
              COALESCE(eg.name, es.gate) AS gate,
              es.zone,
              es.assigned_at
            FROM event_staffs es
            JOIN users u ON u.id = es.staff_id
            LEFT JOIN event_gates eg ON eg.id = es.gate_id
            WHERE es.event_id = $1
            ORDER BY es.assigned_at ASC
            `,
            [eventId],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    return {
      summary: summaryResult.rows[0],
      ticket_types: ticketTypesResult.rows,
      recent_checkins: recentResult.rows,
      hourly_checkins: hourlyResult.rows.reverse(),
      assigned_staff: staffResult.rows,
    };
  }

  async getStaffGateCheckInHistory(
    staffId,
    { eventId = null, page = 1, limit = 10, result = 'OK', source = 'ALL' } = {},
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const offset = (safePage - 1) * safeLimit;
    const includeAllScans = String(result || 'OK').toUpperCase() === 'ALL';
    const normalizedSource = ['STAFF', 'IOT'].includes(String(source || 'ALL').toUpperCase())
      ? String(source).toUpperCase()
      : 'ALL';

    const assignmentsRes = await db.query(
      `
      SELECT
        es.event_id,
        e.title AS event_title,
        es.staff_role,
        es.gate_id,
        COALESCE(eg.name, es.gate) AS gate,
        es.zone,
        COALESCE(dev_summary.shared_devices, '[]'::json) AS shared_devices
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN event_gates eg ON eg.id = es.gate_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'name', COALESCE(d.name, d.mac_address),
            'mac_address', d.mac_address,
            'status', d.status,
            'assigned_gate_id', d.assigned_gate_id,
            'assigned_gate', COALESCE(deg.name, d.assigned_gate),
            'is_online', (d.status = 'ACTIVE' AND d.last_seen_at IS NOT NULL AND d.last_seen_at >= now() - ($3::int * interval '1 second'))
          )
          ORDER BY d.created_at ASC
        ) AS shared_devices
        FROM checkin_devices d
        LEFT JOIN event_gates deg ON deg.id = d.assigned_gate_id
        WHERE d.assigned_event_id = es.event_id
          AND d.status IN ('ACTIVE', 'DISABLED')
          AND (
            (es.gate_id IS NULL AND NULLIF(TRIM(COALESCE(es.gate, '')), '') IS NULL)
            OR (es.gate_id IS NOT NULL AND d.assigned_gate_id = es.gate_id)
            OR (
              NULLIF(TRIM(COALESCE(eg.name, es.gate, '')), '') IS NOT NULL
              AND LOWER(TRIM(COALESCE(deg.name, d.assigned_gate, ''))) = LOWER(TRIM(COALESCE(eg.name, es.gate, '')))
            )
          )
      ) dev_summary ON true
      WHERE es.staff_id = $1
        AND e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
        AND ($2::uuid IS NULL OR e.id = $2::uuid)
      ORDER BY e.start_time ASC
      `,
      [staffId, eventId || null, DEVICE_ONLINE_THRESHOLD_SEC],
    );

    const assignments = assignmentsRes.rows;
    if (assignments.length === 0) {
      return {
        assignments: [],
        items: [],
        counts: { all: 0, staff: 0, iot: 0 },
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          total_pages: 1,
          has_more: false,
        },
      };
    }

    const combinedCte = `
      WITH my_scope AS (
        SELECT
          es.event_id,
          es.gate_id,
          NULLIF(TRIM(COALESCE(eg.name, es.gate, '')), '') AS gate_name
        FROM event_staffs es
        JOIN events e ON e.id = es.event_id
        LEFT JOIN event_gates eg ON eg.id = es.gate_id
        WHERE es.staff_id = $1
          AND e.deleted_at IS NULL
          AND (
            e.status = 'PUBLISHED'
            OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
          )
          AND COALESCE(e.end_time, e.start_time) >= now()
          AND ($2::uuid IS NULL OR e.id = $2::uuid)
      ),
      ticket_history AS (
        SELECT
          t.id,
          t.id AS ticket_id,
          t.ticket_code,
          COALESCE(t.attendee_name, o.buyer_name, 'Không rõ') AS attendee_name,
          COALESCE(t.attendee_email, o.buyer_email) AS attendee_email,
          tt.name AS ticket_type_name,
          CASE
            WHEN s.row_label IS NOT NULL OR s.seat_number IS NOT NULL
              THEN CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, ''))
            ELSE NULL
          END AS seat_label,
          e.id AS event_id,
          e.title AS event_title,
          COALESCE(t.checkin_method, 'MANUAL') AS method,
          CASE WHEN t.checked_in_device_id IS NOT NULL THEN 'IOT' ELSE 'STAFF' END AS source,
          COALESCE(t.checked_in_device_id, t.checked_in_by) AS actor_id,
          COALESCE(dev.name, dev.mac_address, checker.full_name, checker.email, 'Không rõ') AS actor_name,
          (t.checked_in_by = $1 AND t.checked_in_device_id IS NULL) AS is_self,
          COALESCE(t.checked_in_gate_id, dev.assigned_gate_id, checker_es.gate_id) AS gate_id,
          COALESCE(t_gate.name, t.checked_in_gate, dev_gate.name, dev.assigned_gate, checker_gate.name, checker_es.gate) AS gate_name,
          'OK'::varchar AS result,
          NULL::varchar AS result_message,
          t.checked_in_at
        FROM tickets t
        JOIN my_scope ms ON ms.event_id = t.event_id
        JOIN events e ON e.id = t.event_id
        JOIN order_items oi ON oi.id = t.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
        LEFT JOIN seats s ON s.id = ss.seat_id
        LEFT JOIN users checker ON checker.id = t.checked_in_by
        LEFT JOIN event_staffs checker_es ON checker_es.event_id = t.event_id AND checker_es.staff_id = t.checked_in_by
        LEFT JOIN event_gates checker_gate ON checker_gate.id = checker_es.gate_id
        LEFT JOIN checkin_devices dev ON dev.id = t.checked_in_device_id
        LEFT JOIN event_gates dev_gate ON dev_gate.id = dev.assigned_gate_id
        LEFT JOIN event_gates t_gate ON t_gate.id = t.checked_in_gate_id
        WHERE t.status = 'USED'
          AND (
            (ms.gate_id IS NULL AND ms.gate_name IS NULL)
            OR (
              ms.gate_id IS NOT NULL
              AND COALESCE(t.checked_in_gate_id, dev.assigned_gate_id, checker_es.gate_id) = ms.gate_id
            )
            OR (
              ms.gate_name IS NOT NULL
              AND LOWER(TRIM(COALESCE(t_gate.name, t.checked_in_gate, dev_gate.name, dev.assigned_gate, checker_gate.name, checker_es.gate, ''))) = LOWER(TRIM(ms.gate_name))
            )
          )
      ),
      scan_logs AS (
        SELECT
          l.id,
          l.ticket_id,
          COALESCE(l.ticket_code, t.ticket_code, l.qr_code_raw) AS ticket_code,
          COALESCE(l.attendee_name, t.attendee_name, o.buyer_name, 'Không rõ') AS attendee_name,
          COALESCE(t.attendee_email, o.buyer_email) AS attendee_email,
          tt.name AS ticket_type_name,
          CASE
            WHEN s.row_label IS NOT NULL OR s.seat_number IS NOT NULL
              THEN CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, ''))
            ELSE NULL
          END AS seat_label,
          e.id AS event_id,
          e.title AS event_title,
          CASE
            WHEN l.device_id IS NOT NULL THEN 'ESP32_QR'::varchar
            WHEN UPPER(COALESCE(l.action, '')) = 'MANUAL' THEN 'MANUAL'::varchar
            ELSE 'QR'::varchar
          END AS method,
          CASE
            WHEN l.source = 'STAFF' OR (l.device_id IS NULL AND l.staff_id IS NOT NULL) THEN 'STAFF'::text
            ELSE 'IOT'::text
          END AS source,
          COALESCE(l.device_id, l.staff_id) AS actor_id,
          CASE
            WHEN l.source = 'STAFF' OR (l.device_id IS NULL AND l.staff_id IS NOT NULL)
              THEN COALESCE(staff_u.full_name, staff_u.email, 'Nhân viên')
            ELSE COALESCE(dev.name, dev.mac_address, 'Thiết bị IoT')
          END AS actor_name,
          (l.staff_id = $1 AND l.device_id IS NULL) AS is_self,
          COALESCE(l.gate_id, dev.assigned_gate_id, log_es.gate_id) AS gate_id,
          COALESCE(l_gate.name, l.gate_name, dev_gate.name, dev.assigned_gate, log_es_gate.name, log_es.gate) AS gate_name,
          l.result::varchar AS result,
          l.message::varchar AS result_message,
          l.scanned_at AS checked_in_at
        FROM checkin_device_logs l
        LEFT JOIN checkin_devices dev ON dev.id = l.device_id
        LEFT JOIN users staff_u ON staff_u.id = l.staff_id
        JOIN my_scope ms ON ms.event_id = COALESCE(l.event_id, dev.assigned_event_id)
        LEFT JOIN events e ON e.id = COALESCE(l.event_id, dev.assigned_event_id)
        LEFT JOIN event_staffs log_es ON log_es.event_id = COALESCE(l.event_id, dev.assigned_event_id) AND log_es.staff_id = l.staff_id
        LEFT JOIN event_gates log_es_gate ON log_es_gate.id = log_es.gate_id
        LEFT JOIN event_gates dev_gate ON dev_gate.id = dev.assigned_gate_id
        LEFT JOIN event_gates l_gate ON l_gate.id = l.gate_id
        LEFT JOIN tickets t ON t.id = l.ticket_id
        LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
        LEFT JOIN order_items oi ON oi.id = t.order_item_id
        LEFT JOIN orders o ON o.id = oi.order_id
        LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
        LEFT JOIN seats s ON s.id = ss.seat_id
        WHERE (${includeAllScans ? 'true' : "l.result = 'OK'"})
          AND (
            (ms.gate_id IS NULL AND ms.gate_name IS NULL)
            OR (
              ms.gate_id IS NOT NULL
              AND COALESCE(l.gate_id, dev.assigned_gate_id, log_es.gate_id) = ms.gate_id
            )
            OR (
              ms.gate_name IS NOT NULL
              AND LOWER(TRIM(COALESCE(l_gate.name, l.gate_name, dev_gate.name, dev.assigned_gate, log_es_gate.name, log_es.gate, ''))) = LOWER(TRIM(ms.gate_name))
            )
          )
          AND (
            ${includeAllScans ? "l.result <> 'OK' OR " : ''}NOT EXISTS (
              SELECT 1
              FROM ticket_history th
              WHERE (l.ticket_id IS NOT NULL AND th.ticket_id = l.ticket_id)
                 OR (l.ticket_id IS NULL AND l.ticket_code IS NOT NULL AND th.ticket_code = l.ticket_code)
            )
          )
      ),
      combined AS (
        SELECT * FROM ticket_history
        UNION ALL
        SELECT * FROM scan_logs
      )
    `;

    const [countsRes, historyRes] = await Promise.all([
      db.query(
        `
        ${combinedCte}
        SELECT
          COUNT(*)::int AS all_count,
          COUNT(*) FILTER (WHERE combined.source <> 'IOT')::int AS staff_count,
          COUNT(*) FILTER (WHERE combined.source = 'IOT')::int AS iot_count
        FROM combined
        `,
        [staffId, eventId || null],
      ),
      db.query(
        `
        ${combinedCte}
        SELECT *
        FROM combined
        WHERE ($3::text = 'ALL' OR combined.source = $3::text)
        ORDER BY combined.checked_in_at DESC NULLS LAST
        LIMIT $4 OFFSET $5
        `,
        [staffId, eventId || null, normalizedSource, safeLimit, offset],
      ),
    ]);

    const countsRow = countsRes.rows[0] || { all_count: 0, staff_count: 0, iot_count: 0 };
    const total = normalizedSource === 'STAFF'
      ? countsRow.staff_count
      : (normalizedSource === 'IOT' ? countsRow.iot_count : countsRow.all_count);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      assignments,
      items: historyRes.rows,
      counts: {
        all: countsRow.all_count,
        staff: countsRow.staff_count,
        iot: countsRow.iot_count,
      },
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: totalPages,
        has_more: safePage * safeLimit < total,
      },
    };
  }

  async getStaffOverview(staffId) {
    const { rows } = await db.query(
      `
      WITH assigned_events AS (
        SELECT e.id, e.title, e.slug, e.thumbnail_url, e.banner_url, e.status, e.start_time, e.end_time, es.staff_role, es.gate_id, COALESCE(eg.name, es.gate) AS gate, es.zone
        FROM event_staffs es
        JOIN events e ON e.id = es.event_id
        LEFT JOIN event_gates eg ON eg.id = es.gate_id
        WHERE es.staff_id = $1
          AND e.deleted_at IS NULL
          AND (
            e.status = 'PUBLISHED'
            OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
          )
          AND COALESCE(e.end_time, e.start_time) >= now()
      ),
      event_counts AS (
        SELECT COUNT(*)::int AS assigned_events
        FROM assigned_events
      ),
      ticket_counts AS (
        SELECT
          COUNT(t.id) FILTER (WHERE t.status = 'USED')::int AS checked_in_tickets,
          COUNT(t.id) FILTER (WHERE t.status = 'VALID')::int AS remaining_tickets
        FROM tickets t
        JOIN assigned_events ae ON ae.id = t.event_id
      ),
      today_events AS (
        SELECT COALESCE(json_agg(row_to_json(today_row) ORDER BY today_row.start_time ASC), '[]'::json) AS events
        FROM (
          SELECT
            ae.id,
            ae.title,
            ae.slug,
            ae.thumbnail_url,
            ae.banner_url,
            ae.status,
            ae.start_time,
            ae.end_time,
            ae.staff_role,
            ae.gate,
            ae.zone,
            COALESCE(venue_summary.venue_name, '') AS venue_name,
            COALESCE(venue_summary.address_line, '') AS address_line,
            COALESCE(venue_summary.district, '') AS district,
            COALESCE(venue_summary.city, '') AS city,
            COALESCE(checkin_summary.checked_in, 0)::int AS checked_in,
            COALESCE(checkin_summary.remaining, 0)::int AS remaining,
            COALESCE(checkin_summary.total_valid, 0)::int AS total_valid
          FROM assigned_events ae
          LEFT JOIN LATERAL (
            SELECT v.name AS venue_name, v.address_line, v.district, v.city
            FROM event_sessions sess
            JOIN venues v ON v.id = sess.venue_id
            WHERE sess.event_id = ae.id
            ORDER BY sess.start_time ASC
            LIMIT 1
          ) venue_summary ON true
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (WHERE t.status = 'USED') AS checked_in,
              COUNT(*) FILTER (WHERE t.status = 'VALID') AS remaining,
              COUNT(*) FILTER (WHERE t.status IN ('VALID', 'USED')) AS total_valid
            FROM tickets t
            WHERE t.event_id = ae.id
          ) checkin_summary ON true
          WHERE (ae.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            AND (COALESCE(ae.end_time, ae.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
          ORDER BY ae.start_time ASC
          LIMIT 5
        ) today_row
      )
      SELECT
        COALESCE(event_counts.assigned_events, 0)::int AS assigned_events,
        COALESCE(ticket_counts.checked_in_tickets, 0)::int AS checked_in_tickets,
        COALESCE(ticket_counts.remaining_tickets, 0)::int AS remaining_tickets,
        COALESCE(today_events.events, '[]'::json) AS today_events
      FROM event_counts
      CROSS JOIN ticket_counts
      CROSS JOIN today_events
      `,
      [staffId],
    );
    return rows[0];
  }
}

module.exports = new OperationsRepository();
