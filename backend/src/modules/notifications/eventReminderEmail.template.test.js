const {
  formatReminderDate,
  formatReminderTime,
  formatVenueAddress,
  buildEventReminderHtml,
  buildEventReminderText,
} = require('./eventReminderEmail.template');

describe('eventReminderEmail.template', () => {
  describe('formatReminderDate', () => {
    it('formats date in Asia/Ho_Chi_Minh with Vietnamese day of week and dd/MM/yyyy', () => {
      // 2026-10-30T12:00:00Z is 19:00 Friday 30/10/2026 in Asia/Ho_Chi_Minh (UTC+7)
      const res = formatReminderDate('2026-10-30T12:00:00.000Z');
      expect(res).toBe('Thứ Sáu, 30/10/2026');
    });

    it('returns fallback if invalid date', () => {
      expect(formatReminderDate(null)).toBe('Chưa cập nhật');
    });
  });

  describe('formatReminderTime', () => {
    it('formats time in Asia/Ho_Chi_Minh (24h format HH:mm)', () => {
      const start = '2026-10-30T12:00:00.000Z'; // 19:00 ICT
      const end = '2026-10-30T15:00:00.000Z'; // 22:00 ICT
      expect(formatReminderTime(start, end)).toBe('19:00 - 22:00');
      expect(formatReminderTime(start)).toBe('19:00');
    });
  });

  describe('formatVenueAddress', () => {
    it('avoids duplicating ward/district/city if address_line already contains them', () => {
      const address = formatVenueAddress({
        address_line: '70-72 Nguyễn Văn Trỗi, Phường Phú Nhuận, TP. Hồ Chí Minh',
        ward: 'Phường Phú Nhuận',
        district: 'Phú Nhuận',
        city: 'TP. Hồ Chí Minh',
      });
      expect(address).toBe('70-72 Nguyễn Văn Trỗi, Phường Phú Nhuận, TP. Hồ Chí Minh');
    });

    it('appends missing ward or city when not present in address_line', () => {
      const address = formatVenueAddress({
        address_line: 'Số 10 Nguyễn Huệ',
        ward: 'Bến Nghé',
        city: 'Hồ Chí Minh',
      });
      expect(address).toBe('Số 10 Nguyễn Huệ, Bến Nghé, Hồ Chí Minh');
    });

    it('handles online events', () => {
      const address = formatVenueAddress({ isOnline: true });
      expect(address).toContain('Sự kiện trực tuyến (Online)');
    });
  });

  describe('buildEventReminderHtml', () => {
    it('generates rich email template matching mockup requirements', () => {
      const html = buildEventReminderHtml({
        attendeeName: 'Anh Thư',
        eventTitle: 'NGÔI NHÀ KHÔNG CÓ ĐÀN ÔNG',
        bannerUrl: 'https://example.com/banner.jpg',
        startTime: '2026-10-30T12:00:00.000Z',
        venueName: 'Sân Khấu Quốc Thảo',
        addressLine: '70-72 Nguyễn Văn Trỗi, Phường Phú Nhuận, TP. Hồ Chí Minh',
        milestone: '24h',
      });

      expect(html).toContain('Sự kiện sắp bắt đầu!');
      expect(html).toContain('EVENT REMINDER');
      expect(html).toContain('XIN CHÀO, ANH THƯ!');
      expect(html).toContain('NGÔI NHÀ KHÔNG CÓ ĐÀN ÔNG');
      expect(html).toContain('Thứ Sáu, 30/10/2026');
      expect(html).toContain('19:00');
      expect(html).toContain('Sân Khấu Quốc Thảo');
      expect(html).toContain('Trước khi tham dự');
      expect(html).toContain('Xem vé điện tử của tôi');
      expect(html).toContain('/my-tickets');
    });

    it('differentiates 2h milestone badge and description', () => {
      const html = buildEventReminderHtml({
        attendeeName: 'Anh Thư',
        eventTitle: 'NGÔI NHÀ KHÔNG CÓ ĐÀN ÔNG',
        startTime: '2026-10-30T12:00:00.000Z',
        venueName: 'Sân Khấu Quốc Thảo',
        milestone: '2h',
      });

      expect(html).toContain('SỰ KIỆN SẮP DIỄN RA (CÒN 2 GIỜ)');
      expect(html).toContain('Chỉ còn khoảng 2 giờ nữa');
    });
  });
});

