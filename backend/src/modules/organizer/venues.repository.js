const db = require('../../infrastructure/database/db.client');

class VenuesRepository {
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

  async findByOrganizer(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        v.*,
        COUNT(DISTINCT sm.id)::int AS seat_map_count,
        COALESCE(MAX(seat_cnt.c), 0)::int AS max_seats,
        COALESCE(SUM(seat_cnt.c), 0)::int AS total_seats
      FROM venues v
      LEFT JOIN seat_maps sm ON sm.venue_id = v.id AND sm.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS c FROM seats WHERE seat_map_id = sm.id AND COALESCE(is_disabled, false) = false
      ) seat_cnt ON true
      WHERE v.organizer_id = $1 AND v.deleted_at IS NULL
      GROUP BY v.id
      ORDER BY v.created_at DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async findById(venueId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT v.*
      FROM venues v
      WHERE v.id = $1 AND v.organizer_id = $2 AND v.deleted_at IS NULL
      LIMIT 1
      `,
      [venueId, organizerId],
    );
    return rows[0];
  }

  async countActiveUsage(venueId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(*)::int AS count
      FROM event_sessions es
      JOIN events e ON e.id = es.event_id
      WHERE es.venue_id = $1
        AND e.status NOT IN ('DRAFT', 'CANCELLED', 'COMPLETED')
        AND e.deleted_at IS NULL
      `,
      [venueId],
    );
    return rows[0]?.count || 0;
  }

  async create(organizerId, data) {
    const { rows } = await db.query(
      `
      INSERT INTO venues (
        organizer_id, name, country, city, district, ward,
        address_line, latitude, longitude, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        organizerId,
        data.name,
        data.country || 'Vietnam',
        data.city || null,
        data.district || null,
        data.ward || null,
        data.address_line,
        data.latitude ?? null,
        data.longitude ?? null,
        data.description || null,
      ],
    );
    return rows[0];
  }

  async update(venueId, organizerId, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    ['name', 'country', 'city', 'district', 'ward', 'address_line', 'latitude', 'longitude', 'description'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx += 1;
      }
    });

    if (!fields.length) return this.findById(venueId, organizerId);

    values.push(venueId, organizerId);
    const { rows } = await db.query(
      `
      UPDATE venues
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx} AND organizer_id = $${idx + 1} AND deleted_at IS NULL
      RETURNING *
      `,
      values,
    );
    return rows[0];
  }

  async softDelete(venueId, organizerId) {
    const { rows } = await db.query(
      `
      UPDATE venues
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL
      RETURNING id
      `,
      [venueId, organizerId],
    );
    return rows[0];
  }
}

module.exports = new VenuesRepository();
