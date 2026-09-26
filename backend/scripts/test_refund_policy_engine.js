const assert = require('assert');
const { validateRefundRules, generateRefundPolicyLines, generateRefundPolicyText } = require('../src/modules/refunds/refundPolicyHelper');
const refundRuleEngine = require('../src/modules/refunds/refundRuleEngine');

console.log('Testing refund policy helper & rule engine...');

// 1. validateRefundRules
const validRules = [
  { days_before: 7, refund_rate: 100 },
  { days_before: 3, refund_rate: 50 },
];
const valResult = validateRefundRules(validRules);
assert.strictEqual(valResult.isValid, true);
assert.strictEqual(valResult.rules.length, 2);
assert.strictEqual(valResult.rules[0].days_before, 7);
assert.strictEqual(valResult.rules[0].refund_rate, 100);

// Invalid rules: wrong order / non-decreasing rate
const invalidRules = [
  { days_before: 3, refund_rate: 100 },
  { days_before: 7, refund_rate: 50 },
];
const invResult = validateRefundRules(invalidRules);
assert.strictEqual(invResult.isValid, false);

// 2. generateRefundPolicyText
const policyNoRefund = { allow_refund: false };
assert.ok(generateRefundPolicyText(policyNoRefund).includes('Vé không hỗ trợ hoàn hủy'));

const policyWithRefund = {
  allow_refund: true,
  refund_rules: validRules,
  refund_notes: 'Lưu ý kiểm tra email xác nhận.',
};
const text = generateRefundPolicyText(policyWithRefund);
console.log('Generated Policy Text:\n' + text);
assert.ok(text.includes('Hoàn 100% số tiền đã thanh toán nếu yêu cầu trước sự kiện ít nhất 7 ngày'));
assert.ok(text.includes('Hoàn 50% số tiền đã thanh toán nếu yêu cầu trước sự kiện từ 3 đến dưới 7 ngày'));
assert.ok(text.includes('Không hỗ trợ hoàn tiền nếu yêu cầu trong vòng 3 ngày'));
assert.ok(text.includes('Ghi chú từ BTC: Lưu ý kiểm tra email xác nhận.'));

// 3. RefundRuleEngine preview evaluation
const mockEvent = {
  id: 'event-1',
  start_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days away
  refund_policy: policyWithRefund,
};
const mockTicket = {
  id: 'ticket-1',
  status: 'VALID',
  order_item_unit_price: 100000,
  order_item_final_price: 100000,
  order_item_quantity: 1,
  order_platform_fee: 5000, // platform fee should NOT be included in ticket paid amount or refund
  refund_policy_snapshot: policyWithRefund,
};

const mockOrder = {
  id: 'order-1',
  user_id: 'cust-1',
  status: 'PAID',
  total_amount: 105000,
  subtotal: 100000,
  platform_fee: 5000,
};

const eval5Days = refundRuleEngine.evaluateEligibility({
  ticket: mockTicket,
  order: mockOrder,
  event: mockEvent,
  customerId: 'cust-1',
  currentTime: new Date(),
  validateReason: false,
});

console.log('Eval 5 days before event:', eval5Days);
assert.strictEqual(eval5Days.eligible, true);
assert.strictEqual(eval5Days.refundRate, 50); // falls into >= 3 days tier (since 5 < 7)
assert.strictEqual(eval5Days.actualPaid, 100000);
assert.strictEqual(eval5Days.refundableAmount, 50000);

// Eval 8 days away
const mockEvent8Days = {
  id: 'event-1',
  start_time: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  refund_policy: policyWithRefund,
};
const eval8Days = refundRuleEngine.evaluateEligibility({
  ticket: mockTicket,
  order: mockOrder,
  event: mockEvent8Days,
  customerId: 'cust-1',
  currentTime: new Date(),
  validateReason: false,
});
console.log('Eval 8 days before event:', eval8Days);
assert.strictEqual(eval8Days.eligible, true);
assert.strictEqual(eval8Days.refundRate, 100);
assert.strictEqual(eval8Days.refundableAmount, 100000);

// Eval 1 day away (less than 3 days)
const mockEvent1Day = {
  id: 'event-1',
  start_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
  refund_policy: policyWithRefund,
};
const eval1Day = refundRuleEngine.evaluateEligibility({
  ticket: mockTicket,
  order: mockOrder,
  event: mockEvent1Day,
  customerId: 'cust-1',
  currentTime: new Date(),
  validateReason: false,
});
console.log('Eval 1 day before event:', eval1Day);
assert.strictEqual(eval1Day.eligible, false);
assert.strictEqual(eval1Day.refundRate, 0);
assert.strictEqual(eval1Day.refundableAmount, 0);

// Eval when allow_refund = false
const evalDisallowed = refundRuleEngine.evaluateEligibility({
  ticket: { ...mockTicket, refund_policy_snapshot: { allow_refund: false } },
  order: mockOrder,
  event: mockEvent8Days,
  customerId: 'cust-1',
  currentTime: new Date(),
  validateReason: false,
});
assert.strictEqual(evalDisallowed.eligible, false);
assert.strictEqual(evalDisallowed.refundRate, 0);

console.log('ALL UNIT TESTS PASSED SUCCESSFULLY!');
