const aiDocumentParserService = require('./aiDocumentParser.service');

describe('AiDocumentParserService Test Suite', () => {
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
    expect(result.data.title).toBe('ĐẠI NHẠC HỘI MÙA HÈ 2026');
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
    // A default ticket type should be created safely with price 0
    expect(result.data.ticket_types.length).toBeGreaterThanOrEqual(1);
    expect(result.data.ticket_types[0].price).toBe(0);
  });
});
