const mockDbClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  getClient: jest.fn().mockResolvedValue(mockDbClient),
  query: jest.fn(),
};

const mockRefundsRepository = {
  findOrderAndTicketForRefund: jest.fn(),
  findExistingActiveRefund: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdForUpdate: jest.fn(),
  findPaymentOrderWithChannel: jest.fn(),
  lockTicketForRefund: jest.fn(),
  unlockTicketFromRefund: jest.fn(),
  invalidateTicketForRefund: jest.fn(),
  releaseSessionSeat: jest.fn(),
  updateStatus: jest.fn(),
  countActiveOrderTickets: jest.fn(),
  isEventOwnedByUser: jest.fn(),
  findByCustomer: jest.fn(),
  findByOrganizer: jest.fn(),
};

const mockPayosRefundService = {
  processRefund: jest.fn(),
};

const mockNotificationsService = {
  createAndDispatch: jest.fn().mockResolvedValue({}),
};

jest.mock('../../infrastructure/database/db.client', () => mockDb);
jest.mock('./refunds.repository', () => mockRefundsRepository);
jest.mock('./payosRefund.service', () => mockPayosRefundService);
jest.mock('../notifications/notifications.service', () => mockNotificationsService);
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const refundsService = require('./refunds.service');

describe('RefundsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbClient.query.mockResolvedValue({ rows: [] });
  });

  describe('submitRefundRequest', () => {
    const customerId = 'cust-123';
    const validData = {
      order_id: 'order-1',
      ticket_id: 'ticket-1',
      customer_id: customerId,
      organizer_id: 'org-1',
      ticket_status: 'VALID',
      order_status: 'PAID',
      checked_in_at: null,
      session_seat_id: 'seat-1',
      session_start_time: new Date(Date.now() + 10 * 86400000).toISOString(),
      session_end_time: new Date(Date.now() + 11 * 86400000).toISOString(),
      ticket_final_price: 500000,
      ticket_unit_price: 500000,
      event_id: 'event-1',
      event_title: 'Sự kiện âm nhạc',
      event_refund_policy: {
        allow_refunds: true,
        deadline_days: 7,
        fee_percentage: 10,
      },
    };

    it('successfully submits refund request and locks ticket in REFUND_PENDING', async () => {
      mockRefundsRepository.findOrderAndTicketForRefund.mockResolvedValue(validData);
      mockRefundsRepository.findExistingActiveRefund.mockResolvedValue(null);
      mockRefundsRepository.lockTicketForRefund.mockResolvedValue({ id: 'ticket-1', status: 'REFUND_PENDING' });
      mockRefundsRepository.create.mockResolvedValue({
        id: 'refund-1',
        order_id: 'order-1',
        ticket_id: 'ticket-1',
        status: 'PENDING',
        refund_amount: 450000,
        reason: 'Trùng lịch cá nhân',
      });

      const result = await refundsService.submitRefundRequest(customerId, {
        order_id: 'order-1',
        ticket_id: 'ticket-1',
        reason: 'Trùng lịch cá nhân',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockRefundsRepository.lockTicketForRefund).toHaveBeenCalledWith('ticket-1', mockDbClient);
      expect(mockRefundsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'order-1',
          ticket_id: 'ticket-1',
          refund_amount: 450000,
          reason: 'Trùng lịch cá nhân',
        }),
        mockDbClient,
      );
      expect(mockDbClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result.id).toBe('refund-1');
      expect(result.status).toBe('PENDING');
    });

    it('rejects submission if ticket is already checked in', async () => {
      mockRefundsRepository.findOrderAndTicketForRefund.mockResolvedValue({
        ...validData,
        checked_in_at: new Date().toISOString(),
      });

      await expect(
        refundsService.submitRefundRequest(customerId, {
          order_id: 'order-1',
          ticket_id: 'ticket-1',
          reason: 'Trùng lịch cá nhân',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'TICKET_ALREADY_USED',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRefundsRepository.lockTicketForRefund).not.toHaveBeenCalled();
    });

    it('rejects duplicate refund submission on same ticket', async () => {
      mockRefundsRepository.findOrderAndTicketForRefund.mockResolvedValue(validData);
      mockRefundsRepository.findExistingActiveRefund.mockResolvedValue({
        id: 'existing-ref',
        status: 'PENDING',
      });

      await expect(
        refundsService.submitRefundRequest(customerId, {
          order_id: 'order-1',
          ticket_id: 'ticket-1',
          reason: 'Trùng lịch cá nhân',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'DUPLICATE_REFUND_REQUEST',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('processRefundByOrganizer', () => {
    const organizerId = 'org-user-1';
    const pendingRefund = {
      id: 'refund-1',
      order_id: 'order-1',
      ticket_id: 'ticket-1',
      customer_id: 'cust-1',
      organizer_id: organizerId,
      event_id: 'event-1',
      refund_amount: 450000,
      status: 'PENDING',
      session_seat_id: 'seat-1',
      ticket_code: 'TCK123',
      order_code: 'ORD123',
    };

    it('rejects refund request: unlocks ticket to VALID and restores order to PAID', async () => {
      mockRefundsRepository.findByIdForUpdate.mockResolvedValue(pendingRefund);
      mockRefundsRepository.updateStatus.mockResolvedValue({
        ...pendingRefund,
        status: 'REJECTED',
        organizer_note: 'Không đúng chính sách',
      });
      mockDbClient.query.mockImplementation((sql) => {
        if (sql.includes('SELECT 1 FROM refund_requests WHERE order_id')) {
          return Promise.resolve({ rows: [] }); // No other pending refunds
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await refundsService.processRefundByOrganizer(
        organizerId,
        'refund-1',
        {
          action: 'REJECT',
          reject_reason: 'Không đúng chính sách',
        },
        organizerId,
      );

      expect(mockRefundsRepository.unlockTicketFromRefund).toHaveBeenCalledWith('ticket-1', mockDbClient);
      expect(mockRefundsRepository.updateStatus).toHaveBeenCalledWith(
        'refund-1',
        expect.objectContaining({ status: 'REJECTED' }),
        mockDbClient,
      );
      expect(mockDbClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result.status).toBe('REJECTED');
    });

    it('approves refund request with PayOS success: invalidates ticket and releases seat', async () => {
      mockRefundsRepository.findByIdForUpdate.mockResolvedValue(pendingRefund);
      mockRefundsRepository.findPaymentOrderWithChannel.mockResolvedValue({
        id: 'po-1',
        provider_order_code: 1720000000000,
        client_id: 'client-key',
        api_key_encrypted: 'api-key',
      });
      mockPayosRefundService.processRefund.mockResolvedValue({
        success: true,
        transactionId: 'PAYOS_TX_999',
      });
      mockRefundsRepository.countActiveOrderTickets.mockResolvedValue(0);
      mockRefundsRepository.updateStatus.mockResolvedValue({
        ...pendingRefund,
        status: 'REFUNDED',
        organizer_transaction_ref: 'PAYOS_TX_999',
      });

      const result = await refundsService.processRefundByOrganizer(
        organizerId,
        'refund-1',
        {
          action: 'APPROVE',
          refund_method: 'PAYOS',
        },
        organizerId,
      );

      expect(mockPayosRefundService.processRefund).toHaveBeenCalled();
      expect(mockRefundsRepository.invalidateTicketForRefund).toHaveBeenCalledWith('ticket-1', mockDbClient);
      expect(mockRefundsRepository.releaseSessionSeat).toHaveBeenCalledWith('seat-1', mockDbClient);
      expect(mockRefundsRepository.updateStatus).toHaveBeenCalledWith(
        'refund-1',
        expect.objectContaining({
          status: 'REFUNDED',
          organizer_transaction_ref: 'PAYOS_TX_999',
        }),
        mockDbClient,
      );
      expect(mockDbClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result.status).toBe('REFUNDED');
    });

    it('keeps ticket locked in REFUND_PENDING when PayOS refund gateway fails', async () => {
      mockRefundsRepository.findByIdForUpdate.mockResolvedValue(pendingRefund);
      mockRefundsRepository.findPaymentOrderWithChannel.mockResolvedValue({
        id: 'po-1',
        provider_order_code: 1720000000000,
        client_id: 'client-key',
        api_key_encrypted: 'api-key',
      });
      mockPayosRefundService.processRefund.mockResolvedValue({
        success: false,
        error: 'Số dư tài khoản merchant không đủ để hoàn tiền',
        errorCode: 'INSUFFICIENT_BALANCE',
      });

      await expect(
        refundsService.processRefundByOrganizer(
          organizerId,
          'refund-1',
          {
            action: 'APPROVE',
            refund_method: 'PAYOS',
          },
          organizerId,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      // Status should be marked FAILED for retry/manual processing
      expect(mockRefundsRepository.updateStatus).toHaveBeenCalledWith(
        'refund-1',
        expect.objectContaining({ status: 'FAILED' }),
        mockDbClient,
      );
      // Ticket must NOT be invalidated or unlocked!
      expect(mockRefundsRepository.invalidateTicketForRefund).not.toHaveBeenCalled();
      expect(mockRefundsRepository.unlockTicketFromRefund).not.toHaveBeenCalled();
    });

    it('rejects processing if refund request is already processed (conflict / idempotency)', async () => {
      mockRefundsRepository.findByIdForUpdate.mockResolvedValue({
        ...pendingRefund,
        status: 'REFUNDED',
      });

      await expect(
        refundsService.processRefundByOrganizer(
          organizerId,
          'refund-1',
          { action: 'APPROVE' },
          organizerId,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'REFUND_ALREADY_PROCESSED',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects processing if organizer does not own the event (403 Forbidden)', async () => {
      mockRefundsRepository.findByIdForUpdate.mockResolvedValue(pendingRefund);
      mockRefundsRepository.isEventOwnedByUser.mockResolvedValue(false);

      await expect(
        refundsService.processRefundByOrganizer(
          'another-organizer',
          'refund-1',
          { action: 'APPROVE' },
          'another-organizer',
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'AUTH_FORBIDDEN',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
