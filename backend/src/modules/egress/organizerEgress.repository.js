const db = require('../../infrastructure/database/db.client');

class OrganizerEgressRepository {
  async findByOrganizerId(organizerId, client = db) {
    const { rows } = await client.query(
      `SELECT * FROM organizer_egress_gateways WHERE organizer_id = $1 LIMIT 1`,
      [organizerId]
    );
    return rows[0] || null;
  }

  async findByEgressIp(ip, client = db) {
    const { rows } = await client.query(
      `SELECT * FROM organizer_egress_gateways WHERE egress_ip = $1 LIMIT 1`,
      [ip]
    );
    return rows[0] || null;
  }

  async getAllAllocatedIps(client = db) {
    const { rows } = await client.query(
      `SELECT egress_ip FROM organizer_egress_gateways`
    );
    return new Set(rows.map((r) => r.egress_ip));
  }

  async create(data, client = db) {
    const {
      organizer_id,
      gateway_type = 'MOCK',
      egress_ip,
      proxy_url = null,
      status = 'PENDING_WHITELIST',
      is_mock = true,
      metadata = {},
    } = data;

    const { rows } = await client.query(
      `INSERT INTO organizer_egress_gateways (
        organizer_id,
        gateway_type,
        egress_ip,
        proxy_url,
        status,
        is_mock,
        metadata,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *`,
      [organizer_id, gateway_type, egress_ip, proxy_url, status, is_mock, JSON.stringify(metadata)]
    );
    return rows[0];
  }

  async update(id, data, client = db) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (['gateway_type', 'egress_ip', 'proxy_url', 'status', 'is_mock', 'last_verified_at', 'metadata'].includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'metadata' ? JSON.stringify(val) : val);
        idx++;
      }
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const { rows } = await client.query(
      `UPDATE organizer_egress_gateways SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async updateStatus(organizerId, status, lastVerifiedAt = null, client = db) {
    const { rows } = await client.query(
      `UPDATE organizer_egress_gateways
       SET status = $2,
           last_verified_at = COALESCE($3, last_verified_at),
           updated_at = CURRENT_TIMESTAMP
       WHERE organizer_id = $1
       RETURNING *`,
      [organizerId, status, lastVerifiedAt]
    );
    return rows[0] || null;
  }
}

module.exports = new OrganizerEgressRepository();
