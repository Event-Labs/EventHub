const db = require('../../infrastructure/database/db.client');
const { DEVICE_ONLINE_THRESHOLD_SEC } = require('../iot/iot.utils');
const iotRepository = require('../iot/iot.repository');

const SAFE_DEVICE_SELECT = `
  SELECT
    d.id,
    d.mac_address,
    d.name,
    d.hardware,
    d.status,
    d.pairing_code,
    d.pairing_expires_at,
    d.assigned_event_id,
    d.auto_confirm,
    d.config_version,
    d.firmware_version,
    d.last_ip,
    d.last_rssi,
    d.last_free_heap,
    d.last_uptime_sec,
    d.last_seen_at,
    d.approved_by,
    d.approved_at,
    d.created_at,
    d.updated_at,
    (d.pending_secret_plain IS NOT NULL AND (d.pending_secret_expires_at IS NULL OR d.pending_secret_expires_at > now())) AS has_pending_claim,
    (d.secret_hash IS NOT NULL) AS has_secret,
    (d.status = 'ACTIVE' AND d.last_seen_at IS NOT NULL AND d.last_seen_at >= now() - ($1::int * interval '1 second')) AS is_online,
    e.title AS event_title,
    e.slug AS event_slug,
    e.status AS event_status,
    e.start_time AS event_start_time,
    e.end_time AS event_end_time,
    COALESCE(org.organization_name, ou.full_name) AS organizer_name,
    approver.full_name AS approved_by_name,
    COALESCE(ticket_stats.checked_in_count, 0)::int AS checked_in_count
  FROM checkin_devices d
  LEFT JOIN events e ON e.id = d.assigned_event_id AND e.deleted_at IS NULL
  LEFT JOIN organizers org ON org.id = e.organizer_id
  LEFT JOIN users ou ON ou.id = org.user_id
  LEFT JOIN users approver ON approver.id = d.approved_by
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS checked_in_count
    FROM tickets t
    WHERE t.checked_in_device_id = d.id
  ) ticket_stats ON true
`;

class AdminDevicesRepository {
  async listDevices({ status = 'ALL', online = 'ALL', eventId = '', search = '' } = {}) {
    const params = [DEVICE_ONLINE_THRESHOLD_SEC];
    const conditions = [];

    if (status && status !== 'ALL') {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    if (eventId) {
      params.push(eventId);
      conditions.push(`d.assigned_event_id = $${params.length}`);
    }

    if (online === 'ONLINE') {
      conditions.push(
        `d.status = 'ACTIVE' AND d.last_seen_at IS NOT NULL AND d.last_seen_at >= now() - ($1::int * interval '1 second')`,
      );
    } else if (online === 'OFFLINE') {
      conditions.push(
        `(d.status != 'ACTIVE' OR d.last_seen_at IS NULL OR d.last_seen_at < now() - ($1::int * interval '1 second'))`,
      );
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(COALESCE(d.name, '') ILIKE $${params.length} OR d.mac_address ILIKE $${params.length} OR COALESCE(d.pairing_code, '') ILIKE $${params.length} OR COALESCE(d.last_ip, '') ILIKE $${params.length})`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `
      ${SAFE_DEVICE_SELECT}
      ${whereClause}
      ORDER BY
        CASE d.status
          WHEN 'PENDING' THEN 0
          WHEN 'ACTIVE' THEN 1
          WHEN 'DISABLED' THEN 2
          ELSE 3
        END,
        d.last_seen_at DESC NULLS LAST,
        d.created_at DESC
      `,
      params,
    );

    return rows;
  }

  async getStats() {
    const { rows } = await db.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (WHERE status = 'DISABLED')::int AS disabled,
        COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked,
        COUNT(*) FILTER (
          WHERE status = 'ACTIVE'
            AND last_seen_at IS NOT NULL
            AND last_seen_at >= now() - ($1::int * interval '1 second')
        )::int AS online
      FROM checkin_devices
      `,
      [DEVICE_ONLINE_THRESHOLD_SEC],
    );

    return rows[0] || {
      total: 0,
      pending: 0,
      active: 0,
      disabled: 0,
      revoked: 0,
      online: 0,
    };
  }

  async listAssignableEvents() {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.status,
        e.approval_status,
        e.start_time,
        e.end_time,
        COALESCE(o.organization_name, ou.full_name) AS organizer_name
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN users ou ON ou.id = o.user_id
      WHERE e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.display_state, 'VISIBLE') != 'SUSPENDED_BY_ADMIN'
      ORDER BY e.start_time DESC
      LIMIT 200
      `,
    );
    return rows;
  }

  async findAssignableEventById(eventId) {
    const { rows } = await db.query(
      `
      SELECT id, title, slug, status, approval_status, start_time, end_time
      FROM events
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0] || null;
  }

  async findById(id) {
    const { rows } = await db.query(
      `
      ${SAFE_DEVICE_SELECT}
      WHERE d.id = $2
      LIMIT 1
      `,
      [DEVICE_ONLINE_THRESHOLD_SEC, id],
    );
    return rows[0] || null;
  }

  async findRawById(id) {
    const { rows } = await db.query(
      `SELECT * FROM checkin_devices WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  async getRecentCheckIns(deviceId, limit = 20) {
    const history = await iotRepository.queryDeviceHistory(deviceId, { page: 1, limit });
    return history.items;
  }

  async getDeviceHistory(deviceId, filters = {}) {
    return iotRepository.queryDeviceHistory(deviceId, filters);
  }

  async getDeviceHistoryStats(deviceId) {
    return iotRepository.getDeviceHistoryStats(deviceId);
  }

  async approveDevice(
    id,
    { name, assignedEventId, autoConfirm, secretHash, pendingSecretPlain, pendingSecretExpiresAt, approvedBy },
  ) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET name = $2,
          assigned_event_id = $3,
          auto_confirm = $4,
          status = 'ACTIVE',
          secret_hash = $5,
          pending_secret_plain = $6,
          pending_secret_expires_at = $7,
          config_version = config_version + 1,
          approved_by = $8,
          approved_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [
        id,
        name,
        assignedEventId || null,
        Boolean(autoConfirm),
        secretHash,
        pendingSecretPlain,
        pendingSecretExpiresAt,
        approvedBy,
      ],
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async updateDeviceConfig(id, { name, assignedEventId, autoConfirm }) {
    const sets = ['config_version = config_version + 1', 'updated_at = now()'];
    const params = [id];

    if (name !== undefined) {
      params.push(name);
      sets.push(`name = $${params.length}`);
    }

    if (assignedEventId !== undefined) {
      params.push(assignedEventId);
      sets.push(`assigned_event_id = $${params.length}`);
    }

    if (autoConfirm !== undefined) {
      params.push(Boolean(autoConfirm));
      sets.push(`auto_confirm = $${params.length}`);
    }

    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING id
      `,
      params,
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async disableDevice(id) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET status = 'DISABLED',
          config_version = config_version + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async enableDevice(id) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET status = 'ACTIVE',
          config_version = config_version + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async revokeDevice(id) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET status = 'REVOKED',
          secret_hash = NULL,
          pending_secret_plain = NULL,
          pending_secret_expires_at = NULL,
          claim_token_hash = NULL,
          pairing_code = NULL,
          pairing_expires_at = NULL,
          assigned_event_id = NULL,
          config_version = config_version + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async resetDevicePairing(id) {
    const { rows } = await db.query(
      `
      UPDATE checkin_devices
      SET status = 'REVOKED',
          secret_hash = NULL,
          pending_secret_plain = NULL,
          pending_secret_expires_at = NULL,
          claim_token_hash = NULL,
          pairing_code = NULL,
          pairing_expires_at = NULL,
          config_version = config_version + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async deleteDevice(id) {
    const { rowCount } = await db.query(
      `DELETE FROM checkin_devices WHERE id = $1`,
      [id],
    );
    return rowCount > 0;
  }
}

module.exports = new AdminDevicesRepository();

