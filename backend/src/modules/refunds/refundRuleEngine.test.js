const refundRuleEngine = require('./refundRuleEngine');

describe('RefundRuleEngine', () => {
  const baseOrder = {
    id: 'order-1',
    user_id: 'cust-1',
    status: 'PAID',
    total_amount: 500000,
  };

  const baseTicket = {
    id: 'ticket-1',
    customer_id: 'cust-1',
    status: 'VALID',
    checked_in_at: null,
    final_price: 500000,
    unit_price: 500000,
    session_start_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    session_end_time: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const baseEvent = {
    id: 'event-1',
    title: 'Rock Concert',
    start_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    refund_policy: {
      allow_refunds: true,
      deadline_days: 7,
      fee_percentage: 20,
    },
  };

  it('approves an eligible ticket refund request and calculates fee correctly', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(true);
    expect(result.originalPrice).toBe(500000);
    expect(result.feePercentage).toBe(20);
    expect(result.cancellationFee).toBe(100000);
    expect(result.refundableAmount).toBe(400000);
  });

  it('rejects if ticket does not belong to the customer (BR-17)', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'other-user',
      reason: 'Mua nhầm vé',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('FORBIDDEN_OWNERSHIP');
  });

  it('rejects if ticket has already been checked in (BR-71)', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: { ...baseTicket, checked_in_at: new Date().toISOString() },
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Lý do sức khỏe',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('TICKET_ALREADY_USED');
  });

  it('rejects if ticket status is REFUND_PENDING (BR-72)', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: { ...baseTicket, status: 'REFUND_PENDING' },
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('TICKET_REFUND_PENDING');
  });

  it('rejects if ticket status is REFUNDED (BR-71)', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: { ...baseTicket, status: 'REFUNDED' },
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('TICKET_ALREADY_REFUNDED');
  });

  it('rejects if an active refund request is already pending (BR-72)', () => {
    const result = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: baseEvent,
      activeRefund: { id: 'refund-1', status: 'PENDING' },
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('DUPLICATE_REFUND_REQUEST');
  });

  it('rejects if the event policy disallows refunds', () => {
    const nonRefundableEvent = {
      ...baseEvent,
      refund_policy: { allow_refunds: false },
    };

    const result = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: nonRefundableEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('POLICY_NON_REFUNDABLE');
  });

  it('rejects if deadline has passed according to refund policy', () => {
    // Event starts in 3 days, but policy requires 7 days
    const nearEvent = {
      ...baseEvent,
      start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      refund_policy: { allow_refunds: true, deadline_days: 7 },
    };

    const result = refundRuleEngine.evaluateEligibility({
      ticket: { ...baseTicket, session_start_time: nearEvent.start_time },
      order: baseOrder,
      event: nearEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Trùng lịch cá nhân',
    });

    expect(result.eligible).toBe(false);
    expect(result.errorCode).toBe('POLICY_DEADLINE_PASSED');
  });

  it('requires reason note when reason is "Khác"', () => {
    const resultWithoutNote = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Khác',
      customerNote: '',
    });

    expect(resultWithoutNote.eligible).toBe(false);
    expect(resultWithoutNote.errorCode).toBe('REASON_NOTE_REQUIRED');

    const resultWithNote = refundRuleEngine.evaluateEligibility({
      ticket: baseTicket,
      order: baseOrder,
      event: baseEvent,
      activeRefund: null,
      customerId: 'cust-1',
      reason: 'Khác',
      customerNote: 'Lý do cá nhân đột xuất gia đình',
    });

    expect(resultWithNote.eligible).toBe(true);
  });
});
