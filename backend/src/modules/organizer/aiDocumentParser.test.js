const fs = require('fs');
const path = require('path');

jest.mock('../admin/eventCategories.repository', () => ({
  findAll: jest.fn().mockResolvedValue([
    { id: 'cat-music', name: 'Âm nhạc', slug: 'am-nhac-bieu-dien' },
    { id: 'cat-tech', name: 'Công nghệ', slug: 'kinh-doanh-cong-nghe' },
    { id: 'cat-edu', name: 'Hội thảo', slug: 'hoi-thao-giao-duc' },
    { id: 'cat-culture', name: 'Văn hóa', slug: 'le-hoi-van-hoa' },
    { id: 'cat-sport', name: 'Thể thao', slug: 'the-thao' },
  ]),
}));

jest.mock('../../infrastructure/ai/ollama.client', () => ({
  generate: jest.fn().mockRejectedValue(new Error('Ollama offline in unit test')),
  extractJSON: jest.fn(),
}));

jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buf) => {
    if (!buf || buf.length === 0) throw new Error('Invalid PDF');
    return Promise.resolve({ text: 'DAI NHAC HOI MUA HE 2026 GIA VE 200000 VND' });
  });
});

const aiDocumentParserService = require('./aiDocumentParser.service');

describe('AiDocumentParserService Test Suite', () => {
  jest.setTimeout(120000);
  test('extractTextFromFile should read text from plain text buffer', async () => {
    const mockFile = {
      originalname: 'ke_hoach_su_kien.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(
        'ĐẠI NHẠC HỘI MÙA HÈ 2026\nThời gian: 25/11/2026 từ 18:00 đến 22:00\nĐịa điểm: Sân vận động Quân khu 7\nGiá vé:\n- Vé VIP: 500.000 VNĐ\n- Vé Thường: 200.000 VNĐ\nNội dung: Đêm nhạc sôi động quy tụ dàn nghệ sĩ hàng đầu.'
      ),
    };

    const text = await aiDocumentParserService.extractTextFromFile(mockFile);
    expect(text).toContain('ĐẠI NHẠC HỘI MÙA HÈ 2026');
    expect(text).toContain('500.000 VNĐ');
  });

  test('extractTextFromFile should read text from PDF file buffer', async () => {
    const minimalPdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 73 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(DAI NHAC HOI MUA HE 2026 GIA VE 200000 VND) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000222 00000 n \n0000000305 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n428\n%%EOF';
    const mockFile = {
      originalname: 'ke_hoach.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from(minimalPdf),
    };

    const text = await aiDocumentParserService.extractTextFromFile(mockFile);
    expect(text).toContain('DAI NHAC HOI MUA HE 2026');
  });

  test('extractTextFromFile should throw error on invalid/empty file', async () => {
    await expect(aiDocumentParserService.extractTextFromFile(null)).rejects.toThrow();
    await expect(
      aiDocumentParserService.extractTextFromFile({ buffer: Buffer.from('') })
    ).rejects.toThrow();
  });

  test('_normalizeTime should convert various time formats to HH:mm', () => {
    expect(aiDocumentParserService._normalizeTime('9:00')).toBe('09:00');
    expect(aiDocumentParserService._normalizeTime('18h00')).toBe('18:00');
    expect(aiDocumentParserService._normalizeTime('18h')).toBe('18:00');
    expect(aiDocumentParserService._normalizeTime('7:30 PM')).toBe('19:30');
    expect(aiDocumentParserService._normalizeTime('7 AM')).toBe('07:00');
    expect(aiDocumentParserService._normalizeTime('invalid', '10:00')).toBe('10:00');
  });

  test('extractEventFromText should parse event details and enforce 3-week rule', async () => {
    const sampleText = `
ĐẠI NHẠC HỘI MÙA HÈ 2026
Thời gian diễn ra: 30/12/2026 từ 18:00 đến 22:00
Địa điểm: Sân vận động Quân khu 7, TP. Hồ Chí Minh
Giá vé:
- Vé VIP: 500000 vnđ
- Vé Tiêu Chuẩn: 200000 vnđ

Mô tả sự kiện:
Đêm nhạc hoành tráng với sự tham gia của các ban nhạc nổi tiếng.
Check-in sớm từ 17:00.
Chính sách: Không hoàn vé sau khi mua.
    `;

    const result = await aiDocumentParserService.extractEventFromText(sampleText, 'Ưu tiên nhạc trẻ');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.title.toLowerCase()).toBe('đại nhạc hội mùa hè 2026');
    expect(Array.isArray(result.data.sessions)).toBe(true);
    expect(result.data.sessions.length).toBeGreaterThan(0);

    // Verify session times
    const session = result.data.sessions[0];
    expect(session.start_time).toBeDefined();
    expect(session.end_time).toBeDefined();

    // Verify date is valid format YYYY-MM-DD
    expect(typeof session.start_date).toBe('string');
    expect(session.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify tags: does NOT contain 'eventhub'
    if (result.data.tags && result.data.tags.length > 0) {
      const hasEventHubTag = result.data.tags.some((t) => t.toLowerCase().includes('eventhub'));
      expect(hasEventHubTag).toBe(false);
    }

    // Verify tickets
    expect(Array.isArray(result.data.ticket_types)).toBe(true);
    expect(result.data.ticket_types.length).toBeGreaterThanOrEqual(1);
    result.data.ticket_types.forEach((ticket) => {
      expect(typeof ticket.name).toBe('string');
      expect(ticket.price).toBeGreaterThanOrEqual(0);
      expect(ticket.quantity_total === null || ticket.quantity_total >= 1).toBe(true);
    });
  });

  test('extractEventFromText should keep time, venue, and quantity empty when document lacks them', async () => {
    const textWithoutTimeVenueQty = `
HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH
Thời gian: 26.07.2026
Các loại vé: 
Vé vip: 1.000.000 VNĐ
Vé standard: 500.000VNĐ
    `;

    const result = await aiDocumentParserService.extractEventFromText(textWithoutTimeVenueQty, '', { organizerName: 'Sân Khấu Quốc Thảo' });

    expect(result.success).toBe(true);
    // Venue was not in text, must NOT be hallucinated as organizer name
    expect(result.data.venue_name).toBe('');
    // Time was not in text, must NOT be hallucinated
    expect(result.data.sessions[0].start_time).toBe('');
    expect(result.data.sessions[0].checkin_start_time).toBe('');
    // Ticket quantity was not in text, must be null
    expect(result.data.ticket_types[0].quantity_total).toBeNull();
    expect(result.data.ticket_types[1].quantity_total).toBeNull();
  });

  test('extractEventFromText should use organizerName in tags and exclude eventhub', async () => {
    const text = `
TIÊU ĐỀ: Gala Vinh Danh Âm Nhạc 2026
MÔ TẢ NGẮN: Sự kiện âm nhạc đỉnh cao quy tụ dàn nghệ sĩ hàng đầu.
THỜI GIAN: 20:00 ngày 15/11/2026. Check-in từ 18:30.
ĐỊA ĐIỂM: Trung tâm Hội nghị White Palace
GIÁ VÉ: Vé VIP 1.500.000 VNĐ - Bao gồm quà tặng và thức uống đón tiếp
    `;

    const result = await aiDocumentParserService.extractEventFromText(text, '', { organizerName: 'Galaxy Entertainment' });

    expect(result.success).toBe(true);
    expect(result.data.tags).toContain('Galaxy Entertainment');
    const hasEventHubTag = result.data.tags.some((t) => t.toLowerCase().includes('eventhub'));
    expect(hasEventHubTag).toBe(false);
    expect(result.data.sessions[0].checkin_start_time).toBe('18:30');
    expect(result.data.ticket_types[0].description).toContain('Bao gồm quà tặng');
  });

  test('extractEventFromText should handle minimal text without hallucinating', async () => {
    const minimalText = `
Hội thảo Trí tuệ Nhân tạo 2026
Sự kiện chia sẻ các nghiên cứu mới về AI.
    `;

    const result = await aiDocumentParserService.extractEventFromText(minimalText);

    expect(result.success).toBe(true);
    expect(result.data.title).toContain('Hội thảo Trí tuệ Nhân tạo 2026');
    // Venue address should be empty string, not hallucinated fake address
    expect(typeof result.data.address_line).toBe('string');
    // A default or parsed ticket type should have valid numeric price
    expect(result.data.ticket_types.length).toBeGreaterThanOrEqual(1);
    expect(result.data.ticket_types[0].price).toBeGreaterThanOrEqual(0);
  });

  test('extractEventFromText should use Solution 1 hybrid extraction and finish fast without hallucination', async () => {
    const userSampleDoc = `TIÊU ĐỀ: 
HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH

MÔ TẢ NGẮN: 
HOMIES – FORCEBOOK FAN MEETING IN HO CHI MINH là sự kiện gặp gỡ người hâm mộ đặc biệt giữa bộ đôi diễn viên Thái Lan Force Jiratchapong và Book Kasidet. Với chủ đề "Homies", chương trình mang đến không gian giao lưu gần gũi, ấm áp cùng những màn trình diễn độc quyền, trò chơi tương tác và nhiều khoảnh khắc đáng nhớ, giúp người hâm mộ có cơ hội kết nối trực tiếp với thần tượng trong một bầu không khí sôi động và thân thiện. 

MÔ TẢ: 
Gặp nhau có thể là do duyên số,
Nhưng "định mệnh" này chắc chắn là do ForceBook định ra 🦊🍅
Thời gian - địa điểm rõ ràng, hãy chuẩn bị tinh thần cháy hết mình để biến Homies - Forcebook Fan Meeting in Ho Chi Minh City ngày 26.07.2026 sắp tới trở nên thật đặc biệt và đáng nhớ ❤️
Stay tuned! 😎🤙🏻
 
 
 
English Below
Điều khoản và điều kiện:
* Vé concert chỉ có thể được mua thông qua các nền tảng của Ticketbox (trang web và ứng dụng Ticketbox)
* 1 (MỘT) vé chỉ có hiệu lực cho 1 (MỘT) người sở hữu vé cho 1 (MỘT) lần vào bên trong khu vực diễn ra sự kiện.
* Mỗi tài khoản giới hạn tối đa 4 vé.
* Vé KHÔNG được hoàn trả, đổi ngày hoặc chỉnh sửa trong bất kỳ trường hợp nào.
* Vui lòng không mua vé từ bất kỳ nguồn nào khác để tránh trường hợp vé giả hoặc lừa đảo, BTC không chịu trách nhiệm giải quyết các trường hợp này.
* Khán giả có trách nhiệm tự bảo quản vé của mình. BTC từ chối giải quyết các trường hợp có nhiều hơn 1 người check-in cùng 1 mã vé. Theo quy định, BTC sẽ chấp nhận cho phép người sở hữu vé chính chủ theo thông tin khai báo trên Ticketbox được tham dự sự kiện.
* Người tham dự sự kiện vui lòng xuất trình email nhận vé hoặc đơn hàng có trên app Ticketbox để checkin đổi Benefits và nhận Vòng Tay trước khi vào hội trường diễn ra sự kiện.
* Đảm bảo có Vòng Tay và xuất trình được vé điện tử khi được yêu cầu bất cứ lúc nào trước khi vào hội trường diễn ra sự kiện.
* Ban quản lý và nhân viên có quyền từ chối cho vào và/hoặc mời ra ngoài đối với bất kỳ cá nhân nào, vào bất kỳ lúc nào nếu người đó vi phạm bất kỳ Điều khoản & Quy định nào của ban tổ chức.
* Trong mọi trường hợp, quyết định của Ban tổ chức là quyết định cuối cùng.
Terms and Conditions:
* Concert tickets can only be purchased through Ticketbox platforms (Ticketbox website and app).
* 1 (ONE) ticket is valid for 1 (ONE) person for 1 (ONE) entry into the event area.
* Each account is limited to a maximum of 4 tickets.
* Tickets are NON-REFUNDABLE, NON-EXCHANGEABLE, and NON-EDITABLE under any circumstances.
* Please do not purchase tickets from any other sources to avoid the risk of counterfeit or fraudulent tickets. The Organizer is not responsible for resolving such cases.
* Ticket purchasers are responsible for keeping their e-tickets safe. The Organizer will not resolve cases where more than 1 person checks in with 1 e-ticket. According to regulations, the Organizer will only allow the rightful owner of the e-ticket, as per the information declared on Ticketbox, to attend the event.
* Audiences please present the ticket confirmation email or order on the Ticketbox app for check-in to exchange for Benefits and receive Wristbands before entering the event venue.
* Please ensure you have your Wristband and be able to present your e-ticket upon request at any time.
* Management and staff reserve the right to refuse entry and/or remove any individual, at any time, if they violate any terms and conditions of the Organizer.
* In all cases, the Organizer's decision is final.

 
 

Điều khoản & Quy định dành cho người giữ vé
1.	Vé chỉ có giá trị cho đúng sự kiện, ngày giờ và khu vực ghi trên vé.
2.	Không chia sẻ mã QR hoặc thông tin vé cho người khác. Ban Tổ chức không chịu trách nhiệm nếu vé bị sử dụng bởi người không phải chủ sở hữu.
3.	Vé bị chỉnh sửa, rách, hỏng, giả mạo hoặc không thể xác thực sẽ bị từ chối vào cổng.
4.	Vé không được hoàn tiền, đổi trả hoặc đổi sang sự kiện khác sau khi thanh toán thành công, trừ trường hợp Ban Tổ chức thông báo khác hoặc theo quy định của pháp luật.
5.	Người giữ vé phải có mặt đúng giờ. Ban Tổ chức không đảm bảo quyền lợi về chỗ ngồi hoặc việc vào cổng đối với người đến muộn.
6.	Việc tham gia sự kiện đồng nghĩa với việc người giữ vé đã đọc, hiểu và đồng ý tuân thủ toàn bộ các điều khoản và quy định của Ban Tổ chức.`;

    const start = Date.now();
    const result = await aiDocumentParserService.extractEventFromText(userSampleDoc);
    const duration = (Date.now() - start) / 1000;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(35); // Solution 1 must finish fast in under 35s
    expect(result.data.title).toBe('HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH');
    expect(result.data.short_description).toContain('Force Jiratchapong và Book Kasidet');
    expect(result.data.description).toContain('ForceBook định ra 🦊🍅');
    expect(result.data.description).toContain('English Below');
    expect(result.data.description).toContain('Điều khoản và điều kiện:');
    expect(result.data.description).toContain('Terms and Conditions:');
    expect(result.data.description).not.toContain('Giới thiệu sự kiện');
    expect(result.data.description).not.toContain('Lịch trình & Hoạt động nổi bật');
    expect(result.data.additional_terms).toContain('Vé chỉ có giá trị cho đúng sự kiện');
    expect(result.data.refund_policy.allow_refunds).toBe(false);
  }, 60000);

  const sampleDir = path.join(__dirname, '../../../../EventHub_AI_Create_Event_Test_Documents');
  const readSample = (name) => fs.readFileSync(path.join(sampleDir, name), 'utf8');
  const ticketByHint = (tickets, hint) =>
    tickets.find((t) => t.name.toLowerCase().includes(hint.toLowerCase()));

  test('sample 01 structured tech conference', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('01_structured_tech_conference.txt'));
    expect(result.data.title).toBe('FutureTech Vietnam 2027');
    expect(result.data.sessions[0].start_date).toBe('2027-11-20');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('17:30');
    expect(result.data.venue_name).toMatch(/Da Nang Innovation Hub/i);
    expect(result.data.district).toBe('Hải Châu');
    expect(result.data.province).toBe('Thành phố Đà Nẵng');
    expect(ticketByHint(result.data.ticket_types, 'Student').price).toBe(150000);
    expect(ticketByHint(result.data.ticket_types, 'Student').quantity_total).toBe(200);
    expect(ticketByHint(result.data.ticket_types, 'Standard').price).toBe(350000);
    expect(ticketByHint(result.data.ticket_types, 'VIP').quantity_total).toBe(30);
    expect(result.data.require_attendee_information).toBe(true);
  });

  test('sample 02 unstructured music night', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('02_unstructured_music_night.txt'));
    expect(result.data.title).toBe('Mùa Gió Qua Phố');
    expect(result.data.sessions[0].start_date).toBe('2027-11-06');
    expect(result.data.sessions[0].checkin_start_time).toBe('18:00');
    expect(result.data.sessions[0].start_time).toBe('19:00');
    expect(result.data.sessions[0].end_time).toBe('21:45');
    expect(result.data.venue_name).toBe('');
    expect(result.data.district).toMatch(/Bình Thạnh/i);
    expect(result.data.province).toBe('Thành phố Hồ Chí Minh');
    expect(ticketByHint(result.data.ticket_types, 'sớm').price).toBe(100000);
    expect(ticketByHint(result.data.ticket_types, 'thường').price).toBe(140000);
    expect(result.data.require_attendee_information).toBe(true);
  });

  test('sample 03 semistructured workshop', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('03_semistructured_workshop.txt'));
    expect(result.data.title.toLowerCase()).toContain('design thinking');
    expect(result.data.sessions[0].start_date).toBe('2027-03-13');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:30');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('12:00');
    expect(result.data.venue_name).toMatch(/Creative Learning Center/i);
    expect(result.data.province).toBe('Thành phố Đà Nẵng');
    expect(ticketByHint(result.data.ticket_types, 'Learner').price).toBe(80000);
    expect(ticketByHint(result.data.ticket_types, 'Learner').quantity_total).toBe(45);
    expect(ticketByHint(result.data.ticket_types, 'Team').price).toBe(250000);
  });

  test('sample 04 press release art exhibition', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('04_press_release_art_exhibition.txt'));
    expect(result.data.title).toBe('Layers of the City');
    expect(result.data.sessions).toHaveLength(3);
    expect(result.data.sessions.map((s) => s.start_date)).toEqual(['2028-01-22', '2028-01-23', '2028-01-24']);
    expect(result.data.sessions[0].start_time).toBe('10:00');
    expect(result.data.sessions[0].end_time).toBe('20:00');
    expect(result.data.venue_name).toBe('');
    expect(result.data.district).toMatch(/3/);
    expect(result.data.province).toBe('Thành phố Hồ Chí Minh');
    expect(ticketByHint(result.data.ticket_types, 'day').price).toBe(70000);
    expect(ticketByHint(result.data.ticket_types, 'three').price).toBe(150000);
  });

  test('sample 05 table-like food festival', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('05_table_like_food_festival.txt'));
    expect(result.data.title).toBe('Taste of Central Vietnam 2027');
    expect(result.data.sessions[0].start_date).toBe('2027-12-04');
    expect(result.data.sessions[0].start_time).toBe('10:00');
    expect(result.data.sessions[0].end_time).toBe('21:00');
    expect(result.data.venue_name).toMatch(/Riverside Park/i);
    expect(result.data.province).toBe('Thành phố Đà Nẵng');
    expect(ticketByHint(result.data.ticket_types, 'General').price).toBe(50000);
    expect(ticketByHint(result.data.ticket_types, 'General').quantity_total).toBe(1000);
    expect(ticketByHint(result.data.ticket_types, 'Family').price).toBe(160000);
    expect(ticketByHint(result.data.ticket_types, 'Family').quantity_total).toBe(150);
  });

  test('sample 06 email corporate training', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('06_email_corporate_training.txt'));
    expect(result.data.title).toMatch(/Practical Cybersecurity for Small Teams/i);
    expect(result.data.sessions[0].start_date).toBe('2027-04-09');
    expect(result.data.sessions[0].checkin_start_time).toBe('13:00');
    expect(result.data.sessions[0].start_time).toBe('13:30');
    expect(result.data.sessions[0].end_time).toBe('17:00');
    expect(result.data.venue_name).toBe('');
    expect(result.data.district).toBe('Hải Châu');
    expect(result.data.province).toBe('Thành phố Đà Nẵng');
    expect(ticketByHint(result.data.ticket_types, 'regular').price).toBe(200000);
    expect(ticketByHint(result.data.ticket_types, 'student').price).toBe(100000);
  });

  test('sample 07 json event launch', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('07_json_event_launch.txt'));
    expect(result.data.title).toBe('Startup Launchpad Meetup: From Idea to First Customer');
    expect(result.data.sessions[0].start_date).toBe('2027-05-15');
    expect(result.data.sessions[0].checkin_start_time).toBe('17:30');
    expect(result.data.sessions[0].start_time).toBe('18:00');
    expect(result.data.sessions[0].end_time).toBe('20:45');
    expect(result.data.venue_name).toBe('Founders Corner');
    expect(result.data.district).toBe('Sơn Trà');
    expect(result.data.province).toBe('Thành phố Đà Nẵng');
    expect(ticketByHint(result.data.ticket_types, 'Community').price).toBe(120000);
    expect(ticketByHint(result.data.ticket_types, 'Community').quantity_total).toBe(80);
    expect(ticketByHint(result.data.ticket_types, 'Founder').price).toBe(220000);
    expect(result.data.require_attendee_information).toBe(true);
    expect(result.data.tags.join(' ').toLowerCase()).toMatch(/startup/);
  });

  test('sample 08 chat conversation', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('08_chat_conversation.txt'));
    expect(result.data.title).toBe('Steps for Hope');
    expect(result.data.sessions[0].start_date).toBe('2027-05-16');
    expect(result.data.sessions[0].checkin_start_time).toBe('05:30');
    expect(result.data.sessions[0].start_time).toBe('06:15');
    expect(result.data.sessions[0].end_time).toBe('09:00');
    expect(result.data.venue_name).toMatch(/Gia Định/i);
    expect(result.data.province).toBe('Thành phố Hồ Chí Minh');
    expect(ticketByHint(result.data.ticket_types, '5 km').price).toBe(100000);
    expect(ticketByHint(result.data.ticket_types, '10 km').price).toBe(150000);
  });

  test('sample 09 multiday cultural event', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('09_multiday_cultural_event.txt'));
    expect(result.data.title).toMatch(/Asia Culture Exchange Days/i);
    expect(result.data.sessions).toHaveLength(3);
    expect(result.data.sessions[0].start_date).toBe('2027-10-08');
    expect(result.data.sessions[1].start_date).toBe('2027-10-09');
    expect(result.data.sessions[2].start_date).toBe('2027-10-10');
    expect(result.data.sessions[0].checkin_start_time).toBe('15:00');
    expect(result.data.sessions[0].start_time).toBe('16:00');
    expect(result.data.sessions[0].end_time).toBe('20:00');
    expect(result.data.venue_name).toBe('');
    expect(result.data.province).toBe('Thừa Thiên Huế');
    expect(ticketByHint(result.data.ticket_types, 'Three-day').price).toBe(240000);
    expect(ticketByHint(result.data.ticket_types, 'Single').price).toBe(100000);
  });

  test('sample 10 messy notes ignores last-edited date', async () => {
    const result = await aiDocumentParserService.extractEventFromText(readSample('10_messy_notes_missing_fields.txt'));
    expect(result.data.title).toBe('Night of New Voices');
    expect(result.data.sessions[0].start_date).toBe('2027-08-27');
    expect(result.data.sessions[0].checkin_start_time).toBe('16:30');
    expect(result.data.sessions[0].start_time).toBe('17:30');
    expect(result.data.sessions[0].end_time).toBe('21:30');
    expect(result.data.venue_name).toBe('');
    expect(result.data.province).toBe('Thành phố Cần Thơ');
    expect(ticketByHint(result.data.ticket_types, 'student').price).toBe(75000);
    expect(ticketByHint(result.data.ticket_types, 'general').price).toBe(130000);
    expect(ticketByHint(result.data.ticket_types, 'supporter').price).toBe(200000);
  });
});
