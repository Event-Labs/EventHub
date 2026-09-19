const organizerPaymentsService = require('./organizerPayments.service');
const organizerPaymentsRepository = require('./organizerPayments.repository');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');

jest.mock('./organizerPayments.repository');
jest.mock('../organizer/organizerEvents.repository');

describe('OrganizerPaymentsService - Payout Channel', () => {
  const mockUserId = 'user-123';
  const mockOrganizerId = 'org-456';

  beforeEach(() => {
    jest.clearAllMocks();
    organizerEventsRepository.findOrganizerByUserId.mockResolvedValue({ id: mockOrganizerId });
  });

  describe('savePayoutChannel', () => {
    it('throws error if payment channel does not exist yet', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue(null);

      await expect(
        organizerPaymentsService.savePayoutChannel(mockUserId, { use_inbound_for_payout: true })
      ).rejects.toThrow('Vui lòng hoàn tất cài đặt Kênh thu trước khi cấu hình Kênh chi.');
    });

    it('saves SAME_AS_INBOUND when use_inbound_for_payout is true', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-inbound',
      });
      organizerPaymentsRepository.updatePayoutChannel.mockResolvedValue({
        id: 'channel-1',
        payout_status: 'SAME_AS_INBOUND',
      });

      const result = await organizerPaymentsService.savePayoutChannel(mockUserId, {
        use_inbound_for_payout: true,
      });

      expect(organizerPaymentsRepository.updatePayoutChannel).toHaveBeenCalledWith(
        mockOrganizerId,
        expect.objectContaining({
          payout_status: 'SAME_AS_INBOUND',
          payout_client_id: null,
        })
      );
      expect(result.payout_status).toBe('SAME_AS_INBOUND');
    });

    it('saves dedicated payout keys when provided', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-inbound',
      });
      organizerPaymentsRepository.updatePayoutChannel.mockResolvedValue({
        id: 'channel-1',
        payout_client_id: 'payout-client-id',
        payout_status: 'PENDING',
      });

      const result = await organizerPaymentsService.savePayoutChannel(mockUserId, {
        payout_client_id: 'payout-client-id',
        payout_api_key: 'payout-api-key',
        payout_checksum_key: 'payout-checksum-key',
      });

      expect(organizerPaymentsRepository.updatePayoutChannel).toHaveBeenCalledWith(
        mockOrganizerId,
        expect.objectContaining({
          payout_client_id: 'payout-client-id',
          payout_api_key_encrypted: 'payout-api-key',
          payout_checksum_key_encrypted: 'payout-checksum-key',
          payout_status: 'PENDING',
        })
      );
      expect(result.payout_client_id).toBe('payout-client-id');
    });
  });

  describe('testPayoutConnection', () => {
    it('verifies payout connection in test/mock mode', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-inbound',
        api_key_encrypted: 'api-key-inbound',
        payout_status: 'SAME_AS_INBOUND',
      });
      organizerPaymentsRepository.updatePayoutStatus.mockResolvedValue({
        id: 'channel-1',
        payout_status: 'ACTIVE',
      });

      const res = await organizerPaymentsService.testPayoutConnection(mockUserId);
      expect(res.success).toBe(true);
      expect(organizerPaymentsRepository.updatePayoutStatus).toHaveBeenCalledWith(mockOrganizerId, 'ACTIVE');
    });
  });
});
