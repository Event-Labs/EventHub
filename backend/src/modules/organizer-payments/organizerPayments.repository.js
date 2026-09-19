const pool = require('../../infrastructure/database/db.client');

class OrganizerPaymentsRepository {
  async findChannelByOrganizerId(organizerId) {
    const { rows } = await pool.query(
      `SELECT * FROM organizer_payment_channels WHERE organizer_id = $1`,
      [organizerId]
    );
    return rows[0] || null;
  }

  async upsertChannel(organizerId, data) {
    const {
      provider,
      client_id,
      api_key_encrypted,
      checksum_key_encrypted,
      bank_name,
      bank_account_number,
      bank_account_holder,
      status,
      is_default,
    } = data;
    const { rows } = await pool.query(
      `INSERT INTO organizer_payment_channels 
        (
          organizer_id,
          provider,
          client_id,
          api_key_encrypted,
          checksum_key_encrypted,
          bank_name,
          bank_account_number,
          bank_account_holder,
          status,
          is_default
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organizer_id) WHERE is_default = TRUE DO UPDATE SET
        provider = EXCLUDED.provider,
        client_id = EXCLUDED.client_id,
        api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, organizer_payment_channels.api_key_encrypted),
        checksum_key_encrypted = COALESCE(EXCLUDED.checksum_key_encrypted, organizer_payment_channels.checksum_key_encrypted),
        bank_name = EXCLUDED.bank_name,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_account_holder = EXCLUDED.bank_account_holder,
        status = EXCLUDED.status,
        updated_at = NOW()
       RETURNING *`,
      [
        organizerId,
        provider || 'PAYOS',
        client_id,
        api_key_encrypted,
        checksum_key_encrypted,
        bank_name,
        bank_account_number,
        bank_account_holder,
        status || 'PENDING',
        is_default !== false,
      ]
    );
    return rows[0];
  }

  async updateChannelStatus(organizerId, status) {
    const { rows } = await pool.query(
      `UPDATE organizer_payment_channels 
       SET status = $1, updated_at = NOW() 
       WHERE organizer_id = $2 
       RETURNING *`,
      [status, organizerId]
    );
    return rows[0];
  }

  async updatePayoutChannel(organizerId, data) {
    const {
      payout_client_id,
      payout_api_key_encrypted,
      payout_checksum_key_encrypted,
      payout_status,
    } = data;
    const { rows } = await pool.query(
      `UPDATE organizer_payment_channels
       SET payout_client_id = $1,
           payout_api_key_encrypted = COALESCE($2, payout_api_key_encrypted),
           payout_checksum_key_encrypted = COALESCE($3, payout_checksum_key_encrypted),
           payout_status = $4,
           updated_at = NOW()
       WHERE organizer_id = $5
       RETURNING *`,
      [
        payout_client_id,
        payout_api_key_encrypted,
        payout_checksum_key_encrypted,
        payout_status || 'PENDING',
        organizerId,
      ]
    );
    return rows[0] || null;
  }

  async updatePayoutStatus(organizerId, status) {
    const { rows } = await pool.query(
      `UPDATE organizer_payment_channels 
       SET payout_status = $1, updated_at = NOW() 
       WHERE organizer_id = $2 
       RETURNING *`,
      [status, organizerId]
    );
    return rows[0] || null;
  }
}

module.exports = new OrganizerPaymentsRepository();
