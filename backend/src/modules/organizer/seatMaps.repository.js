const db = require('../../infrastructure/database/db.client');

function ensureUniqueSeatLabels(seats) {
  const seen = new Set();
  return (seats || []).map((seat, index) => {
    let rowLabel = String(seat.row_label ?? 'R').trim() || 'R';
    let seatNumber = String(seat.seat_number ?? index + 1).trim() || String(index + 1);
    let key = `${rowLabel}:${seatNumber}`;
    let counter = 1;

    while (seen.has(key)) {
      seatNumber = `${seat.seat_number ?? index + 1}-${counter}`;
      counter += 1;
      key = `${rowLabel}:${seatNumber}`;
    }

    seen.add(key);
    return { ...seat, row_label: rowLabel, seat_number: seatNumber };
  });
}


class SeatMapsRepository {
  async findOrganizerByUserId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM organizers WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [userId],
    );
    return rows[0];
  }

  async assertVenueOwned(venueId, organizerId) {
    const { rows } = await db.query(
      `SELECT id FROM venues WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [venueId, organizerId],
    );
    return rows[0];
  }

  async findSeatMapsByVenue(venueId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        sm.*,
        COUNT(DISTINCT sz.id)::int AS zone_count,
        COUNT(DISTINCT s.id)::int AS seat_count
      FROM seat_maps sm
      JOIN venues v ON v.id = sm.venue_id
      LEFT JOIN seat_zones sz ON sz.seat_map_id = sm.id
      LEFT JOIN seats s ON s.seat_map_id = sm.id
      WHERE sm.venue_id = $1 AND sm.deleted_at IS NULL AND v.organizer_id = $2
      GROUP BY sm.id
      ORDER BY sm.created_at DESC
      `,
      [venueId, organizerId],
    );
    return rows;
  }

  async countSessionUsage(seatMapId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM event_sessions WHERE seat_map_id = $1`,
      [seatMapId],
    );
    return rows[0]?.count || 0;
  }

  async findSeatMapById(seatMapId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        sm.*,
        v.name AS venue_name,
        COALESCE(zones.zones, '[]'::json) AS zones,
        COALESCE(seats_data.seats, '[]'::json) AS seats
      FROM seat_maps sm
      JOIN venues v ON v.id = sm.venue_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', sz.id,
          'name', sz.name,
          'color', sz.color,
          'sort_order', sz.sort_order
        ) ORDER BY sz.sort_order ASC) AS zones
        FROM seat_zones sz
        WHERE sz.seat_map_id = sm.id
      ) zones ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', s.id,
          'row_label', s.row_label,
          'seat_number', s.seat_number,
          'x_position', s.x_position,
          'y_position', s.y_position,
          'zone_id', s.zone_id,
          'is_disabled', s.is_disabled
        ) ORDER BY s.y_position, s.x_position) AS seats
        FROM seats s
        WHERE s.seat_map_id = sm.id
      ) seats_data ON true
      WHERE sm.id = $1 AND sm.deleted_at IS NULL AND v.organizer_id = $2
      LIMIT 1
      `,
      [seatMapId, organizerId],
    );
    return rows[0];
  }

  async insertSeatMapWithData(venueId, data) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { rows: seatMapRows } = await client.query(
        `
        INSERT INTO seat_maps (
          venue_id, name, layout_type, canvas_width, canvas_height,
          config, rows_count, cols_count, is_active,
          stage_position, custom_stage_x, custom_stage_y, custom_stage_width, custom_stage_height
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13)
        RETURNING *
        `,
        [
          venueId,
          data.name,
          data.layout_type || 'GRID',
          data.canvas_width || 900,
          data.canvas_height || 600,
          data.config || {},
          data.rows_count || 0,
          data.cols_count || 0,
          data.stage_position || 'BOTTOM',
          data.custom_stage_x || null,
          data.custom_stage_y || null,
          data.custom_stage_width || null,
          data.custom_stage_height || null,
        ],
      );
      const seatMap = seatMapRows[0];
      const zoneIdMap = {};

      for (let i = 0; i < (data.zones || []).length; i += 1) {
        const z = data.zones[i];
        const { rows: zoneRows } = await client.query(
          `
          INSERT INTO seat_zones (seat_map_id, name, color, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [seatMap.id, z.name, z.color, z.sort_order ?? i],
        );
        zoneIdMap[i] = zoneRows[0].id;
      }

      for (const seat of ensureUniqueSeatLabels(data.seats)) {
        const zoneId = seat.zone_index != null ? zoneIdMap[seat.zone_index] ?? null : null;
        await client.query(
          `
          INSERT INTO seats (
            seat_map_id, row_label, seat_number,
            x_position, y_position, zone_id, is_disabled
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            seatMap.id,
            seat.row_label,
            seat.seat_number,
            seat.x_position,
            seat.y_position,
            zoneId,
            seat.is_disabled ?? false,
          ],
        );
      }

      await client.query('COMMIT');
      return seatMap.id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async replaceSeatMapData(seatMapId, data) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(`DELETE FROM seats WHERE seat_map_id = $1`, [seatMapId]);
      await client.query(`DELETE FROM seat_zones WHERE seat_map_id = $1`, [seatMapId]);

      await client.query(
        `
        UPDATE seat_maps
        SET name = $2, layout_type = $3, canvas_width = $4, canvas_height = $5,
            config = $6, rows_count = $7, cols_count = $8, updated_at = NOW(),
            stage_position = $9, custom_stage_x = $10, custom_stage_y = $11, 
            custom_stage_width = $12, custom_stage_height = $13
        WHERE id = $1
        `,
        [
          seatMapId,
          data.name,
          data.layout_type || 'GRID',
          data.canvas_width || 900,
          data.canvas_height || 600,
          data.config || {},
          data.rows_count || 0,
          data.cols_count || 0,
          data.stage_position || 'BOTTOM',
          data.custom_stage_x || null,
          data.custom_stage_y || null,
          data.custom_stage_width || null,
          data.custom_stage_height || null,
        ],
      );

      const zoneIdMap = {};
      for (let i = 0; i < (data.zones || []).length; i += 1) {
        const z = data.zones[i];
        const { rows: zoneRows } = await client.query(
          `
          INSERT INTO seat_zones (seat_map_id, name, color, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [seatMapId, z.name, z.color, z.sort_order ?? i],
        );
        zoneIdMap[i] = zoneRows[0].id;
      }

      for (const seat of ensureUniqueSeatLabels(data.seats)) {
        const zoneId = seat.zone_index != null ? zoneIdMap[seat.zone_index] ?? null : null;
        await client.query(
          `
          INSERT INTO seats (
            seat_map_id, row_label, seat_number,
            x_position, y_position, zone_id, is_disabled
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            seatMapId,
            seat.row_label,
            seat.seat_number,
            seat.x_position,
            seat.y_position,
            zoneId,
            seat.is_disabled ?? false,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async softDelete(seatMapId) {
    const { rows } = await db.query(
      `
      UPDATE seat_maps
      SET deleted_at = NOW(), updated_at = NOW(), is_active = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
      `,
      [seatMapId],
    );
    return rows[0];
  }
}

module.exports = new SeatMapsRepository();
