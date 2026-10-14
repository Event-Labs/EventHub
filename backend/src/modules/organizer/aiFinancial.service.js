// backend/src/modules/organizer/aiFinancial.service.js

const ollamaClient = require('../../infrastructure/ai/ollama.client');
const { stripThinkBlocks } = require('../../infrastructure/ai/promptSanitizer');
const { buildPrompt } = require('../ai/prompts/financial.prompt');
const logger = require('../../core/logger');

const MAX_SUMMARY_LEN = 3000;
const OLLAMA_TIMEOUT_MS = Number(process.env.FINANCIAL_AI_TIMEOUT_MS || 90000);

class AiFinancialService {
  /**
   * Generate financial summary for an event.
   * Tries Ollama chat first; falls back to rule-based engine on failure or timeout.
   *
   * @param {object} financialData — financial dossier with RevPAS, velocity, pacing, etc.
   * @returns {Promise<{ summary: string, model_version: string }>}
   */
  async generateFinancialSummary(financialData) {
    const { system, user } = buildPrompt(financialData);

    // Prefer fast, dedicated EventHub model (eve-agent) on CPU, or user-configured model
    const targetModel = process.env.FINANCIAL_AI_MODEL || 'eve-agent';
    try {
      logger.info(`[AiFinancial] Đang gọi Ollama (${targetModel}) để tạo báo cáo tài chính cho "${financialData.event_title}"...`);
      const response = await Promise.race([
        ollamaClient.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          {
            model: targetModel,
            max_tokens: 800,
            temperature: 0.2,
            think: false,
          }
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ollama financial summary timeout')), OLLAMA_TIMEOUT_MS)
        ),
      ]);

      const raw = response.content || response.thinking || '';
      const summary = stripThinkBlocks(raw).trim();

      if (summary && summary.length >= 30 && summary.length <= MAX_SUMMARY_LEN) {
        logger.info(`[AiFinancial] Tạo báo cáo tài chính thành công (${summary.length} ký tự, model: ${targetModel}).`);
        return { summary, model_version: targetModel };
      }

      logger.warn('[AiFinancial] Phản hồi từ mô hình không hợp lệ hoặc quá ngắn, sử dụng dự phòng...');
    } catch (err) {
      logger.error(`[AiFinancial] Ollama chat thất bại: ${err.message}. Đang dùng cơ chế fallback.`);
    }

    // Fallback: Rule-based engine (McKinsey 4-pillar deterministic output)
    return this._ruleBasedFallback(financialData);
  }

  _ruleBasedFallback(financialData) {
    const fmt = (v) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;
    const tiers = Array.isArray(financialData.tier_breakdown) ? financialData.tier_breakdown : [];
    const starTier = tiers.find(t => t.status === 'Đang bán tốt') || tiers[0];
    const laggingTier = tiers.find(t => t.status === 'Chậm tiêu thụ');

    const summary = `### 🎯 1. ĐÁNH GIÁ HIỆU SUẤT TÀI CHÍNH & TỶ SUẤT LỢI NHUẬN
Sự kiện "${financialData.event_title}" ghi nhận tổng doanh thu gộp đạt ${fmt(financialData.gross_revenue)}, trong đó doanh thu ròng thực nhận là ${fmt(financialData.net_revenue)} sau khi trừ chi phí gói nền tảng và dịch vụ ${fmt(financialData.platform_fee || financialData.subscription_cost)}. Biên lợi nhuận ròng đạt ${financialData.net_margin_rate || 0}%, thể hiện mức độ kiểm soát chi phí ổn định. Doanh thu trên mỗi chỗ ngồi khả dụng (RevPAS) đạt ${fmt(financialData.revpas || 0)}, tương ứng hiệu suất khai thác doanh thu ${financialData.revpas > 0 && financialData.avg_ticket_price > 0 ? ((financialData.revpas / financialData.avg_ticket_price) * 100).toFixed(1) : 0}% so với giá vé niêm yết trung bình ${fmt(financialData.avg_ticket_price)}.

### 📈 2. VẬN TỐC TIÊU THỤ & ĐỘ LỆCH HẠNG VÉ
Tổng số lượng vé tiêu thụ đạt ${financialData.tickets_sold || 0} vé qua ${financialData.total_orders || 0} đơn hàng thành công, đạt tỷ lệ lấp đầy ${financialData.occupancy_rate || 0}%. Vận tốc bán vé gần nhất ghi nhận ở mức ${financialData.velocity_daily_tickets || 0} vé/ngày (bình quân ${fmt(financialData.velocity_daily_revenue || 0)}/ngày), trạng thái đà tăng trưởng: ${financialData.momentum_label || 'Ổn định'}. Về cơ cấu danh mục vé, hạng vé ${starTier ? `"${starTier.name}"` : (financialData.best_ticket_type || 'chủ lực')} là nguồn đóng góp doanh thu lớn nhất với tỷ trọng ${starTier?.revenue_contribution_pct || 0}% tổng doanh thu.

### ⚠️ 3. ĐIỂM NGHẼN TỒN KHO & CẢNH BÁO RỦI RO
Điểm sức khỏe tài chính đạt ${financialData.health_score || 0}/100 (${financialData.risk_level || 'TRUNG BÌNH'}). Số lượng vé còn tồn trong kho là ${financialData.remaining_tickets || 0} vé trên tổng sức chứa ${financialData.total_capacity || financialData.tickets_sold} chỗ. ${financialData.days_until_event !== null && financialData.days_until_event !== undefined ? `Với thời gian đếm ngược còn ${financialData.days_until_event} ngày đến sự kiện, mức độ rủi ro tồn kho được xếp loại ${financialData.inventory_risk_level === 'CRITICAL' ? 'RẤT CAO' : (financialData.inventory_risk_level === 'HIGH' ? 'CAO' : 'KIỂM SOÁT ĐƯỢC')}, đòi hỏi tốc độ tiêu thụ tối thiểu ${financialData.required_daily_tickets || 0} vé/ngày để giải phóng toàn bộ chỗ ngồi.` : 'Cần tiếp tục theo dõi sát sao tiến độ tiêu thụ theo từng mốc mở bán.'} ${laggingTier ? `Hạng vé "${laggingTier.name}" đang có tỷ lệ lấp đầy thấp (${laggingTier.occupancy_rate}%), là điểm nghẽn tồn đọng cần giải tỏa.` : ''}

### 💡 4. KẾ HOẠCH HÀNH ĐỘNG DOANH THU & ĐỊNH GIÁ ĐỘNG
1. **Tối ưu hóa giá vé & Kích cầu ngắn hạn (48h tới):** ${laggingTier ? `Kích hoạt chương trình Flash Bundle (mua 2 vé tặng kèm quyền lợi ưu đãi) hoặc voucher 10-15% cho hạng vé "${laggingTier.name}" để kích thích quyết định mua sớm.` : `Tập trung mở gói ưu đãi nhóm (Group Ticket) cho các hạng vé còn tồn để cải thiện doanh thu trung bình.`}
2. **Khai thác tệp khách tiềm năng:** Thực hiện chiến dịch tiếp thị lại (Retargeting) hướng đến người dùng đã truy cập xem trang sự kiện nhưng chưa hoàn tất đặt vé.
3. **Mục tiêu doanh thu khả thi:** Ưu tiên đẩy mạnh bán vé cho các ngày cuối tuần để tối ưu hóa tỷ lệ lấp đầy trước giờ diễn ra sự kiện.`;

    return {
      summary,
      model_version: 'financial-rule-fallback',
    };
  }
}

module.exports = new AiFinancialService();

