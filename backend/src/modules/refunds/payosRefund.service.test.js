const payosRefundService = require('./payosRefund.service');

describe('PayOSRefundService', () => {
  const baseRefund = {
    id: 'refund-123',
    refund_amount: 250000,
    reason: 'Trùng lịch cá nhân',
  };

  const basePaymentOrder = {
    order_id: 'order-123',
    provider: 'PAYOS',
    provider_order_code: 1729999999999,
  };

  const baseChannel = {
    client_id: 'client-test-id',
    api_key_encrypted: 'api-test-key',
    checksum_key_encrypted: 'checksum-test-key',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails gracefully when paymentOrder is missing', async () => {
    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: null,
      channel: baseChannel,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PAYMENT_ORDER_NOT_FOUND');
  });

  it('fails gracefully when channel credentials are missing', async () => {
    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: basePaymentOrder,
      channel: null,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PAYOS_CHANNEL_NOT_CONFIGURED');
  });

  it('supports simulated mock success for testing environment', async () => {
    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
      options: { mockSuccess: true },
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.providerOrderCode).toBe(basePaymentOrder.provider_order_code);
  });

  it('handles API gateway error from PayOS', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        code: '10',
        desc: 'Số dư không đủ để hoàn tiền',
      }),
    });

    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Số dư không đủ để hoàn tiền');
    expect(result.errorCode).toBe('10');
  });

  it('handles PayOS timeout or network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection timed out'));

    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PAYOS_NETWORK_ERROR');
    expect(result.error).toContain('Lỗi kết nối PayOS');
  });

  it('handles PayOS 404 Endpoint not found with helpful guidance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        desc: 'Endpoint not found.',
      }),
    });

    const result = await payosRefundService.processRefund({
      refundRequest: baseRefund,
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('HTTP_404');
    expect(result.error).toContain('Chuyển khoản thủ công');
    expect(result.error).toContain('Kênh chi (Payouts)');
  });

  it('successfully processes refund when PayOS returns code 00', async () => {
    global.fetch = jest.fn().mockImplementation((url, options) => {
      expect(url).toContain('/v1/payouts/');
      expect(options.headers['x-client-id']).toBe(baseChannel.client_id);
      expect(options.headers['x-api-key']).toBe(baseChannel.api_key_encrypted);
      expect(options.headers['x-idempotency-key']).toBeDefined();
      expect(options.headers['x-signature']).toBeDefined();

      const body = JSON.parse(options.body);
      expect(body.amount).toBe(250000);
      expect(body.toBin).toBe('970436'); // Vietcombank
      expect(body.toAccountNumber).toBe('0123456789');

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          code: '00',
          desc: 'Success',
          data: {
            id: 'TX_PAYOS_SUCCESS_123',
          },
        }),
      });
    });

    const result = await payosRefundService.processRefund({
      refundRequest: {
        ...baseRefund,
        bank_name: 'Vietcombank',
        bank_account_number: '0123456789',
      },
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('TX_PAYOS_SUCCESS_123');
  });

  it('treats refund as failed when PayOS returns code 00 but approvalState or transaction state is FAILED', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: '00',
        desc: 'Success',
        data: {
          id: 'payout-fail-id',
          approvalState: 'FAILED',
          transactions: [
            {
              id: 'txn-fail',
              state: 'FAILED',
              errorMessage: 'Tài khoản thụ hưởng không tồn tại hoặc bị khóa',
              errorCode: 'INVALID_BENEFICIARY',
            },
          ],
        },
      }),
    });

    const result = await payosRefundService.processRefund({
      refundRequest: {
        ...baseRefund,
        bank_name: 'MB Bank',
        bank_account_number: '0947080052',
      },
      paymentOrder: basePaymentOrder,
      channel: baseChannel,
      amount: 250000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tài khoản thụ hưởng không tồn tại hoặc bị khóa');
    expect(result.errorCode).toBe('INVALID_BENEFICIARY');
  });

  it('fails gracefully when dedicated payout is configured but missing payout_checksum_key', async () => {
    const channelWithoutChecksum = {
      ...baseChannel,
      payout_client_id: 'dedicated-client-id',
      payout_api_key_encrypted: 'dedicated-api-key',
      payout_checksum_key_encrypted: null,
    };

    const result = await payosRefundService.processRefund({
      refundRequest: {
        ...baseRefund,
        bank_name: 'MB Bank',
        bank_account_number: '0947080052',
      },
      paymentOrder: basePaymentOrder,
      channel: channelWithoutChecksum,
      amount: 250000,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PAYOUT_CHECKSUM_KEY_MISSING');
    expect(result.error.toLowerCase()).toContain('chưa cấu hình checksum key của kênh chi');
  });
});
