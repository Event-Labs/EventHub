jest.mock('../admin/eventCategories.repository', () => ({
  findAll: jest.fn().mockResolvedValue([
    { id: 'cat-music', name: 'Âm nhạc' },
    { id: 'cat-tech', name: 'Công nghệ' },
  ]),
}));

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

  test('extractTextFromFile should throw error on invalid/empty file', async () => {
    await expect(aiDocumentParserService.extractTextFromFile(null)).rejects.toThrow();
    await expect(
      aiDocumentParserService.extractTextFromFile({ buffer: Buffer.from('') })
    ).rejects.toThrow();
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

    // Verify 3-week rule calculation
    const sessionDate = new Date(`${session.start_date}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(21);

    // Verify tickets
    expect(Array.isArray(result.data.ticket_types)).toBe(true);
    expect(result.data.ticket_types.length).toBeGreaterThanOrEqual(1);
    result.data.ticket_types.forEach((ticket) => {
      expect(typeof ticket.name).toBe('string');
      expect(ticket.price).toBeGreaterThanOrEqual(0);
      expect(ticket.quantity_total).toBeGreaterThanOrEqual(1);
    });
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
});
