const db = require('../../infrastructure/database/db.client');

/**
 * Manages payment records for subscription purchases.
 * Uses the existing payment_orders table with a nullable order_id
 * and a new organizer_subscription_id reference tracked via description.
 *
 * Strategy: re-use payment_orders with a special provider_order_code pattern
 * and a synthetic payment_channel_id from the platform channel.
 *
 * We store subscription context in the description field and track state
 * via a dedicated sub_payment_orders table created lazily via raw queries.
 */

class OrganizerSubscriptionsPaymentRepository {
  /**
   * Get or create the platform payment channel row used for subscription payments.
   * The channel is built from env vars — no DB row needed, we pass it as an object.
   */
  getPlatformChannel() {
    // Read through env.js (already loaded via dotenv at app startup)
    const clientId    = process.env.PLATFORM_PAYOS_CLIENT_ID;
    const apiKey      = process.env.PLATFORM_PAYOS_API_KEY;
    const checksumKey = process.env.PLATFORM_PAYOS_CHECKSUM_KEY;

    if (!clientId || !apiKey || !checksumKey) {
      return null; // PayOS not configured → fall back to direct activation
    }

    return {
      client_id:              clientId,
      api_key_encrypted:      apiKey,
      checksum_key_encrypted: checksumKey,
    };
  }

  /**
   * Create a pending subscription payment record.
   * We store it in a lightweight table `subscription_payment_orders`.
   * If the table doesn't exist yet we create it on first use.
   */
  async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS subscription_payment_orders (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id        UUID NOT NULL,
        subscription_id     UUID NOT NULL,
        organizer_sub_id    UUID,                   -- filled after activation
        provider            VARCHAR(32)  NOT NULL DEFAULT 'PAYOS',
        provider_order_code BIGINT       NOT NULL UNIQUE,
        amount              NUMERIC(15,2) NOT NULL,
        description         VARCHAR(255) NOT NULL,
        status              VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
        checkout_url        TEXT,
        qr_code             TEXT,
        paid_at             TIMESTAMPTZ,
        expired_at          TIMESTAMPTZ  NOT NULL,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
  }

  async createPending({ organizerId, subscriptionId, amount, description, providerOrderCode, expiredAt }) {
    await this.ensureTable();
    const { rows } = await db.query(
      `INSERT INTO subscription_payment_orders
         (organizer_id, subscription_id, provider_order_code, amount, description, expired_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [organizerId, subscriptionId, providerOrderCode, amount, description, expiredAt],
    );
    return rows[0];
  }

  async attachPaymentLink(id, { checkoutUrl, qrCode }) {
    await this.ensureTable();
    const { rows } = await db.query(
      `UPDATE subscription_payment_orders
       SET checkout_url = $2, qr_code = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, checkoutUrl || null, qrCode || null],
    );
    return rows[0];
  }

  async findByProviderOrderCode(providerOrderCode) {
    await this.ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM subscription_payment_orders WHERE provider_order_code = $1 LIMIT 1`,
      [providerOrderCode],
    );
    return rows[0];
  }

  async findById(id) {
    await this.ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM subscription_payment_orders WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0];
  }

  async markPaid(id, organizer_sub_id) {
    await this.ensureTable();
    const { rows } = await db.query(
      `UPDATE subscription_payment_orders
       SET status = 'PAID', paid_at = NOW(), organizer_sub_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, organizer_sub_id],
    );
    return rows[0];
  }

  async markExpired(id) {
    await this.ensureTable();
    await db.query(
      `UPDATE subscription_payment_orders
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING'`,
      [id],
    );
  }
}

module.exports = new OrganizerSubscriptionsPaymentRepository();
