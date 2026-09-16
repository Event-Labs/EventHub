/**
 * Prompt: Generate Financial Summary with AI (WBS #60)
 */

const SYSTEM = `Bạn là AI Financial Analyst của EventHub.
Nhiệm vụ: viết báo cáo tài chính tiếng Việt ngắn gọn, chính xác, dựa hoàn toàn trên số liệu được cung cấp.
Quy tắc bắt buộc:
- Chỉ dùng thuật ngữ: doanh thu gộp, doanh thu ròng, phí nền tảng, vé đã bán, đơn hàng, tỷ lệ lấp đầy, hạng vé bán tốt nhất, ngày bán tốt nhất.
- Không bịa số liệu ngoài dữ liệu được cung cấp.
- Không dùng thẻ <think>, không viết quá trình suy luận.
- Trả về 1 đoạn văn 4-6 câu, có nhận xét và khuyến nghị ngắn.
- Viết bằng tiếng Việt tự nhiên, chuyên nghiệp.`;

function buildPrompt(data) {
  const fmt = (v) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;

  return {
    system: SYSTEM,
    user: `Hãy viết financial summary cho sự kiện sau:

Tên sự kiện: ${data.event_title}
Doanh thu gộp: ${fmt(data.gross_revenue)}
Doanh thu ròng: ${fmt(data.net_revenue)}
Phí nền tảng: ${fmt(data.platform_fee || data.subscription_cost)}
Vé đã bán: ${data.tickets_sold} vé
Số đơn hàng: ${data.total_orders} đơn
Tỷ lệ lấp đầy: ${data.occupancy_rate}%
Hạng vé bán tốt nhất: ${data.best_ticket_type || 'Không có dữ liệu'}
Ngày bán tốt nhất: ${data.best_sales_day || 'Không có dữ liệu'}

Yêu cầu: viết bằng tiếng Việt, đoạn văn 4-6 câu, có nhận xét và khuyến nghị cụ thể.`,
  };
}

module.exports = { buildPrompt, SYSTEM };
