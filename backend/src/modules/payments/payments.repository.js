const db = require('../../infrastructure/database/db.client');

class PaymentsRepository {
  async findActiveOrganizerPayosChannel(organizerId) {
    const { rows } = await db.query(
      `
      SELECT *
      FROM organizer_payment_channels
      WHERE organizer_id = $1
        AND provider = 'PAYOS'
        AND status = 'ACTIVE'
      ORDER BY is_default DESC, created_at DESC
      LIMIT 1
      `,
      [organizerId],
    );
    return rows[0];
  }

  async findOrganizerPayosChannelForEvent(eventId) {
    const { rows } = await db.query(
      `
      SELECT opc.*
      FROM events e
      JOIN organizer_payment_channels opc ON opc.organizer_id = e.organizer_id
      WHERE e.id = $1
        AND opc.provider = 'PAYOS'
        AND opc.status = 'ACTIVE'
      ORDER BY opc.is_default DESC, opc.created_at DESC
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0];
  }

  async attachPaymentLink(paymentOrderId, payload) {
    const { rows } = await db.query(
      `
      UPDATE payment_orders
      SET checkout_url = $2,
          qr_code = $3,
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        paymentOrderId,
        payload.checkoutUrl || payload.checkout_url || null,
        payload.qrCode || payload.qr_code || null,
      ],
    );
    return rows[0];
  }

  async findPaymentOrderByProviderCode(providerOrderCode) {
    const { rows } = await db.query(
      `
      SELECT po.*, opc.checksum_key_encrypted, COALESCE(po.organizer_id, opc.organizer_id) AS organizer_id
      FROM payment_orders po
      JOIN organizer_payment_channels opc ON opc.id = po.payment_channel_id
      WHERE po.provider_order_code = $1
      LIMIT 1
      `,
      [providerOrderCode],
    );
    return rows[0];
  }

  async findLatestPaymentOrderWithChannelByOrderId(orderId, userId) {
    const { rows } = await db.query(
      `
      SELECT
        po.*,
        opc.client_id,
        opc.api_key_encrypted,
        opc.checksum_key_encrypted,
        COALESCE(po.organizer_id, opc.organizer_id, e.organizer_id) AS organizer_id
      FROM payment_orders po
      JOIN orders o ON o.id = po.order_id
      LEFT JOIN organizer_payment_channels opc ON opc.id = po.payment_channel_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN event_sessions es ON es.id = tt.event_session_id
      LEFT JOIN events e ON e.id = es.event_id
      WHERE po.order_id = $1
        AND o.user_id = $2
      ORDER BY po.created_at DESC
      LIMIT 1
      `,
      [orderId, userId],
    );
    return rows[0];
  }

  async findLatestPaymentOrderWithChannelByOrderIdAnyUser(orderId) {
    const { rows } = await db.query(
      `
      SELECT
        po.*,
        opc.client_id,
        opc.api_key_encrypted,
        opc.checksum_key_encrypted,
        COALESCE(po.organizer_id, opc.organizer_id, e.organizer_id) AS organizer_id
      FROM payment_orders po
      JOIN orders o ON o.id = po.order_id
      LEFT JOIN organizer_payment_channels opc ON opc.id = po.payment_channel_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN event_sessions es ON es.id = tt.event_session_id
      LEFT JOIN events e ON e.id = es.event_id
      WHERE po.order_id = $1
      ORDER BY po.created_at DESC
      LIMIT 1
      `,
      [orderId],
    );
    return rows[0];
  }

  async markPendingPaymentOrdersExpired() {
    await db.query(
      `
      UPDATE payment_orders
      SET status = 'EXPIRED', updated_at = now()
      WHERE status = 'PENDING'
        AND expired_at <= now()
      `,
    );
  }
}

module.exports = new PaymentsRepository();
