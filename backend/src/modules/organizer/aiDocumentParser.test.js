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

  test('sample prose invitation letter with subtitle and multi-pass tickets with descriptions', async () => {
    const invitationDoc = `# FutureTech Vietnam 2027 – Thư mời tham dự hội nghị công nghệ

Xin chào các bạn,

Chúng tôi rất vui được thông báo rằng FutureTech Vietnam 2027 sẽ chính thức diễn ra tại Trung tâm Hội nghị Quốc gia, khu vực Nam Từ Liêm, Hà Nội, vào ngày 15 và 16 tháng 5 năm 2027. Đây là sự kiện dành cho cộng đồng công nghệ, đặc biệt là các lập trình viên, sinh viên công nghệ thông tin, kỹ sư phần mềm và những người quan tâm đến trí tuệ nhân tạo.

Trong hai ngày diễn ra chương trình, người tham dự sẽ được tìm hiểu về xu hướng AI trong phát triển phần mềm, cách triển khai các ứng dụng AI trong môi trường thực tế và những giải pháp chuyển đổi số đang được doanh nghiệp áp dụng. Sự kiện cũng tạo cơ hội để người tham dự gặp gỡ các chuyên gia, trao đổi kinh nghiệm và giới thiệu những sản phẩm công nghệ mới. Chương trình năm nay tập trung vào AI, Machine Learning, Software Engineering, Digital Transformation và Innovation.

Ngày đầu tiên, 15/05/2027, chương trình bắt đầu bằng phiên “AI and the Future of Software Engineering”. Khách tham dự có thể check-in từ 08:00 sáng, phiên diễn thuyết bắt đầu lúc 09:00 và kết thúc lúc 11:30 tại Grand Hall của Trung tâm Hội nghị Quốc gia. Buổi sáng sẽ tập trung vào ứng dụng AI trong quy trình phát triển phần mềm và tự động hóa kiểm thử.

Cũng trong ngày 15 tháng 5, một hội thảo thực hành mang tên “Building Production-Ready AI Applications” sẽ diễn ra vào buổi chiều tại Innovation Room B. Khu vực check-in mở cửa lúc 13:00, hoạt động bắt đầu lúc 13:30 và dự kiến kết thúc lúc 16:30. Người tham gia sẽ được tìm hiểu cách tích hợp mô hình AI vào ứng dụng, thiết kế API và triển khai giải pháp phục vụ nhu cầu thực tế.

Sang ngày 16/05/2027, từ 08:30 sáng, khách mời có thể check-in tại Exhibition Hall để tham gia chương trình “Technology Networking and Innovation Showcase”. Hoạt động chính bắt đầu lúc 09:00 và kết thúc lúc 12:00 trưa. Đây là dịp để các nhóm phát triển sản phẩm, doanh nghiệp và cộng đồng công nghệ gặp gỡ, giới thiệu ý tưởng và trao đổi cơ hội hợp tác.

Vé Standard Pass có giá 350.000 đồng, với 200 vé được phát hành. Loại vé này cho phép người tham dự tham gia các phiên hội nghị theo chương trình, nhận tài liệu sự kiện và kết nối với cộng đồng. Nếu muốn có chỗ ngồi ưu tiên và tham gia phiên networking dành riêng cho khách VIP, người tham dự có thể lựa chọn VIP Pass với giá 750.000 đồng. Số lượng vé VIP giới hạn ở 50 vé. Ngoài ra, ban tổ chức cung cấp Student Pass dành cho sinh viên với mức giá 150.000 đồng và số lượng 100 vé. Người mua vé sinh viên có thể được yêu cầu xuất trình thẻ sinh viên khi check-in.

Khi đăng ký tham dự, mọi khách mời cần cung cấp họ tên, email và số điện thoại. Riêng người đăng ký Student Pass cần bổ sung tên trường đang theo học để ban tổ chức xác minh điều kiện sử dụng vé. Người tham dự hội thảo thực hành nên mang theo laptop cá nhân để thuận tiện cho các hoạt động chuyên môn.

Chúng tôi mong được gặp bạn tại FutureTech Vietnam 2027. Hãy chuẩn bị sẵn sàng cho hai ngày học hỏi, chia sẻ và kết nối cùng cộng đồng công nghệ Việt Nam!

Trân trọng,

Ban tổ chức FutureTech Vietnam 2027`;

    const result = await aiDocumentParserService.extractEventFromText(invitationDoc);
    expect(result.data.title).toBe('FutureTech Vietnam 2027');
    expect(result.data.venue_name).toContain('Trung tâm Hội nghị Quốc gia');
    expect(result.data.district).toBe('Nam Từ Liêm');
    expect(result.data.province).toBe('Thành phố Hà Nội');
    expect(result.data.require_attendee_information).toBe(true);

    const standardTicket = ticketByHint(result.data.ticket_types, 'Standard');
    expect(standardTicket).toBeDefined();
    expect(standardTicket.price).toBe(350000);
    expect(standardTicket.quantity_total).toBe(200);
    expect(standardTicket.description).toContain('Loại vé này cho phép người tham dự tham gia các phiên hội nghị');

    const vipTicket = ticketByHint(result.data.ticket_types, 'VIP');
    expect(vipTicket).toBeDefined();
    expect(vipTicket.price).toBe(750000);
    expect(vipTicket.quantity_total).toBe(50);
    expect(vipTicket.description).toContain('Có chỗ ngồi ưu tiên và tham gia phiên networking dành riêng cho khách VIP');

    const studentTicket = ticketByHint(result.data.ticket_types, 'Student');
    expect(studentTicket).toBeDefined();
    expect(studentTicket.price).toBe(150000);
    expect(studentTicket.quantity_total).toBe(100);
    expect(studentTicket.description).toContain('Dành cho sinh viên');

    // Kiểm tra không gộp phiên: Ngày 15/05/2027 có 2 phiên sáng và chiều riêng biệt + Ngày 16/05/2027 có 1 phiên
    expect(Array.isArray(result.data.sessions)).toBe(true);
    expect(result.data.sessions).toHaveLength(3);

    // Phiên 1 (Sáng 15/05/2027)
    expect(result.data.sessions[0].start_date).toBe('2027-05-15');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('11:30');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');
    expect(result.data.sessions[0].session_name).toContain('AI and the Future of Software Engineering');

    // Phiên 2 (Chiều 15/05/2027 - không bị gộp vào phiên sáng)
    expect(result.data.sessions[1].start_date).toBe('2027-05-15');
    expect(result.data.sessions[1].start_time).toBe('13:30');
    expect(result.data.sessions[1].end_time).toBe('16:30');
    expect(result.data.sessions[1].checkin_start_time).toBe('13:00');
    expect(result.data.sessions[1].session_name).toContain('Building Production-Ready AI Applications');

    // Phiên 3 (Sáng 16/05/2027)
    expect(result.data.sessions[2].start_date).toBe('2027-05-16');
    expect(result.data.sessions[2].start_time).toBe('09:00');
    expect(result.data.sessions[2].end_time).toBe('12:00');
    expect(result.data.sessions[2].checkin_start_time).toBe('08:30');
    expect(result.data.sessions[2].session_name).toContain('Technology Networking and Innovation Showcase');
  });

  test('should not merge morning and afternoon sessions on the same date', async () => {
    const singleDayTwoSessionsDoc = `
# HỘI THẢO CHUYỂN ĐỔI SỐ DOANH NGHIỆP 2027

Kính gửi các đối tác và doanh nghiệp,

Sự kiện diễn ra vào ngày 22/10/2027 tại Khách sạn Melia Hà Nội, quận Hoàn Kiếm, Hà Nội.

Buổi sáng, chương trình khai mạc với phiên “Toàn cảnh Chuyển đổi số 2027”. Khách mời check-in từ 08:00 sáng, hoạt động bắt đầu lúc 08:30 và kết thúc lúc 11:30.

Vào buổi chiều, hội thảo thực hành chuyên sâu mang tên “Ứng dụng AI và Tự động hóa quy trình” sẽ diễn ra. Đón khách từ 13:30, phiên làm việc bắt đầu lúc 14:00 và kết thúc lúc 17:00.

Vé tham dự gồm vé Tiêu Chuẩn 200.000 đồng và vé VIP 500.000 đồng.
    `;

    const result = await aiDocumentParserService.extractEventFromText(singleDayTwoSessionsDoc);
    expect(result.data.title).toMatch(/Hội thảo Chuyển đổi số Doanh nghiệp 2027/i);
    expect(result.data.sessions).toHaveLength(2);

    // Phiên 1 (Sáng)
    expect(result.data.sessions[0].start_date).toBe('2027-10-22');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('11:30');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');
    expect(result.data.sessions[0].session_name).toContain('Toàn cảnh Chuyển đổi số 2027');

    // Phiên 2 (Chiều) - Tuyệt đối không gộp chung với phiên sáng
    expect(result.data.sessions[1].start_date).toBe('2027-10-22');
    expect(result.data.sessions[1].start_time).toBe('14:00');
    expect(result.data.sessions[1].end_time).toBe('17:00');
    expect(result.data.sessions[1].checkin_start_time).toBe('13:30');
    expect(result.data.sessions[1].session_name).toContain('Ứng dụng AI và Tự động hóa quy trình');
  });

  test('should accurately extract Green Living Expo with 3 distinct sessions and 3 ticket passes with descriptions', async () => {
    const greenLivingDoc = `
Green Living Expo – Ngày hội Sống Xanh 2027

Gửi các bạn yêu môi trường,

Bạn có muốn dành một ngày để khám phá những cách sống xanh đơn giản nhưng thiết thực? Green Living Expo sẽ trở lại vào cuối tháng 6 năm 2027 tại Nhà Văn hóa Thanh Niên, số 4 Phạm Ngọc Thạch, phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh. Chương trình được tổ chức trong hai ngày 26 và 27 tháng 6, hướng đến sinh viên, gia đình trẻ, các nhóm cộng đồng và những người quan tâm đến phát triển bền vững.

Năm nay, ngày hội mang đến các hoạt động về giảm rác thải nhựa, tái chế, tiêu dùng có trách nhiệm và lối sống thân thiện với môi trường. Khách tham quan có thể gặp gỡ các dự án cộng đồng, tìm hiểu sản phẩm tái sử dụng và tham gia những buổi chia sẻ cùng các tình nguyện viên. Các chủ đề chính gồm Sustainability, Recycling, Zero Waste, Eco-friendly Products và Community.

Sáng thứ Bảy, ngày 26/06/2027, khu vực đón khách mở cửa lúc 08:30. Chương trình khai mạc “Small Changes, Greener Cities” bắt đầu lúc 09:00 và kết thúc lúc 10:30 tại Hội trường A. Sau phần khai mạc, khách tham dự có thể ghé khu triển lãm sản phẩm tái chế ở Sảnh B. Một phiên hướng dẫn làm đồ dùng từ vật liệu đã qua sử dụng sẽ diễn ra tại Phòng Workshop 2, bắt đầu lúc 13:30; người tham gia nên có mặt từ 13:00 để ổn định chỗ ngồi. Hoạt động buổi chiều dự kiến kết thúc lúc 16:00.

Ngày Chủ nhật 27/06/2027, chương trình “Community Garden and Urban Composting” được tổ chức tại Sân sinh hoạt ngoài trời. Khách có thể check-in từ 07:45, hoạt động bắt đầu lúc 08:15 và kết thúc lúc 11:15. Người tham gia sẽ được giới thiệu các phương pháp ủ rác hữu cơ tại nhà và cách chăm sóc vườn cộng đồng trong không gian nhỏ.

Khách tham quan có thể đăng ký vé Day Pass với giá 80.000 đồng, số lượng 300 vé, cho phép vào khu triển lãm trong một ngày. Vé Workshop Pass có giá 120.000 đồng, chỉ có 80 vé và bao gồm một buổi thực hành tái chế vào chiều thứ Bảy. Nếu muốn tham gia cả hai ngày, khách có thể chọn Green Weekend Pass giá 180.000 đồng; ban tổ chức phát hành tối đa 120 vé loại này. Trẻ em dưới 6 tuổi được vào cửa miễn phí khi đi cùng người lớn, nhưng không có chỗ riêng trong các workshop và không được tính là một vé Workshop Pass.

Khi đăng ký, người tham dự cần cung cấp họ tên và email liên hệ. Người đăng ký Workshop Pass cần cung cấp thêm số điện thoại để ban tổ chức gửi hướng dẫn trước chương trình. Với hoạt động ngoài trời sáng Chủ nhật, người tham dự nên mang theo bình nước cá nhân, đội mũ và chuẩn bị trang phục phù hợp với thời tiết. Ban tổ chức sẽ bố trí nước uống tại khu vực sinh hoạt chung, nhưng không cung cấp dụng cụ làm vườn cá nhân.

Nếu trời mưa lớn, hoạt động tại sân ngoài trời có thể được chuyển sang khu vực có mái che trong cùng địa điểm. Đây là phương án dự phòng, chưa phải lịch thay đổi chính thức. Thông tin cập nhật sẽ được gửi đến email đã đăng ký.

Hẹn gặp bạn tại Green Living Expo – cùng bắt đầu từ những thay đổi nhỏ để tạo nên một cộng đồng xanh hơn!

Ban tổ chức Green Living Expo
    `;

    const result = await aiDocumentParserService.extractEventFromText(greenLivingDoc);
    expect(result.data.title).toMatch(/Green Living Expo/i);
    expect(result.data.venue_name).toMatch(/Nhà Văn hóa Thanh Niên/i);
    expect(result.data.province).toMatch(/Thành phố Hồ Chí Minh/i);

    // Phiên: Bắt buộc đủ 3 phiên (Sáng 26/06, Chiều 26/06, Sáng 27/06), không gộp phiên sáng chiều!
    expect(result.data.sessions).toHaveLength(3);

    // Phiên 1 (Sáng 26/06/2027)
    expect(result.data.sessions[0].start_date).toBe('2027-06-26');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:30');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('10:30');
    expect(result.data.sessions[0].session_name).toContain('Small Changes, Greener Cities');

    // Phiên 2 (Chiều 26/06/2027)
    expect(result.data.sessions[1].start_date).toBe('2027-06-26');
    expect(result.data.sessions[1].checkin_start_time).toBe('13:00');
    expect(result.data.sessions[1].start_time).toBe('13:30');
    expect(result.data.sessions[1].end_time).toBe('16:00');
    expect(result.data.sessions[1].session_name).toMatch(/Hướng dẫn làm đồ dùng từ vật liệu đã qua sử dụng/i);

    // Phiên 3 (Sáng 27/06/2027)
    expect(result.data.sessions[2].start_date).toBe('2027-06-27');
    expect(result.data.sessions[2].checkin_start_time).toBe('07:45');
    expect(result.data.sessions[2].start_time).toBe('08:15');
    expect(result.data.sessions[2].end_time).toBe('11:15');
    expect(result.data.sessions[2].session_name).toContain('Community Garden and Urban Composting');

    // Vé: Đúng 3 hạng vé, không bị trùng lặp, đầy đủ số lượng và mô tả
    expect(result.data.ticket_types).toHaveLength(3);

    const dayPass = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('day pass'));
    expect(dayPass).toBeDefined();
    expect(dayPass.name).toBe('Day Pass');
    expect(dayPass.price).toBe(80000);
    expect(dayPass.quantity_total).toBe(300);
    expect(dayPass.description).toContain('Cho phép vào khu triển lãm trong một ngày');

    const workshopPass = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('workshop pass'));
    expect(workshopPass).toBeDefined();
    expect(workshopPass.name).toBe('Workshop Pass');
    expect(workshopPass.price).toBe(120000);
    expect(workshopPass.quantity_total).toBe(80);
    expect(workshopPass.description).toContain('Bao gồm một buổi thực hành tái chế vào chiều thứ Bảy');

    const weekendPass = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('weekend pass'));
    expect(weekendPass).toBeDefined();
    expect(weekendPass.name).toBe('Green Weekend Pass');
    expect(weekendPass.price).toBe(180000);
    expect(weekendPass.quantity_total).toBe(120);
    expect(weekendPass.description).toContain('Tham gia cả hai ngày');
  });

  test('should accurately extract Sunset Vibes Festival 2027 with 5 sessions and 3 tickets', async () => {
    const docText = `
SUNSET VIBES FESTIVAL 2027 – ÂM NHẠC, ẨM THỰC VÀ HOÀNG HÔN
Bạn đã sẵn sàng tận hưởng một mùa hè đáng nhớ bên bờ biển chưa? Sunset Vibes Festival 2027 sẽ mang đến không gian âm nhạc sôi động, các gian hàng ẩm thực địa phương và những hoạt động giải trí ngoài trời dành cho giới trẻ.

Sự kiện dự kiến diễn ra tại Công viên Biển Đông, thành phố Đà Nẵng, trong hai ngày 10 và 11 tháng 7 năm 2027. Đây là dịp để bạn gặp gỡ bạn bè, thưởng thức những màn trình diễn trực tiếp và khám phá các món ăn đặc trưng của miền Trung. Festival hướng đến những người yêu âm nhạc, khách du lịch, sinh viên và các gia đình muốn tìm kiếm một hoạt động giải trí vào dịp cuối tuần.

Chủ đề của chương trình năm nay là kết nối cộng đồng thông qua âm nhạc và văn hóa địa phương. Các nội dung nổi bật bao gồm Live Music, Street Food, Beach Culture, Youth Community và Local Artists. Ngoài sân khấu chính, khách tham dự còn có thể trải nghiệm khu vực trò chơi tương tác và chụp ảnh tại các gian hàng nghệ thuật.

Cổng đón khách sẽ mở từ 14:00 ngày 10/07. Chương trình mở màn mang tên Welcome to Sunset Vibes bắt đầu lúc 15:00 và kết thúc lúc 16:00 tại sân khấu chính gần khu vực bãi biển. Tiếp theo, từ 16:30 đến 18:00, ban nhạc trẻ The Coastal sẽ biểu diễn trong chương trình Waves of Summer. Khán giả nên có mặt trước giờ diễn để thuận tiện kiểm tra vé và tìm chỗ ngồi.

Khi mặt trời bắt đầu lặn, sân khấu sẽ chuyển sang chương trình Sunset Beats, diễn ra từ 18:30 đến 21:30 cùng ngày. Đây là phần biểu diễn âm nhạc điện tử được mong đợi nhất của festival, với sự tham gia của các DJ khách mời. Khu vực sân khấu chính sẽ có hệ thống âm thanh và ánh sáng được thiết kế riêng cho chương trình buổi tối.

Sáng ngày 11/07, các hoạt động tiếp tục tại khu vực quảng trường của công viên. Chương trình Taste of Central Vietnam mở cửa đón khách lúc 08:30, bắt đầu lúc 09:00 và kết thúc lúc 11:30. Người tham dự có thể khám phá các món ăn địa phương, gặp gỡ những người bán hàng và tìm hiểu câu chuyện phía sau một số đặc sản miền Trung. Buổi chiều cùng ngày, hoạt động Local Artists Showcase diễn ra từ 15:00 đến 17:00 tại sân khấu phụ, giới thiệu các tiết mục biểu diễn và sản phẩm sáng tạo của nghệ sĩ trẻ địa phương.

Vé Early Bird được mở bán với giá 250.000 đồng, số lượng giới hạn 300 vé. Sau khi chương trình ưu đãi kết thúc, vé General Admission sẽ có giá 350.000 đồng với 700 vé dự kiến phát hành. Những người muốn trải nghiệm khu vực gần sân khấu có thể chọn vé Premium với giá 650.000 đồng; số lượng dành cho hạng vé này là 150. Vé Premium bao gồm lối vào khu vực ưu tiên và một phần quà lưu niệm của chương trình, nhưng không bao gồm đồ ăn hoặc thức uống tại các gian hàng.

Ban tổ chức cũng dành một chương trình ưu đãi cho nhóm từ năm người trở lên. Nhóm đăng ký cùng lúc có thể nhận mức giảm 10% trên giá vé General Admission, tùy theo điều kiện áp dụng khi mua vé. Ưu đãi nhóm không áp dụng cho vé Premium và không cộng dồn với chương trình Early Bird.

Khách tham dự cần cung cấp họ tên, địa chỉ email và số điện thoại khi đăng ký vé. Vé được xác nhận sau khi hệ thống ghi nhận thanh toán thành công. Người tham dự nên lưu mã vé điện tử để xuất trình tại cổng vào. Trẻ em dưới 6 tuổi được vào khu vực lễ hội miễn phí khi có người lớn đi cùng, tuy nhiên phải tuân thủ quy định an toàn của ban tổ chức.

Khu vực ẩm thực sẽ hoạt động trong thời gian diễn ra các chương trình ban ngày. Giá món ăn và đồ uống do từng gian hàng quy định, vì vậy không nằm trong giá vé vào cửa. Ban tổ chức khuyến khích khách sử dụng bình nước cá nhân và giữ gìn vệ sinh khu vực công cộng.

Trong trường hợp thời tiết xấu, các hoạt động ngoài trời có thể được điều chỉnh để bảo đảm an toàn. Nếu chương trình buổi tối phải tạm hoãn, ban tổ chức sẽ thông báo qua địa chỉ email mà khách đã sử dụng khi đăng ký. Hiện tại, lịch trình nêu trên là kế hoạch dự kiến; mọi thay đổi chính thức sẽ được cập nhật trước ngày diễn ra sự kiện.

Hãy cùng chúng tôi đón hoàng hôn, thưởng thức âm nhạc và tận hưởng bầu không khí mùa hè tại Sunset Vibes Festival 2027!

Ban tổ chức Sunset Vibes Festival 2027
    `;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toMatch(/SUNSET VIBES FESTIVAL 2027/i);
    expect(result.data.venue_name).toMatch(/Công viên Biển Đông/i);
    expect(result.data.province).toMatch(/Đà Nẵng/i);

    // Phiên sự kiện: Đủ 5 phiên rõ ràng
    expect(result.data.sessions).toHaveLength(5);
    expect(result.data.sessions[0].session_name).toBe('Welcome to Sunset Vibes');
    expect(result.data.sessions[0].start_date).toBe('2027-07-10');
    expect(result.data.sessions[0].start_time).toBe('15:00');
    expect(result.data.sessions[0].end_time).toBe('16:00');
    expect(result.data.sessions[0].checkin_start_time).toBe('14:00');

    expect(result.data.sessions[3].session_name).toBe('Taste of Central Vietnam');
    expect(result.data.sessions[3].start_date).toBe('2027-07-11');
    expect(result.data.sessions[3].start_time).toBe('09:00');
    expect(result.data.sessions[3].end_time).toBe('11:30');
    expect(result.data.sessions[3].checkin_start_time).toBe('08:30');

    // Vé
    expect(result.data.ticket_types).toHaveLength(3);
    const premium = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('premium'));
    expect(premium).toBeDefined();
    expect(premium.price).toBe(650000);
    expect(premium.quantity_total).toBe(150);
    expect(premium.description).toContain('lối vào khu vực ưu tiên');

    // Mô tả sự kiện đầy đủ, không bị rút ngắn, có đầy đủ hoạt động và lưu ý người tham dự
    expect(result.data.description).toContain('Lịch trình & Hoạt động nổi bật:');
    expect(result.data.description).toContain('Lưu ý dành cho người tham dự:');
    expect(result.data.description).toContain('Taste of Central Vietnam');
    expect(result.data.description).toContain('Hãy cùng chúng tôi đón hoàng hôn');
    expect(result.data.description.length).toBeGreaterThan(2500);
  });

  test('should accurately extract Startup Connect Asia 2027 with 6 sessions and 3 tickets', async () => {
    const docText = `
TÀI LIỆU 1: STARTUP CONNECT ASIA 2027
Kết nối khởi nghiệp, công nghệ và đầu tư
Bạn đang xây dựng startup, tìm kiếm nhà đầu tư hoặc muốn khám phá những ý tưởng kinh doanh mới? Startup Connect Asia 2027 sẽ là nơi quy tụ các nhà sáng lập, chuyên gia công nghệ, quỹ đầu tư và cộng đồng khởi nghiệp trẻ tại Việt Nam.

Sự kiện dự kiến diễn ra vào ngày 21 và 22 tháng 8 năm 2027 tại Thiskyhall Sala Convention Center, khu đô thị Sala, thành phố Thủ Đức, Thành phố Hồ Chí Minh. Chương trình được tổ chức với mục tiêu kết nối các doanh nghiệp mới thành lập với những người có kinh nghiệm trong lĩnh vực kinh doanh, công nghệ và đầu tư. Người tham dự sẽ có cơ hội tìm hiểu về chiến lược phát triển sản phẩm, huy động vốn, mở rộng thị trường và ứng dụng trí tuệ nhân tạo vào hoạt động doanh nghiệp.

Nội dung năm nay tập trung vào Startup Ecosystem, Venture Capital, Artificial Intelligence, Product Development và Business Innovation. Bên cạnh các phiên chia sẻ kiến thức, khu vực Startup Showcase sẽ giới thiệu những sản phẩm mới từ các nhóm khởi nghiệp. Một số doanh nghiệp cũng dự kiến tổ chức hoạt động kết nối trực tiếp với nhà đầu tư, tuy nhiên việc tham gia các cuộc gặp riêng có thể cần đăng ký trước.

Ngày đầu tiên, thứ Bảy 21/08/2027, chương trình bắt đầu đón khách từ 08:00. Phiên khai mạc Building the Next Generation of Startups diễn ra từ 09:00 đến 10:00 tại Main Conference Hall. Sau phần khai mạc, diễn đàn From Idea to Product-Market Fit bắt đầu lúc 10:30 và kết thúc lúc 12:00. Các diễn giả sẽ chia sẻ kinh nghiệm xác định nhu cầu khách hàng, kiểm chứng ý tưởng và xây dựng sản phẩm phù hợp với thị trường.

Buổi chiều cùng ngày, từ 13:30 đến 15:00, phiên AI for Business Growth sẽ tập trung vào ứng dụng AI trong chăm sóc khách hàng, phân tích dữ liệu và tự động hóa quy trình. Hoạt động diễn ra tại Innovation Hall. Người tham dự được khuyến khích mang laptop nếu muốn theo dõi các ví dụ thực hành, nhưng không bắt buộc phải mang thiết bị cá nhân.

Từ 15:30 đến 17:00, chương trình Pitching to Investors sẽ diễn ra tại Main Conference Hall. Các nhóm startup được lựa chọn trước sẽ trình bày ý tưởng kinh doanh và trả lời câu hỏi từ hội đồng khách mời. Đây là hoạt động có lịch trình riêng trong ngày hội nghị, nhưng không phải tất cả người mua vé đều được quyền trình bày dự án.

Sang ngày Chủ nhật 22/08/2027, khách có thể check-in từ 08:30 để tham dự Funding and Venture Capital Forum. Phiên thảo luận bắt đầu lúc 09:00 và kết thúc lúc 11:30 tại Main Conference Hall. Nội dung bao gồm các hình thức gọi vốn, đánh giá tiềm năng tăng trưởng và những yếu tố thường được nhà đầu tư xem xét trước khi quyết định rót vốn.

Buổi chiều, hoạt động Startup Networking and Demo Day diễn ra từ 13:00 đến 16:00 tại Exhibition Hall. Người tham dự có thể gặp gỡ các nhóm phát triển sản phẩm, xem trình diễn công nghệ và trao đổi cơ hội hợp tác. Khu vực triển lãm dự kiến mở cửa từ 12:30, sớm hơn thời điểm bắt đầu chương trình networking chính thức.

Ban tổ chức dự kiến phát hành 400 vé Standard với mức giá 450.000 đồng mỗi vé. Vé này cho phép tham gia các phiên hội nghị dành cho khách thông thường trong thời gian hiệu lực của vé, theo điều kiện đăng ký. Đối với khách muốn có chỗ ngồi ưu tiên và tham gia buổi networking dành cho khách mời VIP, vé Business Pass có giá 900.000 đồng, giới hạn 120 vé. Ngoài ra, 150 vé Student Pass được cung cấp với giá ưu đãi 200.000 đồng cho sinh viên có nhu cầu tham dự.

Người mua từ năm vé Standard trở lên trong cùng một giao dịch có thể được giảm 8% trên tổng giá vé Standard đủ điều kiện. Ưu đãi này không áp dụng cho Business Pass hoặc Student Pass. Chính sách giảm giá nhóm chỉ là điều kiện tính giá, không phải một loại vé riêng.

Tất cả người tham dự cần cung cấp họ tên, email và số điện thoại khi đăng ký. Khách đăng ký Student Pass cần bổ sung tên trường đang theo học và có thể được yêu cầu xuất trình thẻ sinh viên. Các startup muốn đăng ký trình bày tại Pitching to Investors phải gửi hồ sơ riêng; việc sở hữu vé tham dự không đồng nghĩa với việc được tự động chọn làm diễn giả.

Phí tham dự không bao gồm chi phí đi lại, lưu trú hoặc các dịch vụ cá nhân ngoài chương trình. Ban tổ chức chưa công bố chính sách hoàn tiền chi tiết trong thông báo giới thiệu này. Khách hàng nên kiểm tra điều khoản bán vé tại thời điểm thanh toán thay vì tự giả định rằng vé có thể được hoàn tiền trong mọi trường hợp.

Nếu lịch trình có thay đổi, thông báo sẽ được gửi đến email đăng ký. Một số cuộc gặp với nhà đầu tư có thể được sắp xếp lại tùy theo lịch làm việc của khách mời, nhưng khung giờ của các phiên hội nghị chính thức chỉ thay đổi khi có thông báo từ ban tổ chức.

Startup Connect Asia 2027 mong muốn trở thành cầu nối giữa ý tưởng, công nghệ và nguồn lực đầu tư, giúp các doanh nghiệp mới có thêm cơ hội phát triển trong hệ sinh thái khởi nghiệp.

Ban tổ chức Startup Connect Asia 2027
    `;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('STARTUP CONNECT ASIA 2027');
    expect(result.data.venue_name).toMatch(/Thiskyhall/i);
    expect(result.data.province).toMatch(/Thành phố Hồ Chí Minh/i);

    // Phiên: Đủ 6 phiên
    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Building the Next Generation of Startups');
    expect(result.data.sessions[0].start_date).toBe('2027-08-21');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');

    // Vé
    expect(result.data.ticket_types).toHaveLength(3);
    const standard = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('standard'));
    expect(standard).toBeDefined();
    expect(standard.price).toBe(450000);
    expect(standard.quantity_total).toBe(400);

    const business = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('business'));
    expect(business).toBeDefined();
    expect(business.price).toBe(900000);
    expect(business.quantity_total).toBe(120);

    // Mô tả sự kiện đầy đủ, không bị rút ngắn, có đầy đủ hoạt động và lưu ý người tham dự
    expect(result.data.description).toContain('Lịch trình & Hoạt động nổi bật:');
    expect(result.data.description).toContain('Lưu ý dành cho người tham dự:');
    expect(result.data.description).toContain('Pitching to Investors');
    expect(result.data.description.length).toBeGreaterThan(2500);
  });

  test('should accurately extract Nippon Culture Fest 2027 with 9 sessions and 3 tickets', async () => {
    const docText = `
TÀI LIỆU 2: NIPPON CULTURE FEST 2027
Hành trình khám phá văn hóa Nhật Bản
Những người yêu thích văn hóa Nhật Bản sẽ có dịp gặp gỡ tại Nippon Culture Fest 2027, một lễ hội kết hợp nghệ thuật truyền thống, anime, cosplay, ẩm thực và các hoạt động trải nghiệm dành cho cộng đồng. Sự kiện dự kiến diễn ra vào ngày 6 và 7 tháng 11 năm 2027 tại Trung tâm Triển lãm và Hội nghị Sài Gòn, khu vực Phú Mỹ Hưng, Thành phố Hồ Chí Minh.

Lễ hội hướng đến sinh viên, gia đình, khách du lịch và những người quan tâm đến văn hóa Nhật Bản. Khách tham dự có thể tìm hiểu về thư pháp, gấp giấy origami, nghệ thuật trình diễn, truyện tranh, hoạt hình và các món ăn phổ biến của Nhật. Các chủ đề chính gồm Japanese Culture, Anime, Cosplay, Traditional Arts và Japanese Cuisine.

Sáng thứ Bảy ngày 06/11/2027, cổng triển lãm dự kiến mở lúc 08:30. Hoạt động khai mạc Welcome to Japan bắt đầu lúc 09:30 tại Hall A và kết thúc lúc 10:15. Sau đó, chương trình The Art of Origami diễn ra từ 10:30 đến 11:30 tại Workshop Room 1. Người tham gia sẽ được hướng dẫn những kỹ thuật gấp giấy cơ bản và có thể mang sản phẩm của mình về sau khi hoàn thành.

Từ 11:30, khu vực Japanese Food Street bắt đầu phục vụ khách tham quan. Các gian hàng cung cấp sushi, takoyaki, ramen và nhiều món ăn lấy cảm hứng từ ẩm thực Nhật Bản. Khu ẩm thực dự kiến hoạt động đến 19:00, nhưng giờ đóng cửa của từng gian hàng có thể khác nhau. Giá món ăn được tính riêng và không bao gồm trong giá vé vào cửa.

Buổi chiều, chương trình Cosplay Parade diễn ra từ 13:30 đến 14:30 tại khu vực Central Plaza. Người tham gia có thể mặc trang phục nhân vật yêu thích và giao lưu với cộng đồng cosplay. Những người muốn đăng ký trình diễn trên sân khấu cần gửi thông tin trước cho ban tổ chức; khách tham quan thông thường không cần đăng ký riêng để xem đoàn diễu hành.

Từ 15:00 đến 16:30, sân khấu chính sẽ tổ chức Anime Music Live, với các tiết mục nhạc anime và biểu diễn trực tiếp. Chương trình Japanese Traditional Arts tiếp nối từ 17:00 đến 18:00 tại Hall A, giới thiệu một số loại hình nghệ thuật biểu diễn và nét đặc trưng của văn hóa truyền thống Nhật Bản.

Ngày Chủ nhật 07/11/2027, khu vực triển lãm mở cửa lúc 09:00. Chương trình Japanese Calligraphy Experience diễn ra từ 09:30 đến 11:00 tại Workshop Room 2. Khách tham gia sẽ tìm hiểu cách sử dụng bút lông và thực hành viết một số ký tự Nhật Bản đơn giản. Số lượng chỗ thực hành có giới hạn, vì vậy người muốn tham gia có thể cần đăng ký suất trước. Tuy nhiên, thông báo này chưa xác định số chỗ chính thức của workshop.

Cùng ngày, hoạt động Manga and Illustration Showcase được tổ chức tại Exhibition Zone từ 10:00 đến 15:00. Khách tham quan có thể xem các tác phẩm minh họa, gặp gỡ những người sáng tạo nội dung và tìm hiểu quy trình xây dựng nhân vật. Đây là khu vực triển lãm mở trong khung giờ đã công bố, không phải một buổi biểu diễn trên sân khấu.

Từ 13:00 đến 14:30, chương trình J-Pop Dance Challenge diễn ra tại Main Stage. Các nhóm nhảy đã đăng ký trước sẽ biểu diễn những tiết mục được chuẩn bị theo chủ đề nhạc Nhật Bản. Sau đó, lễ hội kết thúc bằng hoạt động Sayonara Celebration, bắt đầu lúc 15:30 và dự kiến kết thúc lúc 16:30 tại Hall A.

Khách tham dự có thể chọn vé Single Day Pass với giá 180.000 đồng, có hiệu lực trong một ngày được lựa chọn khi mua. Vé Weekend Pass có giá 300.000 đồng, cho phép vào cửa trong cả hai ngày diễn ra lễ hội. Đối với những người muốn tham gia các hoạt động trải nghiệm có hướng dẫn, vé Culture Workshop Pass có giá 420.000 đồng, giới hạn 100 vé. Loại vé này bao gồm quyền tham gia lễ hội trong hai ngày và quyền đăng ký tối đa hai workshop thuộc danh sách áp dụng, tùy theo tình trạng chỗ trống và quy định đăng ký.

Ban tổ chức dự kiến phát hành 1.000 vé Single Day Pass và 500 vé Weekend Pass. Số lượng vé Culture Workshop Pass giới hạn ở 100. Việc mua Culture Workshop Pass không bảo đảm khách được tham gia mọi workshop nếu các suất đã đầy hoặc khách chưa hoàn tất thủ tục đăng ký theo hướng dẫn.

Trẻ em dưới 5 tuổi được miễn phí vào cửa khi đi cùng người lớn có vé hợp lệ. Quy định miễn phí này chỉ áp dụng cho quyền vào cửa thông thường; nếu trẻ muốn tham gia một hoạt động thực hành có giới hạn vật liệu hoặc chỗ ngồi, ban tổ chức có thể yêu cầu đăng ký riêng. Thông báo hiện tại chưa xác định phí bổ sung dành cho trẻ em trong các workshop.

Người đăng ký cần cung cấp họ tên và email. Số điện thoại được yêu cầu đối với khách đăng ký Culture Workshop Pass để ban tổ chức có thể gửi thông tin xác nhận suất tham gia. Người tham gia hoạt động cosplay trên sân khấu cần tuân thủ hướng dẫn về thời lượng trình diễn, trang phục và an toàn thiết bị.

Một số khu vực có thể đông vào giờ cao điểm. Ban tổ chức khuyến nghị khách đến sớm nếu muốn tham gia workshop hoặc xem các tiết mục tại Main Stage. Việc đến sớm không đồng nghĩa với việc được bảo đảm chỗ ngồi tại tất cả hoạt động có giới hạn số lượng.

Vé điện tử sẽ được gửi sau khi thanh toán thành công. Khách nên kiểm tra email xác nhận và lưu mã vé để xuất trình khi vào cổng. Điều kiện đổi ngày sử dụng vé Single Day Pass, nếu có, sẽ tuân theo quy định bán vé được công bố tại thời điểm giao dịch. Thông báo giới thiệu này chưa xác định cụ thể chính sách đổi ngày hoặc hoàn tiền.

Nếu thời tiết hoặc điều kiện vận hành ảnh hưởng đến một số hoạt động tại Central Plaza, ban tổ chức có thể chuyển hoạt động sang khu vực phù hợp trong cùng địa điểm. Đây là phương án dự phòng, không phải thông báo rằng chương trình ngoài trời đã được chuyển địa điểm.

Nippon Culture Fest 2027 hứa hẹn mang đến cơ hội trải nghiệm văn hóa Nhật Bản qua nghệ thuật, âm nhạc, ẩm thực và những hoạt động sáng tạo dành cho nhiều lứa tuổi.

Ban tổ chức Nippon Culture Fest 2027
    `;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('NIPPON CULTURE FEST 2027');
    expect(result.data.venue_name).toMatch(/Trung tâm Triển lãm và Hội nghị Sài Gòn/i);
    expect(result.data.province).toMatch(/Thành phố Hồ Chí Minh/i);

    // Phiên: Đủ 9 phiên
    expect(result.data.sessions).toHaveLength(9);
    expect(result.data.sessions[0].session_name).toBe('Welcome to Japan');
    expect(result.data.sessions[0].start_date).toBe('2027-11-06');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:30');

    // Vé
    expect(result.data.ticket_types).toHaveLength(3);
    const single = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('single day'));
    expect(single).toBeDefined();
    expect(single.price).toBe(180000);
    expect(single.quantity_total).toBe(1000);

    const weekend = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('weekend'));
    expect(weekend).toBeDefined();
    expect(weekend.price).toBe(300000);
    expect(weekend.quantity_total).toBe(500);

    const culture = result.data.ticket_types.find((t) => t.name.toLowerCase().includes('culture workshop'));
    expect(culture).toBeDefined();
    expect(culture.price).toBe(420000);
    expect(culture.quantity_total).toBe(100);

    // Mô tả ngắn & Thông tin sự kiện tiếng Việt chuẩn xác
    expect(result.data.short_description).toMatch(/Những người yêu thích văn hóa Nhật Bản|Nippon Culture Fest 2027/i);
    expect(result.data.description).toContain('Chủ đề và nội dung nổi bật:');
    expect(result.data.description).toContain('<li>Japanese Culture</li>');
    expect(result.data.description).toContain('<li>Anime</li>');
    expect(result.data.description).toContain('<li>Cosplay</li>');
    expect(result.data.description).toContain('<li>Traditional Arts</li>');
    expect(result.data.description).toContain('<li>Japanese Cuisine</li>');
    expect(result.data.description).toContain('Lịch trình & Hoạt động nổi bật:');
    expect(result.data.description).toContain('Lưu ý dành cho người tham dự:');
    expect(result.data.description).toContain('The Art of Origami');
    expect(result.data.description).toContain('Japanese Food Street');
    expect(result.data.description.length).toBeGreaterThan(3000);
    expect(result.data.description).not.toContain('Attendees can participate');
  });

  test('should detect and reject English hallucinated description for Vietnamese documents', () => {
    const vnDoc = `
TÀI LIỆU 2: NIPPON CULTURE FEST 2027
Hành trình khám phá văn hóa Nhật Bản
Những người yêu thích văn hóa Nhật Bản sẽ có dịp gặp gỡ tại Nippon Culture Fest 2027, một lễ hội kết hợp nghệ thuật truyền thống, anime, cosplay, ẩm thực và các hoạt động trải nghiệm dành cho cộng đồng. Sự kiện dự kiến diễn ra vào ngày 6 và 7 tháng 11 năm 2027 tại Trung tâm Triển lãm và Hội nghị Sài Gòn, khu vực Phú Mỹ Hưng, Thành phố Hồ Chí Minh.

Lễ hội hướng đến sinh viên, gia đình, khách du lịch và những người quan tâm đến văn hóa Nhật Bản. Khách tham dự có thể tìm hiểu về thư pháp, gấp giấy origami, nghệ thuật trình diễn, truyện tranh, hoạt hình và các món ăn phổ biến của Nhật. Các chủ đề chính của chương trình gồm Japanese Culture, Anime, Cosplay, Traditional Arts và Japanese Cuisine.
`;

    const rawAiOutput = {
      title: 'NIPPON CULTURE FEST 2027',
      short_description: 'NIPPON CULTURE FEST 2027 is a cultural event celebrating Japanese culture...',
      description: '<ul><li>Attendees can participate in hands-on activities such as calligraphy, origami, and traditional crafts.</li><li>Live performances by local and international artists will be held throughout the event.</li></ul>',
    };

    const sanitized = aiDocumentParserService._sanitizeAndValidate(rawAiOutput, [], [], vnDoc, {}, {});
    expect(sanitized.short_description).toMatch(/văn hóa Nhật Bản/i);
    expect(sanitized.description).not.toContain('Attendees can participate');
    expect(sanitized.description).toContain('Japanese Culture');
    expect(sanitized.description).toContain('Cosplay');
  });

  test('should accurately extract Tech Innovation Summit 2027 with 7 sessions and 3 tickets', async () => {
    const doc = `TÀI LIỆU 1: TECH INNOVATION SUMMIT 2027
Loại cấu trúc: Bán cấu trúc (Semi-structured Document)
THÔNG TIN CHUNG
Tên chương trình: Tech Innovation Summit 2027

Chủ đề: Công nghệ, trí tuệ nhân tạo và đổi mới sáng tạo

Đơn vị tổ chức: Innovation Community Vietnam

Thời gian: 18–19/09/2027

Địa điểm: White Palace Convention Center, 194 Hoàng Văn Thụ, Phường 9, Quận Phú Nhuận, Thành phố Hồ Chí Minh.

Đối tượng tham dự: Sinh viên, lập trình viên, kỹ sư phần mềm, nhà nghiên cứu và đại diện doanh nghiệp công nghệ.

Tech Innovation Summit 2027 là hội nghị nhằm kết nối cộng đồng công nghệ, chia sẻ kinh nghiệm triển khai AI trong doanh nghiệp và giới thiệu những xu hướng phát triển phần mềm hiện đại. Chương trình bao gồm các phiên diễn thuyết, hội thảo thực hành và hoạt động kết nối chuyên gia.

Từ khóa: Artificial Intelligence, Software Engineering, Cloud Computing, Innovation, Technology Community.
CHƯƠNG TRÌNH NGÀY 18/09/2027
Buổi khai mạc – Opening the Future

Thời gian: 08:30–09:30

Địa điểm: Grand Ballroom

Nội dung: Giới thiệu chương trình, phát biểu khai mạc và tổng quan về xu hướng công nghệ năm 2027.

Khách tham dự có thể check-in từ 08:00. Giờ check-in không phải giờ bắt đầu của chương trình.

Phiên chuyên đề – AI in Modern Software Development

Thời gian: 10:00–11:30

Địa điểm: Grand Ballroom

Nội dung: Phân tích vai trò của AI trong quy trình phát triển phần mềm, kiểm thử tự động và tối ưu hiệu suất làm việc của đội ngũ kỹ thuật.

Hội thảo – Building Scalable Cloud Applications

Thời gian: 13:30–15:30

Địa điểm: Workshop Room A

Nội dung: Hướng dẫn thiết kế kiến trúc ứng dụng có khả năng mở rộng, triển khai dịch vụ trên nền tảng cloud và giám sát hiệu năng hệ thống.

Số lượng chỗ ngồi của hội thảo có giới hạn. Ban tổ chức chưa công bố số lượng chính thức.

Giao lưu – Technology Networking Night

Thời gian: 16:00–18:00

Địa điểm: Networking Lounge

Nội dung: Giao lưu giữa các chuyên gia, nhà phát triển và doanh nghiệp tham dự hội nghị.
CHƯƠNG TRÌNH NGÀY 19/09/2027
Phiên chuyên đề – Responsible AI and Data Privacy

Thời gian: 09:00–10:30

Địa điểm: Grand Ballroom

Nội dung: Thảo luận về quyền riêng tư dữ liệu, bảo mật thông tin và trách nhiệm khi triển khai các ứng dụng trí tuệ nhân tạo.

Trình diễn công nghệ – Innovation Product Showcase

Thời gian: 11:00–12:30

Địa điểm: Exhibition Hall

Nội dung: Giới thiệu sản phẩm, trình diễn giải pháp phần mềm và trao đổi kinh nghiệm xây dựng sản phẩm công nghệ.

Phiên tổng kết – Closing the Summit

Thời gian: 14:00–15:00

Địa điểm: Grand Ballroom

Nội dung: Tổng kết các nội dung chính, chia sẻ kết quả chương trình và gửi lời cảm ơn đến khách tham dự.
THÔNG TIN VÉ
Standard Pass
- Giá: 400.000 VND.
- Số lượng phát hành: 500 vé.
- Quyền lợi: Tham gia các phiên hội nghị dành cho khách thông thường theo điều kiện vé.
Business Pass
- Giá: 850.000 VND.
- Số lượng phát hành: 150 vé.
- Quyền lợi: Bao gồm quyền lợi Standard Pass và quyền sử dụng khu vực networking dành cho khách Business.
Student Pass
- Giá: 200.000 VND.
- Số lượng phát hành: 100 vé.
- Đối tượng: Sinh viên.
- Điều kiện: Có thể phải xuất trình thẻ sinh viên khi check-in.
Người mua từ 5 vé Standard Pass trong một giao dịch được giảm 10% tổng giá trị vé đủ điều kiện. Ưu đãi không áp dụng cho Business Pass và Student Pass, đồng thời không cộng dồn với chương trình khuyến mãi khác.
ĐĂNG KÝ VÀ QUY ĐỊNH
Khi đăng ký, người tham dự cần cung cấp họ tên, email và số điện thoại. Người đăng ký Student Pass cần bổ sung tên trường đang theo học.

Vé được xác nhận sau khi thanh toán thành công. Khách tham dự nên lưu email xác nhận và mã vé điện tử để sử dụng khi vào cổng.

Ban tổ chức chưa công bố chính sách hoàn tiền chi tiết. Người mua cần kiểm tra điều khoản áp dụng tại thời điểm giao dịch.

Nếu có thay đổi lịch trình, thông tin chính thức sẽ được gửi đến email đăng ký.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toMatch(/Tech Innovation Summit 2027/i);
    expect(result.data.venue_name).toMatch(/White Palace Convention Center/i);
    expect(result.data.address_line).toContain('194 Hoàng Văn Thụ');
    expect(result.data.district).toMatch(/Phú Nhuận/i);
    expect(result.data.province).toMatch(/Thành phố Hồ Chí Minh/i);

    // Sessions: Đủ 7 phiên trên 2 ngày
    expect(result.data.sessions).toHaveLength(7);
    expect(result.data.sessions[0].session_name).toMatch(/Opening the Future/i);
    expect(result.data.sessions[0].start_date).toBe('2027-09-18');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('09:30');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');

    expect(result.data.sessions[1].session_name).toMatch(/AI in Modern Software Development/i);
    expect(result.data.sessions[1].start_time).toBe('10:00');
    expect(result.data.sessions[1].end_time).toBe('11:30');

    expect(result.data.sessions[2].session_name).toMatch(/Building Scalable Cloud Applications/i);
    expect(result.data.sessions[2].start_time).toBe('13:30');
    expect(result.data.sessions[2].end_time).toBe('15:30');

    expect(result.data.sessions[3].session_name).toMatch(/Technology Networking Night/i);
    expect(result.data.sessions[3].start_time).toBe('16:00');
    expect(result.data.sessions[3].end_time).toBe('18:00');

    expect(result.data.sessions[4].session_name).toMatch(/Responsible AI and Data Privacy/i);
    expect(result.data.sessions[4].start_date).toBe('2027-09-19');
    expect(result.data.sessions[4].start_time).toBe('09:00');
    expect(result.data.sessions[4].end_time).toBe('10:30');

    expect(result.data.sessions[5].session_name).toMatch(/Innovation Product Showcase/i);
    expect(result.data.sessions[5].start_time).toBe('11:00');
    expect(result.data.sessions[5].end_time).toBe('12:30');

    expect(result.data.sessions[6].session_name).toMatch(/Closing the Summit/i);
    expect(result.data.sessions[6].start_time).toBe('14:00');
    expect(result.data.sessions[6].end_time).toBe('15:00');

    // Tickets: Đủ 3 vé
    expect(result.data.ticket_types).toHaveLength(3);
    const standardPass = ticketByHint(result.data.ticket_types, 'standard');
    expect(standardPass.price).toBe(400000);
    expect(standardPass.quantity_total).toBe(500);

    const businessPass = ticketByHint(result.data.ticket_types, 'business');
    expect(businessPass.price).toBe(850000);
    expect(businessPass.quantity_total).toBe(150);

    const studentPass = ticketByHint(result.data.ticket_types, 'student');
    expect(studentPass.price).toBe(200000);
    expect(studentPass.quantity_total).toBe(100);

    // Negative constraint: chưa công bố chính sách hoàn tiền -> allow_refunds false
    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Green Future Day 2027 with 6 sessions and 3 tickets', async () => {
    const doc = `Từ: Ban tổ chức Green Future Day
Đến: Đội ngũ vận hành và đối tác sự kiện
Tiêu đề: Xác nhận thông tin tổ chức Green Future Day 2027
Chào mọi người,
Mình gửi lại các thông tin đã thống nhất cho chương trình Green Future Day 2027 để đội ngũ thiết kế và vận hành chuẩn bị nội dung đăng ký sự kiện.
Chương trình sẽ diễn ra trong hai ngày 04 và 05/12/2027 tại Nhà Văn hóa Thanh Niên, số 4 Phạm Ngọc Thạch, Thành phố Hồ Chí Minh. Đây là hoạt động hướng đến cộng đồng quan tâm đến bảo vệ môi trường, tái chế và lối sống bền vững.
Tên sự kiện sử dụng trên hệ thống đăng ký là Green Future Day 2027. Phần giới thiệu có thể nhấn mạnh các chủ đề về Zero Waste, Recycling, Sustainable Living và Environmental Education.
Về lịch trình, ngày đầu tiên chúng ta sẽ đón khách từ 08:30. Chương trình Green Living Conference diễn ra từ 09:00 đến 11:00 tại Hội trường Chính. Phiên này tập trung vào các giải pháp giảm rác thải và thay đổi thói quen tiêu dùng trong cộng đồng.
Sau giờ nghỉ trưa, hoạt động Recycling Workshop được tổ chức tại Phòng Workshop 1 từ 13:30 đến 15:00. Người tham gia sẽ thực hành phân loại vật liệu và tạo ra các sản phẩm đơn giản từ vật liệu tái chế. Số lượng chỗ tham gia chưa chốt; đội vận hành sẽ cập nhật sau khi kiểm tra sức chứa phòng.
Cuối ngày 04/12, khu vực triển lãm Eco Product Exhibition mở cửa từ 15:30. Dự kiến khu triển lãm phục vụ khách đến 18:00, nhưng giờ kết thúc vẫn cần được xác nhận với đơn vị quản lý địa điểm. Vì vậy, chưa nên đưa 18:00 thành giờ kết thúc chính thức trên hệ thống.
Ngày 05/12, chương trình Community Green Action bắt đầu lúc 08:00 và kết thúc lúc 10:30 tại khu vực sân ngoài trời của Nhà Văn hóa Thanh Niên. Hoạt động bao gồm trao đổi kinh nghiệm xây dựng cộng đồng xanh và giới thiệu một số sáng kiến bảo vệ môi trường.
Tiếp theo, phiên Sustainable Business Forum diễn ra từ 13:00 đến 15:00 tại Hội trường Chính. Nội dung tập trung vào mô hình kinh doanh bền vững, trách nhiệm xã hội và việc giảm thiểu tác động môi trường trong hoạt động doanh nghiệp.
Buổi tổng kết Green Future Closing Ceremony dự kiến diễn ra từ 15:30 đến 16:00 cùng ngày, cũng tại Hội trường Chính.
Về vé, đội ngũ đã thống nhất ba loại vé chính. Vé Community Pass có giá 100.000 VND, số lượng 400 vé, dành cho khách tham dự các hoạt động thông thường. Vé Workshop Pass có giá 180.000 VND, giới hạn 120 vé và bao gồm quyền đăng ký một phiên workshop thuộc danh sách áp dụng. Vé Supporter Pass có giá 300.000 VND, số lượng 80 vé, dành cho người muốn ủng hộ thêm kinh phí tổ chức và được nhận bộ quà lưu niệm của chương trình.
Lưu ý rằng Supporter Pass không phải vé VIP và không mặc nhiên cung cấp chỗ ngồi ưu tiên. Giá vé cũng không bao gồm chi phí mua sản phẩm tại khu triển lãm.
Đối với đăng ký, tất cả người tham dự cần cung cấp họ tên và email. Người đăng ký Workshop Pass cần bổ sung số điện thoại để nhận thông báo xác nhận suất tham gia. Nếu workshop hết chỗ, đội vận hành sẽ thông báo các phương án phù hợp; hiện tại chưa có chính sách tự động chuyển người tham dự sang một workshop khác.
Một số thành viên đề xuất tổ chức thêm hoạt động chiếu phim tài liệu môi trường vào tối ngày 04/12, khoảng 19:00. Tuy nhiên, hoạt động này chưa được ban tổ chức phê duyệt và chưa có địa điểm xác nhận. Vì vậy, nội dung chiếu phim chỉ là đề xuất nội bộ, không đưa vào lịch trình chính thức.
Về phương án dự phòng, nếu thời tiết xấu vào sáng ngày 05/12, hoạt động Community Green Action có thể chuyển vào khu vực có mái che trong cùng địa điểm. Đây là phương án chuẩn bị trước, chưa phải quyết định thay đổi địa điểm.
Chính sách hoàn tiền hiện chưa được thống nhất. Không ghi nội dung “được hoàn tiền trong vòng 7 ngày” vào mô tả sự kiện vì chưa có căn cứ xác nhận. Khi điều khoản chính thức được duyệt, đội phụ trách sẽ cập nhật riêng.
Nhờ mọi người sử dụng đúng các thông tin đã xác nhận ở trên khi chuẩn bị trang đăng ký. Các nội dung chưa chốt cần để trống hoặc ghi nhận là chưa xác định, không tự bổ sung thông tin dựa trên dự đoán.
Cảm ơn mọi người.
Ban tổ chức Green Future Day 2027`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toMatch(/Green Future Day 2027/i);
    expect(result.data.venue_name).toMatch(/Nhà Văn hóa Thanh Niên/i);
    expect(result.data.address_line).toContain('số 4 Phạm Ngọc Thạch');
    expect(result.data.province).toMatch(/Thành phố Hồ Chí Minh/i);

    // Sessions: Đủ 6 phiên đã xác nhận, loại trừ chiếu phim tài liệu (chỉ là đề xuất nội bộ)
    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toMatch(/Green Living Conference/i);
    expect(result.data.sessions[0].start_date).toBe('2027-12-04');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('11:00');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:30');

    expect(result.data.sessions[1].session_name).toMatch(/Recycling Workshop/i);
    expect(result.data.sessions[1].start_time).toBe('13:30');
    expect(result.data.sessions[1].end_time).toBe('15:00');

    expect(result.data.sessions[2].session_name).toMatch(/Eco Product Exhibition/i);
    expect(result.data.sessions[2].start_time).toBe('15:30');
    expect(result.data.sessions[2].end_time).toBe(''); // Giờ kết thúc chưa được xác nhận

    expect(result.data.sessions[3].session_name).toMatch(/Community Green Action/i);
    expect(result.data.sessions[3].start_date).toBe('2027-12-05');
    expect(result.data.sessions[3].start_time).toBe('08:00');
    expect(result.data.sessions[3].end_time).toBe('10:30');

    expect(result.data.sessions[4].session_name).toMatch(/Sustainable Business Forum/i);
    expect(result.data.sessions[4].start_time).toBe('13:00');
    expect(result.data.sessions[4].end_time).toBe('15:00');

    expect(result.data.sessions[5].session_name).toMatch(/Green Future Closing Ceremony/i);
    expect(result.data.sessions[5].start_time).toBe('15:30');
    expect(result.data.sessions[5].end_time).toBe('16:00');

    // Không chứa phiên chiếu phim tài liệu
    const movieSession = result.data.sessions.find((s) => /chiếu\s*phim|movie/i.test(s.session_name));
    expect(movieSession).toBeUndefined();

    // Tickets: Đủ 3 vé
    expect(result.data.ticket_types).toHaveLength(3);
    const commPass = ticketByHint(result.data.ticket_types, 'community');
    expect(commPass.price).toBe(100000);
    expect(commPass.quantity_total).toBe(400);

    const wsPass = ticketByHint(result.data.ticket_types, 'workshop');
    expect(wsPass.price).toBe(180000);
    expect(wsPass.quantity_total).toBe(120);

    const supPass = ticketByHint(result.data.ticket_types, 'supporter');
    expect(supPass.price).toBe(300000);
    expect(supPass.quantity_total).toBe(80);

    // Negative constraint: chưa có căn cứ hoàn tiền -> allow_refunds false và không ghi 7 ngày
    expect(result.data.refund_policy.allow_refunds).toBe(false);
    expect(result.data.description).not.toContain('hoàn tiền trong vòng 7 ngày');
  });

  test('should accurately extract TechCareer Connect 2027 with table schedule, tickets and negative constraints', async () => {
    const docText = `# TÀI LIỆU 1: KẾ HOẠCH TRIỂN KHAI SỰ KIỆN TECHCAREER CONNECT 2027

**Mã kế hoạch:** TCC-2027-01  
**Đơn vị tổ chức:** NextGen Career Network  
**Trạng thái:** Đã phê duyệt

## 1. Tổng quan

TechCareer Connect 2027 là sự kiện kết nối sinh viên công nghệ thông tin với doanh nghiệp phần mềm, chuyên gia tuyển dụng và các kỹ sư giàu kinh nghiệm.

Sự kiện diễn ra trong hai ngày 12–13/12/2027 tại Trung tâm Hội nghị Adora Center, 431 Hoàng Văn Thụ, Phường Tân Sơn Nhất, Thành phố Hồ Chí Minh.

Mục tiêu của chương trình là tạo cơ hội giao lưu nghề nghiệp, tìm hiểu thị trường lao động và thực hành phỏng vấn.

## 2. Lịch trình triển khai

| Mã | Hoạt động | Ngày | Bắt đầu | Kết thúc | Địa điểm |
|---|---|---|---|---|---|
| TC01 | Future of Software Engineering | 12/12/2027 | 08:30 | 10:00 | Hall A |
| TC02 | CV Review and Career Coaching | 12/12/2027 | 10:30 | 12:00 | Room B1 |
| TC03 | Technical Interview Simulation | 12/12/2027 | 13:30 | 15:00 | Room B2 |
| TC04 | Technology Company Networking | 12/12/2027 | 15:30 | 17:00 | Networking Area |
| TC05 | Backend Development Workshop | 13/12/2027 | 09:00 | 11:30 | Lab 1 |
| TC06 | Frontend Portfolio Showcase | 13/12/2027 | 13:00 | 14:30 | Hall A |
| TC07 | Career Opportunities and Closing | 13/12/2027 | 15:00 | 16:00 | Hall A |

Khách tham dự được phép làm thủ tục check-in từ 07:45 ngày 12/12/2027. Giờ check-in cho ngày thứ hai chưa được quy định.

## 3. Danh mục vé

| Loại vé | Giá | Số lượng | Quyền lợi |
|---|---:|---:|---|
| Student Pass | 120.000 VND | 300 | Tham dự các phiên thông thường |
| Career Plus | 280.000 VND | 150 | Tham dự các phiên thông thường và một buổi CV coaching |
| Developer Pro | 500.000 VND | 80 | Tham dự các phiên thông thường và một workshop kỹ thuật |

Người mua Student Pass phải cung cấp tên trường đang theo học.

Career Plus và Developer Pro yêu cầu họ tên, email và số điện thoại. Riêng Student Pass chỉ yêu cầu họ tên, email và tên trường.

Số lượng vé được liệt kê là hạn mức phát hành, không phải số người đã đăng ký.

## 4. Điều khoản đăng ký

- Mỗi email chỉ được sử dụng để tạo một đăng ký cho mỗi loại vé.
- Vé Developer Pro không bảo đảm người tham dự được chọn workshop nếu workshop đã đủ chỗ.
- Ban tổ chức chưa công bố chính sách hoàn tiền.
- Danh sách doanh nghiệp tham gia sẽ được công bố sau.

## 5. Từ khóa

Career, Software Engineering, Recruitment, Technical Interview, Developer, Student Networking.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('TECHCAREER CONNECT 2027');
    expect(result.data.venue_name).toMatch(/Adora Center/i);
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);

    expect(result.data.sessions).toHaveLength(7);
    expect(result.data.sessions[0].session_name).toBe('Future of Software Engineering');
    expect(result.data.sessions[0].start_date).toBe('2027-12-12');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('10:00');
    expect(result.data.sessions[0].checkin_start_time).toBe('07:45');

    expect(result.data.sessions[4].session_name).toBe('Backend Development Workshop');
    expect(result.data.sessions[4].start_date).toBe('2027-12-13');
    expect(result.data.sessions[4].start_time).toBe('09:00');
    expect(result.data.sessions[4].end_time).toBe('11:30');
    expect(result.data.sessions[4].checkin_start_time).toBe('');

    expect(result.data.ticket_types).toHaveLength(3);
    const sp = ticketByHint(result.data.ticket_types, 'student');
    expect(sp.price).toBe(120000);
    expect(sp.quantity_total).toBe(300);

    const cp = ticketByHint(result.data.ticket_types, 'career');
    expect(cp.price).toBe(280000);
    expect(cp.quantity_total).toBe(150);

    const dp = ticketByHint(result.data.ticket_types, 'developer');
    expect(dp.price).toBe(500000);
    expect(dp.quantity_total).toBe(80);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Ocean Cleanup Weekend 2027 with 4 activities and volunteer tickets', async () => {
    const docText = `# TÀI LIỆU 2: THÔNG BÁO NỘI BỘ VỀ SỰ KIỆN OCEAN CLEANUP WEEKEND 2027

**Đơn vị phát hành:** Blue Ocean Community  
**Ngày thông báo:** 05/09/2027  
**Mã thông báo:** BOC-0927  
**Đối tượng:** Tình nguyện viên và cộng đồng địa phương

## THÔNG BÁO

Blue Ocean Community thông báo tổ chức chương trình Ocean Cleanup Weekend 2027 nhằm nâng cao nhận thức về rác thải nhựa và bảo vệ môi trường biển.

Chương trình chính thức diễn ra ngày 06/11/2027 tại Bãi biển Mỹ Khê, khu vực đường Võ Nguyên Giáp, Đà Nẵng.

### Hoạt động trong chương trình

**Hoạt động 1 – Plastic Waste Awareness Talk**

Thời gian: 07:30–08:30 ngày 06/11/2027.

Địa điểm: Khu sinh hoạt cộng đồng gần bãi biển.

Nội dung: Chia sẻ về tác động của rác thải nhựa đối với môi trường biển.

**Hoạt động 2 – Community Beach Cleanup**

Thời gian: 09:00–11:30 cùng ngày.

Địa điểm: Bãi biển Mỹ Khê.

Người tham gia được hướng dẫn phân loại rác tại điểm tập kết. Ban tổ chức sẽ cung cấp bao tay và túi thu gom.

**Hoạt động 3 – Waste Sorting Challenge**

Thời gian: 13:00–14:30.

Địa điểm: Khu sinh hoạt cộng đồng gần bãi biển.

Hoạt động theo nhóm, yêu cầu người tham gia phân loại các mẫu rác theo hướng dẫn của điều phối viên.

**Hoạt động 4 – Green Community Sharing**

Thời gian: 15:00–16:00.

Địa điểm: Khu sinh hoạt cộng đồng gần bãi biển.

Nội dung: Chia sẻ kinh nghiệm giảm thiểu rác thải trong sinh hoạt.

### Thông tin đăng ký

Chương trình áp dụng hai hình thức tham gia:

| Hình thức | Phí tham gia | Số lượng dự kiến |
|---|---:|---:|
| Volunteer Pass | Miễn phí | 200 |
| Supporter Pass | 100.000 VND | 100 |

Volunteer Pass dành cho người đăng ký tham gia hoạt động tình nguyện. Supporter Pass bao gồm một bộ quà lưu niệm và phần đóng góp cho chương trình.

Người đăng ký phải cung cấp họ tên, email và số điện thoại liên hệ.

### Ghi chú của ban tổ chức

Ban tổ chức đang xem xét tổ chức một buổi chiếu phim tài liệu về đại dương vào tối ngày 06/11. Hoạt động này chưa được phê duyệt và chưa có địa điểm cụ thể.

Nếu thời tiết xấu, hoạt động ngoài trời có thể được điều chỉnh hoặc tạm hoãn. Chưa có quyết định chuyển địa điểm sang khu vực trong nhà.

Chương trình hiện chưa áp dụng chính sách hoàn tiền hoặc quy định hoàn phí cụ thể.

### Từ khóa

Ocean Conservation, Beach Cleanup, Sustainability, Plastic Waste, Volunteer, Community.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('OCEAN CLEANUP WEEKEND 2027');
    expect(result.data.venue_name).toMatch(/Bãi biển Mỹ Khê/i);
    expect(result.data.province).toMatch(/Đà Nẵng/i);

    expect(result.data.sessions).toHaveLength(4);
    expect(result.data.sessions[0].session_name).toBe('Plastic Waste Awareness Talk');
    expect(result.data.sessions[0].start_date).toBe('2027-11-06');
    expect(result.data.sessions[0].start_time).toBe('07:30');
    expect(result.data.sessions[0].end_time).toBe('08:30');

    expect(result.data.sessions[1].session_name).toBe('Community Beach Cleanup');
    expect(result.data.sessions[1].start_time).toBe('09:00');
    expect(result.data.sessions[1].end_time).toBe('11:30');

    expect(result.data.ticket_types).toHaveLength(2);
    const volPass = ticketByHint(result.data.ticket_types, 'volunteer');
    expect(volPass.price).toBe(0);
    expect(volPass.quantity_total).toBe(200);

    const supPass = ticketByHint(result.data.ticket_types, 'supporter');
    expect(supPass.price).toBe(100000);
    expect(supPass.quantity_total).toBe(100);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract FinTech Future Forum 2027 with 6 confirmed sessions and 3 tickets', async () => {
    const docText = `# TÀI LIỆU 3: BIÊN BẢN HỌP TỔ CHỨC SỰ KIỆN FINTECH FUTURE FORUM 2027

**Mã biên bản:** FFF-MOM-2027-03  
**Ngày họp:** 18/09/2027  
**Thành phần:** Ban tổ chức, nhóm nội dung, nhóm vận hành và đại diện tài trợ  
**Trạng thái biên bản:** Các nội dung tại mục Quyết định đã được thông qua

## 1. Nội dung thảo luận

Cuộc họp thống nhất tổ chức FinTech Future Forum 2027 vào ngày 18–19/12/2027 tại khách sạn The Mira Central Park, Bình Dương.

Địa chỉ được cung cấp trong hồ sơ địa điểm là 555B Đại lộ Bình Dương, Phường Bình Hòa, Thành phố Hồ Chí Minh? Nhóm vận hành cần xác minh lại thông tin tỉnh/thành trước khi xuất bản trang sự kiện.

**Lưu ý:** Địa chỉ chi tiết và đơn vị hành chính chưa được xác minh. Không tự động sửa địa chỉ dựa trên suy đoán.

## 2. Các quyết định đã thông qua

### Phiên 1: Digital Banking Transformation

- Ngày: 18/12/2027.
- Thời gian: 09:00–10:30.
- Địa điểm: Conference Hall 1.
- Trạng thái: Đã xác nhận.

### Phiên 2: Blockchain in Financial Services

- Ngày: 18/12/2027.
- Thời gian: 11:00–12:30.
- Địa điểm: Conference Hall 1.
- Trạng thái: Đã xác nhận.

### Phiên 3: FinTech Startup Pitching

- Ngày: 18/12/2027.
- Thời gian: 14:00–16:00.
- Địa điểm: Innovation Room.
- Trạng thái: Đã xác nhận.

### Phiên 4: Cybersecurity for Digital Finance

- Ngày: 19/12/2027.
- Thời gian: 09:30–11:00.
- Địa điểm: Conference Hall 1.
- Trạng thái: Đã xác nhận.

### Phiên 5: Investor Networking Session

- Ngày: 19/12/2027.
- Thời gian: 13:30–15:00.
- Địa điểm: Networking Lounge.
- Trạng thái: Đã xác nhận.

### Phiên 6: Closing Remarks

- Ngày: 19/12/2027.
- Thời gian: 15:30–16:00.
- Địa điểm: Conference Hall 1.
- Trạng thái: Đã xác nhận.

## 3. Các đề xuất chưa được thông qua

Một thành viên đề xuất bổ sung phiên “Central Bank Digital Currency Roundtable” vào sáng ngày 19/12. Nhóm nội dung chưa thống nhất được diễn giả và thời gian tổ chức. Phiên này không thuộc chương trình đã xác nhận.

Đại diện tài trợ đề xuất mở tiệc giao lưu vào tối ngày 18/12. Chưa có quyết định về ngân sách, địa điểm hoặc thời gian. Không đưa nội dung này vào lịch chính thức.

## 4. Phương án vé

| Loại vé | Giá | Hạn mức |
|---|---:|---:|
| Standard Forum Pass | 350.000 VND | 400 |
| Finance Professional Pass | 700.000 VND | 180 |
| Investor Access Pass | 1.200.000 VND | 60 |

Standard Forum Pass cho phép tham dự các phiên thông thường.

Finance Professional Pass bao gồm quyền tham dự các phiên thông thường và tài liệu chuyên môn.

Investor Access Pass bao gồm quyền tham dự các phiên thông thường và khu vực networking dành cho nhà đầu tư. Vé không bảo đảm người mua sẽ được gặp riêng bất kỳ diễn giả nào.

Người mua vé cần cung cấp họ tên, email và số điện thoại. Người mua Investor Access Pass được yêu cầu khai báo thêm tên tổ chức hoặc doanh nghiệp.

## 5. Các vấn đề còn mở

- Xác minh chính xác địa chỉ và đơn vị hành chính của địa điểm.
- Xác định chính sách hoàn tiền.
- Phê duyệt hoặc loại bỏ các phiên được đề xuất.
- Xác nhận sức chứa thực tế của từng phòng.

**Từ khóa:** FinTech, Digital Banking, Blockchain, Cybersecurity, Investment, Financial Technology.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('FINTECH FUTURE FORUM 2027');
    expect(result.data.venue_name).toMatch(/The Mira Central Park/i);
    expect(result.data.province).toMatch(/Bình Dương/i);

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Digital Banking Transformation');
    expect(result.data.sessions[0].start_date).toBe('2027-12-18');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('10:30');

    expect(result.data.sessions[3].session_name).toBe('Cybersecurity for Digital Finance');
    expect(result.data.sessions[3].start_date).toBe('2027-12-19');
    expect(result.data.sessions[3].start_time).toBe('09:30');
    expect(result.data.sessions[3].end_time).toBe('11:00');

    expect(result.data.ticket_types).toHaveLength(3);
    const stdPass = ticketByHint(result.data.ticket_types, 'standard');
    expect(stdPass.price).toBe(350000);
    expect(stdPass.quantity_total).toBe(400);

    const proPass = ticketByHint(result.data.ticket_types, 'professional');
    expect(proPass.price).toBe(700000);
    expect(proPass.quantity_total).toBe(180);

    const invPass = ticketByHint(result.data.ticket_types, 'investor');
    expect(invPass.price).toBe(1200000);
    expect(invPass.quantity_total).toBe(60);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract EduVerse International 2028 with 7 prose sessions and 3 packages', async () => {
    const docText = `# TÀI LIỆU 4: THƯ MỜI VÀ BÁO GIÁ THAM DỰ EDUVERSE INTERNATIONAL 2028

**Đơn vị gửi:** EduVerse Organization  
**Mã thư:** EVO-INV-2028-11  
**Ngày phát hành:** 10/11/2027  
**Chủ đề:** Thư mời tham dự hội nghị giáo dục và công nghệ EduVerse International 2028

Kính gửi Quý đối tác và Quý khách,

EduVerse Organization trân trọng kính mời Quý khách tham dự EduVerse International 2028, sự kiện về công nghệ giáo dục, học tập số và đổi mới phương pháp giảng dạy.

Chương trình được tổ chức vào ngày 15–16/01/2028 tại Saigon Exhibition and Convention Center (SECC), số 799 Nguyễn Văn Linh, Phường Tân Mỹ, Thành phố Hồ Chí Minh.

## Chương trình dự kiến chính thức

**Ngày 15/01/2028**

Buổi sáng, từ 08:30 đến 10:00, diễn ra phiên khai mạc “The Next Generation of Digital Learning” tại Hall B.

Từ 10:30 đến 12:00, khách tham dự có thể tham gia “AI-Powered Personalized Education” tại Hall B.

Buổi chiều, từ 13:30 đến 15:30, chương trình “Interactive Learning Design Workshop” được tổ chức tại Workshop Room 2.

Từ 16:00 đến 17:00, phiên “EdTech Partner Networking” diễn ra tại Networking Zone.

**Ngày 16/01/2028**

Từ 09:00 đến 10:30, phiên “Digital Assessment and Learning Analytics” được tổ chức tại Hall B.

Từ 11:00 đến 12:30, phiên “Building Inclusive Online Classrooms” diễn ra tại Hall B.

Lễ bế mạc “EduVerse Closing Ceremony” diễn ra từ 14:00 đến 15:00 tại Hall B.

Ban tổ chức dự kiến mở cửa check-in từ 07:45 ngày 15/01/2028. Giờ check-in ngày thứ hai chưa được công bố.

## Báo giá tham dự

| Gói | Giá bán | Số lượng dự kiến | Nội dung |
|---|---:|---:|---|
| Learner Pass | 200.000 VND | 500 | Tham dự các phiên hội nghị thông thường |
| Educator Pass | 450.000 VND | 200 | Tham dự hội nghị và đăng ký một workshop |
| Institutional Pass | 1.500.000 VND | 50 | Quyền lợi hội nghị dành cho đại diện tổ chức và bộ tài liệu mở rộng |

Institutional Pass không đồng nghĩa với vé nhóm. Mỗi vé dành cho một người tham dự.

Tất cả người đăng ký phải cung cấp họ tên và email. Người mua Educator Pass phải cung cấp thêm đơn vị công tác. Người mua Institutional Pass phải cung cấp tên tổ chức.

Các mức giá trên là giá niêm yết dự kiến trong thư mời. Ban tổ chức chưa công bố chương trình giảm giá.

## Điều khoản thương mại

Báo giá không bao gồm chi phí đi lại và lưu trú.

Chính sách hủy đăng ký và hoàn tiền đang được xem xét. Không có điều khoản nào trong thư này xác nhận rằng người mua được hoàn tiền toàn bộ.

Ban tổ chức đang đàm phán với một đơn vị cung cấp nền tảng triển lãm trực tuyến. Nếu được phê duyệt, hoạt động này có thể được tổ chức song song với hội nghị. Hiện chưa có thời gian, đường dẫn hoặc địa điểm trực tuyến chính thức.

## Thông tin liên hệ

EduVerse Organization  
Bộ phận đăng ký sự kiện  
Email liên hệ chưa được cung cấp trong tài liệu này.

Trân trọng,  
Ban tổ chức EduVerse International 2028

**Từ khóa:** EdTech, Digital Learning, AI in Education, Learning Analytics, Online Education, Education Innovation.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('EDUVERSE INTERNATIONAL 2028');
    expect(result.data.venue_name).toMatch(/Saigon Exhibition and Convention Center|SECC/i);
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);

    expect(result.data.sessions).toHaveLength(7);
    expect(result.data.sessions[0].session_name).toBe('The Next Generation of Digital Learning');
    expect(result.data.sessions[0].start_date).toBe('2028-01-15');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('10:00');
    expect(result.data.sessions[0].checkin_start_time).toBe('07:45');

    expect(result.data.sessions[1].session_name).toBe('AI-Powered Personalized Education');
    expect(result.data.sessions[1].start_time).toBe('10:30');
    expect(result.data.sessions[1].end_time).toBe('12:00');

    expect(result.data.ticket_types).toHaveLength(3);
    const lp = ticketByHint(result.data.ticket_types, 'learner');
    expect(lp.price).toBe(200000);
    expect(lp.quantity_total).toBe(500);

    const ep = ticketByHint(result.data.ticket_types, 'educator');
    expect(ep.price).toBe(450000);
    expect(ep.quantity_total).toBe(200);

    const ip = ticketByHint(result.data.ticket_types, 'institutional');
    expect(ip.price).toBe(1500000);
    expect(ip.quantity_total).toBe(500 ? 50 : 50);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Music Waves Festival 2028 adopting approved Version 2.0 schedule over Version 1.0', async () => {
    const docText = `# TÀI LIỆU 5: PHIẾU CẬP NHẬT CHƯƠNG TRÌNH MUSIC WAVES FESTIVAL 2028

**Mã tài liệu:** MWF-CHANGE-006  
**Phiên bản:** 2.0  
**Ngày cập nhật:** 05/02/2028  
**Trạng thái:** Phiên bản 2.0 thay thế lịch trình của phiên bản 1.0 đối với những mục được nêu rõ bên dưới.

## 1. Thông tin sự kiện

Tên sự kiện: Music Waves Festival 2028.

Ngày tổ chức: 22/04/2028.

Địa điểm: Công viên Biển Đông, Đà Nẵng.

Địa chỉ chi tiết của khu vực tổ chức và cổng vào dành cho khách tham dự chưa được xác nhận.

## 2. Lịch trình phiên bản 1.0

Lịch trình cũ được ghi nhận để đối chiếu:

| Hoạt động | Ngày | Bắt đầu | Kết thúc | Khu vực |
|---|---|---|---|---|
| Acoustic Opening | 22/04/2028 | 15:00 | 15:45 | Stage A |
| Indie Band Showcase | 22/04/2028 | 16:00 | 17:00 | Stage A |
| Electronic Music Session | 22/04/2028 | 17:30 | 19:00 | Main Stage |
| Headliner Performance | 22/04/2028 | 19:30 | 21:00 | Main Stage |
| Festival Closing | 22/04/2028 | 21:15 | 21:30 | Main Stage |

## 3. Các thay đổi được phê duyệt trong phiên bản 2.0

**Thay đổi số 1: Acoustic Opening**

Thời gian bắt đầu mới là 14:30, thời gian kết thúc mới là 15:15. Khu vực vẫn là Stage A.

Lịch trình phiên bản 1.0 không còn áp dụng cho hoạt động này.

**Thay đổi số 2: Indie Band Showcase**

Thời gian được điều chỉnh thành 15:30–16:30. Khu vực tổ chức vẫn là Stage A.

**Thay đổi số 3: Electronic Music Session**

Thời gian mới là 17:00–18:30 tại Main Stage.

**Thay đổi số 4: Headliner Performance**

Thời gian mới là 19:00–20:30 tại Main Stage.

**Thay đổi số 5: Festival Closing**

Thời gian mới là 20:45–21:00 tại Main Stage.

Như vậy, lịch trình phiên bản 2.0 có năm hoạt động chính thức, và tất cả các thời gian mới nêu trên đã được phê duyệt.

## 4. Hoạt động bổ sung đang được xem xét

Ban tổ chức đang cân nhắc mở một khu vực giao lưu nghệ sĩ vào buổi trưa ngày 22/04/2028. Chưa có thời gian cụ thể, chưa xác định địa điểm và chưa có quyết định phê duyệt.

Một đề xuất khác là tổ chức chương trình DJ After Party sau khi Festival Closing kết thúc. Đề xuất này chưa được phê duyệt; không được tự suy luận rằng sự kiện kết thúc muộn hơn 21:00.

## 5. Các loại vé

| Loại vé | Giá | Số lượng | Quyền lợi |
|---|---:|---:|---|
| Early Wave | 300.000 VND | 600 | Vé vào cửa khu vực phổ thông |
| Standard Wave | 450.000 VND | 1.000 | Vé vào cửa khu vực phổ thông |
| Golden Wave | 850.000 VND | 250 | Vé vào cửa và khu vực xem biểu diễn ưu tiên |

Số lượng nêu trên là hạn mức phát hành theo kế hoạch hiện tại.

Người mua phải cung cấp họ tên và email. Golden Wave yêu cầu thêm số điện thoại để gửi thông tin hướng dẫn vào khu vực ưu tiên.

Ban tổ chức chưa công bố chính sách hoàn tiền hoặc đổi vé.

## 6. Quy tắc xử lý tài liệu

- Phiên bản 2.0 là nguồn dữ liệu có hiệu lực đối với năm hoạt động đã được điều chỉnh.
- Không sử dụng giờ của phiên bản 1.0 cho các hoạt động đã có giờ mới.
- Không tự bổ sung hoạt động giao lưu nghệ sĩ hoặc DJ After Party vào lịch chính thức.
- Không suy luận địa chỉ chi tiết của địa điểm từ tên công viên.
- Không tự đặt chính sách hoàn tiền.
- Giữ nguyên giá và số lượng vé theo bảng tại mục 5.

**Từ khóa:** Music Festival, Live Music, Indie, Electronic Music, Concert, Music Community.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toMatch(/Music Waves Festival 2028/i);
    expect(result.data.venue_name).toMatch(/Công viên Biển Đông/i);
    expect(result.data.province).toMatch(/Đà Nẵng/i);

    // Phiên bản 2.0 đã ghi đè Version 1.0: 5 phiên với giờ mới
    expect(result.data.sessions).toHaveLength(5);
    expect(result.data.sessions[0].session_name).toBe('Acoustic Opening');
    expect(result.data.sessions[0].start_date).toBe('2028-04-22');
    expect(result.data.sessions[0].start_time).toBe('14:30');
    expect(result.data.sessions[0].end_time).toBe('15:15');

    expect(result.data.sessions[1].session_name).toBe('Indie Band Showcase');
    expect(result.data.sessions[1].start_time).toBe('15:30');
    expect(result.data.sessions[1].end_time).toBe('16:30');

    expect(result.data.sessions[2].session_name).toBe('Electronic Music Session');
    expect(result.data.sessions[2].start_time).toBe('17:00');
    expect(result.data.sessions[2].end_time).toBe('18:30');

    expect(result.data.sessions[3].session_name).toBe('Headliner Performance');
    expect(result.data.sessions[3].start_time).toBe('19:00');
    expect(result.data.sessions[3].end_time).toBe('20:30');

    expect(result.data.sessions[4].session_name).toBe('Festival Closing');
    expect(result.data.sessions[4].start_time).toBe('20:45');
    expect(result.data.sessions[4].end_time).toBe('21:00');

    expect(result.data.ticket_types).toHaveLength(3);
    const ew = ticketByHint(result.data.ticket_types, 'early');
    expect(ew.price).toBe(300000);
    expect(ew.quantity_total).toBe(600);

    const sw = ticketByHint(result.data.ticket_types, 'standard');
    expect(sw.price).toBe(450000);
    expect(sw.quantity_total).toBe(1000);

    const gw = ticketByHint(result.data.ticket_types, 'golden');
    expect(gw.price).toBe(850000);
    expect(gw.quantity_total).toBe(250);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Digital Creator Expo 2027 from legal agreement with 6 bullet sessions and 3 ticket packs', async () => {
    const docText = `# THỎA THUẬN TỔ CHỨC VÀ TÀI TRỢ SỰ KIỆN
## DIGITAL CREATOR EXPO 2027

**Mã tài liệu:** DCE-SP-027  
**Ngày lập:** 15/08/2027  
**Trạng thái:** Kế hoạch tổ chức đã được xác nhận một phần

### ĐIỀU 1. MỤC ĐÍCH VÀ QUY MÔ

Digital Creator Expo 2027 là sự kiện kết nối nhà sáng tạo nội dung, doanh nghiệp công nghệ và cộng đồng truyền thông số. Chương trình dự kiến diễn ra trong hai ngày 20 và 21 tháng 11 năm 2027 tại Trung tâm Hội nghị Riverside Palace, số 360D Bến Vân Đồn, Phường Vĩnh Hội, Thành phố Hồ Chí Minh.

Ban tổ chức dự kiến đón khoảng 800 người tham dự. Đây là số lượng khách dự kiến, không phải số vé được phép bán.

### ĐIỀU 2. NỘI DUNG CHƯƠNG TRÌNH

Các hoạt động được xác nhận trong kế hoạch hiện tại bao gồm:

- **Creator Economy: Where Are We Going?** diễn ra ngày 20/11/2027, từ 09:00 đến 10:30 tại Main Conference Hall. Khách tham dự có thể làm thủ tục check-in từ 08:15.
- **Short-form Video Production Lab** được tổ chức cùng ngày từ 11:00 đến 12:30 tại Studio Room B.
- **Brand Partnership Networking** bắt đầu lúc 14:00 và kết thúc lúc 16:00 ngày 20/11/2027 tại Networking Lounge.
- **AI Tools for Digital Creators** diễn ra ngày 21/11/2027, từ 09:30 đến 11:00 tại Main Conference Hall.
- **Creator Showcase & Awards** được lên lịch từ 13:30 đến 15:30 ngày 21/11/2027 tại Main Conference Hall.
- **Closing and Community Meetup** diễn ra từ 16:00 đến 17:00 ngày 21/11/2027 tại Networking Lounge.

Ban tổ chức đang cân nhắc bổ sung một buổi giao lưu với khách mời nổi tiếng vào tối ngày 20/11. Thời gian, địa điểm và khách mời chưa được xác nhận. Hoạt động này không thuộc lịch trình chính thức.

### ĐIỀU 3. VÉ THAM DỰ VÀ PHÂN PHỐI

Ban tổ chức thống nhất ba loại vé như sau:

**Gói A – General Admission**
- Giá bán: 250.000 VND/vé.
- Số lượng: 450 vé.
- Quyền lợi: tham dự các phiên chương trình thông thường trong khuôn khổ sự kiện.
- Không bao gồm quyền tham dự các workshop có giới hạn chỗ nếu workshop yêu cầu đăng ký riêng.

**Gói B – Creator Workshop Pass**
- Giá bán: 450.000 VND/vé.
- Số lượng: 200 vé.
- Quyền lợi: tham dự chương trình thông thường và đăng ký một workshop được chỉ định trong danh sách workshop.
- Việc tham dự workshop phụ thuộc vào xác nhận đăng ký và số chỗ còn lại.

**Gói C – VIP Experience**
- Giá bán: 900.000 VND/vé.
- Số lượng: 100 vé.
- Quyền lợi: khu vực chỗ ngồi ưu tiên tại Main Conference Hall, một bộ quà tặng sự kiện và quyền tham dự phiên Creator Showcase & Awards.
- Không bao gồm dịch vụ đưa đón hoặc lưu trú.

Tổng số vé dự kiến phát hành là 750 vé. Số lượng vé này độc lập với quy mô khách tham dự dự kiến tại Điều 1.

### ĐIỀU 4. THÔNG TIN ĐĂNG KÝ

Tất cả người mua vé phải cung cấp họ tên đầy đủ và địa chỉ email hợp lệ.

Người đăng ký gói Creator Workshop Pass phải cung cấp thêm số điện thoại để ban tổ chức gửi thông tin xác nhận workshop.

Người đăng ký gói VIP Experience cần cung cấp tên hiển thị trên thẻ tham dự. Tên hiển thị có thể trùng với họ tên đầy đủ đã khai báo.

Ban tổ chức chưa quyết định có yêu cầu người tham dự cung cấp thông tin công ty hay không. Vì vậy, thông tin công ty chưa phải trường dữ liệu bắt buộc.

### ĐIỀU 5. ĐIỀU KHOẢN HOÀN TIỀN

Chính sách hoàn tiền vẫn đang được bộ phận tài chính xem xét. Thỏa thuận này không xác lập thời hạn hoặc tỷ lệ hoàn tiền cụ thể.

Không được hiểu rằng vé có thể được hoàn tiền trong vòng 7 ngày kể từ ngày mua, vì thời hạn này chưa được ban tổ chức phê duyệt.

### ĐIỀU 6. TRÁCH NHIỆM CỦA BAN TỔ CHỨC

Ban tổ chức chịu trách nhiệm bố trí địa điểm, quản lý đăng ký, kiểm soát số lượng vé và thông báo các thay đổi đã được phê duyệt.

Mọi hoạt động chưa được xác nhận phải được đánh dấu là đề xuất hoặc đang xem xét; không được tự động đưa vào lịch trình chính thức.

---

## PHỤ LỤC A – THÔNG TIN ĐỊA ĐIỂM

Tên địa điểm: Riverside Palace Convention Center  
Địa chỉ: 360D Bến Vân Đồn, Phường Vĩnh Hội, Thành phố Hồ Chí Minh, Việt Nam.

Các phòng dự kiến sử dụng:
- Main Conference Hall
- Studio Room B
- Networking Lounge

Thông tin về sức chứa riêng của từng phòng chưa được cung cấp trong tài liệu này.

## PHỤ LỤC B – TỪ KHÓA SỰ KIỆN

Digital Creator, Content Creation, Digital Marketing, Artificial Intelligence, Creator Economy, Networking, Video Production.

## PHỤ LỤC C – CÁC THÔNG TIN CHƯA ĐƯỢC XÁC NHẬN

1. Khách mời của buổi giao lưu dự kiến vào tối 20/11/2027.
2. Thời gian và địa điểm chính thức của buổi giao lưu nói trên.
3. Chính sách hoàn tiền.
4. Sức chứa cụ thể của từng phòng.
5. Việc thu thập thông tin công ty của người tham dự.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('DIGITAL CREATOR EXPO 2027');
    expect(result.data.venue_name).toMatch(/Riverside Palace/i);
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Creator Economy: Where Are We Going?');
    expect(result.data.sessions[0].start_date).toBe('2027-11-20');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('10:30');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:15');

    expect(result.data.sessions[3].session_name).toBe('AI Tools for Digital Creators');
    expect(result.data.sessions[3].start_date).toBe('2027-11-21');
    expect(result.data.sessions[3].start_time).toBe('09:30');
    expect(result.data.sessions[3].end_time).toBe('11:00');

    expect(result.data.sessions[4].session_name).toBe('Creator Showcase & Awards');
    expect(result.data.sessions[4].start_time).toBe('13:30');
    expect(result.data.sessions[4].end_time).toBe('15:30');

    expect(result.data.ticket_types).toHaveLength(3);
    const gA = ticketByHint(result.data.ticket_types, 'general');
    expect(gA.price).toBe(250000);
    expect(gA.quantity_total).toBe(450);

    const gB = ticketByHint(result.data.ticket_types, 'workshop');
    expect(gB.price).toBe(450000);
    expect(gB.quantity_total).toBe(200);

    const gC = ticketByHint(result.data.ticket_types, 'vip');
    expect(gC.price).toBe(900000);
    expect(gC.quantity_total).toBe(100);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Vietnam Green Industry Expo 2028 from RFP format with 7 dossier sessions and 3 tickets', async () => {
    const docText = `# TÀI LIỆU 1 — HỒ SƠ YÊU CẦU TỔ CHỨC TRIỂN LÃM
## VIETNAM GREEN INDUSTRY EXPO 2028

**Mã hồ sơ:** VGIE-RFP-028  
**Đơn vị yêu cầu:** Vietnam Green Industry Association  
**Loại hồ sơ:** Yêu cầu cung cấp dịch vụ tổ chức triển lãm  
**Trạng thái:** Phạm vi sự kiện đã được phê duyệt

### A. Phạm vi cung cấp dịch vụ

Đơn vị tổ chức được lựa chọn sẽ chịu trách nhiệm xây dựng không gian triển lãm, điều phối các phiên chuyên đề và hỗ trợ đăng ký khách tham dự cho Vietnam Green Industry Expo 2028.

Thời gian tổ chức chính thức là ngày 08–10/06/2028 tại WTC EXPO, đường A19, Phường Bình Dương, Thành phố Hồ Chí Minh.

Chủ đề triển lãm bao gồm công nghệ năng lượng sạch, sản xuất bền vững, tái chế công nghiệp và giải pháp giảm phát thải carbon.

### B. Danh mục phiên chuyên đề

Các phiên dưới đây thuộc chương trình đã được xác nhận.

**Hồ sơ hoạt động A-01**

Tên: Industrial Decarbonization Forum  
Ngày tổ chức: 08/06/2028  
Khung giờ: 09:00–10:30  
Khu vực: Conference Zone North  
Hình thức: Hội thảo chuyên đề.

**Hồ sơ hoạt động A-02**

Tên: Renewable Energy Technology Showcase  
Ngày tổ chức: 08/06/2028  
Khung giờ: 11:00–12:30  
Khu vực: Exhibition Stage 1  
Hình thức: Giới thiệu công nghệ.

**Hồ sơ hoạt động A-03**

Tên: Circular Manufacturing Workshop  
Ngày tổ chức: 08/06/2028  
Khung giờ: 14:00–16:00  
Khu vực: Workshop Room C  
Hình thức: Workshop thực hành.

**Hồ sơ hoạt động A-04**

Tên: Sustainable Supply Chain Forum  
Ngày tổ chức: 09/06/2028  
Khung giờ: 09:30–11:00  
Khu vực: Conference Zone North  
Hình thức: Hội thảo chuyên đề.

**Hồ sơ hoạt động A-05**

Tên: Waste-to-Value Innovation Pitch  
Ngày tổ chức: 09/06/2028  
Khung giờ: 13:30–15:00  
Khu vực: Exhibition Stage 1  
Hình thức: Trình bày giải pháp.

**Hồ sơ hoạt động A-06**

Tên: Green Manufacturing Partnership Session  
Ngày tổ chức: 10/06/2028  
Khung giờ: 09:00–10:30  
Khu vực: Conference Zone North  
Hình thức: Kết nối doanh nghiệp.

**Hồ sơ hoạt động A-07**

Tên: Expo Closing and Industry Outlook  
Ngày tổ chức: 10/06/2028  
Khung giờ: 15:00–16:00  
Khu vực: Exhibition Stage 1  
Hình thức: Tổng kết triển lãm.

### C. Yêu cầu phân khu

| Khu vực | Công năng | Sức chứa |
|---|---|---|
| Conference Zone North | Hội thảo | Chưa cung cấp |
| Exhibition Stage 1 | Trình diễn công nghệ và thuyết trình | Chưa cung cấp |
| Workshop Room C | Workshop | 60 người |
| Green Innovation Pavilion | Gian hàng triển lãm | Không áp dụng sức chứa theo ghế |

Không được lấy sức chứa Workshop Room C làm sức chứa mặc định cho các khu vực khác.

### D. Phương án vé tham quan và tham dự

| Mã vé | Tên vé | Giá | Hạn mức |
|---|---|---:|---:|
| VG-01 | Expo Visitor | 150.000 VND | 800 |
| VG-02 | Industry Professional | 350.000 VND | 300 |
| VG-03 | Workshop Access | 500.000 VND | 100 |

**Expo Visitor:** Cho phép vào khu triển lãm và tham dự các phiên mở cửa dành cho khách tham quan.

**Industry Professional:** Bao gồm quyền tham quan và sử dụng khu vực networking dành cho doanh nghiệp.

**Workshop Access:** Bao gồm quyền tham quan và đăng ký một workshop còn chỗ. Vé không bảo đảm được tham dự nếu người mua chưa hoàn thành bước đăng ký workshop.

Người mua vé phải cung cấp họ tên và email. Người mua Industry Professional phải khai báo thêm tên doanh nghiệp. Người mua Workshop Access phải cung cấp số điện thoại.

### E. Điều kiện vận hành

Giờ mở cửa khu triển lãm chưa được chốt cho cả ba ngày. Các phiên chuyên đề đã có giờ bắt đầu và kết thúc theo mục B, nhưng không được dùng giờ phiên đầu tiên để suy ra giờ mở cửa toàn khu.

Chính sách hoàn tiền chưa được ban tổ chức công bố.

Một khu trình diễn máy móc công nghiệp ngoài trời đang được xem xét. Hạng mục này chưa có vị trí, thời gian hoặc quyết định phê duyệt nên không thuộc danh sách hoạt động chính thức.

### F. Từ khóa

Green Industry, Renewable Energy, Sustainable Manufacturing, Recycling, Carbon Reduction, Clean Technology.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('VIETNAM GREEN INDUSTRY EXPO 2028');
    expect(result.data.venue_name).toMatch(/WTC EXPO/i);
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);

    expect(result.data.sessions).toHaveLength(7);
    expect(result.data.sessions[0].session_name).toBe('Industrial Decarbonization Forum');
    expect(result.data.sessions[0].start_date).toBe('2028-06-08');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('10:30');

    expect(result.data.sessions[3].session_name).toBe('Sustainable Supply Chain Forum');
    expect(result.data.sessions[3].start_date).toBe('2028-06-09');
    expect(result.data.sessions[3].start_time).toBe('09:30');
    expect(result.data.sessions[3].end_time).toBe('11:00');

    expect(result.data.sessions[6].session_name).toBe('Expo Closing and Industry Outlook');
    expect(result.data.sessions[6].start_date).toBe('2028-06-10');
    expect(result.data.sessions[6].start_time).toBe('15:00');
    expect(result.data.sessions[6].end_time).toBe('16:00');

    expect(result.data.ticket_types).toHaveLength(3);
    const tVisitor = ticketByHint(result.data.ticket_types, 'visitor');
    expect(tVisitor.name).toBe('Expo Visitor');
    expect(tVisitor.price).toBe(150000);
    expect(tVisitor.quantity_total).toBe(800);

    const tPro = ticketByHint(result.data.ticket_types, 'professional');
    expect(tPro.name).toBe('Industry Professional');
    expect(tPro.price).toBe(350000);
    expect(tPro.quantity_total).toBe(300);

    const tWorkshop = ticketByHint(result.data.ticket_types, 'workshop');
    expect(tWorkshop.name).toBe('Workshop Access');
    expect(tWorkshop.price).toBe(500000);
    expect(tWorkshop.quantity_total).toBe(100);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Culture Beats Festival 2028 from stage cue sheet with 6 performances, excluding 14:00 technical setup and DJ After-Party', async () => {
    const docText = `# TÀI LIỆU 2 — KỊCH BẢN ĐIỀU PHỐI SÂN KHẤU
## CULTURE BEATS FESTIVAL 2028

**Mã kịch bản:** CBF-SHOW-04  
**Ngày diễn:** 17/07/2028  
**Địa điểm:** Công viên Thống Nhất, Hà Nội  
**Đơn vị sản xuất:** Culture Beats Production  
**Phiên bản:** Kịch bản biểu diễn đã duyệt

> Tài liệu này được viết để điều phối MC, kỹ thuật âm thanh, ánh sáng và nghệ sĩ. Một số mốc thời gian là chỉ dẫn kỹ thuật, không phải phiên chương trình dành cho khách tham dự.

### CUE 01 — MỞ CỔNG

**14:00 — Kỹ thuật:** Bật hệ thống âm thanh khu vực khán giả. Màn hình LED hiển thị thông điệp chào mừng.

**14:30 — Điều phối:** Bắt đầu đón khách vào khu vực sự kiện.

Mốc 14:00 là thời điểm chuẩn bị kỹ thuật; 14:30 mới là giờ mở cửa dự kiến dành cho khách.

### CUE 02 — OPENING PERFORMANCE

**15:00–15:20**

MC: “Xin chào tất cả mọi người! Chào mừng đến với Culture Beats Festival 2028, nơi âm nhạc truyền thống gặp gỡ nhịp sống hiện đại.”

Nghệ sĩ biểu diễn: Culture Beats Ensemble.

Địa điểm: Main Stage.

Trạng thái: Đã xác nhận.

### CUE 03 — VIETNAMESE FOLK MUSIC REMIX

**15:30–16:15**

MC giới thiệu phần trình diễn kết hợp nhạc cụ dân tộc và âm nhạc điện tử.

Địa điểm: Main Stage.

Trạng thái: Đã xác nhận.

### CUE 04 — YOUNG ARTISTS SHOWCASE

**16:30–17:30**

Chương trình giới thiệu các nghệ sĩ trẻ đã được tuyển chọn.

Địa điểm: Community Stage.

Trạng thái: Đã xác nhận.

### CUE 05 — CULTURAL FASHION PRESENTATION

**18:00–18:45**

MC giới thiệu các bộ sưu tập lấy cảm hứng từ trang phục và họa tiết truyền thống.

Địa điểm: Main Stage.

Trạng thái: Đã xác nhận.

### CUE 06 — HEADLINE MUSIC PERFORMANCE

**19:15–20:45**

Tiết mục biểu diễn âm nhạc chính của lễ hội.

Địa điểm: Main Stage.

Tên nghệ sĩ khách mời chưa được công bố. Không tự điền tên nghệ sĩ vào dữ liệu sự kiện.

### CUE 07 — CLOSING PERFORMANCE

**21:00–21:20**

MC cảm ơn khách tham dự, nghệ sĩ và đơn vị đồng hành. Kết thúc chương trình sân khấu chính.

Địa điểm: Main Stage.

Trạng thái: Đã xác nhận.

### CUE 08 — AFTER-PARTY PROPOSAL

Một thành viên nhóm sản xuất đề xuất tổ chức DJ After-Party từ 21:30 đến 23:00.

**Ghi chú của quản lý chương trình:** Chưa được cấp phép và chưa có địa điểm. Không đưa hoạt động này vào lịch trình chính thức.

### THẺ ĐĂNG KÝ KHÁCH THAM DỰ

Ban tổ chức dự kiến bán hai loại vé:

| Loại vé | Giá | Số lượng |
|---|---:|---:|
| Festival Entry | 180.000 VND | 1.000 |
| Front Stage Access | 450.000 VND | 250 |

Festival Entry cho phép vào khu vực khán giả phổ thông.

Front Stage Access cho phép sử dụng khu vực xem biểu diễn ưu tiên theo hướng dẫn của ban tổ chức. Vé không bao gồm quyền gặp riêng nghệ sĩ.

Trường dữ liệu bắt buộc: họ tên và email. Front Stage Access yêu cầu bổ sung số điện thoại để gửi hướng dẫn check-in.

Chính sách hoàn tiền chưa được xác nhận.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('CULTURE BEATS FESTIVAL 2028');
    expect(result.data.venue_name).toMatch(/Công viên Thống Nhất/i);
    expect(result.data.province).toMatch(/Hà Nội/i);

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Opening Performance');
    expect(result.data.sessions[0].start_date).toBe('2028-07-17');
    expect(result.data.sessions[0].start_time).toBe('15:00');
    expect(result.data.sessions[0].end_time).toBe('15:20');
    expect(result.data.sessions[0].checkin_start_time).toBe('14:30');

    expect(result.data.sessions[5].session_name).toBe('Closing Performance');
    expect(result.data.sessions[5].start_time).toBe('21:00');
    expect(result.data.sessions[5].end_time).toBe('21:20');

    expect(result.data.ticket_types).toHaveLength(2);
    const entry = ticketByHint(result.data.ticket_types, 'festival');
    expect(entry.name).toBe('Festival Entry');
    expect(entry.price).toBe(180000);
    expect(entry.quantity_total).toBe(1000);

    const front = ticketByHint(result.data.ticket_types, 'front');
    expect(front.name).toBe('Front Stage Access');
    expect(front.price).toBe(450000);
    expect(front.quantity_total).toBe(250);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Mekong Culture & Food Week 2028 from travel itinerary with 6 sessions and 3 tickets', async () => {
    const docText = `# TÀI LIỆU 3 — BẢN TIN TRẢI NGHIỆM VÀ LỊCH TRÌNH DU LỊCH
## MEKONG CULTURE & FOOD WEEK 2028

**Đơn vị phát hành:** Mekong Experience Network  
**Mã bản tin:** MEFN-028  
**Thời gian chương trình:** 21–22/08/2028  
**Địa điểm trung tâm:** Công viên Sông Hậu, Cần Thơ

Mekong Culture & Food Week 2028 là chương trình khám phá văn hóa ẩm thực, nghệ thuật dân gian và sản phẩm địa phương vùng Đồng bằng sông Cửu Long.

Trong hai ngày diễn ra chương trình, khách tham dự có thể tìm hiểu văn hóa địa phương thông qua các hoạt động trình diễn, giao lưu và trải nghiệm ẩm thực.

### Hành trình ngày thứ nhất — 21/08/2028

**09:00–10:00 | Mekong Cultural Opening**

Chương trình khai mạc giới thiệu nghệ thuật truyền thống và các nét văn hóa đặc trưng của vùng sông nước.

Địa điểm: Riverside Stage.

**10:30–12:00 | Traditional Craft Demonstration**

Nghệ nhân địa phương trình diễn các kỹ thuật thủ công truyền thống.

Địa điểm: Craft Experience Zone.

**13:30–15:00 | Mekong Cuisine Experience**

Khách tham dự tìm hiểu nguyên liệu, cách chế biến và câu chuyện đằng sau một số món ăn địa phương.

Địa điểm: Food Experience Pavilion.

### Hành trình ngày thứ hai — 22/08/2028

**09:00–10:30 | Folk Music and Dance Showcase**

Chương trình biểu diễn âm nhạc và múa dân gian.

Địa điểm: Riverside Stage.

**11:00–12:30 | Local Product Discovery**

Giới thiệu các sản phẩm đặc trưng của địa phương và câu chuyện của những nhà sản xuất nhỏ.

Địa điểm: Local Product Zone.

**14:00–15:30 | Mekong Community Exchange**

Hoạt động giao lưu giữa cộng đồng địa phương, nghệ nhân và khách tham dự.

Địa điểm: Riverside Stage.

### Thông tin chưa xác nhận

Một chuyến tham quan chợ nổi vào sáng ngày 22/08 đang được đơn vị lữ hành đề xuất. Chưa có giờ khởi hành, điểm tập trung hoặc xác nhận phương tiện. Chuyến tham quan này không thuộc lịch chương trình chính thức của sự kiện.

Bản tin cũng đề cập khả năng tổ chức một bữa tối giới thiệu món ăn vùng miền. Thời gian và địa điểm chưa được chốt. Không tự động tạo hoạt động này.

### Thông tin đăng ký trải nghiệm

| Gói | Giá | Số lượng |
|---|---:|---:|
| Culture Visitor | 120.000 VND | 600 |
| Food Explorer | 280.000 VND | 200 |
| Craft Experience | 220.000 VND | 150 |

Culture Visitor cho phép tham dự các hoạt động mở cửa thông thường.

Food Explorer bao gồm quyền tham gia một hoạt động trải nghiệm ẩm thực theo lịch đăng ký.

Craft Experience bao gồm quyền tham gia một buổi trình diễn thủ công có hướng dẫn. Người mua cần đăng ký khung giờ riêng sau khi mua vé.

Các gói trải nghiệm không bao gồm chi phí di chuyển đến Cần Thơ hoặc lưu trú.

Tất cả người đăng ký phải cung cấp họ tên và email. Food Explorer và Craft Experience yêu cầu thêm số điện thoại.

Ban tổ chức chưa công bố chính sách hoàn tiền.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('MEKONG CULTURE & FOOD WEEK 2028');
    expect(result.data.venue_name).toMatch(/Công viên Sông Hậu/i);
    expect(result.data.province).toMatch(/Cần Thơ/i);

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Mekong Cultural Opening');
    expect(result.data.sessions[0].start_date).toBe('2028-08-21');
    expect(result.data.sessions[0].start_time).toBe('09:00');
    expect(result.data.sessions[0].end_time).toBe('10:00');

    expect(result.data.sessions[3].session_name).toBe('Folk Music and Dance Showcase');
    expect(result.data.sessions[3].start_date).toBe('2028-08-22');
    expect(result.data.sessions[3].start_time).toBe('09:00');
    expect(result.data.sessions[3].end_time).toBe('10:30');

    expect(result.data.ticket_types).toHaveLength(3);
    const tCulture = ticketByHint(result.data.ticket_types, 'culture');
    expect(tCulture.name).toBe('Culture Visitor');
    expect(tCulture.price).toBe(120000);
    expect(tCulture.quantity_total).toBe(600);

    const tFood = ticketByHint(result.data.ticket_types, 'food');
    expect(tFood.name).toBe('Food Explorer');
    expect(tFood.price).toBe(280000);
    expect(tFood.quantity_total).toBe(200);

    const tCraft = ticketByHint(result.data.ticket_types, 'craft');
    expect(tCraft.name).toBe('Craft Experience');
    expect(tCraft.price).toBe(220000);
    expect(tCraft.quantity_total).toBe(150);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Healthcare Digital Transformation Conference 2028 from service request form with 4 sessions and 3 passes', async () => {
    const docText = `# TÀI LIỆU 4 — PHIẾU YÊU CẦU DỊCH VỤ VÀ ĐĂNG KÝ HỘI THẢO
## HEALTHCARE DIGITAL TRANSFORMATION CONFERENCE 2028

**Mã yêu cầu:** HDTC-SRV-0828  
**Đơn vị đặt dịch vụ:** Healthcare Technology Network  
**Đơn vị vận hành:** HTN Conference Operations  
**Trạng thái:** Đã xác nhận nội dung hội thảo

## FORM A — THÔNG TIN SỰ KIỆN

**Tên:** Healthcare Digital Transformation Conference 2028

**Ngày tổ chức:** 05/09/2028

**Địa điểm:** International Convention Center, 11 Lê Hồng Phong, Hà Nội.

**Mục đích:** Thảo luận về hồ sơ y tế điện tử, ứng dụng AI trong vận hành bệnh viện và bảo mật dữ liệu y tế.

### FORM B — YÊU CẦU BỐ TRÍ PHÒNG

| Mã phòng | Tên phòng | Công năng | Sức chứa được xác nhận |
|---|---|---|---:|
| H01 | Main Auditorium | Hội thảo chính | 300 |
| H02 | Clinical Innovation Room | Phiên chuyên đề | 80 |
| H03 | Technology Demonstration Lab | Trình diễn công nghệ | Chưa xác nhận |

Sức chứa được cung cấp ở trên là giới hạn của từng phòng, không phải số lượng vé phát hành.

## FORM C — PHIẾU XÁC NHẬN CHƯƠNG TRÌNH

**SESSION 01**

- Tên: Digital Health Systems in Modern Hospitals
- Ngày: 05/09/2028
- Bắt đầu: 08:30
- Kết thúc: 09:45
- Phòng: H01
- Check-in: 08:00
- Trạng thái: Confirmed.

**SESSION 02**

- Tên: Artificial Intelligence in Clinical Operations
- Ngày: 05/09/2028
- Bắt đầu: 10:00
- Kết thúc: 11:15
- Phòng: H01
- Trạng thái: Confirmed.

**SESSION 03**

- Tên: Electronic Medical Record Integration Workshop
- Ngày: 05/09/2028
- Bắt đầu: 13:00
- Kết thúc: 14:30
- Phòng: H02
- Trạng thái: Confirmed.

**SESSION 04**

- Tên: Protecting Patient Data in Digital Healthcare
- Ngày: 05/09/2028
- Bắt đầu: 15:00
- Kết thúc: 16:00
- Phòng: H01
- Trạng thái: Confirmed.

Một yêu cầu dịch vụ bổ sung đề nghị bố trí buổi tham quan phòng trình diễn công nghệ vào 16:30. Bộ phận vận hành chưa xác nhận thời gian và phòng H03 chưa có sức chứa được duyệt. Hoạt động này không nằm trong chương trình chính thức.

## FORM D — DANH MỤC VÉ

| Mã | Tên vé | Giá | Hạn mức |
|---|---|---:|---:|
| HD-01 | Healthcare Professional | 400.000 VND | 250 |
| HD-02 | Hospital Management Pass | 750.000 VND | 80 |
| HD-03 | Digital Health Workshop Pass | 600.000 VND | 60 |

**Healthcare Professional:** Quyền tham dự các phiên hội thảo thông thường.

**Hospital Management Pass:** Quyền tham dự hội thảo và sử dụng khu vực networking dành cho quản lý cơ sở y tế.

**Digital Health Workshop Pass:** Quyền tham dự hội thảo và đăng ký một workshop còn chỗ.

### FORM E — THÔNG TIN ĐĂNG KÝ

Các trường bắt buộc cho tất cả loại vé:

- Họ tên.
- Email.
- Đơn vị công tác.

Riêng Digital Health Workshop Pass yêu cầu thêm số điện thoại.

Người mua Hospital Management Pass phải khai báo chức danh công việc.

### FORM F — ĐIỀU KIỆN DỊCH VỤ

Ban tổ chức yêu cầu hệ thống đăng ký gửi email xác nhận sau khi hoàn thành thanh toán.

Tài liệu này không quy định thời hạn hoàn tiền. Không có dữ liệu được phê duyệt về chính sách hủy đăng ký.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('HEALTHCARE DIGITAL TRANSFORMATION CONFERENCE 2028');
    expect(result.data.venue_name).toMatch(/International Convention Center/i);
    expect(result.data.address_line).toMatch(/11 Lê Hồng Phong/i);
    expect(result.data.province).toMatch(/Hà Nội/i);

    expect(result.data.sessions).toHaveLength(4);
    expect(result.data.sessions[0].session_name).toBe('Digital Health Systems in Modern Hospitals');
    expect(result.data.sessions[0].start_date).toBe('2028-09-05');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('09:45');
    expect(result.data.sessions[0].checkin_start_time).toBe('08:00');

    expect(result.data.sessions[1].session_name).toBe('Artificial Intelligence in Clinical Operations');
    expect(result.data.sessions[2].session_name).toBe('Electronic Medical Record Integration Workshop');
    expect(result.data.sessions[3].session_name).toBe('Protecting Patient Data in Digital Healthcare');

    expect(result.data.ticket_types).toHaveLength(3);
    const tHp = ticketByHint(result.data.ticket_types, 'professional');
    expect(tHp.name).toBe('Healthcare Professional');
    expect(tHp.price).toBe(400000);
    expect(tHp.quantity_total).toBe(250);

    const tHm = ticketByHint(result.data.ticket_types, 'hospital');
    expect(tHm.name).toBe('Hospital Management Pass');
    expect(tHm.price).toBe(750000);
    expect(tHm.quantity_total).toBe(80);

    const tWs = ticketByHint(result.data.ticket_types, 'workshop');
    expect(tWs.name).toBe('Digital Health Workshop Pass');
    expect(tWs.price).toBe(600000);
    expect(tWs.quantity_total).toBe(60);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract International Robotics Challenge 2028 resolving conflicting draft records into 6 confirmed sessions, 3 approved tickets and Day 1 checkin', async () => {
    const docText = `# TÀI LIỆU 5 — BẢN GHI DỮ LIỆU SỰ KIỆN NHẬP TỪ NHIỀU NGUỒN
## INTERNATIONAL ROBOTICS CHALLENGE 2028

**Mã hồ sơ:** IRC-IMPORT-2028  
**Nguồn dữ liệu:** Form đăng ký nội bộ, bảng tính vận hành và ghi chú của ban tổ chức  
**Mục tiêu:** Kiểm tra khả năng tổng hợp dữ liệu không đồng nhất  
**Trạng thái:** Cần đối chiếu các trường mâu thuẫn trước khi xuất bản

> Tài liệu này cố ý giữ lại các bản ghi mâu thuẫn. Không được tự chọn một giá trị chỉ vì nó xuất hiện nhiều lần. Những trường không thể xác minh phải được đánh dấu để kiểm tra hoặc giữ trống theo schema.

## RECORD 001 — EVENT REGISTRATION FORM

\`\`\`text
event_name: International Robotics Challenge 2028
event_date: 2028-10-14
event_end_date: 2028-10-15
venue_name: Da Nang Innovation Center
address: 02 Quang Trung, Da Nang
status: approved
\`\`\`

## RECORD 002 — OPERATIONS SPREADSHEET

\`\`\`text
event_title: International Robotics Challenge
start_date: 2028-10-14
end_date: 2028-10-16
venue: Da Nang Innovation Center
venue_address: 02 Quang Trung, Hai Chau, Da Nang
status: draft
last_updated: 2028-07-20
\`\`\`

## RECORD 003 — APPROVED EVENT NOTICE

Thông báo của ban tổ chức ghi rõ International Robotics Challenge 2028 sẽ diễn ra trong hai ngày 14 và 15/10/2028.

Địa điểm là Da Nang Innovation Center. Địa chỉ được xác nhận trong thông báo là 02 Quang Trung, Đà Nẵng.

Ngày 16/10 xuất hiện trong một bảng vận hành cũ nhưng không thuộc thời gian tổ chức đã được phê duyệt.

## RECORD 004 — SESSION NOTES

Hoạt động “Robotics Opening Ceremony” diễn ra ngày 14/10/2028, từ 08:30 đến 09:00 tại Main Arena.

Hoạt động “Autonomous Robot Challenge” diễn ra cùng ngày từ 09:30 đến 12:00 tại Main Arena.

Hoạt động “Robotics Engineering Workshop” diễn ra ngày 14/10/2028, từ 13:30 đến 15:00 tại Lab A.

Ngày 15/10/2028, “Industrial Robotics Demonstration” diễn ra từ 09:00 đến 10:30 tại Main Arena.

“Student Robotics Final” diễn ra từ 11:00 đến 12:30 ngày 15/10/2028 tại Main Arena.

“Closing and Awards Ceremony” diễn ra từ 15:00 đến 16:00 ngày 15/10/2028 tại Main Arena.

Cả sáu hoạt động trên đều được đánh dấu là đã xác nhận.

## RECORD 005 — UNAPPROVED ADDITION

Một email đề xuất mở cửa khu trải nghiệm robot vào ngày 16/10/2028.

Email không ghi thời gian mở cửa, địa điểm cụ thể hoặc quyết định phê duyệt.

Không đưa khu trải nghiệm này vào lịch trình chính thức.

## RECORD 006 — TICKET EXPORT

\`\`\`csv
ticket_name,price,quantity,status
General Robotics Pass,200000,500,approved
Engineering Workshop Pass,450000,120,approved
VIP Robotics Pass,800000,50,approved
Student Robotics Pass,100000,200,draft
\`\`\`

## RECORD 007 — TICKET POLICY

Ba loại vé đã được xác nhận:

**General Robotics Pass:** 200.000 VND, tối đa 500 vé. Cho phép tham dự các hoạt động mở cửa dành cho khách thông thường.

**Engineering Workshop Pass:** 450.000 VND, tối đa 120 vé. Bao gồm quyền đăng ký một workshop, tùy thuộc số chỗ.

**VIP Robotics Pass:** 800.000 VND, tối đa 50 vé. Bao gồm quyền sử dụng khu vực xem biểu diễn ưu tiên và nhận bộ quà tặng sự kiện.

Student Robotics Pass xuất hiện trong bản xuất dữ liệu nháp, nhưng chưa được phê duyệt. Không được coi đây là loại vé chính thức.

## RECORD 008 — REGISTRATION REQUIREMENTS

Tất cả người đăng ký phải cung cấp họ tên và email.

Engineering Workshop Pass yêu cầu số điện thoại.

VIP Robotics Pass yêu cầu tên tổ chức hoặc trường học.

Chưa có quy định bắt buộc cung cấp thông tin trường học cho General Robotics Pass.

## RECORD 009 — CHECK-IN NOTES

Một ghi chú vận hành viết: “Check-in begins at 07:45 on the first day.”

Ghi chú không xác nhận giờ check-in cho ngày thứ hai.

Không được suy ra rằng giờ check-in ngày thứ hai cũng là 07:45.

## RECORD 010 — REFUND POLICY

Bảng tính nội bộ có dòng “Refund period: 5 business days”.

Tuy nhiên, ghi chú của quản lý tài chính ghi rõ: “Chính sách hoàn tiền chưa được phê duyệt; không sử dụng thời hạn trong bảng tính để công bố cho khách hàng.”

Do đó, chính sách hoàn tiền chính thức vẫn chưa được xác nhận.`;

    const result = await aiDocumentParserService.extractEventFromText(docText);
    expect(result.data.title).toBe('INTERNATIONAL ROBOTICS CHALLENGE 2028');
    expect(result.data.venue_name).toMatch(/Da Nang Innovation Center/i);
    expect(result.data.address_line).toMatch(/02 Quang Trung/i);
    expect(result.data.province).toMatch(/Đà Nẵng/i);

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Robotics Opening Ceremony');
    expect(result.data.sessions[0].start_date).toBe('2028-10-14');
    expect(result.data.sessions[0].start_time).toBe('08:30');
    expect(result.data.sessions[0].end_time).toBe('09:00');
    expect(result.data.sessions[0].checkin_start_time).toBe('07:45');

    expect(result.data.sessions[3].session_name).toBe('Industrial Robotics Demonstration');
    expect(result.data.sessions[3].start_date).toBe('2028-10-15');
    expect(result.data.sessions[3].start_time).toBe('09:00');
    expect(result.data.sessions[3].end_time).toBe('10:30');
    expect(result.data.sessions[3].checkin_start_time).toBe('');

    // Chỉ có 3 loại vé được phê duyệt (Student Robotics Pass là draft bị loại bỏ)
    expect(result.data.ticket_types).toHaveLength(3);
    const tGen = ticketByHint(result.data.ticket_types, 'general');
    expect(tGen.name).toBe('General Robotics Pass');
    expect(tGen.price).toBe(200000);
    expect(tGen.quantity_total).toBe(500);

    const tEng = ticketByHint(result.data.ticket_types, 'engineering');
    expect(tEng.name).toBe('Engineering Workshop Pass');
    expect(tEng.price).toBe(450000);
    expect(tEng.quantity_total).toBe(120);

    const tVip = ticketByHint(result.data.ticket_types, 'vip');
    expect(tVip.name).toBe('VIP Robotics Pass');
    expect(tVip.price).toBe(800000);
    expect(tVip.quantity_total).toBe(50);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract National Young Scientists Challenge 2028 with 7 sessions and 2 team/observer tickets', async () => {
    const doc = `# TÀI LIỆU 1 — HỒ SƠ CUỘC THI HỌC THUẬT
# NATIONAL YOUNG SCIENTISTS CHALLENGE 2028

**Mã hồ sơ:** NYSC-28-AC  
**Đơn vị tổ chức:** Vietnam Young Researchers Network  
**Loại tài liệu:** Hồ sơ cuộc thi và quy chế tổ chức  
**Trạng thái:** Chương trình chính thức đã được phê duyệt

## A. Giới thiệu cuộc thi

National Young Scientists Challenge 2028 là cuộc thi dành cho sinh viên đại học có dự án nghiên cứu thuộc các lĩnh vực khoa học tự nhiên, công nghệ sinh học và khoa học môi trường.

Cuộc thi diễn ra từ ngày 10/04/2028 đến ngày 12/04/2028 tại Đại học Khoa học Tự nhiên, Đại học Quốc gia Thành phố Hồ Chí Minh, 227 Nguyễn Văn Cừ, Thành phố Hồ Chí Minh.

Các đội thi sẽ trải qua vòng trình bày đề tài, phản biện chuyên môn và vòng chung kết.

## B. Quy trình tổ chức

### Ngày 10/04/2028 — Preliminary Round

**Hoạt động:** Research Proposal Presentation  
**Thời gian:** 08:00–10:00  
**Địa điểm:** Lecture Hall A

**Hoạt động:** Scientific Poster Exhibition  
**Thời gian:** 10:30–12:00  
**Địa điểm:** Research Exhibition Area

**Hoạt động:** Research Methodology Workshop  
**Thời gian:** 13:30–15:00  
**Địa điểm:** Laboratory Building, Room 201

### Ngày 11/04/2028 — Evaluation Round

**Hoạt động:** Scientific Debate and Peer Review  
**Thời gian:** 09:00–11:00  
**Địa điểm:** Lecture Hall A

**Hoạt động:** Prototype Demonstration  
**Thời gian:** 13:00–15:00  
**Địa điểm:** Innovation Laboratory

### Ngày 12/04/2028 — Final Round

**Hoạt động:** Finalist Presentation  
**Thời gian:** 09:00–11:30  
**Địa điểm:** Main Auditorium

**Hoạt động:** Awards Ceremony  
**Thời gian:** 14:00–15:30  
**Địa điểm:** Main Auditorium

Các hoạt động trên đều đã được phê duyệt. Ban tổ chức chưa xác nhận sức chứa của Lecture Hall A và Main Auditorium.

## C. Quy định đăng ký

Cuộc thi có hai hình thức đăng ký.

**Research Team Registration**
- Phí đăng ký: 300.000 VND/đội.
- Số lượng: 60 đội.
- Mỗi đội được đăng ký tối đa 5 thành viên.
- Hồ sơ bắt buộc: tên đội, họ tên trưởng nhóm, email liên hệ và tên trường đại học.

**Observer Pass**
- Phí đăng ký: 100.000 VND/người.
- Số lượng: 200 vé.
- Cho phép tham dự các hoạt động mở cửa dành cho người quan sát.
- Không bao gồm quyền tham gia chấm điểm hoặc phản biện chính thức.

Người đăng ký Observer Pass cần cung cấp họ tên và email.

## D. Đề xuất chưa phê duyệt

Ban tổ chức đang xem xét tổ chức một chuyến tham quan phòng nghiên cứu vào chiều ngày 12/04/2028. Chưa có lịch trình hoặc phòng thí nghiệm được xác nhận.

Hoạt động này không thuộc chương trình chính thức.

## E. Chính sách

Quy định về hoàn phí đăng ký chưa được công bố. Không tự suy luận rằng người dự thi được hoàn phí nếu rút khỏi cuộc thi.

**Từ khóa:** Scientific Research, Student Competition, Biotechnology, Environmental Science, Innovation, Academic Challenge.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toBe('NATIONAL YOUNG SCIENTISTS CHALLENGE 2028');
    expect(result.data.venue_name).toMatch(/Đại học Khoa học Tự nhiên/i);
    expect(result.data.address_line).toContain('227 Nguyễn Văn Cừ');
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);
    expect(result.data.start_date).toBe('2028-04-10');
    expect(result.data.end_date).toBe('2028-04-12');

    expect(result.data.sessions).toHaveLength(7);
    expect(result.data.sessions[0].session_name).toBe('Research Proposal Presentation');
    expect(result.data.sessions[0].start_date).toBe('2028-04-10');
    expect(result.data.sessions[0].start_time).toBe('08:00');
    expect(result.data.sessions[0].end_time).toBe('10:00');
    expect(result.data.sessions[6].session_name).toBe('Awards Ceremony');
    expect(result.data.sessions[6].start_date).toBe('2028-04-12');
    expect(result.data.sessions[6].start_time).toBe('14:00');
    expect(result.data.sessions[6].end_time).toBe('15:30');

    expect(result.data.ticket_types).toHaveLength(2);
    const teamTicket = ticketByHint(result.data.ticket_types, 'research team');
    expect(teamTicket.price).toBe(300000);
    expect(teamTicket.quantity_total).toBe(60);

    const observerTicket = ticketByHint(result.data.ticket_types, 'observer');
    expect(observerTicket.price).toBe(100000);
    expect(observerTicket.quantity_total).toBe(200);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Handmade & Design Market 2028 with 6 sessions and 2 visitor ticket types, excluding booth rentals', async () => {
    const doc = `# TÀI LIỆU 2 — SỔ TAY VẬN HÀNH HỘI CHỢ
# HANDMADE & DESIGN MARKET 2028

**Mã sổ tay:** HDM-OPS-081  
**Đơn vị vận hành:** Creative Market Collective  
**Loại tài liệu:** Sổ tay dành cho ban tổ chức, nhà bán hàng và khách tham dự

## 1. Thông tin địa điểm

Handmade & Design Market 2028 là hội chợ giới thiệu sản phẩm thủ công, thiết kế độc lập, đồ trang trí và các sản phẩm sáng tạo.

Địa điểm tổ chức là Nhà thi đấu Nguyễn Du, 116 Nguyễn Du, Thành phố Hồ Chí Minh.

Hội chợ mở cửa trong hai ngày 19 và 20/08/2028.

Giờ mở cửa dành cho khách tham quan:
- Ngày 19/08: 09:00–18:00.
- Ngày 20/08: 09:00–17:00.

Các mốc giờ trên là giờ mở cửa hội chợ, không phải giờ bắt đầu của từng hoạt động sân khấu.

## 2. Lịch hoạt động

### Hoạt động tại Design Stage

| Ngày | Tên hoạt động | Bắt đầu | Kết thúc |
|---|---|---|---|
| 19/08/2028 | Independent Design Trends | 10:00 | 11:00 |
| 19/08/2028 | Sustainable Packaging Talk | 13:00 | 14:00 |
| 20/08/2028 | Handmade Business Stories | 10:30 | 11:30 |
| 20/08/2028 | Creative Product Presentation | 14:00 | 15:00 |

### Hoạt động tại Workshop Corner

**Ceramic Painting Workshop**

Ngày: 19/08/2028  
Thời gian: 11:30–13:00  
Số chỗ: 35 người.

**Handmade Paper Craft**

Ngày: 20/08/2028  
Thời gian: 09:30–11:00  
Số chỗ: 25 người.

**Natural Dye Demonstration**

Ngày: 20/08/2028  
Thời gian: 13:00–14:30  
Số chỗ: chưa xác nhận.

Tất cả sáu hoạt động nêu trên đã được xác nhận.

## 3. Quy định dành cho gian hàng

Ban tổ chức dự kiến bố trí 80 gian hàng.

| Loại gian hàng | Phí tham gia | Số lượng |
|---|---:|---:|
| Standard Booth | 1.500.000 VND | 50 |
| Premium Booth | 2.800.000 VND | 20 |
| Food & Beverage Booth | 3.500.000 VND | 10 |

Standard Booth dành cho các sản phẩm thủ công và thiết kế.

Premium Booth có diện tích trưng bày lớn hơn theo sơ đồ mặt bằng được duyệt.

Food & Beverage Booth dành cho các đơn vị kinh doanh thực phẩm và đồ uống đáp ứng điều kiện vận hành của ban tổ chức.

Các khoản phí trên là phí thuê gian hàng dành cho đơn vị triển lãm, không phải giá vé dành cho khách tham quan.

## 4. Vé khách tham quan

Khách tham quan có thể lựa chọn:

- **Daily Entry:** 50.000 VND, hạn mức 1.000 vé/ngày.
- **Weekend Pass:** 80.000 VND, hạn mức 600 vé.

Daily Entry chỉ có hiệu lực trong một ngày do khách chọn.

Weekend Pass cho phép vào hội chợ trong cả hai ngày.

Các workshop có thể yêu cầu phí đăng ký riêng. Việc sở hữu vé vào cửa không bảo đảm có chỗ trong workshop.

Người mua vé cần cung cấp họ tên và email. Người đăng ký workshop phải cung cấp thêm số điện thoại.

## 5. Nội dung chưa xác nhận

Ban tổ chức đang cân nhắc tổ chức một buổi đấu giá sản phẩm thiết kế vào cuối ngày 20/08. Chưa có thời gian cụ thể, danh sách sản phẩm hoặc quyết định phê duyệt.

Không đưa buổi đấu giá vào lịch chính thức.

Chính sách hoàn tiền vé chưa được công bố.

**Từ khóa:** Handmade, Independent Design, Craft Market, Sustainable Packaging, Creative Business, Local Products.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toBe('HANDMADE & DESIGN MARKET 2028');
    expect(result.data.venue_name).toMatch(/Nhà thi đấu Nguyễn Du/i);
    expect(result.data.address_line).toContain('116 Nguyễn Du');
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);
    expect(result.data.start_date).toBe('2028-08-19');
    expect(result.data.end_date).toBe('2028-08-20');

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Independent Design Trends');
    expect(result.data.sessions[0].start_date).toBe('2028-08-19');
    expect(result.data.sessions[4].session_name).toBe('Ceramic Painting Workshop');
    expect(result.data.sessions[4].start_date).toBe('2028-08-19');

    expect(result.data.ticket_types).toHaveLength(2);
    const dailyTicket = ticketByHint(result.data.ticket_types, 'daily entry');
    expect(dailyTicket.price).toBe(50000);
    expect(dailyTicket.quantity_total).toBe(1000);

    const weekendTicket = ticketByHint(result.data.ticket_types, 'weekend pass');
    expect(weekendTicket.price).toBe(80000);
    expect(weekendTicket.quantity_total).toBe(600);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract Midnight Stories 2028 with 5 chapters and 3 tickets, excluding autograph session', async () => {
    const doc = `# TÀI LIỆU 3 — BẢN PHÁT HÀNH ALBUM VÀ LỊCH BIỂU DIỄN
# MIDNIGHT STORIES — LIVE ALBUM PREMIERE 2028

**Mã phát hành:** MS-LAP-2028  
**Đơn vị sản xuất:** Midnight Sound Studio  
**Loại tài liệu:** Press kit dành cho báo chí và đối tác truyền thông

## Thông cáo báo chí

Midnight Sound Studio giới thiệu sự kiện Midnight Stories — Live Album Premiere 2028, chương trình ra mắt album kết hợp biểu diễn trực tiếp, giao lưu sáng tạo và triển lãm hình ảnh hậu trường.

Sự kiện được tổ chức vào ngày 07/10/2028 tại Nhà hát Hòa Bình, 240 Đường 3 Tháng 2, Thành phố Hồ Chí Minh.

Chương trình tập trung vào trải nghiệm âm nhạc trực tiếp và quá trình sáng tác album mới.

## Lịch biểu diễn

### Chapter One — Behind the Album

**Thời gian:** 17:30–18:00  
**Địa điểm:** Foyer Gallery

Nội dung: Giới thiệu hình ảnh hậu trường và câu chuyện hình thành album.

### Chapter Two — Acoustic Session

**Thời gian:** 18:15–18:45  
**Địa điểm:** Main Theatre

Nội dung: Biểu diễn acoustic các ca khúc được lựa chọn từ album.

### Chapter Three — Official Album Premiere

**Thời gian:** 19:00–19:30  
**Địa điểm:** Main Theatre

Nội dung: Công bố album và phát hành phiên bản nghe thử dành cho khách tham dự.

### Chapter Four — Live Band Performance

**Thời gian:** 19:45–21:00  
**Địa điểm:** Main Theatre

Nội dung: Biểu diễn trực tiếp cùng ban nhạc.

### Chapter Five — Artist Talk

**Thời gian:** 21:15–21:45  
**Địa điểm:** Main Theatre

Nội dung: Chia sẻ về quá trình sáng tác và sản xuất âm nhạc.

Năm hoạt động trên thuộc chương trình chính thức.

## Chính sách vé

| Loại vé | Giá | Số lượng |
|---|---:|---:|
| Balcony Seat | 350.000 VND | 300 |
| Standard Seat | 550.000 VND | 250 |
| Soundcheck Experience | 1.200.000 VND | 50 |

**Balcony Seat:** Chỗ ngồi tại khu vực ban công.

**Standard Seat:** Chỗ ngồi tại khu vực tiêu chuẩn của nhà hát.

**Soundcheck Experience:** Bao gồm vé xem chương trình và quyền tham dự buổi soundcheck được tổ chức theo hướng dẫn riêng của ban tổ chức.

Thời gian soundcheck chưa được công bố. Không tự động tạo một phiên chính thức từ quyền lợi này.

Người mua phải cung cấp họ tên và email. Soundcheck Experience yêu cầu thêm số điện thoại để nhận hướng dẫn.

## Hoạt động chưa được xác nhận

Một đề xuất tổ chức buổi ký tặng album sau chương trình đang được xem xét. Chưa có giờ bắt đầu, địa điểm cụ thể hoặc danh sách nghệ sĩ tham gia.

Không coi hoạt động ký tặng là một phần của lịch trình đã phê duyệt.

Chính sách hoàn tiền và đổi vé chưa được công bố.

## Từ khóa

Live Music, Album Premiere, Acoustic Performance, Music Production, Artist Talk, Live Band.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toBe('MIDNIGHT STORIES — LIVE ALBUM PREMIERE 2028');
    expect(result.data.venue_name).toMatch(/Nhà hát Hòa Bình/i);
    expect(result.data.address_line).toContain('240 Đường 3 Tháng 2');
    expect(result.data.province).toMatch(/Hồ Chí Minh/i);
    expect(result.data.start_date).toBe('2028-10-07');
    expect(result.data.end_date).toBe('2028-10-07');

    expect(result.data.sessions).toHaveLength(5);
    expect(result.data.sessions[0].session_name).toBe('Chapter One — Behind the Album');
    expect(result.data.sessions[0].start_time).toBe('17:30');
    expect(result.data.sessions[0].end_time).toBe('18:00');
    expect(result.data.sessions[4].session_name).toBe('Chapter Five — Artist Talk');
    expect(result.data.sessions[4].start_time).toBe('21:15');
    expect(result.data.sessions[4].end_time).toBe('21:45');

    expect(result.data.ticket_types).toHaveLength(3);
    const balconyTicket = ticketByHint(result.data.ticket_types, 'balcony');
    expect(balconyTicket.price).toBe(350000);
    expect(balconyTicket.quantity_total).toBe(300);

    const standardTicket = ticketByHint(result.data.ticket_types, 'standard');
    expect(standardTicket.price).toBe(550000);
    expect(standardTicket.quantity_total).toBe(250);

    const soundcheckTicket = ticketByHint(result.data.ticket_types, 'soundcheck');
    expect(soundcheckTicket.price).toBe(1200000);
    expect(soundcheckTicket.quantity_total).toBe(50);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract City Night Run 2028 with 6 sessions and 3 runner distance tickets', async () => {
    const doc = `# TÀI LIỆU 4 — ĐẶC TẢ GIẢI THỂ THAO
# CITY NIGHT RUN 2028

**Mã giải:** CNR-2028  
**Đơn vị tổ chức:** Urban Sports Association  
**Loại tài liệu:** Điều lệ giải và hướng dẫn vận động viên

## I. Thông tin chung

City Night Run 2028 là giải chạy cộng đồng tổ chức vào tối ngày 25/11/2028 tại Công viên Yên Sở, Hà Nội.

Giải có các cự ly 3 km, 5 km và 10 km, hướng tới vận động viên phong trào và người yêu thích hoạt động thể thao.

Khu vực xuất phát và về đích đặt tại Main Event Plaza.

## II. Lịch hoạt động

| Hoạt động | Thời gian | Địa điểm |
|---|---|---|
| Participant Check-in | 15:00–17:00 | Registration Tent |
| Warm-up and Safety Briefing | 17:15–17:45 | Main Event Plaza |
| 3 KM Community Run | 18:00–19:00 | Route A |
| 5 KM Night Run | 18:15–20:00 | Route B |
| 10 KM Challenge | 18:30–21:00 | Route C |
| Awards and Closing Ceremony | 21:15–21:45 | Main Event Plaza |

Các mốc giờ và hoạt động trong bảng là lịch chính thức.

Thời gian hoàn thành ở từng cự ly là khung vận hành dự kiến của ban tổ chức, không phải giới hạn thời gian bắt buộc đối với từng vận động viên.

## III. Hạng mục đăng ký

### Community Runner — 3 KM

- Giá: 180.000 VND.
- Số lượng: 500 suất.
- Đối tượng: người tham gia giải chạy cộng đồng.

### Night Runner — 5 KM

- Giá: 280.000 VND.
- Số lượng: 700 suất.
- Đối tượng: người đăng ký cự ly 5 km.

### Challenge Runner — 10 KM

- Giá: 400.000 VND.
- Số lượng: 300 suất.
- Đối tượng: người đăng ký cự ly 10 km.

Các mức giá trên là phí đăng ký theo từng cự ly. Không được hiểu là giá thuê thiết bị hoặc phí tổ chức.

Người đăng ký cần cung cấp họ tên, email, số điện thoại và ngày sinh để phục vụ công tác quản lý vận động viên.

## IV. Điều kiện tham gia

Người tham gia phải tuân thủ hướng dẫn an toàn của ban tổ chức.

Người đăng ký cự ly 10 km được yêu cầu xác nhận đã đọc hướng dẫn an toàn trước khi hoàn tất đăng ký.

Các yêu cầu này là điều kiện tham gia, không phải các phiên chương trình độc lập.

## V. Hoạt động phụ trợ

Ban tổ chức đang cân nhắc bố trí khu trải nghiệm thiết bị thể thao trước giờ xuất phát. Chưa có thời gian hoạt động, danh sách nhà cung cấp hoặc vị trí chính thức.

Hoạt động chưa được phê duyệt không được đưa vào lịch trình chính.

## VI. Hoàn phí

Tài liệu hiện tại chưa xác định chính sách hoàn phí khi vận động viên hủy đăng ký hoặc không thể tham gia.

## VII. Từ khóa

Night Run, Community Sports, Running, Fitness, Urban Sports, Outdoor Event.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toBe('CITY NIGHT RUN 2028');
    expect(result.data.venue_name).toMatch(/Công viên Yên Sở/i);
    expect(result.data.province).toMatch(/Hà Nội/i);
    expect(result.data.start_date).toBe('2028-11-25');
    expect(result.data.end_date).toBe('2028-11-25');

    expect(result.data.sessions).toHaveLength(6);
    expect(result.data.sessions[0].session_name).toBe('Participant Check-in');
    expect(result.data.sessions[0].start_time).toBe('15:00');
    expect(result.data.sessions[0].end_time).toBe('17:00');
    expect(result.data.sessions[5].session_name).toBe('Awards and Closing Ceremony');
    expect(result.data.sessions[5].start_time).toBe('21:15');
    expect(result.data.sessions[5].end_time).toBe('21:45');

    expect(result.data.ticket_types).toHaveLength(3);
    const run3 = ticketByHint(result.data.ticket_types, '3 km');
    expect(run3.price).toBe(180000);
    expect(run3.quantity_total).toBe(500);

    const run5 = ticketByHint(result.data.ticket_types, '5 km');
    expect(run5.price).toBe(280000);
    expect(run5.quantity_total).toBe(700);

    const run10 = ticketByHint(result.data.ticket_types, '10 km');
    expect(run10.price).toBe(400000);
    expect(run10.quantity_total).toBe(300);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  test('should accurately extract International Children\'s Book Fair 2028 with 7 timeline-updated sessions and 3 approved passes', async () => {
    const doc = `# TÀI LIỆU 5 — NHẬT KÝ ĐIỀU PHỐI VÀ BẢN GHI CẬP NHẬT
# INTERNATIONAL CHILDREN'S BOOK FAIR 2028

**Mã nhật ký:** ICBF-LOG-28  
**Đơn vị điều phối:** Children's Reading Foundation  
**Địa điểm:** Hanoi Creative City, 1 Lương Yên, Hà Nội  
**Ngày diễn ra:** 03–04/12/2028

Tài liệu dưới đây ghi lại các cập nhật theo thời gian. Những bản ghi cũ được giữ lại để truy vết, nhưng không phải tất cả đều có hiệu lực tại thời điểm xuất bản.

## Nhật ký 01 — 01/08/2028, 09:00

Ban tổ chức dự kiến tổ chức hội chợ sách thiếu nhi trong hai ngày 03 và 04/12/2028.

Lịch chương trình ban đầu gồm:

- Children's Literature Opening: ngày 03/12, 09:00–09:30, Main Hall.
- Storytelling for Young Readers: ngày 03/12, 10:00–11:00, Reading Corner.
- Children's Illustration Workshop: ngày 03/12, 13:30–15:00, Art Room.
- Young Authors Meet-up: ngày 04/12, 09:30–11:00, Main Hall.
- Family Reading Session: ngày 04/12, 13:00–14:00, Reading Corner.
- Closing and Book Donation: ngày 04/12, 15:30–16:00, Main Hall.

## Nhật ký 02 — 15/09/2028, 14:30

Ban tổ chức xác nhận toàn bộ sáu hoạt động trong nhật ký ngày 01/08.

Các phiên vẫn giữ nguyên ngày, giờ và địa điểm như lịch trình ban đầu.

## Nhật ký 03 — 20/10/2028, 11:15

Đơn vị vận hành yêu cầu thay đổi Children's Illustration Workshop từ 13:30–15:00 thành 14:00–15:30 ngày 03/12/2028.

Địa điểm vẫn là Art Room.

Thay đổi đã được phê duyệt.

Kể từ thời điểm này, lịch 14:00–15:30 là lịch có hiệu lực cho workshop. Mốc 13:30–15:00 chỉ được giữ lại trong nhật ký lịch sử.

## Nhật ký 04 — 25/10/2028, 16:00

Ban tổ chức xác nhận bổ sung hoạt động Book Character Costume Parade.

- Ngày: 04/12/2028.
- Thời gian: 11:30–12:15.
- Địa điểm: Exhibition Hall.

Hoạt động này đã được phê duyệt và phải được bổ sung vào lịch trình chính thức.

## Nhật ký 05 — 27/10/2028, 10:00

Một thành viên đề xuất tổ chức hoạt động Children's Film Screening vào 16:30 ngày 04/12.

Chưa có địa điểm và chưa có quyết định phê duyệt.

Đề xuất này không thuộc lịch chính thức.

## Nhật ký 06 — 29/10/2028, 15:45

Ban tổ chức cập nhật chính sách vé như sau:

| Loại vé | Giá | Hạn mức | Trạng thái |
|---|---:|---:|---|
| Family Entry | 100.000 VND | 500 | Approved |
| Young Reader Pass | 60.000 VND | 300 | Approved |
| Illustration Workshop Pass | 180.000 VND | 100 | Approved |
| Premium Family Package | 350.000 VND | 50 | Draft |

Premium Family Package mới chỉ xuất hiện trong bản đề xuất. Không đưa loại vé này vào danh sách vé chính thức.

### Quyền lợi vé

**Family Entry:** Cho phép gia đình tham dự các hoạt động mở cửa của hội chợ.

**Young Reader Pass:** Dành cho khách tham dự cá nhân, bao gồm quyền vào hội chợ và khu đọc sách.

**Illustration Workshop Pass:** Bao gồm vé vào cửa và quyền đăng ký một buổi workshop vẽ minh họa còn chỗ.

Người mua phải cung cấp họ tên và email. Người đăng ký Illustration Workshop Pass cần cung cấp thêm số điện thoại.

## Nhật ký 07 — 30/10/2028, 09:20

Ban tổ chức xác nhận địa điểm tổ chức không thay đổi.

Giờ mở cửa dành cho khách tham quan:

- Ngày 03/12/2028: 08:30–17:00.
- Ngày 04/12/2028: 09:00–17:00.

Đây là giờ mở cửa chung của hội chợ, không thay thế thời gian của từng hoạt động trong lịch trình.

## Nhật ký 08 — 30/10/2028, 17:00

Bộ phận tài chính xác nhận rằng chính sách hoàn tiền chưa được phê duyệt.

Một bản ghi nháp cũ từng đề cập hoàn tiền trong vòng 3 ngày, nhưng không có quyết định chính thức xác nhận thời hạn này.

Không sử dụng thời hạn 3 ngày trong dữ liệu sự kiện.`;

    const result = await aiDocumentParserService.extractEventFromText(doc);
    expect(result.data.title).toBe('INTERNATIONAL CHILDREN\'S BOOK FAIR 2028');
    expect(result.data.venue_name).toMatch(/Hanoi Creative City/i);
    expect(result.data.address_line).toContain('1 Lương Yên');
    expect(result.data.province).toMatch(/Hà Nội/i);
    expect(result.data.start_date).toBe('2028-12-03');
    expect(result.data.end_date).toBe('2028-12-04');

    expect(result.data.sessions).toHaveLength(7);
    const ws = result.data.sessions.find(s => s.session_name.includes('Illustration Workshop'));
    expect(ws.start_date).toBe('2028-12-03');
    expect(ws.start_time).toBe('14:00');
    expect(ws.end_time).toBe('15:30');

    const parade = result.data.sessions.find(s => s.session_name.includes('Costume Parade'));
    expect(parade.start_date).toBe('2028-12-04');
    expect(parade.start_time).toBe('11:30');
    expect(parade.end_time).toBe('12:15');

    expect(result.data.ticket_types).toHaveLength(3);
    const familyTicket = ticketByHint(result.data.ticket_types, 'family entry');
    expect(familyTicket.price).toBe(100000);
    expect(familyTicket.quantity_total).toBe(500);

    const youngTicket = ticketByHint(result.data.ticket_types, 'young reader');
    expect(youngTicket.price).toBe(60000);
    expect(youngTicket.quantity_total).toBe(300);

    const wsTicket = ticketByHint(result.data.ticket_types, 'illustration workshop');
    expect(wsTicket.price).toBe(180000);
    expect(wsTicket.quantity_total).toBe(100);

    expect(result.data.refund_policy.allow_refunds).toBe(false);
  });

  describe('Non-event document validation and rejection', () => {
    test('should reject multiple choice exam/quiz documents with 400 error', async () => {
      const examDoc = `
Theo Hồ Chí Minh, "Muốn xây dựng chủ nghĩa xã hội, trước hết cần có  
a. con người xã hội chủ nghĩa"
b. khoa học xã hội tiên tiến"
c. công nông nghiệp hiện đại"
d. nền kinh tế phát triển"
a
(Kiểu hỏi khác: Theo Hồ Chí Minh, muốn xây dựng chủ nghĩa xã hội trước hết cần có cái gì? 
=>Con người xã hội chủ nghĩa)
(Kiểu hỏi khác: Theo Hồ Chí Minh muốn xây dựng chủ nghĩa xã hội, trước hết cần có: 
=> Con người xã hội chủ nghĩa.)
 

Theo Hồ Chí Minh, biện pháp nào quan trọng nhất trong xây dựng chủ nghĩa xã hội? 
A. Tranh thủ tối đa sự giúp đỡ, viện trợ quốc tế
B. Kết hợp cải tạo xã hội cũ và xây dựng xã hội mới
C. Huy động các nguồn lực sẵn có trong dân
D. Kết hợp xây dựng và bảo vệ đất nước
C
(Kiểu hỏi khác: Theo Hồ Chí Minh, cách làm trong xây dựng xã hội mới là: 
A. Tranh thủ tối đa sự giúp đỡ, viện trợ quốc tế 
B. Đem của dân, tài dân, sức dân làm lợi cho dân C. Kết hợp cải tạo xã hội cũ với xây dựng xã hội mới 
D. Kết hợp xây dựng và bảo vệ đất nước)
Theo Hồ Chí Minh, biện pháp cơ bản nhất để xây dựng chủ nghĩa xã hội là: 
A. Đem của dân, tài dân, sức dân làm lợi cho dân
B. Nhà nước phải ban phát từ trên xuống
C. Phải dựa vào sự giúp đỡ của các nước xã hội chủ nghĩa
D. Phải tự lực cánh sinh, dựa vào sức mình là chính
A
      `;

      await expect(aiDocumentParserService.extractEventFromText(examDoc)).rejects.toThrow(
        /Tài liệu được cung cấp là đề thi \/ câu hỏi trắc nghiệm/i
      );
    });

    test('should reject source code snippets with 400 error', async () => {
      const codeDoc = `
import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/users').then(res => {
      setUsers(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      {users.map(u => <p key={u.id}>{u.name}</p>)}
    </div>
  );
}
      `;

      await expect(aiDocumentParserService.extractEventFromText(codeDoc)).rejects.toThrow(
        /Tài liệu được cung cấp là đoạn mã nguồn lập trình/i
      );
    });

    test('should reject bank statements / invoices with 400 error', async () => {
      const invoiceDoc = `
HÓA ĐƠN ĐIỆN TỬ GIÁ TRỊ GIA TĂNG
Phiếu thu tiền cước dịch vụ viễn thông
Số tài khoản trích nợ: 0123456789
Lệnh chuyển tiền thành công số: FT12345678
Số dư khả dụng: 50,000,000 VND
Ủy nhiệm chi số 987654
      `;

      await expect(aiDocumentParserService.extractEventFromText(invoiceDoc)).rejects.toThrow(
        /Tài liệu được cung cấp là hóa đơn \/ chứng từ thanh toán/i
      );
    });

    test('should reject empty or irrelevant generic conversation text', async () => {
      const emptyDoc = '   ';
      await expect(aiDocumentParserService.extractEventFromText(emptyDoc)).rejects.toThrow(
        /Nội dung tài liệu trống/i
      );

      const irrelevantDoc = 'Hôm nay trời đẹp quá, chúng ta cùng đi dạo công viên và ngắm cảnh nhé bạn ơi.';
      await expect(aiDocumentParserService.extractEventFromText(irrelevantDoc)).rejects.toThrow(
        /không chứa thông tin về sự kiện/i
      );
    });

    test('should reject HCM202 (2).docx exam question bank file with 400 error', async () => {
      const hcmFilePath = path.join(sampleDir, 'HCM202 (2).docx');
      if (fs.existsSync(hcmFilePath)) {
        const buffer = fs.readFileSync(hcmFilePath);
        const file = {
          buffer,
          originalname: 'HCM202 (2).docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
        const text = await aiDocumentParserService.extractTextFromFile(file);
        await expect(aiDocumentParserService.extractEventFromText(text)).rejects.toThrow(
          /Tài liệu được cung cấp là đề thi \/ câu hỏi trắc nghiệm/i
        );
      }
    });

    test('should reject academic syllabus and lecture notes with 400 error', async () => {
      const syllabusDoc = `
ĐỀ CƯƠNG CHI TIẾT HỌC PHẦN
Mã học phần: SWE102
Số tín chỉ: 3
Giáo trình môn học: Kỹ thuật phần mềm cơ sở
      `;
      await expect(aiDocumentParserService.extractEventFromText(syllabusDoc)).rejects.toThrow(
        /Tài liệu được cung cấp là giáo trình \/ đề cương môn học/i
      );
    });
  });
});



