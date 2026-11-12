const {
  buildEventCancellationEmail,
  detectCancellationLocale,
  formatCancellationCurrency,
  formatCancellationDate,
  getCancellationCopy,
} = require('./eventCancellationEmail.template');

describe('eventCancellationEmail.template', () => {
  describe('detectCancellationLocale', () => {
    it('detects en locale correctly', () => {
      expect(detectCancellationLocale({ locale: 'en' })).toBe('en');
      expect(detectCancellationLocale({ locale: 'en-US' })).toBe('en');
      expect(detectCancellationLocale({ locale: 'en_us' })).toBe('en');
    });

    it('detects vi locale correctly', () => {
      expect(detectCancellationLocale({ locale: 'vi' })).toBe('vi');
      expect(detectCancellationLocale({ locale: 'vi-VN' })).toBe('vi');
    });

    it('falls back to vi when undefined or invalid', () => {
      expect(detectCancellationLocale({})).toBe('vi');
      expect(detectCancellationLocale({ locale: 'fr' })).toBe('vi');
    });
  });

  describe('formatCancellationCurrency', () => {
    it('formats currency correctly in Vietnamese', () => {
      const formatted = formatCancellationCurrency(150000, 'vi');
      expect(formatted).toContain('150.000');
      expect(formatted).toContain('VND');
    });

    it('formats currency correctly in English', () => {
      const formatted = formatCancellationCurrency(150000, 'en');
      expect(formatted).toContain('150,000');
      expect(formatted).toContain('VND');
    });
  });

  describe('buildEventCancellationEmail - Vietnamese', () => {
    const data = {
      customerName: 'Nguyễn Văn A',
      eventName: 'Liveshow Sân khấu 5B',
      eventDate: '2026-12-12T19:00:00Z',
      orderCode: 'ORD-123456',
      cancellationReason: 'Nghệ sĩ gặp sự cố sức khỏe đột xuất',
      refundAmount: 500000,
      locale: 'vi',
    };

    it('generates Vietnamese subject, text and HTML correctly', () => {
      const result = buildEventCancellationEmail(data);

      expect(result.locale).toBe('vi');
      expect(result.subject).toContain('[EventHub] Thông báo hủy sự kiện & Hoàn tiền 100%');
      expect(result.subject).toContain('Liveshow Sân khấu 5B');

      // Check key text in body
      expect(result.html).toContain('Sự kiện đã bị hủy');
      expect(result.html).toContain('Thông báo quan trọng về đơn vé của bạn.');
      expect(result.html).toContain('Kính gửi Quý khách Nguyễn Văn A,');
      expect(result.html).toContain('Nghệ sĩ gặp sự cố sức khỏe đột xuất');
      expect(result.html).toContain('100% số tiền');
      expect(result.html).toContain('500.000 VND');
      expect(result.html).toContain('Chờ hoàn tiền');
      expect(result.html).toContain('ORD-123456');

      // Check 4 steps
      expect(result.html).toContain('Bước 1. Truy cập mục Vé của tôi');
      expect(result.html).toContain('Bước 2. Kiểm tra thông tin nhận tiền');
      expect(result.html).toContain('Bước 3. Cập nhật thông tin nếu cần');
      expect(result.html).toContain('Bước 4. Theo dõi trạng thái hoàn tiền');

      // Check CTA
      expect(result.html).toContain('Truy cập Vé của tôi');
      expect(result.html).toContain('/my-tickets?status=REFUND_PENDING');

      // Check footer
      expect(result.html).toContain('eventhub.coop@gmail.com');
      expect(result.html).toContain('Together for a better event experience');
    });
  });

  describe('buildEventCancellationEmail - English', () => {
    const data = {
      customerName: 'John Doe',
      eventName: 'Rock Concert 2026',
      eventDate: '2026-12-12T19:00:00Z',
      orderCode: 'ORD-987654',
      cancellationReason: 'Bad weather conditions',
      refundAmount: 300000,
      locale: 'en',
    };

    it('generates English subject, text and HTML correctly', () => {
      const result = buildEventCancellationEmail(data);

      expect(result.locale).toBe('en');
      expect(result.subject).toContain('[EventHub] Event Cancelled & 100% Refund Notice');
      expect(result.subject).toContain('Rock Concert 2026');

      // Check key text in body
      expect(result.html).toContain('Event Cancelled');
      expect(result.html).toContain('Important notice regarding your ticket order.');
      expect(result.html).toContain('Dear John Doe,');
      expect(result.html).toContain('Bad weather conditions');
      expect(result.html).toContain('100% of the amount');
      expect(result.html).toContain('300,000 VND');
      expect(result.html).toContain('Pending Refund');
      expect(result.html).toContain('ORD-987654');

      // Check 4 steps in English
      expect(result.html).toContain('Step 1. Access My Tickets');
      expect(result.html).toContain('Step 2. Verify Receiving Account Details');
      expect(result.html).toContain('Step 3. Update Information if Needed');
      expect(result.html).toContain('Step 4. Track Refund Status');

      // Check CTA
      expect(result.html).toContain('Go to My Tickets');
      expect(result.html).toContain('/my-tickets?status=REFUND_PENDING');
    });
  });

  describe('buildEventCancellationEmail - Security & Escaping', () => {
    it('escapes dangerous HTML characters', () => {
      const maliciousData = {
        customerName: '<script>alert("hack")</script>',
        eventName: 'Party <img src=x onerror=alert(1)>',
        cancellationReason: '<b>Bold</b> & "Quotes"',
        refundAmount: 100000,
        locale: 'vi',
      };

      const result = buildEventCancellationEmail(maliciousData);
      expect(result.html).not.toContain('<script>alert("hack")</script>');
      expect(result.html).toContain('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
      expect(result.html).not.toContain('<img src=x onerror=alert(1)>');
      expect(result.html).toContain('&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;Quotes&quot;');
    });

    it('handles missing optional fields gracefully', () => {
      const emptyData = {
        locale: 'vi',
      };

      const result = buildEventCancellationEmail(emptyData);
      expect(result.html).toContain('Quý khách');
      expect(result.html).toContain('Sự kiện EventHub');
      expect(result.html).toContain('0 VND');
    });
  });
});

