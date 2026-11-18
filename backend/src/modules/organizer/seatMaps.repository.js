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


async function insertSeatsBatch(client, seatMapId, seats, zoneIdMap) {
  const uniqueSeats = ensureUniqueSeatLabels(seats);
  if (!uniqueSeats || uniqueSeats.length === 0) return;

  const CHUNK_SIZE = 200;
  for (let i = 0; i < uniqueSeats.length; i += CHUNK_SIZE) {
    const chunk = uniqueSeats.slice(i, i + CHUNK_SIZE);
    const values = [];
    const placeholders = chunk.map((seat, idx) => {
      const zoneId = seat.zone_index != null ? zoneIdMap[seat.zone_index] ?? null : null;
      const offset = idx * 7;
      values.push(
        seatMapId,
        seat.row_label,
        seat.seat_number,
        seat.x_position,
        seat.y_position,
        zoneId,
        seat.is_disabled ?? false,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
    });

    await client.query(
      `
      INSERT INTO seats (
        seat_map_id, row_label, seat_number,
        x_position, y_position, zone_id, is_disabled
      )
      VALUES ${placeholders.join(', ')}
      `,
      values,
    );
  }
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
        e.title AS event_title,
        e.status AS event_status,
        COUNT(DISTINCT sz.id)::int AS db_zone_count,
        COUNT(DISTINCT s.id)::int AS db_seat_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM jsonb_array_elements(
            CASE 
              WHEN sm.config IS NOT NULL AND (sm.config::jsonb) ? 'standingAreas' AND jsonb_typeof((sm.config::jsonb)->'standingAreas') = 'array' THEN (sm.config::jsonb)->'standingAreas'
              WHEN sm.config IS NOT NULL AND (sm.config::jsonb) ? 'standing_areas' AND jsonb_typeof((sm.config::jsonb)->'standing_areas') = 'array' THEN (sm.config::jsonb)->'standing_areas'
              ELSE '[]'::jsonb
            END
          )
        ), 0)::int AS standing_area_count,
        COALESCE((
          SELECT SUM(COALESCE(NULLIF(sa->>'capacity', '')::int, 0))::int
          FROM jsonb_array_elements(
            CASE 
              WHEN sm.config IS NOT NULL AND (sm.config::jsonb) ? 'standingAreas' AND jsonb_typeof((sm.config::jsonb)->'standingAreas') = 'array' THEN (sm.config::jsonb)->'standingAreas'
              WHEN sm.config IS NOT NULL AND (sm.config::jsonb) ? 'standing_areas' AND jsonb_typeof((sm.config::jsonb)->'standing_areas') = 'array' THEN (sm.config::jsonb)->'standing_areas'
              ELSE '[]'::jsonb
            END
          ) AS sa
        ), 0)::int AS standing_capacity,
        COALESCE(usage_info.session_count, 0)::int AS session_count,
        COALESCE(usage_info.event_count, 0)::int AS event_count,
        (COALESCE(usage_info.is_published, false) OR COALESCE(usage_info.sold_or_held_seats_count, 0) > 0) AS is_append_only
      FROM seat_maps sm
      JOIN venues v ON v.id = sm.venue_id
      LEFT JOIN events e ON e.id = sm.event_id AND e.deleted_at IS NULL
      LEFT JOIN seat_zones sz ON sz.seat_map_id = sm.id
      LEFT JOIN seats s ON s.seat_map_id = sm.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT es.id)::int AS session_count,
          COUNT(DISTINCT es.event_id)::int AS event_count,
          BOOL_OR(e2.status IN ('PUBLISHED', 'COMPLETED') OR e2.approval_status = 'APPROVED') AS is_published,
          COALESCE((
            SELECT COUNT(*)::int
            FROM session_seats ss
            JOIN event_sessions es2 ON es2.id = ss.event_session_id
            WHERE es2.seat_map_id = sm.id
              AND ss.status IN ('SOLD', 'HELD')
          ), 0)::int AS sold_or_held_seats_count
        FROM event_sessions es
        JOIN events e2 ON e2.id = es.event_id
        WHERE es.seat_map_id = sm.id
          AND e2.deleted_at IS NULL
      ) usage_info ON true
      WHERE sm.venue_id = $1 AND sm.deleted_at IS NULL AND v.organizer_id = $2
      GROUP BY sm.id, e.title, e.status, usage_info.session_count, usage_info.event_count, usage_info.is_published, usage_info.sold_or_held_seats_count
      ORDER BY sm.created_at DESC
      `,
      [venueId, organizerId],
    );

    return rows.map((sm) => {
      let seatCount = sm.db_seat_count || 0;
      if (seatCount === 0 && (sm.layout_type || 'GRID') === 'GRID' && sm.rows_count > 0 && sm.cols_count > 0) {
        seatCount = sm.rows_count * sm.cols_count;
      }

      let zoneCount = sm.db_zone_count || 0;
      if (zoneCount === 0 && Array.isArray(sm.config?.zones)) {
        zoneCount = sm.config.zones.length;
      }
      zoneCount += sm.standing_area_count || 0;

      const totalCapacity = seatCount + (sm.standing_capacity || 0);

      return {
        ...sm,
        seat_count: totalCapacity || seatCount,
        zone_count: zoneCount,
        total_capacity: totalCapacity,
        is_append_only: Boolean(sm.is_append_only),
        event_title: sm.event_title || null,
        session_count: sm.session_count || 0,
      };
    });
  }

  async countSessionUsage(seatMapId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(*)::int AS count
      FROM event_sessions es
      JOIN events e ON e.id = es.event_id
      WHERE es.seat_map_id = $1
        AND e.status NOT IN ('DRAFT', 'CANCELLED')
      `,
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
        COALESCE(seats_data.seats, '[]'::json) AS seats,
        COALESCE(usage_info.session_count, 0)::int AS session_count,
        COALESCE(usage_info.event_count, 0)::int AS event_count,
        COALESCE(usage_info.is_published, false) AS is_published,
        COALESCE(usage_info.sold_or_held_seats_count, 0)::int AS sold_or_held_seats_count,
        (COALESCE(usage_info.is_published, false) OR COALESCE(usage_info.sold_or_held_seats_count, 0) > 0) AS is_append_only
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
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT es.id)::int AS session_count,
          COUNT(DISTINCT es.event_id)::int AS event_count,
          BOOL_OR(e.status IN ('PUBLISHED', 'COMPLETED') OR e.approval_status = 'APPROVED') AS is_published,
          COALESCE((
            SELECT COUNT(*)::int
            FROM session_seats ss
            JOIN event_sessions es2 ON es2.id = ss.event_session_id
            WHERE es2.seat_map_id = sm.id
              AND ss.status IN ('SOLD', 'HELD')
          ), 0)::int AS sold_or_held_seats_count
        FROM event_sessions es
        JOIN events e ON e.id = es.event_id
        WHERE es.seat_map_id = sm.id
          AND e.deleted_at IS NULL
      ) usage_info ON true
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

      await insertSeatsBatch(client, seatMap.id, data.seats, zoneIdMap);

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

      await client.query(`DELETE FROM ticket_type_seats WHERE seat_id IN (SELECT id FROM seats WHERE seat_map_id = $1)`, [seatMapId]);
      await client.query(`DELETE FROM session_seats WHERE seat_id IN (SELECT id FROM seats WHERE seat_map_id = $1)`, [seatMapId]);
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

      await insertSeatsBatch(client, seatMapId, data.seats, zoneIdMap);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSeatMapUsageDetails(seatMapId) {
    const { rows } = await db.query(
      `
      SELECT
        COUNT(DISTINCT es.id)::int AS session_count,
        COUNT(DISTINCT es.event_id)::int AS event_count,
        BOOL_OR(e.status IN ('PUBLISHED', 'COMPLETED') OR e.approval_status = 'APPROVED') AS is_published,
        COALESCE((
          SELECT COUNT(*)::int
          FROM session_seats ss
          JOIN event_sessions es2 ON es2.id = ss.event_session_id
          WHERE es2.seat_map_id = $1
            AND ss.status IN ('SOLD', 'HELD')
        ), 0)::int AS sold_or_held_seats_count
      FROM event_sessions es
      JOIN events e ON e.id = es.event_id
      WHERE es.seat_map_id = $1
        AND e.deleted_at IS NULL
      `,
      [seatMapId],
    );
    const usage = rows[0] || {};
    const isPublished = Boolean(usage.is_published);
    const soldOrHeld = Number(usage.sold_or_held_seats_count || 0);
    return {
      session_count: Number(usage.session_count || 0),
      event_count: Number(usage.event_count || 0),
      is_published: isPublished,
      sold_or_held_seats_count: soldOrHeld,
      is_append_only: isPublished || soldOrHeld > 0,
    };
  }

  async findDedicatedSeatMapForEvent(eventId) {
    const { rows } = await db.query(
      `SELECT * FROM seat_maps WHERE event_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [eventId],
    );
    return rows[0] || null;
  }

  async cloneSeatMap(sourceSeatMapId, { venueId = null, eventId = null, name = null, client = null } = {}) {
    const dbClient = client || await db.getClient();
    const shouldManageTx = !client;
    try {
      if (shouldManageTx) await dbClient.query('BEGIN');

      // 1. Lấy thông tin sơ đồ gốc
      const { rows: sourceRows } = await dbClient.query(
        `SELECT * FROM seat_maps WHERE id = $1 AND deleted_at IS NULL`,
        [sourceSeatMapId],
      );
      const source = sourceRows[0];
      if (!source) {
        throw new Error('Sơ đồ ghế gốc không tồn tại.');
      }

      // 2. Tạo bản ghi seat_maps mới cho sự kiện
      const targetVenueId = venueId || source.venue_id;
      const targetName = name || `${source.name} (Bản sao)`;
      const { rows: newMapRows } = await dbClient.query(
        `
        INSERT INTO seat_maps (
          venue_id, event_id, name, layout_type, canvas_width, canvas_height,
          config, rows_count, cols_count, is_active,
          stage_position, custom_stage_x, custom_stage_y, custom_stage_width, custom_stage_height
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14)
        RETURNING *
        `,
        [
          targetVenueId,
          eventId || null,
          targetName,
          source.layout_type || 'GRID',
          source.canvas_width || 900,
          source.canvas_height || 600,
          source.config || {},
          source.rows_count || 0,
          source.cols_count || 0,
          source.stage_position || 'BOTTOM',
          source.custom_stage_x || null,
          source.custom_stage_y || null,
          source.custom_stage_width || null,
          source.custom_stage_height || null,
        ],
      );
      const newSeatMap = newMapRows[0];

      // 3. Nhân bản seat_zones
      const { rows: sourceZones } = await dbClient.query(
        `SELECT * FROM seat_zones WHERE seat_map_id = $1 ORDER BY sort_order ASC, created_at ASC`,
        [sourceSeatMapId],
      );
      const zoneIdMap = {};
      for (const sz of sourceZones) {
        const { rows: newZoneRows } = await dbClient.query(
          `
          INSERT INTO seat_zones (seat_map_id, name, color, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [newSeatMap.id, sz.name, sz.color, sz.sort_order],
        );
        zoneIdMap[sz.id] = newZoneRows[0].id;
      }

      // 4. Nhân bản seats
      const { rows: sourceSeats } = await dbClient.query(
        `SELECT * FROM seats WHERE seat_map_id = $1 ORDER BY y_position, x_position`,
        [sourceSeatMapId],
      );
      const seatIdMap = {};
      for (const seat of sourceSeats) {
        const newZoneId = seat.zone_id ? (zoneIdMap[seat.zone_id] || null) : null;
        const { rows: newSeatRows } = await dbClient.query(
          `
          INSERT INTO seats (
            seat_map_id, row_label, seat_number,
            x_position, y_position, zone_id, is_disabled
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
          `,
          [
            newSeatMap.id,
            seat.row_label,
            seat.seat_number,
            seat.x_position,
            seat.y_position,
            newZoneId,
            Boolean(seat.is_disabled),
          ],
        );
        seatIdMap[seat.id] = newSeatRows[0].id;
      }

      if (shouldManageTx) await dbClient.query('COMMIT');
      return {
        newSeatMapId: newSeatMap.id,
        seatMap: newSeatMap,
        zoneIdMap,
        seatIdMap,
      };
    } catch (err) {
      if (shouldManageTx) await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) dbClient.release();
    }
  }

  async appendSeatMapData(seatMapId, data) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Lấy danh sách ghế và khu vực hiện có
      const { rows: existingSeats } = await client.query(
        `SELECT id, row_label, seat_number, x_position, y_position, zone_id, is_disabled FROM seats WHERE seat_map_id = $1`,
        [seatMapId],
      );
      const existingSeatMap = new Map();
      existingSeats.forEach((s) => existingSeatMap.set(String(s.id), s));

      const { rows: existingZones } = await client.query(
        `SELECT id, name, color, sort_order FROM seat_zones WHERE seat_map_id = $1`,
        [seatMapId],
      );
      const existingZoneMap = new Map();
      existingZones.forEach((z) => existingZoneMap.set(String(z.id), z));

      // 2. Kiểm tra ghế: Toàn bộ ghế cũ phải còn nguyên vẹn, không được xóa hoặc đổi vị trí
      const payloadSeats = data.seats || [];
      const payloadSeatIdSet = new Set();
      const newSeats = [];

      for (const s of payloadSeats) {
        const id = s.id || s.localId;
        if (id && existingSeatMap.has(String(id))) {
          const sid = String(id);
          payloadSeatIdSet.add(sid);
          const orig = existingSeatMap.get(sid);
          if (
            orig.row_label !== s.row_label ||
            orig.seat_number !== s.seat_number ||
            Boolean(orig.is_disabled) !== Boolean(s.is_disabled) ||
            Math.abs(Number(orig.x_position) - Number(s.x_position)) > 2 ||
            Math.abs(Number(orig.y_position) - Number(s.y_position)) > 2
          ) {
            throw new Error(`Ghế ${orig.row_label}-${orig.seat_number} đã tồn tại trong sự kiện đã mở bán, không được phép thay đổi vị trí, nhãn hàng hoặc số ghế.`);
          }
        } else {
          newSeats.push(s);
        }
      }

      // Chặn xóa ghế cũ
      for (const [id, orig] of existingSeatMap.entries()) {
        if (!payloadSeatIdSet.has(id)) {
          throw new Error(`Không thể xóa ghế đã tồn tại (${orig.row_label}-${orig.seat_number}) vì sự kiện đã mở bán vé.`);
        }
      }

      // 3. Kiểm tra khu vực: Không được xóa khu vực cũ
      const payloadZones = data.zones || [];
      const payloadZoneIdSet = new Set();
      const newZones = [];

      for (let i = 0; i < payloadZones.length; i++) {
        const z = payloadZones[i];
        const id = z.id || z.localId;
        if (id && existingZoneMap.has(String(id))) {
          payloadZoneIdSet.add(String(id));
        } else {
          newZones.push({ ...z, sort_order: z.sort_order ?? i, original_index: i });
        }
      }

      for (const [id, orig] of existingZoneMap.entries()) {
        if (!payloadZoneIdSet.has(id)) {
          throw new Error(`Không thể xóa khu vực "${orig.name}" đã tồn tại vì sơ đồ đang được sử dụng.`);
        }
      }

      // 4. Thêm khu vực mới (nếu có)
      const zoneIndexMap = {};
      for (const nz of newZones) {
        const { rows: nzRows } = await client.query(
          `
          INSERT INTO seat_zones (seat_map_id, name, color, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [seatMapId, nz.name, nz.color, nz.sort_order],
        );
        const newZid = nzRows[0].id;
        if (nz.localId) zoneIndexMap[nz.localId] = newZid;
        if (nz.original_index !== undefined) zoneIndexMap[nz.original_index] = newZid;
      }

      // 5. Thêm ghế mới (nếu có)
      const createdSeatIds = [];
      if (newSeats.length > 0) {
        for (const ns of newSeats) {
          let targetZoneId = ns.zone_id || null;
          if (!targetZoneId && ns.zoneLocalId && zoneIndexMap[ns.zoneLocalId]) {
            targetZoneId = zoneIndexMap[ns.zoneLocalId];
          } else if (!targetZoneId && ns.zone_index !== undefined && zoneIndexMap[ns.zone_index]) {
            targetZoneId = zoneIndexMap[ns.zone_index];
          }

          const { rows: seatRows } = await client.query(
            `
            INSERT INTO seats (
              seat_map_id, row_label, seat_number,
              x_position, y_position, zone_id, is_disabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            `,
            [
              seatMapId,
              ns.row_label,
              ns.seat_number,
              ns.x_position,
              ns.y_position,
              targetZoneId,
              Boolean(ns.is_disabled),
            ],
          );
          createdSeatIds.push(seatRows[0].id);
        }
      }

      // 6. Cập nhật metadata sơ đồ (standingAreas, auxiliaryElements, config, etc.)
      await client.query(
        `
        UPDATE seat_maps
        SET name = COALESCE($2, name),
            config = COALESCE($3, config),
            rows_count = GREATEST(rows_count, $4),
            cols_count = GREATEST(cols_count, $5),
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          seatMapId,
          data.name,
          data.config || {},
          data.rows_count || 0,
          data.cols_count || 0,
        ],
      );

      // 7. TỰ ĐỘNG ĐỒNG BỘ SESSION (REQUIREMENT 4):
      // Tìm tất cả các session đang liên kết với seat_map_id này mà chưa kết thúc
      const { rows: activeSessions } = await client.query(
        `
        SELECT id, session_name
        FROM event_sessions
        WHERE seat_map_id = $1
          AND (end_time > NOW() OR end_time IS NULL)
        `,
        [seatMapId],
      );

      // Với mỗi ghế mới thêm, tự động tạo session_seats với trạng thái 'AVAILABLE' cho các session còn hiệu lực
      if (createdSeatIds.length > 0 && activeSessions.length > 0) {
        for (const session of activeSessions) {
          for (const newSeatId of createdSeatIds) {
            await client.query(
              `
              INSERT INTO session_seats (event_session_id, seat_id, status)
              VALUES ($1, $2, 'AVAILABLE')
              ON CONFLICT (event_session_id, seat_id) DO NOTHING
              `,
              [session.id, newSeatId],
            );
          }
        }
      }

      await client.query('COMMIT');
      return {
        updated: true,
        new_seats_count: createdSeatIds.length,
        synced_sessions_count: activeSessions.length,
      };
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
