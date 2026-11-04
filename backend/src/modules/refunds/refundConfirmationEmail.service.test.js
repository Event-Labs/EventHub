const {
  buildRefundConfirmationEmail,
  formatRefundAmount,
  formatRefundDate,
  resolveRefundMethod,
  resolveRequestCode,
} = require('./refundConfirmationEmail.service');

describe('Refund Confirmation Email Service', () => {
  const mockRefund = {
    id: 'f22ab96c-4d11-4f9e-8a2b-34567890abcd',
    ticket_code: 'EH-F22AB96C4D',
    order_code: 'EH-ORD-12345',
    event_title: 'Đêm Nhạc Trữ Tình Hà Nội',
    customer_name: 'Nguyễn Văn A',
    customer_email: 'nguyenvana@example.com',
    refund_amount: 30000,
    refund_method: 'PAYOS',
    refunded_at: '2026-10-27T08:30:00.000Z',
  };

  const mockUpdated = {
    refund_amount: 30000,
    refunded_at: '2026-10-27T08:30:00.000Z',
    status: 'REFUNDED',
  };

  test('formatRefundAmount correctly formats numbers into Vietnamese currency VND', () => {
    expect(formatRefundAmount(30000)).toBe('30.000 VND');
    expect(formatRefundAmount(1500000)).toBe('1.500.000 VND');
    expect(formatRefundAmount(0)).toBe('0 VND');
    expect(formatRefundAmount(null)).toBe('0 VND');
  });

  test('formatRefundDate correctly formats date to DD/MM/YYYY', () => {
    const formatted = formatRefundDate('2026-10-27T10:00:00.000Z');
    expect(formatted).toMatch(/\d{2}\/\d{2}\/2026/);
  });

  test('resolveRefundMethod resolves standard and bank methods correctly', () => {
    expect(resolveRefundMethod('PAYOS')).toBe('Phương thức thanh toán ban đầu');
    expect(resolveRefundMethod('MANUAL_BANK_TRANSFER', 'Vietcombank')).toBe('Chuyển khoản ngân hàng (Vietcombank)');
    expect(resolveRefundMethod('MANUAL_BANK_TRANSFER')).toBe('Chuyển khoản ngân hàng');
    expect(resolveRefundMethod(null, 'Techcombank')).toBe('Chuyển khoản ngân hàng (Techcombank)');
    expect(resolveRefundMethod(null, null)).toBe('Phương thức thanh toán ban đầu');
  });

  test('resolveRequestCode produces clean uppercase code with EH-RF- prefix', () => {
    expect(resolveRequestCode({ id: 'f22ab96c-4d11-4f9e-8a2b-34567890abcd' })).toBe('EH-RF-F22AB96C');
    expect(resolveRequestCode(null)).toBe('EH-RF-00000000');
  });

  test('buildRefundConfirmationEmail builds all required and recommended fields matching spec', () => {
    const result = buildRefundConfirmationEmail(mockRefund, mockUpdated);

    // 1. Subject line
    expect(result.subject).toBe('[EventHub] Hoàn tiền thành công – Mã yêu cầu EH-RF-F22AB96C');

    // 2. Customer name
    expect(result.html).toContain('Nguyễn Văn A');
    expect(result.text).toContain('Nguyễn Văn A');

    // 3. Request code
    expect(result.html).toContain('EH-RF-F22AB96C');
    expect(result.text).toContain('EH-RF-F22AB96C');

    // 4. Refund amount
    expect(result.html).toContain('30.000 VND');
    expect(result.text).toContain('30.000 VND');

    // 5. Ticket code and Event title
    expect(result.html).toContain('EH-F22AB96C4D');
    expect(result.text).toContain('EH-F22AB96C4D');
    expect(result.html).toContain('Đêm Nhạc Trữ Tình Hà Nội');
    expect(result.text).toContain('Đêm Nhạc Trữ Tình Hà Nội');

    // 6. Refund date
    expect(result.html).toContain('Ngày hoàn tiền');
    expect(result.text).toContain('Ngày hoàn tiền');

    // 7. Refund method
    expect(result.html).toContain('Phương thức thanh toán ban đầu');
    expect(result.text).toContain('Phương thức thanh toán ban đầu');

    // 8. Ticket status after refund
    expect(result.html).toContain('Đã vô hiệu hóa');
    expect(result.text).toContain('Đã vô hiệu hóa');

    // 9. Status badge
    expect(result.html).toContain('Thành công');
    expect(result.text).toContain('Thành công');

    // 10. Notes section
    expect(result.html).toContain('Bạn cần lưu ý');
    expect(result.html).toContain('Số tiền hoàn sẽ được chuyển về phương thức thanh toán');
    expect(result.html).toContain('Thời gian tiền thực tế xuất hiện trong tài khoản');
    expect(result.html).toContain('Vé đã được hoàn tiền có thể bị vô hiệu hóa');

    // 11. Support instructions
    expect(result.html).toContain('Nếu bạn cần hỗ trợ về giao dịch này');
    expect(result.text).toContain('Nếu bạn cần hỗ trợ về giao dịch này');

    // 12. Footer
    expect(result.html).toContain('Email tự động từ hệ thống EventHub');
    expect(result.text).toContain('Email tự động từ hệ thống EventHub');
  });

  test('escapes HTML special characters in customer name and event title for security', () => {
    const maliciousRefund = {
      ...mockRefund,
      customer_name: '<script>alert("xss")</script> & Bob',
      event_title: 'Rock Festival <2026> & "Live"',
    };

    const result = buildRefundConfirmationEmail(maliciousRefund, mockUpdated);

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Bob');
    expect(result.html).toContain('Rock Festival &lt;2026&gt; &amp; &quot;Live&quot;');
  });

  test('falls back gracefully when optional fields are missing', () => {
    const minimalRefund = {
      id: '12345678-0000-0000-0000-000000000000',
    };

    const result = buildRefundConfirmationEmail(minimalRefund, {});

    expect(result.subject).toBe('[EventHub] Hoàn tiền thành công – Mã yêu cầu EH-RF-12345678');
    expect(result.html).toContain('Quý khách');
    expect(result.html).toContain('0 VND');
    expect(result.html).toContain('N/A');
    expect(result.html).toContain('Sự kiện EventHub');
  });
});
