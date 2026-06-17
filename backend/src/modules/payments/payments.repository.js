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
        AND is_default = true
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
        AND opc.is_default = true
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
      SELECT po.*, opc.checksum_key_encrypted
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
        opc.checksum_key_encrypted
      FROM payment_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN organizer_payment_channels opc ON opc.id = po.payment_channel_id
      WHERE po.order_id = $1
        AND o.user_id = $2
      ORDER BY po.created_at DESC
      LIMIT 1
      `,
      [orderId, userId],
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
