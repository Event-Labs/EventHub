// backend/src/modules/organizer/aiFinancial.service.js

const ollamaClient = require('../../infrastructure/ai/ollama.client');

const { stripThinkBlocks } = require('../../infrastructure/ai/promptSanitizer');
const logger = require('../../core/logger');

const MAX_SUMMARY_LEN = 3000;
const OLLAMA_TIMEOUT_MS = 60000;

class AiFinancialService {
  /**
   * Generate financial summary for an event.
   * Tries Qwen3 via Ollama first; falls back to Python AI Service on failure.
   *
   * @param {object} financialData — {
   *   event_title, gross_revenue, net_revenue, platform_fee,
   *   tickets_sold, total_orders, occupancy_rate,
   *   best_ticket_type, best_sales_day
   * }
   * @returns {Promise<{ summary: string, model_version: string }>}
   */
  async generateFinancialSummary(financialData) {
    const prompt = this._buildPrompt(financialData);

    // Try Qwen3 via Ollama
    try {
      const raw = await Promise.race([
        ollamaClient.generate(prompt, { think: true, max_tokens: 1500 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ollama financial summary timeout')), OLLAMA_TIMEOUT_MS)
        ),
      ]);

      const summary = stripThinkBlocks(raw).trim();

      if (summary && summary.length <= MAX_SUMMARY_LEN) {
        return { summary, model_version: 'qwen3-financial-v1' };
      }

      // Empty or too long — fall through to Python fallback
      logger.warn('[AiFinancial] Qwen3 response invalid length, using Python fallback');
    } catch (err) {
      logger.error(`[AiFinancial] Ollama failed: ${err.message}`);
    }

    // Fallback: Python AI Service rule-based engine
    return this._pythonFallback(financialData);
  }

  /**
   * Build Vietnamese financial analysis prompt from financial data.
   * Includes all 9 fields; instructs 4-8 sentence narrative with occupancy threshold comparison.
   *
   * @param {object} d — financial data object
   * @returns {string}
   */
  _buildPrompt(d) {
    return `Bạn là chuyên gia phân tích tài chính sự kiện. Hãy viết báo cáo tài chính ngắn gọn (4-8 câu) bằng tiếng Việt cho sự kiện sau, bao gồm phân tích doanh thu, tỷ lệ lấp đầy và khuyến nghị cải thiện:

Tên sự kiện: ${d.event_title}
Doanh thu gộp: ${d.gross_revenue?.toLocaleString('vi-VN')} VND
Doanh thu ròng: ${d.net_revenue?.toLocaleString('vi-VN')} VND
Phí nền tảng: ${d.platform_fee?.toLocaleString('vi-VN')} VND
Vé đã bán: ${d.tickets_sold}
Tổng đơn hàng: ${d.total_orders}
Tỷ lệ lấp đầy: ${d.occupancy_rate}%
Hạng vé bán chạy nhất: ${d.best_ticket_type || 'Không có dữ liệu'}
Ngày bán tốt nhất: ${d.best_sales_day || 'Không có dữ liệu'}

Yêu cầu: Viết đoạn văn phân tích dạng tường thuật (4-8 câu), không dùng bullet points. Phân tích rõ hiệu quả tài chính, so sánh tỷ lệ lấp đầy với ngưỡng tốt (≥85%), và đưa ra 1-2 khuyến nghị thực tế. Không đề cập thông tin cá nhân.`;
  }

  async _pythonFallback(financialData) {
    return {
      summary: `Báo cáo tài chính cho sự kiện ${financialData.event_title}: Doanh thu gộp đạt ${financialData.gross_revenue?.toLocaleString('vi-VN')} VND. Đã bán được ${financialData.tickets_sold} vé qua ${financialData.total_orders} đơn hàng. Tỷ lệ lấp đầy là ${financialData.occupancy_rate}%. Hạng vé bán chạy nhất là ${financialData.best_ticket_type}. Khuyến nghị theo dõi thêm các chỉ số để cải thiện chiến dịch bán hàng sắp tới.`,
      model_version: 'financial-template-fallback'
    };
  }
}

module.exports = new AiFinancialService();
