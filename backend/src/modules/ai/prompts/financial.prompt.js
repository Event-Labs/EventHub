/**
 * Prompt: Generate Financial Summary with AI (WBS #60 - Senior Revenue & Yield Management Advisor)
 */

const SYSTEM = `Bạn là Chuyên gia Cố vấn Cấp cao về Quản trị Doanh thu & Tối ưu hóa Vé sự kiện (Senior Yield & Revenue Management Advisor) của nền tảng EventHub.
Nhiệm vụ của bạn là lập Báo cáo Phân tích Chiến lược Tài chính (Executive Financial Briefing) chuyên sâu, sắc bén và hữu ích cho Nhà tổ chức sự kiện.

Quy tắc bắt buộc:
1. Độ tin cậy & Dữ liệu thực chứng:
   - Dựa 100% vào các chỉ số định lượng được cung cấp (Doanh thu gộp, Doanh thu ròng, Phí nền tảng, RevPAS, Vận tốc bán vé, Rủi ro tồn kho, Cơ cấu hạng vé).
   - Tuyệt đối không bịa đặt số liệu hay ảo giác thông tin ngoài dữ liệu.
2. Phong cách & Ngôn ngữ:
   - Sử dụng thuật ngữ tài chính - kinh tế chuẩn mực (biên lợi nhuận ròng, vận tốc bán vé, RevPAS, tỷ lệ lấp đầy, điểm nghẽn tồn kho, chiến lược định giá động).
   - Giọng văn tư vấn quản trị cấp cao (tương tự báo cáo McKinsey / Big 4), ngắn gọn, khúc chiết, mang tính định hướng hành động cao.
3. Không viết thẻ suy nghĩ <think>, không giải thích dài dòng quy trình suy luận.
4. BẮT BUỘC định dạng câu trả lời rõ ràng theo đúng 4 đề mục Markdown sau:
   ### 🎯 1. ĐÁNH GIÁ HIỆU SUẤT TÀI CHÍNH & TỶ SUẤT LỢI NHUẬN
   ### 📈 2. VẬN TỐC TIÊU THỤ & ĐỘ LỆCH HẠNG VÉ
   ### ⚠️ 3. ĐIỂM NGHẼN TỒN KHO & CẢNH BÁO RỦI RO
   ### 💡 4. KẾ HOẠCH HÀNH ĐỘNG DOANH THU & ĐỊNH GIÁ ĐỘNG`;

function buildPrompt(data) {
  const fmt = (v) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;

  const tierSummary = Array.isArray(data.tier_breakdown) && data.tier_breakdown.length > 0
    ? data.tier_breakdown.map((t) => 
        `- Hạng vé "${t.name}": Giá ${fmt(t.price || t.unit_price)} | Đã bán ${t.sold}/${t.capacity} vé (Lấp đầy ${t.occupancy_rate}%) | Đóng góp ${t.revenue_contribution_pct}% doanh thu | Tình trạng: ${t.status}`
      ).join('\n')
    : `- Hạng vé chính: ${data.best_ticket_type || 'Chưa có phân bổ chi tiết'}`;

  const daysText = data.days_until_event !== null && data.days_until_event !== undefined
    ? `${data.days_until_event} ngày`
    : 'Không xác định / Sự kiện nhiều kỳ';

  return {
    system: SYSTEM,
    user: `Hãy phân tích chiến lược tài chính và đưa ra khuyến nghị quản trị doanh thu cho sự kiện sau:

=== HỒ SƠ TÀI CHÍNH & VẬN TỐC SỰ KIỆN ===
- Tên sự kiện: ${data.event_title}
- Điểm sức khỏe tài chính (Health Score): ${data.health_score || 0}/100 (${data.risk_level || 'CHƯA RÕ'})
- Doanh thu gộp (Gross Revenue): ${fmt(data.gross_revenue)}
- Doanh thu ròng (Net Revenue): ${fmt(data.net_revenue)}
- Phí nền tảng & Dịch vụ: ${fmt(data.platform_fee || data.subscription_cost)} (Tỷ lệ phí: ${data.subscription_cost_rate || 0}%)
- Biên lợi nhuận ròng (Net Margin Rate): ${data.net_margin_rate || 0}%
- Tổng vé đã bán: ${data.tickets_sold} / Tổng sức chứa: ${data.total_capacity || data.tickets_sold} vé (Lấp đầy: ${data.occupancy_rate}%)
- Vé còn tồn (Unsold Inventory): ${data.remaining_tickets || 0} vé
- RevPAS (Doanh thu trung bình trên mỗi chỗ ngồi khả dụng): ${fmt(data.revpas || 0)}
- Giá vé trung bình thực tế: ${fmt(data.avg_ticket_price || 0)} | Giá trị đơn hàng trung bình (AOV): ${fmt(data.avg_order_value || 0)}
- Thời gian còn lại đến sự kiện: ${daysText}
- Vận tốc bán vé gần nhất: ${data.velocity_daily_tickets || 0} vé/ngày (~${fmt(data.velocity_daily_revenue || 0)}/ngày)
- Gia tốc tăng trưởng doanh số 7 ngày gần nhất: ${data.velocity_growth_pct || 0}% (${data.momentum_label || 'Ổn định'})
- Mức độ rủi ro tồn kho (Inventory Risk): ${data.inventory_risk_level || 'MODERATE'} (Cần bán ${data.required_daily_tickets || 0} vé/ngày để hết sạch vé)
- Ngày có doanh số đột biến cao nhất: ${data.best_sales_day || 'Chưa ghi nhận'}

=== CHI TIẾT CƠ CẤU TỪNG HẠNG VÉ ===
${tierSummary}

=== YÊU CẦU TRẢ LỜI ===
Hãy lập Báo cáo Cố vấn Doanh thu (4 đề mục Markdown chuẩn), phân tích sâu sắc mối tương quan giữa vận tốc bán, cơ cấu giá vé, rủi ro thời gian và đề xuất chiến thuật định giá/kích cầu cụ thể, thực tế cho Organizer.`,
  };
}

module.exports = { buildPrompt, SYSTEM };

