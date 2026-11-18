require('../src/config/env');
const db = require('../src/infrastructure/database/db.client');

async function separateSharedSeatMaps() {
  console.log('=== BẮT ĐẦU KIỂM TRA VÀ TÁCH CÁC SEAT MAP DÙNG CHUNG (REQUIREMENT 8) ===\n');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Tìm các seat_map_id đang được dùng bởi nhiều hơn 1 event
    const { rows: sharedMaps } = await client.query(`
      SELECT 
        es.seat_map_id,
        sm.name as seat_map_name,
        sm.venue_id,
        COUNT(DISTINCT es.event_id) as event_count,
        array_agg(DISTINCT es.event_id) as event_ids
      FROM event_sessions es
      JOIN seat_maps sm ON sm.id = es.seat_map_id
      WHERE es.seat_map_id IS NOT NULL
      GROUP BY es.seat_map_id, sm.name, sm.venue_id
      HAVING COUNT(DISTINCT es.event_id) > 1;
    `);

    console.log(`Tìm thấy ${sharedMaps.length} sơ đồ ghế đang được dùng chung bởi nhiều sự kiện:`);
    for (const sm of sharedMaps) {
      console.log(`- Sơ đồ "${sm.seat_map_name}" (ID: ${sm.seat_map_id}): được dùng bởi ${sm.event_count} sự kiện.`);
    }

    let totalCloned = 0;
    let totalSessionsRemapped = 0;
    let totalSessionSeatsRemapped = 0;
    let totalTicketTypeSeatsRemapped = 0;

    for (const shared of sharedMaps) {
      const originalSeatMapId = shared.seat_map_id;
      const eventIds = shared.event_ids;
      console.log(`\nĐang xử lý tách sơ đồ "${shared.seat_map_name}"...`);

      // Sự kiện đầu tiên (index 0) gán event_id vào bản gốc
      const firstEventId = eventIds[0];
      await client.query(`
        UPDATE seat_maps
        SET event_id = $1
        WHERE id = $2 AND event_id IS NULL
      `, [firstEventId, originalSeatMapId]);

      // Tách cho các sự kiện tiếp theo (từ index 1)
      for (let i = 1; i < eventIds.length; i++) {
        const targetEventId = eventIds[i];
        const { rows: eventRows } = await client.query(`SELECT title FROM events WHERE id = $1`, [targetEventId]);
        const eventTitle = eventRows[0]?.title || `Sự kiện ${targetEventId.slice(0, 8)}`;

        console.log(`  -> Tách bản sao riêng cho sự kiện: "${eventTitle}" (Event ID: ${targetEventId})`);

        // Lấy thông tin seat_map gốc
        const { rows: origMapRows } = await client.query(`SELECT * FROM seat_maps WHERE id = $1`, [originalSeatMapId]);
        const origMap = origMapRows[0];

        // Tạo bản sao seat_map mới
        const newMapName = `${eventTitle} - ${origMap.name}`;
        const { rows: newMapRows } = await client.query(`
          INSERT INTO seat_maps (
            venue_id, event_id, name, layout_type, canvas_width, canvas_height,
            config, rows_count, cols_count, is_active,
            stage_position, custom_stage_x, custom_stage_y, custom_stage_width, custom_stage_height
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14)
          RETURNING id
        `, [
          origMap.venue_id,
          targetEventId,
          newMapName,
          origMap.layout_type || 'GRID',
          origMap.canvas_width || 900,
          origMap.canvas_height || 600,
          origMap.config || {},
          origMap.rows_count || 0,
          origMap.cols_count || 0,
          origMap.stage_position || 'BOTTOM',
          origMap.custom_stage_x || null,
          origMap.custom_stage_y || null,
          origMap.custom_stage_width || null,
          origMap.custom_stage_height || null,
        ]);
        const newSeatMapId = newMapRows[0].id;
        totalCloned++;

        // Sao chép zones
        const { rows: origZones } = await client.query(`
          SELECT * FROM seat_zones WHERE seat_map_id = $1 ORDER BY sort_order ASC, created_at ASC
        `, [originalSeatMapId]);
        const zoneIdMap = {};
        for (const oz of origZones) {
          const { rows: nzRows } = await client.query(`
            INSERT INTO seat_zones (seat_map_id, name, color, sort_order)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [newSeatMapId, oz.name, oz.color, oz.sort_order]);
          zoneIdMap[oz.id] = nzRows[0].id;
        }

        // Sao chép seats và lưu mapping oldSeatId -> newSeatId
        const { rows: origSeats } = await client.query(`
          SELECT * FROM seats WHERE seat_map_id = $1 ORDER BY y_position, x_position
        `, [originalSeatMapId]);

        const oldSeatIds = [];
        const newSeatIds = [];

        for (const os of origSeats) {
          const newZoneId = os.zone_id ? (zoneIdMap[os.zone_id] || null) : null;
          const { rows: nsRows } = await client.query(`
            INSERT INTO seats (
              seat_map_id, row_label, seat_number,
              x_position, y_position, zone_id, is_disabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `, [
            newSeatMapId,
            os.row_label,
            os.seat_number,
            os.x_position,
            os.y_position,
            newZoneId,
            Boolean(os.is_disabled),
          ]);
          oldSeatIds.push(os.id);
          newSeatIds.push(nsRows[0].id);
        }

        // Cập nhật event_sessions của targetEventId trỏ về newSeatMapId
        const { rows: updatedSessions } = await client.query(`
          UPDATE event_sessions
          SET seat_map_id = $1
          WHERE event_id = $2 AND seat_map_id = $3
          RETURNING id
        `, [newSeatMapId, targetEventId, originalSeatMapId]);
        totalSessionsRemapped += updatedSessions.length;

        // BATCH UPDATE: Cập nhật session_seats và ticket_type_seats bằng UNNEST
        if (oldSeatIds.length > 0 && updatedSessions.length > 0) {
          const sessionIds = updatedSessions.map(s => s.id);

          const { rowCount: ssUpdated } = await client.query(`
            UPDATE session_seats ss
            SET seat_id = m.new_id
            FROM (
              SELECT UNNEST($1::uuid[]) AS old_id, UNNEST($2::uuid[]) AS new_id
            ) m
            WHERE ss.event_session_id = ANY($3::uuid[])
              AND ss.seat_id = m.old_id;
          `, [oldSeatIds, newSeatIds, sessionIds]);
          totalSessionSeatsRemapped += (ssUpdated || 0);

          const { rowCount: ttsUpdated } = await client.query(`
            UPDATE ticket_type_seats tts
            SET seat_id = m.new_id
            FROM (
              SELECT UNNEST($1::uuid[]) AS old_id, UNNEST($2::uuid[]) AS new_id
            ) m
            WHERE tts.seat_id = m.old_id
              AND tts.ticket_type_id IN (
                SELECT id FROM ticket_types WHERE event_session_id = ANY($3::uuid[])
              );
          `, [oldSeatIds, newSeatIds, sessionIds]);
          totalTicketTypeSeatsRemapped += (ttsUpdated || 0);
        }
      }
    }

    // 2. Với các event đơn lẻ đang dùng seat_map nhưng seat_map chưa gắn event_id:
    // Gán event_id để xác định seat_map đó thuộc sở hữu của event đó
    const { rowCount: singleEventUpdated } = await client.query(`
      UPDATE seat_maps sm
      SET event_id = sub.event_id
      FROM (
        SELECT es.seat_map_id, es.event_id
        FROM event_sessions es
        GROUP BY es.seat_map_id, es.event_id
      ) sub
      WHERE sm.id = sub.seat_map_id AND sm.event_id IS NULL;
    `);
    console.log(`\nĐã gán quyền sở hữu event_id cho ${singleEventUpdated} sơ đồ ghế của các sự kiện đơn lẻ.`);

    await client.query('COMMIT');

    console.log('\n=== TỔNG KẾT MIGRATION ===');
    console.log(`- Số sơ đồ mới đã nhân bản riêng: ${totalCloned}`);
    console.log(`- Số phiên sự kiện (sessions) đã chuyển sang sơ đồ riêng: ${totalSessionsRemapped}`);
    console.log(`- Số session_seats đã re-map an toàn: ${totalSessionSeatsRemapped}`);
    console.log(`- Số ticket_type_seats đã re-map an toàn: ${totalTicketTypeSeatsRemapped}`);
    console.log('- session_seats.id KHÔNG THAY ĐỔI => Toàn bộ vé, mã QR và đơn hàng 100% nguyên vẹn!');
    console.log('=== HOÀN TẤT THÀNH CÔNG ===\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('LỖI KHI MIGRATION:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

separateSharedSeatMaps().catch((e) => {
  console.error(e);
  process.exit(1);
});
