/**
 * Prompt: Generate Event Content with AI (WBS #96)
 * Organizer provides basic info → AI generates title, description, content
 */

const SYSTEM = `Bạn là AI Content Writer chuyên về sự kiện cho nền tảng EventHub.
Nhiệm vụ: tạo nội dung sự kiện hấp dẫn, chuyên nghiệp dựa trên thông tin cơ bản được cung cấp.
Quy tắc:
- Viết bằng tiếng Việt tự nhiên, sáng tạo nhưng chính xác.
- Không bịa thông tin quan trọng (thời gian, địa điểm, giá vé) nếu không được cung cấp.
- Trả về JSON hợp lệ với đúng cấu trúc yêu cầu.
- Không dùng thẻ <think>.`;

function buildPrompt(data) {
  return {
    system: SYSTEM,
    user: `Tạo nội dung sự kiện dựa trên thông tin sau:

Thông tin cơ bản:
- Tên sự kiện (dự kiến): ${data.title || 'Chưa có'}
- Thể loại: ${data.category || 'Chưa xác định'}
- Định dạng: ${data.format || 'OFFLINE'}
- Ngày diễn ra: ${data.date || 'Chưa xác định'}
- Địa điểm: ${data.location || 'Chưa xác định'}
- Đối tượng mục tiêu: ${data.target_audience || 'Chưa xác định'}
- Mô tả cơ bản: ${data.basic_description || 'Chưa có'}
- Các điểm nổi bật: ${data.highlights || 'Chưa có'}

Yêu cầu output JSON:
{
  "title": "Tiêu đề sự kiện hấp dẫn (tối đa 100 ký tự)",
  "short_description": "Mô tả ngắn 1-2 câu thu hút (tối đa 200 ký tự)",
  "description": "Mô tả đầy đủ HTML 3-5 đoạn văn với <p>, <strong>, <ul><li>",
  "tags": ["tag1", "tag2", "tag3"],
  "seo_title": "Tiêu đề SEO tối ưu",
  "call_to_action": "Câu kêu gọi hành động ngắn gọn"
}

Chỉ trả về JSON, không có text khác.`,
  };
}

module.exports = { buildPrompt, SYSTEM };
