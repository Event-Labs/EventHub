const pool = require('../../infrastructure/database/db.client');
const organizerPaymentsRepository = require('./organizerPayments.repository');

jest.mock('../../infrastructure/database/db.client', () => ({
  query: jest.fn(),
}));

describe('OrganizerPaymentsRepository', () => {
  const organizerId = 'org-123';

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [{ id: 'ch-default', is_default: true }] });
  });

  it('findChannelByOrganizerId prioritizes is_default DESC NULLS LAST before updated_at DESC', async () => {
    await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY is_default DESC NULLS LAST,\s*updated_at DESC\s*LIMIT 1/i);
    expect(params).toEqual([organizerId]);
  });

  it('updateChannelStatus targets only the canonical channel row by id', async () => {
    await organizerPaymentsRepository.updateChannelStatus(organizerId, 'ACTIVE');

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \(\s*SELECT id FROM organizer_payment_channels/i);
    expect(sql).toMatch(/ORDER BY is_default DESC NULLS LAST,\s*updated_at DESC\s*LIMIT 1/i);
    expect(params).toEqual(['ACTIVE', organizerId]);
  });

  it('updatePayoutChannel targets only the canonical channel row by id', async () => {
    await organizerPaymentsRepository.updatePayoutChannel(organizerId, {
      payout_client_id: 'payout-client',
      payout_api_key_encrypted: 'enc.api',
      payout_checksum_key_encrypted: 'enc.chk',
      payout_status: 'PENDING',
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \(\s*SELECT id FROM organizer_payment_channels/i);
    expect(params).toEqual(['payout-client', 'enc.api', 'enc.chk', 'PENDING', organizerId]);
  });

  it('updatePayoutStatus and clearPayoutCredentials target only the canonical channel row by id', async () => {
    await organizerPaymentsRepository.updatePayoutStatus(organizerId, 'ACTIVE');
    const [statusSql, statusParams] = pool.query.mock.calls[0];
    expect(statusSql).toMatch(/WHERE id = \(\s*SELECT id FROM organizer_payment_channels/i);
    expect(statusParams).toEqual(['ACTIVE', organizerId]);

    await organizerPaymentsRepository.clearPayoutCredentials(organizerId);
    const [clearSql, clearParams] = pool.query.mock.calls[1];
    expect(clearSql).toMatch(/WHERE id = \(\s*SELECT id FROM organizer_payment_channels/i);
    expect(clearSql).toMatch(/payout_status = 'SAME_AS_INBOUND'/);
    expect(clearParams).toEqual([organizerId]);
  });
});

