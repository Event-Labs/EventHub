const {
  TAGLINE,
  SUPPORT_EMAIL,
  escapeHtml,
  sanitizeSafeUrl,
  buildEventUrl,
  detectNotificationLocale,
  extractInlineDataImages,
  formatNotificationMessageHtml,
  htmlToPlainText,
  normalizeAttachments,
  buildOrganizerAnnouncementHtml,
  buildOrganizerAnnouncementText,
} = require('./organizerAnnouncementEmail.template');

const mockQuery = jest.fn();
const mockSendEmail = jest.fn();
const mockCreateNotification = jest.fn();
const mockFindOrganizerByUserId = jest.fn();
const mockFindOrganizerEvent = jest.fn();
const mockCreateAnnouncement = jest.fn();
const mockFindEventAttendeeContacts = jest.fn();

jest.mock('../../config/env', () => ({
  CLIENT_URL: 'https://www.eventhub.id.vn',
}));

jest.mock('../../infrastructure/database/db.client', () => ({
  query: (...args) => mockQuery(...args),
}));

jest.mock('../../infrastructure/email/email.service', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('./notifications.stream', () => ({
  sendToUser: jest.fn(),
}));

jest.mock('./notifications.repository', () => ({
  findOrganizerByUserId: (...args) => mockFindOrganizerByUserId(...args),
  findOrganizerEvent: (...args) => mockFindOrganizerEvent(...args),
  createAnnouncement: (...args) => mockCreateAnnouncement(...args),
  findEventAttendeeContacts: (...args) => mockFindEventAttendeeContacts(...args),
  createNotification: (...args) => mockCreateNotification(...args),
  unreadCount: jest.fn().mockResolvedValue(1),
}));

const notificationsService = require('./notifications.service');

describe('organizerAnnouncementEmail.template', () => {
  describe('branding & layout sections', () => {
    it('renders all universal EventHub brand palette colors, header, hero, event card, CTA and footer', () => {
      const html = buildOrganizerAnnouncementHtml({
        customerName: 'Nguyễn Minh Anh',
        organizerName: 'Art Studio',
        notificationTitle: 'Thay đổi thời gian check-in',
        notificationMessage: '<p>Cổng check-in sẽ mở sớm hơn 30 phút so với dự kiến.</p>',
        eventId: 'evt-uuid-1234',
        eventSlug: 'workshop-tui-thao-moc-healing',
        eventName: 'Workshop Túi thảo mộc healing',
        eventImage: 'https://res.cloudinary.com/demo/image/upload/banner.jpg',
        startTime: '2026-10-30T12:00:00.000Z',
        endTime: '2026-10-30T15:00:00.000Z',
        venueName: 'Không gian Nghệ thuật Art',
        addressLine: '120 Nguyễn Huệ',
        district: 'Quận 1',
        city: 'TP. Hồ Chí Minh',
      });

      // Brand colors
      expect(html).toContain('#081126');
      expect(html).toContain('#122155');
      expect(html).toContain('#2B5C92');
      expect(html).toContain('#B3CDE0');
      expect(html).toContain('#38BDF8');

      // Header & Hero (no redundant top tagline, bell icon or organizer badge; wider 720px card)
      expect(html).toContain('max-width: 720px');
      expect(html).toContain('Bạn có thông báo mới!');
      expect(html).not.toContain('&#128276;');
      expect(html).not.toContain('THÔNG BÁO TỪ BAN TỔ CHỨC');
      expect(html).not.toContain(TAGLINE);

      // Greeting & Organizer
      expect(html).toContain('Xin chào Nguyễn Minh Anh,');
      expect(html).toContain('Art Studio');

      // Notification content appears before Event card
      expect(html).toContain('Thay đổi thời gian check-in');
      expect(html).toContain('Cổng check-in sẽ mở sớm hơn 30 phút so với dự kiến.');

      // Event card
      expect(html).toContain('Workshop Túi thảo mộc healing');
      expect(html).toContain('https://res.cloudinary.com/demo/image/upload/banner.jpg');
      expect(html).toContain('Thứ Sáu, 30/10/2026');
      expect(html).toContain('19:00 - 22:00 (GMT+7)');
      expect(html).toContain('Không gian Nghệ thuật Art');
      expect(html).toContain('120 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh');

      expect(html.indexOf('NỘI DUNG THÔNG BÁO')).toBeLessThan(html.indexOf('THÔNG TIN SỰ KIỆN'));
      expect(html.indexOf('Thay đổi thời gian check-in')).toBeLessThan(
        html.indexOf('120 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh'),
      );

      // CTA & fallback link removed; footer keeps support info without tagline or exposing internal UUID
      expect(html).not.toContain('Xem chi tiết sự kiện');
      expect(html).not.toContain('Hoặc mở trực tiếp đường dẫn sau');
      expect(html).not.toContain('evt-uuid-1234');
      expect(html).toContain(SUPPORT_EMAIL);
    });

    it('ensures light mode and dark mode compatibility across Gmail, Apple Mail, and Outlook', () => {
      const html = buildOrganizerAnnouncementHtml({
        customerName: 'Nguyễn Thị Anh Thư',
        organizerName: 'Garden Art',
        notificationTitle: 'Cập nhật lịch tham gia',
        notificationMessage:
          '<p><span style="color: #ffffff; background-color: #ffffff;">Văn bản copy nền trắng</span></p>' +
          '<p><span style="color: #000000;">Văn bản đen mặc định</span></p>' +
          '<p><span style="background-color: #fef08a; color: #000000;">Highlight quan trọng</span></p>',
        eventName: '[GARDEN ART] - ART WORKSHOP',
        startTime: '2026-11-29T07:00:00.000Z',
        venueName: 'Garden Art',
        addressLine: 'Lầu 1, 386/17C Lê Văn Sỹ',
        district: 'Quận 3',
        city: 'TP. Hồ Chí Minh',
      });

      // Crucial Gmail iOS/Android Dark Mode rule: never use non-invertible CSS linear-gradient on text surfaces
      expect(html).not.toContain('linear-gradient');

      // Dark mode opt-in meta & CSS rules for Apple Mail / iOS Mail / Outlook
      expect(html).toContain('<meta name="color-scheme" content="light dark" />');
      expect(html).toContain('<meta name="supported-color-schemes" content="light dark" />');
      expect(html).toContain('@media (prefers-color-scheme: dark)');
      expect(html).toContain('[data-ogsc] .eh-event-card');
      expect(html).toContain('eh-event-card');
      expect(html).toContain('eh-footer-bg');

      // Copied neutral white/black text without intentional highlight background gets normalized; intentional highlights stay intact
      expect(html).not.toContain('background-color: #ffffff;');
      expect(html).not.toContain('color: #ffffff');
      expect(html).toContain('Văn bản copy nền trắng');
      expect(html).toContain('Văn bản đen mặc định');
      expect(html).toContain('background-color: #fef08a; color: #000000');
    });
  });

  describe('language scenarios (Vietnamese & English)', () => {
    it('supports short Vietnamese notification with special characters', () => {
      const html = buildOrganizerAnnouncementHtml({
        customerName: 'Trần Bảo Ngọc & Gia Đình',
        organizerName: 'Âm Nhạc Việt',
        notificationTitle: 'Cập nhật nhanh (<10 phút)',
        notificationMessage: 'Hẹn gặp bạn lúc 18:30! Mang theo CMND/CCCD & vé QR.',
        eventSlug: 'dem-nhac-viet',
        eventName: 'Đêm Nhạc Việt 2026',
        startTime: '2026-11-15T11:30:00.000Z',
        venueName: 'Nhà hát Hòa Bình',
      });

      expect(html).toContain('lang="vi"');
      expect(html).toContain('Trần Bảo Ngọc &amp; Gia Đình');
      expect(html).toContain('Cập nhật nhanh (&lt;10 phút)');
      expect(html).toContain('Hẹn gặp bạn lúc 18:30! Mang theo CMND/CCCD &amp; vé QR.');
    });

    it('supports full English notification and UI copy', () => {
      const html = buildOrganizerAnnouncementHtml({
        locale: 'en',
        customerName: 'Sophia Turner',
        organizerName: 'Global Tech Summit',
        notificationTitle: 'Doors Open Earlier at 8:00 AM',
        notificationMessage: '<p>Please bring your confirmation code to Hall B for badge pickup.</p>',
        eventSlug: 'global-tech-summit-2026',
        eventName: 'Global Tech Summit 2026',
        startTime: '2026-11-20T01:00:00.000Z',
        endTime: '2026-11-20T10:00:00.000Z',
        venueName: 'Saigon Exhibition Center',
        addressLine: '799 Nguyen Van Linh',
        city: 'Ho Chi Minh City',
      });

      expect(html).toContain('lang="en"');
      expect(html).toContain('You have a new notification!');
      expect(html).toContain("Here&#39;s the latest update from the event organizer.");
      expect(html).toContain('Hello Sophia Turner,');
      expect(html).not.toContain('View Event');
      expect(html).not.toContain('Or open this link in your browser');
      expect(html).toContain('Doors Open Earlier at 8:00 AM');
      expect(html).toContain('Friday, Nov 20, 2026');
    });

    it('auto-detects English when organizer message has no Vietnamese diacritics', () => {
      expect(
        detectNotificationLocale({
          notificationTitle: 'Workshop Reminder',
          notificationMessage: 'Bring your laptop tomorrow.',
        }),
      ).toBe('en');

      expect(
        detectNotificationLocale({
          notificationTitle: 'Nhắc lịch tham dự',
          notificationMessage: 'Vui lòng mang theo laptop.',
        }),
      ).toBe('vi');
    });
  });

  describe('long content & rich text preservation (links, images, line breaks, attachments)', () => {
    it('handles very long messages with responsive word-wrapping and preserved paragraphs/line breaks', () => {
      const longParagraph = 'Thông tin chi tiết sự kiện rất quan trọng. '.repeat(60);
      const longUrl = `https://example.com/${'segment-'.repeat(25)}guide`;
      const html = buildOrganizerAnnouncementHtml({
        customerName: 'Lê Hoàng',
        notificationTitle: `Cập nhật toàn bộ lịch trình ${'chi tiết '.repeat(12)}`,
        notificationMessage: `<p>${longParagraph}</p><p><br></p><p>Xem tài liệu: ${longUrl}</p>`,
        eventSlug: 'hoi-nghi-2026',
        eventName: 'Hội nghị Công nghệ 2026',
      });

      expect(html).toContain('overflow-wrap: anywhere; word-break: break-word;');
      expect(html).toContain(longParagraph.trim());
      expect(html).toContain(`href="${longUrl}"`);
    });

    it('preserves plain-text line breaks and auto-linkifies bare URLs safely', () => {
      const html = formatNotificationMessageHtml(
        'Dòng thứ nhất\nDòng thứ hai: https://meet.google.com/abc-defg-hij.\nGiá vé < 500k & ưu đãi!',
      );

      expect(html).toContain('Dòng thứ nhất<br />');
      expect(html).toContain(
        '<a href="https://meet.google.com/abc-defg-hij" target="_blank" rel="noopener noreferrer"',
      );
      expect(html).toContain('Giá vé &lt; 500k &amp; ưu đãi!');
    });

    it('translates Quill classes into email-client inline CSS and resolves relative URLs to absolute URLs', () => {
      const html = formatNotificationMessageHtml(
        '<h2 class="ql-align-center">Lịch trình</h2><p class="ql-indent-1"><a href="/events/my-event">Trang sự kiện</a></p><img src="/uploads/map.png" alt="Bản đồ" />',
        { clientUrl: 'https://www.eventhub.id.vn' },
      );

      expect(html).toContain('text-align: center');
      expect(html).toContain('padding-left: 24px');
      expect(html).toContain('href="https://www.eventhub.id.vn/events/my-event"');
      expect(html).toContain('src="https://www.eventhub.id.vn/uploads/map.png"');
      expect(html).toContain('alt="Bản đồ"');
    });

    it('renders attached images and downloadable file attachments cleanly, and hides sections when none provided', () => {
      const withAttachments = buildOrganizerAnnouncementHtml({
        customerName: 'Minh Thư',
        notificationTitle: 'Tài liệu & Sơ đồ chỗ ngồi',
        notificationMessage: '<p>Vui lòng xem file và ảnh sơ đồ đính kèm.</p>',
        eventSlug: 'acoustic-night',
        eventName: 'Acoustic Night',
        attachments: [
          {
            filename: 'so-do-cho-ngoi.png',
            path: 'https://res.cloudinary.com/demo/image/upload/seating.png',
            contentType: 'image/png',
            size: 204800,
          },
          {
            filename: 'Huong_dan_check_in.pdf',
            path: 'https://res.cloudinary.com/demo/raw/upload/guide.pdf',
            contentType: 'application/pdf',
            size: 1572864,
          },
        ],
      });

      expect(withAttachments).toContain('Hình ảnh đính kèm (1)');
      expect(withAttachments).toContain('so-do-cho-ngoi.png');
      expect(withAttachments).toContain('https://res.cloudinary.com/demo/image/upload/seating.png');
      expect(withAttachments).toContain('Tệp đính kèm (1)');
      expect(withAttachments).toContain('Huong_dan_check_in.pdf');
      expect(withAttachments).toContain('1.5 MB');
      expect(withAttachments).toContain('PDF');
      expect(withAttachments).toContain('https://res.cloudinary.com/demo/raw/upload/guide.pdf');

      const withoutAttachments = buildOrganizerAnnouncementHtml({
        customerName: 'Minh Thư',
        notificationTitle: 'Thông báo ngắn',
        notificationMessage: '<p>Không có tệp đính kèm.</p>',
        eventSlug: 'acoustic-night',
        eventName: 'Acoustic Night',
        attachments: [],
      });

      expect(withoutAttachments).not.toContain('Hình ảnh đính kèm');
      expect(withoutAttachments).not.toContain('Tệp đính kèm');
    });

    it('extracts pasted data:image base64 screenshots into inline CID attachments', () => {
      const { html, inlineAttachments } = extractInlineDataImages(
        '<p>Ảnh vé mẫu:</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" alt="Sample" />',
      );

      expect(inlineAttachments).toHaveLength(1);
      expect(inlineAttachments[0].cid).toBe('eh-inline-1@eventhub');
      expect(inlineAttachments[0].contentType).toBe('image/png');
      expect(Buffer.isBuffer(inlineAttachments[0].content)).toBe(true);
      expect(html).toContain('src="cid:eh-inline-1@eventhub"');

      const rendered = formatNotificationMessageHtml(html);
      expect(rendered).toContain('src="cid:eh-inline-1@eventhub"');
    });
  });

  describe('missing optional data & multiple events/organizers', () => {
    it('gracefully hides missing event cover image and shows clean fallbacks for missing optional event info', () => {
      const html = buildOrganizerAnnouncementHtml({
        customerName: '',
        organizerName: '',
        notificationTitle: 'Thông báo cập nhật',
        notificationMessage: '<p>Nội dung cập nhật chung.</p>',
        eventId: 'evt-999',
        eventName: 'Workshop Cuối Tuần',
      });

      expect(html).toContain('Xin chào Quý khách,');
      expect(html).toContain('Ban tổ chức vừa gửi đến bạn một thông báo mới');
      expect(html).not.toContain('Tổ chức bởi:');
      expect(html).not.toContain('object-fit: cover');
      expect(html).toContain('Đang cập nhật');
      expect(html).not.toContain('evt-999');
    });

    it('formats ONLINE events cleanly without requiring physical address fields', () => {
      const html = buildOrganizerAnnouncementHtml({
        locale: 'en',
        customerName: 'Alex',
        notificationTitle: 'Webinar Access Link',
        notificationMessage: '<p>Join here: <a href="https://zoom.us/j/123456">Zoom Room</a></p>',
        eventSlug: 'ai-webinar',
        eventName: 'AI Product Webinar',
        eventFormat: 'ONLINE',
      });

      expect(html).toContain('Online Event');
      expect(html).toContain('href="https://zoom.us/j/123456"');
    });

    it('renders distinct branding and URLs accurately across different events and organizers', () => {
      const firstEmail = buildOrganizerAnnouncementHtml({
        customerName: 'Lan',
        organizerName: 'Organizer Alpha',
        notificationTitle: 'Notice A',
        notificationMessage: 'Message A',
        eventSlug: 'event-alpha',
        eventName: 'Alpha Fest',
      });
      const secondEmail = buildOrganizerAnnouncementHtml({
        customerName: 'Lan',
        organizerName: 'Organizer Beta',
        notificationTitle: 'Notice B',
        notificationMessage: 'Message B',
        eventSlug: 'event-beta',
        eventName: 'Beta Summit',
      });

      expect(firstEmail).toContain('Organizer Alpha');
      expect(firstEmail).toContain('Alpha Fest');
      expect(firstEmail).not.toContain('Beta Summit');

      expect(secondEmail).toContain('Organizer Beta');
      expect(secondEmail).toContain('Beta Summit');
      expect(secondEmail).not.toContain('Alpha Fest');
    });
  });

  describe('security & XSS prevention', () => {
    it('strips scripts, iframes, event handlers, and javascript: URIs from rich notification content', () => {
      const malicious =
        '<script>alert("xss")</script>' +
        '<p style="color: #0284c7; background: url(javascript:alert(1));" onclick="evil()">An toàn</p>' +
        '<iframe src="https://evil.com"></iframe>' +
        '<img src="x" onerror="alert(1)" />' +
        '<a href="javascript:alert(1)">Bad Link</a> ' +
        '<a href="https://safe.example.com/ok">Safe Link</a>';

      const sanitized = formatNotificationMessageHtml(malicious);

      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert("xss")');
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('color: #0284c7');
      expect(sanitized).toContain('href="https://safe.example.com/ok"');
    });

    it('escapes HTML injection payloads in customer name, organizer name, title, and event fields', () => {
      const html = buildOrganizerAnnouncementHtml({
        customerName: '<img src=x onerror=alert(1)>',
        organizerName: '<script>steal()</script>',
        notificationTitle: '"><script>alert(1)</script>',
        notificationMessage: 'Hello',
        eventName: 'Event <b>Name</b>',
        venueName: 'Hall <script>1</script>',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
      expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Event &lt;b&gt;Name&lt;/b&gt;');
    });

    it('rejects unsafe URL protocols while normalizing valid relative URLs', () => {
      expect(sanitizeSafeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeSafeUrl('  J&#x61;vaScript:alert(1)')).toBe('');
      expect(sanitizeSafeUrl('data:text/html,<script>1</script>')).toBe('');
      expect(sanitizeSafeUrl('/events/rock-show', 'https://www.eventhub.id.vn')).toBe(
        'https://www.eventhub.id.vn/events/rock-show',
      );
      expect(buildEventUrl({ clientUrl: 'https://www.eventhub.id.vn', eventSlug: 'rock show' })).toBe(
        'https://www.eventhub.id.vn/events/rock%20show',
      );
    });
  });

  describe('plain text email fallback', () => {
    it('preserves text links, line breaks, attachments, and dynamic event URL in plain-text output', () => {
      const text = buildOrganizerAnnouncementText({
        customerName: 'Hoàng Nam',
        organizerName: 'Saigon Jazz',
        notificationTitle: 'Gửi tài liệu chương trình',
        notificationMessage:
          '<p>Chào bạn,</p><p>Xem lịch diễn tại <a href="https://example.com/schedule">Lịch diễn</a></p>',
        eventSlug: 'saigon-jazz-night',
        eventName: 'Saigon Jazz Night',
        startTime: '2026-12-01T12:30:00.000Z',
        venueName: 'Nhà hát Thành phố',
        attachments: [
          {
            filename: 'Agenda.pdf',
            path: 'https://res.cloudinary.com/demo/raw/upload/Agenda.pdf',
            size: 102400,
          },
        ],
      });

      expect(text).toContain('[EventHub] Gửi tài liệu chương trình');
      expect(text).toContain('Xin chào Hoàng Nam,');
      expect(text).toContain('Lịch diễn (https://example.com/schedule)');
      expect(text).toContain('- Agenda.pdf (100 KB): https://res.cloudinary.com/demo/raw/upload/Agenda.pdf');
      expect(text).not.toContain('Xem chi tiết sự kiện');
    });
  });
});

describe('notificationsService.sendAnnouncement integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOrganizerByUserId.mockResolvedValue({
      id: 'org-1',
      user_id: 'user-org-1',
      organization_name: 'Art Creative Hub',
      status: 'ACTIVE',
    });
    mockFindOrganizerEvent.mockResolvedValue({
      id: 'evt-1',
      title: 'Workshop Túi thảo mộc healing',
      slug: 'workshop-tui-thao-moc-healing',
      organizer_id: 'org-1',
      banner_url: 'https://res.cloudinary.com/demo/image/upload/workshop.jpg',
      event_format: 'OFFLINE',
      start_time: '2026-11-15T07:00:00.000Z',
      end_time: '2026-11-15T10:00:00.000Z',
      venue_name: 'Art Space',
      address_line: '45 Lê Lợi',
      district: 'Quận 1',
      city: 'TP.HCM',
    });
    mockCreateAnnouncement.mockResolvedValue({
      id: 'ann-1',
      event_id: 'evt-1',
      organizer_id: 'org-1',
      title: 'Thay đổi thời gian check-in',
      content: '<p>Check-in sớm 30 phút</p>',
    });
    mockFindEventAttendeeContacts.mockResolvedValue([
      { user_id: 'cust-1', email: 'lan@example.com', full_name: 'Ngọc Lan' },
      { user_id: 'cust-2', email: 'minh@example.com', full_name: 'Quốc Minh' },
    ]);
    mockCreateNotification.mockResolvedValue({
      id: 'notif-1',
      user_id: 'cust-1',
      event_id: 'evt-1',
      title: 'Thay đổi thời gian check-in',
      content: '<p>Check-in sớm 30 phút</p>',
      type: 'EVENT',
      is_read: false,
      created_at: new Date().toISOString(),
    });
    mockSendEmail.mockResolvedValue({ messageId: 'msg-1', accepted: ['ok'], rejected: [] });
  });

  it('sends redesigned branded HTML emails with attachments and inline CID images while keeping web notifications intact', async () => {
    const result = await notificationsService.sendAnnouncement('user-org-1', {
      event_id: 'evt-1',
      title: 'Thay đổi thời gian check-in',
      content:
        '<p>Vui lòng đến sớm 30 phút. Xem bản đồ: <a href="https://maps.example.com/venue">Google Maps</a></p><img src="data:image/png;base64,AAAA" alt="Map" />',
      attachments: [
        {
          filename: 'schedule.pdf',
          path: 'https://res.cloudinary.com/demo/raw/upload/schedule.pdf',
          contentType: 'application/pdf',
          size: 51200,
        },
      ],
      channels: ['web', 'email'],
    });

    expect(result.recipients).toBe(2);
    expect(result.web_sent).toBe(2);
    expect(result.email_sent).toBe(2);

    // Wait for setImmediate background batch dispatch
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // In-app web notifications receive unchanged webContent with raw attachment list
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cust-1',
        eventId: 'evt-1',
        title: 'Thay đổi thời gian check-in',
        content: expect.stringContaining('schedule.pdf'),
      }),
    );

    // Emails use redesigned HTML template and include both file and extracted CID inline attachments
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const firstEmailCall = mockSendEmail.mock.calls.find((c) => c[0].email === 'lan@example.com')[0];
    expect(firstEmailCall.subject).toBe('[EventHub] Thay đổi thời gian check-in');
    expect(firstEmailCall.html).toContain('Xin chào Ngọc Lan,');
    expect(firstEmailCall.html).toContain('Art Creative Hub');
    expect(firstEmailCall.html).toContain('Workshop Túi thảo mộc healing');
    expect(firstEmailCall.html).toContain('href="https://maps.example.com/venue"');
    expect(firstEmailCall.html).toContain('src="cid:eh-inline-1@eventhub"');
    expect(firstEmailCall.html).not.toContain('Xem chi tiết sự kiện');
    expect(firstEmailCall.html).not.toContain(TAGLINE);
    expect(firstEmailCall.attachments).toHaveLength(2);
    expect(firstEmailCall.attachments[0]).toMatchObject({
      filename: 'schedule.pdf',
      path: 'https://res.cloudinary.com/demo/raw/upload/schedule.pdf',
    });
    expect(firstEmailCall.attachments[1]).toMatchObject({
      cid: 'eh-inline-1@eventhub',
      contentDisposition: 'inline',
    });
  });
});

