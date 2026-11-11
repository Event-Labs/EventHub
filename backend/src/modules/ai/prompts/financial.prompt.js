/**
 * Prompt: Generate Financial Summary with AI (WBS #60 - Senior Revenue & Yield Management Advisor)
 */

const SYSTEM = `Bạn là Chuyên gia Cố vấn Cấp cao về Quản trị Doanh thu & Tối ưu hóa Vé sự kiện của nền tảng EventHub.
Nhiệm vụ của bạn là lập Báo cáo Phân tích Chiến lược Doanh thu & Tối ưu Bán vé chuyên sâu, sắc bén, dễ hiểu và thiết thực cho Nhà tổ chức sự kiện.

Bối cảnh mô hình kinh doanh EventHub:
- Nền tảng áp dụng mô hình gói thuê bao đăng sự kiện (Subscription Plan theo hạn ngạch số lượng sự kiện), KHÔNG thu phí hoa hồng chiết khấu % trên doanh thu bán vé.
- 100% dòng tiền doanh thu bán vé thuộc về Nhà tổ chức (không phân chia doanh thu gộp/ròng).

Quy tắc bắt buộc:
1. Độ tin cậy & Dữ liệu thực chứng:
   - Dựa 100% vào các chỉ số định lượng được cung cấp (Tổng doanh thu vé, Doanh thu trên mỗi chỗ ngồi, Giá vé trung bình, Giá trị đơn hàng trung bình, Tốc độ bán vé, Rủi ro tồn kho, Cơ cấu hạng vé).
   - Tuyệt đối không bịa đặt số liệu hay ảo giác thông tin ngoài dữ liệu.
2. Ngôn ngữ & Diễn đạt:
   - BẮT BUỘC dùng 100% tiếng Việt tự nhiên, chuẩn mực, dễ hiểu cho người dùng Việt Nam.
   - TUYỆT ĐỐI KHÔNG sử dụng từ ngữ tiếng Anh nửa vời hoặc thuật ngữ biệt ngữ khó hiểu (như: Flash Bundle, Retargeting, What-If, CRITICAL, MODERATE, LOW, HIGH, Yield, RevPAS, Velocity, Pacing, Inventory...). Thay vào đó, dùng từ thuần Việt tương ứng: "gói combo ưu đãi", "tiếp thị lại cho khách quan tâm", "mức độ rủi ro rất cao", "mức độ rủi ro trung bình", "doanh thu bình quân mỗi chỗ ngồi", "tốc độ bán vé", "tiến độ tiêu thụ tồn kho", "vé tồn kho"...
   - Các con số phần trăm (%) PHẢI làm tròn 1 chữ số thập phân (ví dụ: 12.5%, tuyệt đối không ghi số lẻ dài như 0.06982775819644876%).
   - Các số tiền viết rõ định dạng số và đơn vị VND (ví dụ: 50.000 VND, 1.250.000 VND).
   - Giọng văn tư vấn quản trị chuyên nghiệp, ngắn gọn, khúc chiết, mang tính định hướng hành động cao.
3. Không viết thẻ suy nghĩ <think>, không giải thích dài dòng quy trình suy luận.
4. BẮT BUỘC định dạng câu trả lời rõ ràng theo đúng 4 đề mục Markdown sau:
   ### 1. ĐÁNH GIÁ TỔNG QUAN DOANH THU & HIỆU SUẤT KHAI THÁC
   ### 2. TỐC ĐỘ TIÊU THỤ & ĐỘ LỆCH HẠNG VÉ
   ### 3. ĐIỂM NGHẼN TỒN KHO & CẢNH BÁO RỦI RO
   ### 4. KẾ HOẠCH HÀNH ĐỘNG KÍCH CẦU & ĐỊNH GIÁ ĐỘNG
5. Dung lượng & Tính súc tích:
   - Mỗi đề mục viết cô đọng trong 2-3 câu sắc bén, đi thẳng vào số liệu thực chứng và giải pháp hành động thiết thực (toàn bài hoàn chỉnh trong khoảng 300-450 từ).
   - Tuyệt đối không viết lan man hoặc lặp lại câu từ ngoài 4 đề mục trên.`;

function buildPrompt(data) {
  const fmt = (v) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;
  const round1 = (v) => Number(v || 0).toFixed(1);

  const riskLabelVn = {
    LOW: 'Rủi ro thấp',
    MEDIUM: 'Rủi ro trung bình',
    HIGH: 'Rủi ro cao',
    CRITICAL: 'Rủi ro rất cao',
  }[data.risk_level] || data.risk_level || 'Rủi ro trung bình';

  const invRiskVn = {
    LOW: 'Thấp (an toàn)',
    MODERATE: 'Trung bình',
    HIGH: 'Cao',
    CRITICAL: 'Rất cao (báo động)',
  }[data.inventory_risk_level] || 'Trung bình';

  let tierSummary = '';
  if (Array.isArray(data.tier_breakdown) && data.tier_breakdown.length > 0) {
    // Sort tiers by revenue descending, show top contributors and lagging tiers to avoid token bloat
    const sorted = [...data.tier_breakdown].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    const topTiers = sorted.slice(0, 6);
    const topTierIds = new Set(topTiers.map(t => t.id || t.name));

    const remaining = sorted.filter(t => !topTierIds.has(t.id || t.name));
    const laggingTiers = remaining
      .filter(t => t.status === 'Chậm tiêu thụ' && (t.capacity || 0) > 0)
      .slice(0, 2);

    const shownTiers = [...topTiers, ...laggingTiers];
    const shownIds = new Set(shownTiers.map(t => t.id || t.name));
    const unshownCount = data.tier_breakdown.length - shownTiers.length;

    tierSummary = shownTiers.map((t) => 
      `- Hạng vé "${t.name}": Giá ${fmt(t.price || t.unit_price)} | Đã bán ${t.sold}/${t.capacity} vé (Tỷ lệ lấp đầy: ${round1(t.occupancy_rate)}%) | Đóng góp: ${Math.min(Number(t.revenue_contribution_pct || 0), 100).toFixed(1)}% doanh thu | Trạng thái: ${t.status}`
    ).join('\n');

    if (unshownCount > 0) {
      const otherRevenue = remaining.filter(t => !shownIds.has(t.id || t.name)).reduce((sum, t) => sum + Number(t.revenue || 0), 0);
      const otherSold = remaining.filter(t => !shownIds.has(t.id || t.name)).reduce((sum, t) => sum + Number(t.sold || 0), 0);
      tierSummary += `\n- (${unshownCount} hạng vé khác: tổng cộng đã bán ${otherSold} vé, doanh thu ${fmt(otherRevenue)})`;
    }
  } else {
    tierSummary = `- Hạng vé chính: ${data.best_ticket_type || 'Chưa có phân bổ chi tiết'}`;
  }

  const daysText = data.days_until_event !== null && data.days_until_event !== undefined
    ? `${data.days_until_event} ngày`
    : 'Không giới hạn / Sự kiện nhiều kỳ';

  return {
    system: SYSTEM,
    user: `Hãy phân tích chiến lược tài chính và đưa ra khuyến nghị quản trị doanh thu cho sự kiện sau (dùng 100% tiếng Việt tự nhiên, không chèn từ ngữ tiếng Anh nửa vời):

=== DỮ LIỆU TÀI CHÍNH & TỐC ĐỘ BÁN VÉ ===
- Tên sự kiện: ${data.event_title}
- Điểm sức khỏe tài chính: ${data.health_score || 0}/100 (Đánh giá: ${riskLabelVn})
- Tổng doanh thu bán vé: ${fmt(data.gross_revenue || data.net_revenue)} (100% doanh thu thuộc về Nhà tổ chức)
- Tổng số đơn hàng thành công: ${data.total_orders || 0} đơn
- Số vé đã bán: ${data.tickets_sold} / Tổng sức chứa: ${data.total_capacity || data.tickets_sold} chỗ (Tỷ lệ lấp đầy: ${round1(data.occupancy_rate)}%)
- Số vé còn tồn kho: ${data.remaining_tickets || 0} vé
- Doanh thu bình quân trên mỗi chỗ ngồi khả dụng: ${fmt(data.revpas || 0)}
- Giá vé trung bình thực tế: ${fmt(data.avg_ticket_price || 0)} | Giá trị đơn hàng trung bình: ${fmt(data.avg_order_value || 0)}/đơn
- Thời gian còn lại đến ngày diễn ra: ${daysText}
- Tốc độ bán vé gần đây: ${data.velocity_daily_tickets || 0} vé/ngày (~${fmt(data.velocity_daily_revenue || 0)}/ngày)
- Xu hướng đà tăng trưởng doanh số: ${data.velocity_growth_pct || 0}% (${data.momentum_label || 'Ổn định'})
- Mức độ rủi ro vé tồn kho: ${invRiskVn} (Cần bán tối thiểu ${data.required_daily_tickets || 0} vé/ngày để giải phóng toàn bộ chỗ ngồi)
- Ngày đạt doanh số cao nhất: ${data.best_sales_day || 'Chưa ghi nhận'}

=== CƠ CẤU CHI TIẾT CÁC HẠNG VÉ ===
${tierSummary}

=== YÊU CẦU TRẢ LỜI ===
Lập báo cáo cố vấn doanh thu gồm 4 đề mục Markdown bằng tiếng Việt rõ ràng, mạch lạc, phân tích thực tế và đề xuất hành động kích cầu hiệu quả cho Ban tổ chức.`,
  };
}

module.exports = { buildPrompt, SYSTEM };
