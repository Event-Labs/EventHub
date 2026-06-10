const db = require('../../infrastructure/database/db.client');

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
//   - is_read      = false  →  PENDING
//                    true   →  ACCEPTED or DECLINED (see content.status)
//
// content JSON shape:
// {
//   "status": "PENDING" | "ACCEPTED" | "DECLINED",
//   "organizer_id": uuid,
//   "invited_email": string,
//   "staff_role": string | null,
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
  return {
    id: row.id,
    event_id: row.event_id,
    event_title: row.event_title || null,
    event_start_time: row.event_start_time || null,
    event_end_time: row.event_end_time || null,
    organization_name: row.organization_name || null,
    invited_user_id: row.user_id,
    invited_user_name: row.invited_user_name || null,
    invited_email: meta.invited_email || null,
    staff_role: meta.staff_role || null,
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
        e.status,
        e.start_time,
        e.end_time,
        COUNT(DISTINCT es.staff_id)::int AS staff_count,
        COUNT(DISTINCT st.id)::int       AS task_count
      FROM events e
      LEFT JOIN event_staffs es ON es.event_id = e.id
      LEFT JOIN staff_tasks  st ON st.event_id = e.id
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
      GROUP BY e.id
      ORDER BY e.start_time DESC
      LIMIT 200
      `,
      [organizerId],
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
      SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.status
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r      ON r.id = ur.role_id
      WHERE r.name = 'CUSTOMER'
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
        AND n.is_read  = false
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

  /** Count PENDING invitations for an event (is_read = false = PENDING) */
  async countPendingInvitations(eventId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notifications
      WHERE event_id = $1
        AND title    = $2
        AND is_read  = false
        AND content::json->>'status' = 'PENDING'
      `,
      [eventId, INVITE_TITLE],
    );
    return rows[0]?.total || 0;
  }

  async findEventStaffAssignment(eventId, staffId) {
    const { rows } = await db.query(
      'SELECT id, event_id, staff_id FROM event_staffs WHERE event_id = $1 AND staff_id = $2 LIMIT 1',
      [eventId, staffId],
    );
    return rows[0];
  }

  async getStaffEventIds(staffId) {
    const { rows } = await db.query(
      'SELECT event_id FROM event_staffs WHERE staff_id = $1',
      [staffId],
    );
    return rows.map(r => r.event_id);
  }

  async assignStaff({ eventId, staffId, staffRole, assignedBy }) {
    const { rows } = await db.query(
      `
      INSERT INTO event_staffs (event_id, staff_id, staff_role, assigned_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (event_id, staff_id)
      DO UPDATE SET
        staff_role  = EXCLUDED.staff_role,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now()
      RETURNING id, event_id, staff_id, staff_role, assigned_by, assigned_at
      `,
      [eventId, staffId, staffRole || null, assignedBy],
    );
    return rows[0];
  }

  /**
   * Creates a staff invitation as a notification row.
   * Returns a normalised invitation object.
   */
  async createStaffInvitation({ eventId, organizerId, invitedUserId, email, staffRole, invitedBy }) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const meta = JSON.stringify({
      status: 'PENDING',
      organizer_id: organizerId,
      invited_email: email.toLowerCase(),
      staff_role: staffRole || null,
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

  /** List all invitations sent by an organizer (optionally filtered by event) */
  async listOrganizerInvitations(organizerId, eventId = null) {
    const params = [organizerId, INVITE_TITLE];
    const eventClause = eventId ? `AND n.event_id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        n.*,
        e.title   AS event_title,
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
        e.title AS event_title
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
   *   3. Insert into event_staffs
   * All in one transaction.
   */
  async acceptInvitation({ invitationId, userId, staffRole, acceptedBy }) {
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

      // Assign to event
      const assignmentResult = await client.query(
        `
        INSERT INTO event_staffs (event_id, staff_id, staff_role, assigned_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id, staff_id)
        DO UPDATE SET
          staff_role  = EXCLUDED.staff_role,
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = now()
        RETURNING id, event_id, staff_id, staff_role, assigned_by, assigned_at
        `,
        [notif.event_id, userId, staffRole || meta.staff_role || null, acceptedBy],
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
      await client.query(
        'DELETE FROM staff_tasks WHERE event_id = $1 AND staff_id = $2',
        [eventId, staffId],
      );
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
        es.assigned_at,
        assigner.full_name AS assigned_by_name
      FROM event_staffs es
      JOIN events e   ON e.id = es.event_id
      JOIN users  u   ON u.id = es.staff_id
      LEFT JOIN users assigner ON assigner.id = es.assigned_by
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventClause}
      ORDER BY es.assigned_at DESC
      `,
      params,
    );
    return rows;
  }

  async createTask({ eventId, staffId, title, description, createdBy }) {
    const { rows } = await db.query(
      `
      INSERT INTO staff_tasks (event_id, staff_id, title, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, event_id, staff_id, title, description, status, created_by, created_at, updated_at
      `,
      [eventId, staffId, title, description || null, createdBy],
    );
    return rows[0];
  }

  async listOrganizerTasks(organizerId, eventId = null) {
    const params = [organizerId];
    const eventClause = eventId ? `AND e.id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        st.id,
        st.event_id,
        e.title          AS event_title,
        st.staff_id,
        u.full_name      AS staff_name,
        u.email          AS staff_email,
        st.title,
        st.description,
        st.status,
        st.created_at,
        st.updated_at
      FROM staff_tasks st
      JOIN events e ON e.id = st.event_id
      JOIN users  u ON u.id = st.staff_id
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventClause}
      ORDER BY st.created_at DESC
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
        e.status,
        e.start_time,
        e.end_time,
        es.staff_role,
        es.assigned_at,
        COALESCE(venue_summary.venue_name,   '') AS venue_name,
        COALESCE(venue_summary.address_line, '') AS address_line,
        COALESCE(venue_summary.district,     '') AS district,
        COALESCE(venue_summary.city,         '') AS city,
        COALESCE(checkin_summary.checked_in,  0)::int AS checked_in,
        COALESCE(checkin_summary.total_valid, 0)::int AS total_valid
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN LATERAL (
        SELECT v.name AS venue_name, v.address_line, v.district, v.city
        FROM event_sessions sess
        JOIN venues v ON v.id = sess.venue_id
        WHERE sess.event_id = e.id
        ORDER BY sess.start_time ASC
        LIMIT 1
      ) venue_summary ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE t.status = 'USED')                    AS checked_in,
          COUNT(*) FILTER (WHERE t.status IN ('VALID', 'USED'))        AS total_valid
        FROM tickets t
        WHERE t.event_id = e.id
      ) checkin_summary ON true
      WHERE es.staff_id = $1
        AND e.deleted_at IS NULL
      ORDER BY e.start_time ASC
      `,
      [staffId],
    );
    return rows;
  }

  async listStaffTasks(staffId, eventId = null) {
    const params = [staffId];
    const eventClause = eventId ? `AND st.event_id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        st.id,
        st.event_id,
        e.title AS event_title,
        st.staff_id,
        st.title,
        st.description,
        st.status,
        st.created_at,
        st.updated_at
      FROM staff_tasks st
      JOIN events      e  ON e.id  = st.event_id
      JOIN event_staffs es ON es.event_id = st.event_id AND es.staff_id = st.staff_id
      WHERE st.staff_id = $1
        AND e.deleted_at IS NULL
        ${eventClause}
      ORDER BY
        CASE st.status WHEN 'TODO' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,
        st.created_at DESC
      `,
      params,
    );
    return rows;
  }
}

module.exports = new OperationsRepository();
