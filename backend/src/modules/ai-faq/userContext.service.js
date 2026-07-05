const db = require('../../infrastructure/database/db.client');

function formatDateVN(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

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
        `SELECT
           COUNT(*)::int                                            AS total,
           COUNT(*) FILTER (WHERE e.start_time > now())::int       AS upcoming,
           COUNT(*) FILTER (WHERE e.end_time <= now())::int        AS past
         FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
         JOIN orders o      ON o.id  = oi.order_id
         JOIN events e      ON e.id  = t.event_id
         WHERE o.user_id = $1
           AND o.status = 'PAID'
           AND t.status IN ('VALID', 'USED')`,
        [userId],
      ),
      db.query(
        `SELECT COUNT(*)::int AS total FROM favorite_events WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const ticketStats = ticketsResult.rows[0] || { total: 0, upcoming: 0, past: 0 };
    const favorites   = favoritesResult.rows[0]?.total || 0;

    // Upcoming tickets with full detail for AI to reference
    const { rows: upcomingTickets } = await db.query(
      `SELECT
         t.ticket_code,
         t.status         AS ticket_status,
         tt.name          AS ticket_type,
         e.title          AS event_title,
         e.start_time,
         e.end_time,
         es.session_name,
         v.name           AS venue_name,
         v.city           AS venue_city,
         v.address_line   AS venue_address
       FROM tickets t
       JOIN order_items oi  ON oi.id  = t.order_item_id
       JOIN orders o        ON o.id   = oi.order_id
       JOIN events e        ON e.id   = t.event_id
       JOIN ticket_types tt ON tt.id  = t.ticket_type_id
       JOIN event_sessions es ON es.id = t.event_session_id
       JOIN venues v        ON v.id   = es.venue_id
       WHERE o.user_id = $1
         AND o.status  = 'PAID'
         AND t.status  = 'VALID'
         AND e.start_time > now()
       ORDER BY e.start_time ASC
       LIMIT 5`,
      [userId],
    );

    // Recent past tickets (last 3)
    const { rows: pastTickets } = await db.query(
      `SELECT
         t.ticket_code,
         tt.name      AS ticket_type,
         e.title      AS event_title,
         e.start_time,
         t.checked_in_at
       FROM tickets t
       JOIN order_items oi  ON oi.id  = t.order_item_id
       JOIN orders o        ON o.id   = oi.order_id
       JOIN events e        ON e.id   = t.event_id
       JOIN ticket_types tt ON tt.id  = t.ticket_type_id
       WHERE o.user_id = $1
         AND o.status  = 'PAID'
         AND t.status IN ('VALID','USED')
         AND e.end_time <= now()
       ORDER BY e.start_time DESC
       LIMIT 3`,
      [userId],
    );

    const hints = [];
    if (ticketStats.upcoming > 0) {
      hints.push(`Người dùng có ${ticketStats.upcoming} vé sắp diễn ra. Chi tiết trong upcoming_tickets.`);
    } else if (ticketStats.total > 0) {
      hints.push(`Người dùng có ${ticketStats.total} vé nhưng không có sự kiện nào sắp tới.`);
    } else {
      hints.push('Người dùng chưa có vé nào. Gợi ý khám phá sự kiện tại /events.');
    }

    return {
      authenticated: true,
      ticket_summary: {
        total:    ticketStats.total,
        upcoming: ticketStats.upcoming,
        past:     ticketStats.past,
      },
      favorites,
      upcoming_tickets: upcomingTickets.map((t) => ({
        ticket_code:   t.ticket_code,
        ticket_status: t.ticket_status,
        ticket_type:   t.ticket_type,
        event_title:   t.event_title,
        start_time:    formatDateVN(t.start_time),
        end_time:      formatDateVN(t.end_time),
        session:       t.session_name || null,
        venue:         [t.venue_name, t.venue_city].filter(Boolean).join(', '),
        venue_address: t.venue_address || null,
      })),
      past_tickets: pastTickets.map((t) => ({
        ticket_code:  t.ticket_code,
        ticket_type:  t.ticket_type,
        event_title:  t.event_title,
        start_time:   formatDateVN(t.start_time),
        checked_in:   Boolean(t.checked_in_at),
      })),
      hints,
    };
  }
}

module.exports = new UserContextService();
