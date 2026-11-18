/**
 * ============================================================================
 * EVENTHUB - BOOKING CLIENT PERFORMANCE TEST DATA SETUP & CLEANUP
 * ============================================================================
 * Prepares test context, discovers active bookable events/sessions/seats/tickets,
 * provisions load-test client accounts + 5,000 Virtual Client JWT profiles,
 * and supports post-test cleanup (--cleanup).
 */

const path = require('path');
const fs = require('fs');

const backendDir = path.resolve(__dirname, '../backend');
const backendModules = path.join(backendDir, 'node_modules');

require(path.join(backendModules, 'dotenv')).config({
  path: path.join(backendDir, '.env'),
});

const jwt = require(path.join(backendModules, 'jsonwebtoken'));
const db = require(path.join(backendDir, 'src/infrastructure/database/db.client'));

const CONTEXT_FILE = path.resolve(__dirname, 'booking-perf-context.json');
const TOTAL_VIRTUAL_CLIENTS = 5000;
const DB_TEST_USER_POOL_SIZE = 100; // 100 real DB customer rows mapped across 5,000 concurrent client sessions

async function cleanupTestArtifacts() {
  console.log('🧹 [Cleanup] Đang dọn dẹp dữ liệu giữ vé & đơn hàng test hiệu năng...');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Find test users
    const testUsersRes = await client.query(
      `SELECT id FROM users WHERE email LIKE 'perf.client.%@eventhub.test' OR email = 'customer@example.com'`
    );
    const userIds = testUsersRes.rows.map((r) => r.id);

    if (userIds.length > 0) {
      // Release session_seats held by test users
      const releasedSeats = await client.query(
        `UPDATE session_seats
         SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
         WHERE held_by = ANY($1::uuid[]) AND status = 'HELD'`,
        [userIds]
      );

      // Cancel active ticket_holds by test users
      const cancelledHolds = await client.query(
        `UPDATE ticket_holds
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE user_id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
        [userIds]
      );

      // Cancel PENDING test orders created with perf buyer_email
      const cancelledOrders = await client.query(
        `UPDATE orders
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE buyer_email LIKE 'perf.vu.%@eventhub.test' AND status = 'PENDING'`
      );

      await client.query(
        `UPDATE events
         SET waiting_room_config = '{"enabled":false}'::jsonb
         WHERE id = '1fa5ca41-e7fd-49f0-93bf-aadd60bdcfa8'`
      );

      console.log(
        `✅ [Cleanup] Đã giải phóng ${releasedSeats.rowCount} ghế HELD, hủy ${cancelledHolds.rowCount} ticket_holds và ${cancelledOrders.rowCount} đơn hàng PENDING test.`
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [Cleanup] Lỗi khi dọn dẹp:', err.message);
  } finally {
    client.release();
  }
}

async function setupPerfData() {
  console.log('======================================================================');
  console.log(' 🚀 CHUẨN BỊ DỮ LIỆU & 5,000 CLIENT SESSIONS CHO TEST ĐẶT VÉ');
  console.log('======================================================================\n');

  if (process.argv.includes('--cleanup')) {
    await cleanupTestArtifacts();
    process.exit(0);
  }

  // 1. Clean up stale holds before starting
  await cleanupTestArtifacts();

  // 2. Discover best bookable event (with upcoming/ongoing session and active ticket types)
  const eventsQuery = `
    SELECT
      e.id AS event_id,
      e.title AS event_title,
      e.slug AS event_slug,
      e.status AS event_status,
      e.sales_status,
      e.seating_rules,
      e.require_attendee_info,
      e.additional_terms,
      es.id AS session_id,
      es.start_time AS session_start_time,
      es.end_time AS session_end_time,
      es.status AS session_status,
      (SELECT COUNT(*)::int FROM session_seats ss WHERE ss.event_session_id = es.id AND ss.status = 'AVAILABLE') AS available_seats_count,
      (SELECT COUNT(*)::int FROM ticket_types tt WHERE tt.event_session_id = es.id) AS ticket_types_count
    FROM events e
    JOIN event_sessions es ON es.event_id = e.id
    WHERE e.deleted_at IS NULL
      AND e.status = 'PUBLISHED'
      AND e.approval_status = 'APPROVED'
      AND e.visibility = 'PUBLIC'
      AND es.status IN ('UPCOMING', 'ONGOING')
      AND (es.end_time IS NULL OR es.end_time > NOW())
    ORDER BY
      (CASE WHEN e.sales_status = 'ON_SALE' THEN 0 ELSE 1 END) ASC,
      available_seats_count DESC,
      e.created_at DESC
    LIMIT 10
  `;

  const { rows: candidateEvents } = await db.query(eventsQuery);
  if (candidateEvents.length === 0) {
    throw new Error('Không tìm thấy sự kiện PUBLISHED nào khả dụng trong Database để test đặt vé.');
  }

  // Pick the best event that has ticket types
  const selectedEvent = candidateEvents.find((ev) => ev.ticket_types_count > 0) || candidateEvents[0];
  console.log(`📌 Sự kiện được chọn để test đặt vé:`);
  console.log(`   - Event ID:        ${selectedEvent.event_id}`);
  console.log(`   - Tên sự kiện:     ${selectedEvent.event_title}`);
  console.log(`   - Session ID:      ${selectedEvent.session_id} (${selectedEvent.session_name || 'Main Session'})`);
  console.log(`   - Số ghế trống:    ${selectedEvent.available_seats_count}`);

  // Fetch ticket types for this event session
  const ticketTypesRes = await db.query(
    `SELECT
       tt.id,
       tt.event_session_id,
       tt.name,
       tt.price::numeric AS price,
       tt.quantity,
       tt.max_per_order,
       tt.sale_start,
       tt.sale_end,
       tt.is_seated,
       GREATEST(
         tt.quantity
         - COALESCE((
             SELECT SUM(oi.quantity)::int
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE oi.ticket_type_id = tt.id AND o.status IN ('PAID', 'CONFIRMED')
           ), 0)
         - COALESCE((
             SELECT SUM(th.quantity)::int
             FROM ticket_holds th
             WHERE th.ticket_type_id = tt.id AND th.status = 'ACTIVE' AND th.expires_at > NOW()
           ), 0),
         0
       )::int AS available_quantity
     FROM ticket_types tt
     WHERE tt.event_session_id = $1
     ORDER BY tt.is_seated ASC, tt.price ASC`,
    [selectedEvent.session_id]
  );

  const ticketTypes = ticketTypesRes.rows.map((t) => ({
    ...t,
    price: Number(t.price || 0),
    quantity: Number(t.quantity || 0),
    available_quantity: Number(t.available_quantity || 0),
    max_per_order: Number(t.max_per_order || 4),
    is_seated: Boolean(t.is_seated),
  }));

  console.log(`   - Các hạng vé (${ticketTypes.length}):`);
  for (const tt of ticketTypes) {
    console.log(
      `     • [${tt.is_seated ? 'SEATED' : 'GA/ZONE'}] ${tt.name} (ID: ${tt.id}) | Giá: ${tt.price.toLocaleString('vi-VN')}đ | Trống: ${tt.available_quantity}/${tt.quantity}`
    );
  }

  // Fetch available session seats (if seated)
  const seatsRes = await db.query(
    `SELECT
       ss.id AS session_seat_id,
       ss.seat_id,
       ss.status,
       s.row_label,
       s.seat_number,
       CONCAT(COALESCE(s.row_label, ''), COALESCE(s.seat_number::text, '')) AS label,
       ARRAY(
         SELECT tts.ticket_type_id
         FROM ticket_type_seats tts
         WHERE tts.seat_id = s.id
       ) AS mapped_ticket_type_ids
     FROM session_seats ss
     JOIN seats s ON s.id = ss.seat_id
     WHERE ss.event_session_id = $1
       AND s.is_disabled = FALSE
       AND (ss.status = 'AVAILABLE' OR (ss.status = 'HELD' AND ss.held_until <= NOW()))
     ORDER BY s.row_label ASC, s.seat_number ASC
     LIMIT 2000`,
    [selectedEvent.session_id]
  );

  const availableSeats = seatsRes.rows;
  console.log(`   - Số ghế lấy mẫu sẵn sàng: ${availableSeats.length} ghế`);

  // 3. Provision a pool of DB Customer accounts for authentic FK-safe holds & checkouts
  console.log(`\n👥 Đang khởi tạo Pool ${DB_TEST_USER_POOL_SIZE} tài khoản Customer trong DB & 5,000 JWT Client Tokens...`);
  const client = await db.getClient();
  const dbUserIds = [];

  try {
    await client.query('BEGIN');

    // Get role_id for CUSTOMER
    const roleRes = await client.query(`SELECT id FROM roles WHERE UPPER(name) = 'CUSTOMER' LIMIT 1`);
    const customerRoleId = roleRes.rows[0]?.id || 1;

    // Batch insert 100 test users
    const emails = [];
    const names = [];
    for (let i = 1; i <= DB_TEST_USER_POOL_SIZE; i++) {
      emails.push(`perf.client.${i}@eventhub.test`);
      names.push(`Perf Test Client #${i}`);
    }

    const upsertUsersRes = await client.query(
      `INSERT INTO users (email, password_hash, full_name, status, email_verified, two_factor_enabled)
       SELECT
         u.email,
         '$2a$10$CwTycUXWue0Thq9StjUM0uJ8p4K1.X8G7pU/l5/1234567890abcd',
         u.full_name,
         'ACTIVE',
         TRUE,
         FALSE
       FROM UNNEST($1::text[], $2::text[]) AS u(email, full_name)
       ON CONFLICT (email) DO UPDATE SET status = 'ACTIVE', email_verified = TRUE
       RETURNING id, email, full_name`,
      [emails, names]
    );

    for (const row of upsertUsersRes.rows) {
      dbUserIds.push(row);
    }

    // Ensure user_roles mapped
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u_id, $2
       FROM UNNEST($1::uuid[]) AS u_id
       ON CONFLICT DO NOTHING`,
      [dbUserIds.map((u) => u.id), customerRoleId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.warn(`⚠️ Không thể tạo pool user mới (${err.message}), chuyển sang lấy user CUSTOMER có sẵn...`);
    const fallbackUsers = await db.query(
      `SELECT id, email, full_name FROM users WHERE status = 'ACTIVE' LIMIT 100`
    );
    dbUserIds.push(...fallbackUsers.rows);
  } finally {
    client.release();
  }

  // Generate tokens for DB user pool + 5000 virtual client profiles
  const tokenPool = dbUserIds.map((u, idx) => {
    const token = jwt.sign(
      { sub: u.id, roles: ['CUSTOMER'] },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '7d' }
    );
    return {
      poolIndex: idx,
      userId: u.id,
      email: u.email,
      fullName: u.full_name,
      token,
    };
  });

  // Also include the main customer token from auth-tokens.json if present
  let browserCustomerAuth = null;
  const authTokensPath = path.resolve(__dirname, 'auth-tokens.json');
  if (fs.existsSync(authTokensPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(authTokensPath, 'utf8'));
      browserCustomerAuth = parsed.CUSTOMER;
    } catch (_) {}
  }
  if (!browserCustomerAuth && tokenPool[0]) {
    browserCustomerAuth = {
      token: tokenPool[0].token,
      user: {
        id: tokenPool[0].userId,
        email: tokenPool[0].email,
        full_name: tokenPool[0].fullName,
        roles: ['customer'],
        role: 'customer',
      },
    };
  }

  const contextData = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: process.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
    frontendBaseUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    concurrencyTiers: [500, 1000, 2000, 5000],
    totalVirtualClients: TOTAL_VIRTUAL_CLIENTS,
    event: {
      eventId: selectedEvent.event_id,
      title: selectedEvent.event_title,
      slug: selectedEvent.event_slug,
      sessionId: selectedEvent.session_id,
      sessionName: selectedEvent.session_name,
      salesStatus: selectedEvent.sales_status,
      requireAttendeeInfo: Boolean(selectedEvent.require_attendee_info),
      hasAdditionalTerms: Boolean(selectedEvent.additional_terms && String(selectedEvent.additional_terms).trim()),
      seatingRules: selectedEvent.seating_rules || {},
      availableSeatsCount: selectedEvent.available_seats_count,
    },
    ticketTypes,
    sampleAvailableSeats: availableSeats.slice(0, 1000),
    browserCustomerAuth,
    tokenPool,
  };

  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(contextData, null, 2), 'utf8');
  console.log(`\n✅ Đã lưu cấu hình & dữ liệu test vào: ${CONTEXT_FILE}`);
  console.log(`   - Số lượng Token Pool: ${tokenPool.length} tài khoản thật (phục vụ xoay vòng cho 5,000 VUs)`);
  console.log(`   - Các mức tải mục tiêu: 500 | 1,000 | 2,000 | 5,000 CCU`);
  process.exit(0);
}

setupPerfData().catch((err) => {
  console.error('❌ Lỗi khởi tạo dữ liệu test:', err);
  process.exit(1);
});
