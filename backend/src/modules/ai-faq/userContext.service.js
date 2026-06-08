const db = require('../../infrastructure/database/db.client');

class UserContextService {
  async build(userId) {
    if (!userId) {
      return {
        authenticated: false,
        hints: ['Đăng nhập để AI có thể tham chiếu vé và sự kiện bạn đã mua.'],
      };
    }

    const [ticketsResult, favoritesResult] = await Promise.all([
      db.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE e.end_time > now())::int AS upcoming,
          COUNT(*) FILTER (WHERE e.end_time <= now())::int AS past
        FROM tickets t
        JOIN order_items oi ON oi.id = t.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN events e ON e.id = t.event_id
        WHERE o.user_id = $1 AND o.status = 'PAID' AND t.status IN ('VALID', 'USED')
        `,
        [userId],
      ),
      db.query(
        `SELECT COUNT(*)::int AS total FROM favorite_events WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const ticketStats = ticketsResult.rows[0] || { total: 0, upcoming: 0, past: 0 };
    const favorites = favoritesResult.rows[0]?.total || 0;

    const { rows: nextEvents } = await db.query(
      `
      SELECT e.title, e.start_time
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      WHERE o.user_id = $1
        AND o.status = 'PAID'
        AND t.status = 'VALID'
        AND e.end_time > now()
      ORDER BY e.start_time ASC
      LIMIT 2
      `,
      [userId],
    );

    return {
      authenticated: true,
      tickets: ticketStats,
      favorites,
      upcoming_events: nextEvents.map((row) => ({
        title: row.title,
        start_time: row.start_time,
      })),
      hints: [
        ticketStats.total > 0
          ? `Bạn có ${ticketStats.total} vé (${ticketStats.upcoming} sắp diễn ra). Xem tại /my-tickets.`
          : 'Bạn chưa có vé nào. Khám phá sự kiện tại /events.',
      ],
    };
  }
}

module.exports = new UserContextService();