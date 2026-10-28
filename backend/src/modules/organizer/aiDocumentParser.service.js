const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventCategoriesRepository = require('../admin/eventCategories.repository');
const logger = require('../../core/logger');

const PRIMARY_MODEL = process.env.OLLAMA_EXTRACTION_MODEL || 'qwen3-eventhub-Q4_K_M.gguf';
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'qwen3-eventhub-Q4_K_M.gguf';
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);

const EN_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const EN_MONTH_ALT = Object.keys(EN_MONTHS).join('|');
const DATE_SKIP_CONTEXT = /(?:last\s*edited|edited\s*on|copied\s*from|updated\s*on|ghi\s*chú\s*lúc|cập\s*nhật\s*lúc)/i;

class AiDocumentParserService {
  /**
   * Chuyển đổi HTML từ file DOCX (mammoth) thành Markdown có cấu trúc bảng
   */
  _htmlToStructuredMarkdown(html) {
    if (!html || typeof html !== 'string') return '';
    // Loại bỏ hình ảnh base64 lớn tránh tràn bộ nhớ
    let text = html.replace(/<img[^>]*>/gi, '');
    // Chuyển đổi thẻ xuống dòng trước khi xử lý đoạn văn
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Giải mã thực thể HTML cơ bản
    text = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");

    // 1. Chuyển đổi bảng HTML thành định dạng bảng Markdown
    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, tableBody) => {
      const rows = [];
      const rowMatches = tableBody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      for (const r of rowMatches) {
        const cells = [];
        const cellMatches = r.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
        for (const c of cellMatches) {
          const cellText = c.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          cells.push(cellText);
        }
        if (cells.length > 0) {
          rows.push('| ' + cells.join(' | ') + ' |');
        }
      }
      if (rows.length === 0) return '';
      if (rows.length > 1) {
        const colCount = rows[0].split('|').length - 2;
        const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
        rows.splice(1, 0, separator);
      }
      return '\n\n' + rows.join('\n') + '\n\n';
    });

    // 2. Chuyển đổi headings, paragraphs, lists
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, content) => {
      const hText = content.replace(/<[^>]*>/g, '').trim();
      return '\n\n' + '#'.repeat(Number(level)) + ' ' + hText + '\n\n';
    });
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, content) => {
      return '\n- ' + content.replace(/<[^>]*>/g, '').trim();
    });
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, content) => {
      return '\n\n' + content.replace(/<[^>]*>/g, '').trim() + '\n\n';
    });
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  /**
   * Tự động nhận diện các dòng phân tách bằng tab (\t) và chuyển thành bảng Markdown
   */
  _convertTabsToMarkdownTable(text) {
    if (!text || typeof text !== 'string') return text;
    const lines = text.split('\n');
    const result = [];
    let tabTableLines = [];

    const flushTabTable = () => {
      if (tabTableLines.length > 0) {
        if (tabTableLines.length >= 2) {
          const rows = tabTableLines.map((line) => {
            const cells = line.split('\t').map((c) => c.trim());
            return '| ' + cells.join(' | ') + ' |';
          });
          const colCount = rows[0].split('|').length - 2;
          const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          rows.splice(1, 0, separator);
          result.push(...rows);
        } else {
          result.push(...tabTableLines);
        }
        tabTableLines = [];
      }
    };

    for (const line of lines) {
      if (line.includes('\t') && line.split('\t').filter((c) => c.trim().length > 0).length >= 2) {
        tabTableLines.push(line);
      } else {
        flushTabTable();
        result.push(line);
      }
    }
    flushTabTable();
    return result.join('\n');
  }

  /**
   * Trích xuất văn bản thô từ file tải lên
   * @param {object} file - Multer file object { buffer, mimetype, originalname }
   * @returns {Promise<string>}
   */
  async extractTextFromFile(file) {
    if (!file || !file.buffer) {
      throw new Error('File không hợp lệ hoặc rỗng');
    }

    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const mime = file.mimetype || '';

    let rawText = '';

    if (mime === 'application/pdf' || ext === 'pdf') {
      try {
        if (typeof pdfParse === 'function') {
          const parsed = await pdfParse(file.buffer);
          rawText = parsed.text || '';
        } else if (pdfParse && pdfParse.PDFParse) {
          const parser = new pdfParse.PDFParse({ data: file.buffer });
          const parsed = await parser.getText();
          rawText = parsed.text || '';
          if (typeof parser.destroy === 'function') {
            await parser.destroy();
          }
        } else {
          throw new Error('Thư viện pdf-parse không khả dụng');
        }
      } catch (err) {
        logger.error(`[AiDocumentParser] Lỗi đọc PDF: ${err.message}`);
        throw new Error(`Không thể đọc nội dung file PDF: ${err.message}`);
      }
    } else if (
      mime.includes('wordprocessingml') ||
      mime.includes('msword') ||
      ext === 'docx'
    ) {
      try {
        const parsed = await mammoth.convertToHtml({ buffer: file.buffer });
        rawText = this._htmlToStructuredMarkdown(parsed.value || '');
      } catch (err) {
        logger.error(`[AiDocumentParser] Lỗi đọc DOCX: ${err.message}`);
        throw new Error(`Không thể đọc nội dung file Word (.docx): ${err.message}`);
      }
    } else if (mime.startsWith('text/') || mime.includes('json') || ext === 'txt' || ext === 'md' || ext === 'json') {
      rawText = file.buffer.toString('utf-8');
    } else {
      throw new Error('Định dạng file không được hỗ trợ. Vui lòng tải file PDF, Word (.docx) hoặc Text (.txt)');
    }

    const cleaned = this._convertTabsToMarkdownTable(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    if (!cleaned || cleaned.length < 20) {
      throw new Error('Tài liệu quá ngắn hoặc không chứa nội dung văn bản có thể đọc được');
    }

    return cleaned;
  }

  /**
   * Tính toán ngày gợi ý tối thiểu (ngày mai)
   */
  getSuggestedMinDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Phân tích văn bản và trích xuất dữ liệu sự kiện
   * @param {string} text - Nội dung tài liệu
   * @param {string} userNote - Ghi chú thêm từ BTC nếu có
   * @param {object} options - Tùy chọn bổ sung (organizerName, ...)
   * @returns {Promise<object>}
   */
  async extractEventFromText(text, userNote = '', options = {}) {
    const organizerName = (options && options.organizerName) ? String(options.organizerName).trim() : '';

    // 1. Lấy danh sách categories từ database để AI gán đúng ID
    let categories = [];
    try {
      categories = await eventCategoriesRepository.findAll();
    } catch (err) {
      logger.warn(`[AiDocumentParser] Không lấy được danh mục từ DB: ${err.message}`);
    }

    const categoriesPrompt = (categories || [])
      .map((c) => `- ID "${c.id}": "${c.name}"`)
      .join('\n');

    // Dọn dẹp khoảng trắng dư thừa nhưng BẢO TOÀN NGUYÊN VẸN NỘI DUNG và BẢNG (hỗ trợ tài liệu lớn tới 15.000 ký tự)
    const tableFormatted = this._convertTabsToMarkdownTable(text);
    const cleanedText = tableFormatted
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const truncatedText = cleanedText.slice(0, 15000);
    logger.info(`[AiDocumentParser] Tiếp nhận ${text.length} ký tự tài liệu (gửi đầy đủ ${truncatedText.length} ký tự tới AI ${PRIMARY_MODEL} để trích xuất).`);

    // 1.1 Phân tích bóc tách các mục định sẵn trong tài liệu (nếu có nhãn TIÊU ĐỀ, MÔ TẢ, v.v.)
    const detectedSections = this._extractDocumentSections(cleanedText);

    const hasStructuredDesc = Boolean(detectedSections.description);
    const hasStructuredShortDesc = Boolean(detectedSections.short_description);
    const hasStructuredTerms = Boolean(detectedSections.additional_terms);

    const textForAi = truncatedText;

    const prompt = `Bạn là Trợ lý AI chuyên trách bóc tách tài liệu sự kiện của nền tảng EventHub.
NHIỆM VỤ: Đọc kỹ tài liệu kế hoạch sự kiện dưới đây và trích xuất các thuộc tính cấu trúc thành một JSON duy nhất theo đúng cấu trúc yêu cầu.

=== NỘI DUNG TÀI LIỆU CẦN TRÍCH XUẤT ===
"""
${textForAi}
"""
${userNote ? `Lưu ý thêm từ Ban tổ chức: "${userNote}"` : ''}

=== DANH SÁCH DANH MỤC HỆ THỐNG (BẮT BUỘC CHỌN 1 ID PHÙ HỢP NHẤT) ===
${categoriesPrompt || 'Chưa có danh mục cụ thể, hãy để trống category_id'}

=== QUY TẮC BẮT BUỘC (TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT DỮ LIỆU) ===
1. CHỈ TRÍCH XUẤT THÔNG TIN CÓ THẬT TRONG TÀI LIỆU.
2. TUYỆT ĐỐI KHÔNG tự sáng tác thêm các tiêu đề hoặc quy định cấm đoán generic nếu tài liệu không đề cập.
3. QUY TẮC TRÍCH XUẤT GIỜ GIẤC & LỊCH TRÌNH:
   - Cột hoặc dòng "Check-in" / "Đón khách" BẮT BUỘC map vào "checkin_start_time".
   - Cột hoặc dòng "Bắt đầu" / "Start" BẮT BUỘC map vào "start_time".
   - Cột hoặc dòng "Kết thúc" / "End" BẮT BUỘC map vào "end_time".
   - Giờ check-in LUÔN diễn ra trước hoặc cùng giờ bắt đầu (checkin_start_time <= start_time). TUYỆT ĐỐI KHÔNG ĐẢO NGƯỢC HOẶC GÁN NHẦM GIỜ CHECK-IN VÀO START_TIME.
   - Với các mốc giờ viết bằng chữ tiếng Việt (ví dụ: "8 giờ 30 sáng" -> "08:30", "9 giờ 15" -> "09:15", "17 giờ" -> "17:00", "16 giờ" -> "16:00"): BẮT BUỘC trích xuất chính xác theo định dạng HH:mm.
4. ĐẶC BIỆT VỚI TÀI LIỆU DẠNG EMAIL, THƯ TỪ, CHAT, JSON, THÔNG CÁO BÁO CHÍ HOẶC VĂN BẢN TỰ SỰ:
   - "title": Tìm tên sự kiện từ nhãn Event name / Event / Subject, từ cụm "mang tên/tên là/called", hoặc tên trong dấu ngoặc kép. TUYỆT ĐỐI KHÔNG lấy dòng tiêu đề chung (như "Email trao đổi...", "Event Proposal", "FOR IMMEDIATE RELEASE", "FOOD FESTIVAL DATA SHEET", "rough notes").
   - "sessions": Nếu sự kiện diễn ra nhiều ngày (Day 1/2/3, "22–24 January 2028", "ngày DD và DD tháng MM năm YYYY"), BẮT BUỘC tách từng phiên với ĐÚNG NĂM trong tài liệu. Ngày tiếng Anh ("13 March 2027") phải ra YYYY-MM-DD. TUYỆT ĐỐI không lấy mốc "last edited" / "copied from".
   - Giờ có thể viết "09:00–12:00", "Operating hours", "doors at", "xuất phát", "100k" = 100000 VND.
   - Nếu tài liệu là JSON, map title/sessions/tickets/venue từ JSON (check_in_time → checkin_start_time, tickets[].quantity → quantity_total).
   - "ticket_types": Đọc kỹ các câu mô tả vé (pipe "| 150000 VND | quantity 200", "vé 5 km là 100k", "day ticket for 70,000 VND"). CHỈ TRÍCH XUẤT HẠNG VÉ THỰC SỰ ĐƯỢC NÊU. TUYỆT ĐỐI KHÔNG TỰ BỊA "General Admission" HAY "Non-refundable" NẾU TÀI LIỆU KHÔNG NÊU!
   - "venue_name": Tìm địa điểm sau "tại ...", "Venue:", "Location:", "Where:". Nếu tài liệu nói địa điểm chưa chốt / don't use a venue name, để venue_name rỗng nhưng vẫn lấy quận/tỉnh nếu có.
5. CÁC TRƯỜNG DỮ LIỆU CẦN XUẤT:
   - "title": ${detectedSections.title && !this._isGenericDocumentTitle(detectedSections.title) ? `"${detectedSections.title}" (đã xác định chính xác từ tài liệu, TUYỆT ĐỐI không đổi sang tiêu đề chung như EVENT PROPOSAL).` : 'Tên chính thức của sự kiện (chỉ lấy tên sự kiện, không kèm danh mục hay tags, tuyệt đối không lấy tiêu đề chung như EVENT PROPOSAL hay ĐỀ XUẤT SỰ KIỆN).'}
   - "category_id": ID phù hợp nhất lấy từ danh mục hệ thống ở trên.
   - "short_description": ${hasStructuredShortDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu).' : 'Tóm tắt 1 - 2 câu mở đầu (tối đa 300 ký tự).'}
   - "description": ${hasStructuredDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu để tối ưu tốc độ).' : 'Nội dung chi tiết của sự kiện theo HTML (<p>, <ul>, <li>, <strong>).'}
   - "venue_name": Tên địa điểm cụ thể (ví dụ: "Trung tâm Hội nghị ABC", "Nhà hát Bến Thành"). NẾU TÀI LIỆU KHÔNG GHI ĐỊA ĐIỂM CỤ THỂ, BẮT BUỘC ĐỂ CHUỖI RỖNG "". TUYỆT ĐỐI KHÔNG tự bịa và TUYỆT ĐỐI KHÔNG lấy tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} để làm địa điểm nếu tài liệu không đề cập.
   - "address_line": Địa chỉ chi tiết nếu có trong tài liệu. Nếu không có để chuỗi rỗng "".
   - "district": Quận/Huyện nếu tài liệu có ghi (ví dụ: "Ngũ Hành Sơn", "Hải Châu", "Liên Chiểu", "Quận 1").
   - "province": Tỉnh/Thành phố nếu tài liệu có ghi (ví dụ: "Thành phố Hồ Chí Minh", "Thành phố Hà Nội", "Thành phố Đà Nẵng").
   - "sessions": Mảng chứa ĐẦY ĐỦ tất cả các phiên diễn ra sự kiện (nếu sự kiện có nhiều ca/buổi/phiên như Sáng, Chiều hoặc nhiều ngày, BẮT BUỘC trích xuất riêng từng phiên vào mảng này). Mỗi phiên gồm:
     * "session_name": Tên phiên (ví dụ: "Phiên 1", "Phiên Sáng: Keynote & Panels", "Phiên Chiều: Workshop & Tech Talks", hoặc "Phiên sự kiện").
     * "start_date": Ngày diễn ra theo định dạng YYYY-MM-DD. Lấy chính xác ngày và năm ghi trong tài liệu.
     * "checkin_start_time": Giờ bắt đầu check-in / đón khách theo định dạng HH:mm (lấy chính xác từ cột/câu "Check-in" hoặc "Đón khách", ví dụ: "08:30"). NẾU TÀI LIỆU KHÔNG GHI GIỜ CHECK-IN, BẮT BUỘC ĐỂ "".
     * "start_time": Giờ bắt đầu sự kiện theo định dạng HH:mm (lấy chính xác từ cột/câu "Bắt đầu" hoặc "Start", ví dụ: "09:15"). NẾU TÀI LIỆU KHÔNG GHI GIỜ BẮT ĐẦU, BẮT BUỘC ĐỂ "".
     * "end_time": Giờ kết thúc theo định dạng HH:mm (lấy từ cột/câu "Kết thúc", ví dụ: "17:00"). NẾU TÀI LIỆU KHÔNG GHI GIỜ KẾT THÚC, BẮT BUỘC ĐỂ "".
   - "ticket_types": Mảng chứa ĐẦY ĐỦ các hạng vé với tên, giá tiền VNĐ chính xác, số lượng và mô tả quyền lợi [{ "name": string, "price": number, "quantity_total": number | null, "description": string }].
     * "quantity_total": Số lượng vé tương ứng. NẾU TÀI LIỆU KHÔNG GHI RÕ SỐ LƯỢNG VÉ, BẮT BUỘC ĐỂ null. TUYỆT ĐỐI KHÔNG ĐIỀN 100 HAY BẤT KỲ SỐ NÀO NẾU TÀI LIỆU KHÔNG NÊU.
     * "description": Mô tả quyền lợi của vé. Nếu không có để "".
   - "refund_policy": { "allow_refunds": boolean, "deadline_days": number } (nếu ghi vé không hoàn trả hoặc non-refundable thì allow_refunds là false).
   - "require_attendee_information": boolean (true nếu tài liệu yêu cầu thu thập thông tin người tham dự như họ tên, email, sđt...; ngược lại false).
   - "additional_terms": ${hasStructuredTerms ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn).' : 'Các điều khoản riêng nếu có.'}
   - "tags": Mảng các từ khóa liên quan đến sự kiện. TUYỆT ĐỐI KHÔNG chứa tag "EventHub" hay "eventhub". BẮT BUỘC bao gồm tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} trong danh sách tags.
6. Chỉ xuất ra DUY NHẤT một chuỗi JSON hợp lệ theo cấu trúc mẫu, không giải thích thêm:

=== CẤU TRÚC JSON MẪU BẮT BUỘC ===
{
  "title": "",
  "category_id": "",
  "short_description": "",
  "description": "",
  "venue_name": "",
  "address_line": "",
  "ward": "",
  "district": "",
  "province": "",
  "sessions": [
    {
      "session_name": "Phiên 1",
      "start_date": "",
      "start_time": "",
      "end_time": "",
      "checkin_start_time": ""
    }
  ],
  "ticket_types": [],
  "refund_policy": {
    "allow_refunds": false,
    "deadline_days": 7
  },
  "require_attendee_information": false,
  "additional_terms": "",
  "tags": [${organizerName ? `"${organizerName}", ` : ''}"Sự kiện"]
}`;

    let parsedData = null;
    let usedModel = PRIMARY_MODEL;
    let warnings = [];

    // Helper: Gọi Ollama kèm timeout
    const maxTokens = 2048;
    const callOllamaModel = async (modelName) => {
      logger.info(`[AiDocumentParser] Đang gọi Ollama model: ${modelName} (Timeout: ${TIMEOUT_MS}ms, maxTokens: ${maxTokens})`);
      const raw = await Promise.race([
        ollamaClient.generate(prompt, {
          model: modelName,
          format: 'json',
          think: false,
          temperature: 0.1,
          max_tokens: maxTokens,
          num_ctx: 4096,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Ollama extraction timeout sau ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
        ),
      ]);
      logger.info(`[AiDocumentParser] Raw Ollama response: ${raw}`);
      const parsed = ollamaClient.extractJSON(raw);
      return parsed;
    };

    // 2. Gọi mô hình PRIMARY_MODEL
    try {
      parsedData = await callOllamaModel(PRIMARY_MODEL);
      if (parsedData && parsedData.title) {
        logger.info(`[AiDocumentParser] Trích xuất thành công bằng ${PRIMARY_MODEL}`);
      } else {
        parsedData = null;
      }
    } catch (err) {
      logger.warn(`[AiDocumentParser] Model ${PRIMARY_MODEL} không khả dụng (${err.message})`);
      // Thử fallback sang FALLBACK_MODEL nếu cấu hình khác PRIMARY_MODEL
      if (FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL) {
        try {
          logger.info(`[AiDocumentParser] Thử chuyển sang mô hình dự phòng: ${FALLBACK_MODEL}`);
          parsedData = await callOllamaModel(FALLBACK_MODEL);
          if (parsedData && parsedData.title) {
            usedModel = FALLBACK_MODEL;
            warnings.push(`Đang sử dụng mô hình dự phòng (${FALLBACK_MODEL}).`);
          } else {
            parsedData = null;
          }
        } catch (fbErr) {
          logger.warn(`[AiDocumentParser] Mô hình dự phòng ${FALLBACK_MODEL} cũng thất bại: ${fbErr.message}`);
          parsedData = null;
        }
      }
    }

    // 3. Fallback Parser bằng Regex (nếu toàn bộ Ollama offline hoặc timeout)
    if (!parsedData) {
      usedModel = 'heuristic-regex-extractor';
      warnings.push(`AI Engine tạm thời không phản hồi. Hệ thống đã kích hoạt bộ trích xuất dự phòng.`);
      parsedData = this._heuristicExtraction(text, categories, detectedSections, options);
    }

    // 4. Chuẩn hóa và làm sạch dữ liệu (Data Sanitization & Business Rules)
    const sanitized = this._sanitizeAndValidate(parsedData, categories, warnings, text, detectedSections, options);

    return {
      success: true,
      data: sanitized,
      model_used: usedModel,
      warnings,
    };
  }

  /**
   * Làm sạch tiền tố hành chính của tiêu đề để lấy tên thực tế của sự kiện
   */
  _cleanDocumentTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    let clean = rawTitle.replace(/^[#\*\s\-–—"':]+|[#\*\s\-–—"':]+$/g, '').trim();
    const prefixRegex = /^(?:kế\s*hoạch\s*tổ\s*chức|đề\s*án\s*tổ\s*chức|thông\s*báo\s*(?:về\s*(?:việc\s*)?)?tổ\s*chức|kế\s*hoạch|đề\s*án|email\s*trao\s*đổi\s*về|tài\s*liệu\s*mẫu\s*kiểm\s*thử\s*(?:chức\s*năng\s*)?trích\s*xuất\s*thông\s*tin\s*sự\s*kiện\s*[:：\-–]?|thư\s*mời\s*tham\s*dự|chương\s*trình|workshop\s*brief|program\s*overview|please\s*hold\s*the\s*date|food\s*festival\s*data\s*sheet|subject\s*[:：\-–—]?\s*(?:please\s*hold\s*the\s*date\s*[—\-–]?\s*)?|name\s*maybe)\s*(?:sự\s*kiện\s*)?[:：\-–—]?\s*/i;
    let stripped = clean.replace(prefixRegex, '').trim();

    // Nếu tiêu đề bắt đầu bằng chuỗi trong ngoặc kép ví dụ “Layers of the City” brings emerging... -> lấy phần trong ngoặc
    const leadQuote = stripped.match(/^[“"«]([^”"»\r\n]{3,80})[”"»]/);
    if (leadQuote && !this._isGenericDocumentTitle(leadQuote[1])) {
      stripped = leadQuote[1].trim();
    } else if (stripped.includes('“') && stripped.includes('”')) {
      const qm = stripped.match(/[“"«]([^”"»\r\n]{3,80})[”"»]/);
      if (qm && !this._isGenericDocumentTitle(qm[1])) {
        stripped = qm[1].trim();
      }
    }

    // Nếu chứa các phương án phân tách bằng gạch chéo ví dụ "Night of New Voices" / "New Voices Live" -> lấy phương án đầu tiên
    if (stripped.includes(' / ')) {
      const firstOption = stripped.split(' / ')[0].replace(/^[#\*\s\-–—"':]+|[#\*\s\-–—"':]+$/g, '').trim();
      if (firstOption.length >= 3 && !this._isGenericDocumentTitle(firstOption)) {
        stripped = firstOption;
      }
    }

    if (stripped.length >= 3 && !this._isGenericDocumentTitle(stripped)) {
      return stripped;
    }
    return clean;
  }

  /**
   * Kiểm tra xem một chuỗi có phải là tiêu đề chung/tên loại văn bản chứ không chứa tên sự kiện cụ thể
   */
  _isGenericDocumentTitle(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.replace(/^[#\*\s\-–—"':]+|[#\*\s\-–—"':]+$/g, '').trim().toLowerCase();
    if (!clean || clean.length < 3) return true;

    const genericExactPatterns = [
      /^(?:event\s*proposal|proposal|kế\s*hoạch\s*(?:tổ\s*chức\s*)?sự\s*kiện|đề\s*xuất\s*sự\s*kiện|kịch\s*bản\s*sự\s*kiện|tài\s*liệu\s*(?:mẫu|sự\s*kiện|kiểm\s*thử)|eventhub|event\s*plan|event\s*outline)$/i,
      /^(?:email|thư|thư\s*điện\s*tử|tin\s*nhắn|thông\s*báo|thông\s*điệp|trao\s*đổi|biên\s*bản|dự\s*thảo|kế\s*hoạch|đề\s*án|tờ\s*trình|báo\s*cáo|memo|notes?|minutes)$/i,
      /^(?:email\s*trao\s*đổi\s*về\s*sự\s*kiện|kế\s*hoạch\s*tổ\s*chức\s*sự\s*kiện|đề\s*xuất\s*tổ\s*chức\s*sự\s*kiện)$/i,
      /^(?:for\s*immediate\s*release(?:\s*[—\-–]?\s*draft)?|food\s*festival\s*data\s*sheet|workshop\s*brief|program\s*overview|rough\s*notes.*)$/i,
      /^(?:eventhub|hub)[\s\-–—]*(?:ai\s*create\s*event)?$/i,
      /^tài\s*liệu\s*mẫu/i,
      /^name\s*maybe/i,
      /^\d+[\.\)]\s*(?:thông\s*tin\s*sự\s*kiện|event\s*information)/i,
      /^\[\d{1,2}:\d{2}\]/i,
    ];

    return genericExactPatterns.some((p) => p.test(clean));
  }

  _toIsoDate(year, month, day) {
    const y = String(year);
    const m = String(Number(month)).padStart(2, '0');
    const d = String(Number(day)).padStart(2, '0');
    if (!y || m === 'NaN' || d === 'NaN' || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) {
      return '';
    }
    return `${y}-${m}-${d}`;
  }

  _formatIsoDate(rawDate) {
    if (!rawDate) return '';
    const rd = String(rawDate).trim();
    if (/^\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}$/.test(rd)) {
      const [y, m, d] = rd.split(/[\-\/\.]/);
      return this._toIsoDate(y, m, d);
    }
    if (/^\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4}$/.test(rd)) {
      const [d, m, y] = rd.split(/[\-\/\.]/);
      return this._toIsoDate(y, m, d);
    }
    return '';
  }

  _isSkippedDateContext(text, index) {
    const windowStart = Math.max(0, index - 40);
    const prefix = text.slice(windowStart, index);
    return DATE_SKIP_CONTEXT.test(prefix);
  }

  _parseEnglishDateToIso(raw) {
    if (!raw) return '';
    const text = String(raw).replace(/\s+/g, ' ').trim();
    const re = new RegExp(
      `(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b,?\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`,
      'i'
    );
    const m = text.match(re);
    if (m) return this._toIsoDate(m[3], EN_MONTHS[m[2].toLowerCase()], m[1]);
    const re2 = new RegExp(`(${EN_MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i');
    const m2 = text.match(re2);
    if (m2) return this._toIsoDate(m2[3], EN_MONTHS[m2[1].toLowerCase()], m2[2]);
    return '';
  }

  _dateAppearsInText(iso, text) {
    if (!iso || !text) return false;
    const src = String(text);
    if (src.includes(iso)) return true;
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return false;
    const dNum = String(Number(d));
    const mNum = String(Number(m));
    const variants = [
      `${d}/${m}/${y}`,
      `${dNum}/${mNum}/${y}`,
      `${d}.${m}.${y}`,
      `${dNum}.${mNum}.${y}`,
      `${d}-${m}-${y}`,
      `${iso.replace(/-/g, '/')}`,
    ];
    if (variants.some((v) => src.includes(v))) return true;
    const monthName = Object.keys(EN_MONTHS).find((k) => EN_MONTHS[k] === Number(m) && k.length > 3);
    if (monthName) {
      const re = new RegExp(`${dNum}(?:st|nd|rd|th)?\\s+${monthName}\\s+${y}|${monthName}\\s+${dNum}(?:st|nd|rd|th)?,?\\s+${y}`, 'i');
      if (re.test(src)) return true;
    }
    return false;
  }

  _parsePriceToken(raw) {
    if (raw === undefined || raw === null) return 0;
    const text = String(raw).trim().toLowerCase().replace(/\s/g, '');
    if (!text) return 0;
    const kMatch = text.match(/^(\d+(?:[.,]\d+)?)k$/i);
    if (kMatch) {
      return Math.round(Number(kMatch[1].replace(',', '.')) * 1000);
    }
    const num = Number(String(raw).replace(/[^\d]/g, ''));
    return Number.isNaN(num) ? 0 : num;
  }

  _tryParseEventJson(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    let candidate = trimmed;
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidate = fence[1].trim();
    if (!candidate.startsWith('{')) {
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start < 0 || end <= start || start > 80) return null;
      candidate = candidate.slice(start, end + 1);
    }
    try {
      const obj = JSON.parse(candidate);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      if (!(obj.title || obj.event_name || obj.name || obj.sessions || obj.tickets || obj.ticket_types)) {
        return null;
      }
      return obj;
    } catch (_err) {
      return null;
    }
  }

  _mapJsonEventDocument(obj) {
    if (!obj) return null;
    const sessionSource = Array.isArray(obj.sessions) ? obj.sessions : [];
    const sessions = sessionSource.map((s, idx) => {
      const dateRaw = s.date || s.start_date || s.startDate || '';
      const startDate = this._formatIsoDate(dateRaw) || this._parseEnglishDateToIso(dateRaw);
      return {
        session_name: s.session_name || s.name || (sessionSource.length > 1 ? `Phiên ${idx + 1}` : 'Phiên sự kiện'),
        start_date: startDate,
        start_time: this._normalizeTime(s.start_time || s.startTime || '', ''),
        end_date: startDate,
        end_time: this._normalizeTime(s.end_time || s.endTime || '', ''),
        checkin_start_time: this._normalizeTime(s.check_in_time || s.checkin_start_time || s.checkInTime || '', ''),
      };
    });
    const venueFromSession = sessionSource[0] || {};
    const ticketSource = Array.isArray(obj.tickets) ? obj.tickets : (Array.isArray(obj.ticket_types) ? obj.ticket_types : []);
    const tickets = ticketSource.map((t) => ({
      name: String(t.name || t.ticket_name || 'Hạng vé').trim(),
      price: this._parsePriceToken(t.price),
      quantity_total: t.quantity != null ? Number(t.quantity) : (t.quantity_total != null ? Number(t.quantity_total) : null),
      description: String(t.description || t.type || '').trim(),
    }));
    const attendee = obj.require_attendee_information;
    const requireAttendee = Array.isArray(attendee) ? attendee.length > 0 : Boolean(attendee);

    return {
      title: String(obj.title || obj.event_name || obj.name || '').trim(),
      category: String(obj.category || obj.category_name || '').trim(),
      tags: Array.isArray(obj.tags) ? obj.tags.join(', ') : String(obj.tags || ''),
      short_description: String(obj.short_description || obj.summary || '').trim(),
      description: String(obj.description || '').trim(),
      venue: {
        venue_name: String(obj.venue_name || obj.venue || venueFromSession.venue_name || '').trim(),
        address_line: String(obj.address_line || obj.address || venueFromSession.address || '').trim(),
        district: String(obj.district || venueFromSession.district || '').trim(),
        province: String(obj.province || obj.city || venueFromSession.city || venueFromSession.province || '').trim(),
      },
      sessions,
      tickets,
      require_attendee_information: requireAttendee,
      additional_terms: String(obj.notes || obj.additional_terms || '').trim(),
    };
  }

  _extractQuotedTitles(text) {
    if (!text) return [];
    const titles = [];
    const re = /(?:[“"«]|(?<=\s|^)['‘])([^“"”'’\r\n]{3,120})[”"»'’]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = this._cleanDocumentTitle(m[1]);
      if (raw && !this._isGenericDocumentTitle(raw) && !/^(yes|no|ok|draft|homies|định\s*mệnh)$/i.test(raw)) {
        titles.push(raw);
      }
    }
    return titles;
  }

  _parseEnglishDateRangeSessions(text) {
    if (!text) return [];
    const re = new RegExp(`(\\d{1,2})\\s*[–\\-]\\s*(\\d{1,2})\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`, 'i');
    const m = text.match(re);
    if (!m) return [];
    const startDay = Number(m[1]);
    const endDay = Number(m[2]);
    const month = EN_MONTHS[m[3].toLowerCase()];
    const year = m[4];
    if (!month || endDay < startDay || endDay - startDay > 14) return [];
    const hours = this._extractPrimaryHours(text);
    const sessions = [];
    for (let day = startDay; day <= endDay; day += 1) {
      const iso = this._toIsoDate(year, month, day);
      sessions.push({
        session_name: `Ngày ${day}`,
        start_date: iso,
        start_time: hours.start,
        end_date: iso,
        end_time: hours.end,
        checkin_start_time: hours.checkin,
      });
    }
    return sessions;
  }

  _extractPrimaryHours(text) {
    const result = { checkin: '', start: '', end: '' };
    if (!text) return result;

    const ciMatch = text.match(/(?:check[\s\-]?in(?:\s*and\s*welcome)?|registration\s*opens|gates?\s*open|doors?\s*open|đón\s*khách|mở\s*cửa|khách\s*bắt\s*đầu\s*vào|doors?\s*at)\s*[:：]?\s*(?:từ\s*|from\s*|at\s*|lúc\s*|khoảng\s*)?(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?)?)/i);
    if (ciMatch) result.checkin = this._normalizeTime(ciMatch[1], '');

    const labeledHours = text.match(/(?:operating\s*hours|opening\s*hours)\s*[:：]?\s*(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})/i);
    const workshopRange = text.match(/\bworkshop\s*[:：]?\s*(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})/i);
    const sessionFrom = text.match(/(?:session|chương\s*trình\s*chính)\s*(?:from|khoảng|từ)?\s*(\d{1,2}[:h]\d{2})\s*(?:to|đến|[–\-])\s*(\d{1,2}[:h]\d{2})/i);
    if (labeledHours) {
      result.start = this._normalizeTime(labeledHours[1], '');
      result.end = this._normalizeTime(labeledHours[2], '');
    } else if (workshopRange) {
      result.start = this._normalizeTime(workshopRange[1], '');
      result.end = this._normalizeTime(workshopRange[2], '');
    } else if (sessionFrom) {
      result.start = this._normalizeTime(sessionFrom[1], '');
      result.end = this._normalizeTime(sessionFrom[2], '');
    } else {
      const ranges = [...text.matchAll(/(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})/g)];
      if (ranges.length > 0) {
        result.start = this._normalizeTime(ranges[0][1], '');
        result.end = this._normalizeTime(ranges[ranges.length - 1][2], '');
      }
    }

    const startMatch = text.match(/(?:opening\s*program|first\s*act|xuất\s*phát|start(?:\s*time)?|bắt\s*đầu|community\s*workshops|craft\s*and\s*language)\s*[:：]?\s*(?:from|at|lúc|khoảng)?\s*(\d{1,2}[:h]\d{2})/i);
    if (startMatch && !labeledHours && !workshopRange) {
      result.start = this._normalizeTime(startMatch[1], '');
    } else if (startMatch && !result.start) {
      result.start = this._normalizeTime(startMatch[1], '');
    }

    const endMatch = text.match(/(?:end(?:\s*time)?|kết\s*thúc|finish(?:\s*around)?|closing(?:\s*gathering)?)\s*[:：]?\s*(?:trước\s*|before\s*|around\s*|khoảng\s*)?(\d{1,2}[:h]\d{2})/i);
    if (endMatch && !labeledHours && !workshopRange) {
      result.end = this._normalizeTime(endMatch[1], '');
    } else if (endMatch && !result.end) {
      result.end = this._normalizeTime(endMatch[1], '');
    }

    if (!result.end) {
      const denMatch = text.match(/\bđến\s+(\d{1,2}[:h]\d{2})/i);
      if (denMatch) result.end = this._normalizeTime(denMatch[1], '');
    }
    return result;
  }

  _parseDayNumberedBlocks(text) {
    if (!text) return [];
    const dayRe = /(?:^|\n)\s*Day\s*(\d+)\s*[—\-–:]?\s*([^\n]*)/gi;
    const matches = [...text.matchAll(dayRe)];
    if (matches.length < 2) return [];
    const sessions = [];
    for (let i = 0; i < matches.length; i += 1) {
      const startIdx = matches[i].index;
      const endIdx = matches[i + 1] ? matches[i + 1].index : text.length;
      const block = text.slice(startIdx, endIdx);
      const header = matches[i][2] || '';
      const iso = this._parseEnglishDateToIso(header) || this._formatIsoDate(header);
      const hours = this._extractPrimaryHours(block);
      if (!hours.start) {
        const firstTime = block.match(/(\d{1,2}[:h]\d{2})/);
        if (firstTime) hours.start = this._normalizeTime(firstTime[1], '');
      }
      if (!hours.end) {
        const times = [...block.matchAll(/(\d{1,2}[:h]\d{2})/g)];
        if (times.length > 0) hours.end = this._normalizeTime(times[times.length - 1][1], '');
      }
      sessions.push({
        session_name: `Ngày ${matches[i][1]}${header ? `: ${header.trim()}` : ''}`,
        start_date: iso,
        start_time: hours.start,
        end_date: iso,
        end_time: hours.end,
        checkin_start_time: hours.checkin,
      });
    }
    return sessions;
  }

  _parseLooseTickets(text) {
    if (!text) return [];
    const tickets = [];
    const seen = new Set();
    const pushTicket = (name, priceRaw, qtyRaw, desc = '') => {
      let cleanName = String(name || '').replace(/^[\-•\*\d\.\)\s]+/, '').replace(/\s+/g, ' ').trim();
      cleanName = cleanName.replace(/^(?:talked\s*about\s*)/i, '').trim();
      cleanName = cleanName.replace(/^(?:vé|hạng vé|ticket)\s+/i, '').trim() || cleanName;
      if (!cleanName || cleanName.length < 2 || cleanName.length > 80) return;
      if (/^(admission|draft|status|missing|note|contact|organizer|prices?|ideas?)$/i.test(cleanName)) return;
      if (/free|miễn phí|not decided|undecided|may be free/i.test(String(name) + String(priceRaw))) {
        if (!/\d/.test(String(priceRaw))) return;
      }
      const price = this._parsePriceToken(priceRaw);
      if (price <= 0) return;
      const key = cleanName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      let qty = null;
      if (qtyRaw != null && String(qtyRaw).trim() !== '') {
        const q = Number(String(qtyRaw).replace(/[^\d]/g, ''));
        if (!Number.isNaN(q) && q > 0 && q !== price) qty = q;
      }
      let formattedName = cleanName;
      if (/^\d+\s*km$/i.test(cleanName)) formattedName = `Vé ${cleanName}`;
      else if (/^vip$/i.test(cleanName)) formattedName = 'Vé VIP';
      else if (/^standard$/i.test(cleanName)) formattedName = 'Vé Standard';
      else if (/^đặt\s*sớm$/i.test(cleanName)) formattedName = 'Vé đặt sớm';
      else if (/^thường$/i.test(cleanName)) formattedName = 'Vé thường';
      tickets.push({
        name: formattedName,
        price,
        quantity_total: qty,
        description: String(desc || '').trim(),
      });
    };

    let m;
    const pipeRe = /(?:^|\n)[ \t]*[\-•\*]?[ \t]*([^|\n]+?)[ \t]*\|[ \t]*([0-9\.,]+)[ \t]*(?:vnd|vnđ|đồng)?[ \t]*(?:\|[ \t]*(?:quantity\s*)?([0-9\.,]+))?/gi;
    while ((m = pipeRe.exec(text)) !== null) {
      pushTicket(m[1], m[2], m[3]);
    }

    const lineRe = /(?:^|\n)[ \t]*[•\-\*]?[ \t]*([A-Za-z0-9][A-Za-z0-9 \tÀ-ỹ/'&+]{1,50}?)[ \t]*[—\-–:]+[ \t]*([0-9][0-9\.,]*)[ \t]*(k\b|vnd|vnđ|đồng)\b([^.\n]*)/gi;
    while ((m = lineRe.exec(text)) !== null) {
      const priceToken = m[3].toLowerCase() === 'k' ? `${m[2]}k` : m[2];
      const tail = m[4] || '';
      const qtyHit = tail.match(/(?:quantity|places?|chỗ|bundles?|vé|suất)[ \t]*([0-9][0-9\.,]*)/i)
        || tail.match(/([0-9][0-9\.,]*)[ \t]*(?:places?|teams?|bundles?|chỗ|vé)/i);
      const desc = qtyHit
        ? tail.replace(/(?:số\s*lượng(?:\s*là)?|proposed\s*quantity|quantity|places?|chỗ|bundles?|vé|suất)[ \t]*[0-9][0-9\.,]*\s*(?:places?|teams?|bundles?|chỗ|vé)?/i, '').replace(/^[—\-–:,;\s]+|[—\-–:,;\s]+$/g, '').trim()
        : tail.replace(/^[—\-–:,;\s]+|[—\-–:,;\s]+$/g, '').trim();
      pushTicket(m[1], priceToken, qtyHit ? qtyHit[1] : null, desc);
    }

    const proseEn = /((?:student(?:\/nonprofit)?|standard|vip|community|founder(?:\s*plus)?|learner|team|volunteer|general(?:\s*entry)?|family(?:\s*bundle)?|day|three[\-\s]?day|single[\-\s]?day|regular|discounted|supporter|đặt\s*sớm|thường)\s*(?:pass|ticket|seat|entry|bundle)?)\s*(?:at|for|is|là|:)?\s*([0-9][0-9\.,]*)\s*(k\b|vnd|vnđ|đồng)/gi;
    while ((m = proseEn.exec(text)) !== null) {
      const priceToken = m[3].toLowerCase() === 'k' ? `${m[2]}k` : m[2];
      const qtyNear = text.slice(m.index, m.index + 80).match(/(?:quantity|places?|số\s*lượng)\s*([0-9][0-9\.,]*)/i);
      const tail = text.slice(m.index + m[0].length).split('\n')[0] || '';
      let desc = '';
      const descHit = tail.match(/^[ \t]*[—\-–:][ \t]*([^\n]+)/);
      if (descHit && !/(?:quantity|places?|số\s*lượng)/i.test(descHit[1])) {
        desc = descHit[1].trim();
      }
      pushTicket(m[1], priceToken, qtyNear ? qtyNear[1] : null, desc);
    }

    const kmRe = /vé\s+(\d+\s*km)\s+là\s+(\d+)\s*k\b/gi;
    while ((m = kmRe.exec(text)) !== null) {
      pushTicket(`Vé ${m[1]}`, `${m[2]}k`, null);
    }

    const kLineRe = /(?:^|\n)[ \t]*[\-•\*]?[ \t]*([A-Za-z][A-Za-z0-9 \tÀ-ỹ]{1,40}?)[ \t]+(\d{2,4})[ \t]*k\b/gi;
    while ((m = kLineRe.exec(text)) !== null) {
      pushTicket(m[1], `${m[2]}k`, null);
    }

    return tickets;
  }

  _parseFlexibleLocation(text) {
    const venue = { venue_name: '', address_line: '', district: '', province: '' };
    if (!text) return venue;
    const labeled = text.match(/(?:Venue(?:\s*Name)?|Location|Where|Địa\s*điểm|Nơi\s*tổ\s*chức)\s*[:：\-–]\s*([^\n\r]+)/i);
    if (labeled) {
      let rest = labeled[1].trim();
      const distInLine = rest.match(/\|\s*District\s*[:：]?\s*([^|]+)/i);
      const cityInLine = rest.match(/\|\s*City\s*[:：]?\s*([^|]+)/i);
      rest = rest.replace(/\|\s*(?:District|City|Ward)\s*[:：]?[^|]*/gi, '').trim();
      const parts = rest.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
      const lastPart = parts[parts.length - 1] || '';
      if (parts.length >= 2 && /da nang|đà nẵng|hà nội|ha noi|hồ chí minh|ho chi minh|hue|huế|cần thơ|can tho/i.test(lastPart)) {
        venue.province = parts.pop();
        venue.venue_name = parts.join(', ');
      } else if (!/is being considered|chưa\s*(?:được\s*)?chốt/i.test(rest)) {
        venue.venue_name = rest.split('|')[0].trim();
      }
      if (distInLine) venue.district = distInLine[1].trim();
      if (cityInLine) venue.province = cityInLine[1].trim();
    }
    if (!venue.district) {
      const dist = text.match(/(?:District|Quận)\s*(\d+|[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\s]+?)(?:[,.\n|]|$)/i)
        || text.match(/(?:khu\s*vực|ở|in)\s+([A-Za-zÀ-ỹ\s]{2,30}?)(?=[,;\s]+(?:TP|Da Nang|Đà Nẵng|HCM|Hồ Chí Minh|Hà Nội|Huế|Cần Thơ))/i);
      if (dist) {
        let rawDist = dist[1].replace(/\s+/g, ' ').trim();
        rawDist = rawDist.replace(/^khu\s*vực\s+/i, '').trim();
        if (!/tổ\s*chức|công\s*viên|all\s*cases|any\s*case|general|addition/i.test(rawDist)) {
          venue.district = /^\d+$/.test(rawDist) ? `Quận ${rawDist}` : rawDist;
        }
      }
    }
    if (!venue.province || /is being considered/i.test(venue.province)) {
      const city = text.match(/\b(Da Nang|Đà Nẵng|Ho Chi Minh City|TP\.?\s*HCM|Hà Nội|Ha Noi|Hue City|Huế|Cần Thơ|Can Tho|Hải Phòng)\b/i);
      if (city) venue.province = city[1];
    }
    if (!venue.venue_name) {
      const named = text.match(/(?:quanh|tại|at)\s+([A-ZÀ-Ỹ][^,.\n]{3,60}?)(?:,|\.|$)/);
      if (named && !/gallery|coworking|cultural center|indoor event space|quán cà phê/i.test(named[1])) {
        venue.venue_name = named[1].trim();
      }
    }
    return venue;
  }

  /**
   * Bóc tách các phần cấu trúc rõ ràng trong tài liệu (Ground Truth Extraction)
   * Giúp bảo toàn 100% nguyên văn mô tả, tiêu đề, tóm tắt khi tài liệu đã có cấu trúc (kể cả định dạng Markdown #, **, v.v.)
   * @param {string} text
   * @returns {object} { title, short_description, description, additional_terms, schedule_location, ticket_info, attendee_info, category, tags }
   */
  _extractDocumentSections(text) {
    if (!text || typeof text !== 'string') return {};
    const converted = this._convertTabsToMarkdownTable(text);
    const norm = converted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const jsonDoc = this._tryParseEventJson(norm);
    const jsonMapped = jsonDoc ? this._mapJsonEventDocument(jsonDoc) : null;

    const pfx = '^[ \\t]*(?:#{1,6}\\s*)?(?:\\*{1,2}\\s*)?(?:\\d+[\\.\\)]\\s*)?(?:\\*{1,2}\\s*)?';
    const sfx = '(?:\\*{1,2})?\\s*(?:[:：]\\s*([^\\n]*)|[ \\t]*(?:\\*{1,2})?\\s*)$';

    const headerDefs = [
      { key: 'title', singleLine: true, regex: new RegExp(`${pfx}(?:TIÊU\\s*ĐỀ|TÊN\\s*SỰ\\s*KIỆN|TÊN\\s*HOẠT\\s*ĐỘNG|EVENT\\s*NAME|EVENT\\s*TITLE|NAME\\s*OF\\s*EVENT|TITLE|(?<![A-Za-z0-9])EVENT(?!\\s*(?:NAME|TITLE|SCHEDULE|DETAILS?|DESCRIPTION|PROPOSAL|HUB)))[:：\\-–]\\s*([^\\n]+)$`, 'im') },
      { key: 'category', singleLine: true, regex: new RegExp(`${pfx}(?:DANH\\s*MỤC|THỂ\\s*LOẠI|CHỦ\\s*ĐỀ|EVENT\\s*CATEGORY|CATEGORY|GENRE|TOPIC)${sfx}`, 'im') },
      { key: 'tags', singleLine: true, regex: new RegExp(`${pfx}(?:TAGS?|TỪ\\s*KHÓA|TỪ\\s*KHOÁ|NHÃN|KEYWORDS?)${sfx}`, 'im') },
      { key: 'short_description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*NGẮN|TÓM\\s*TẮT|GIỚI\\s*THIỆU\\s*NGẮN|SHORT\\s*DESCRIPTION|BRIEF\\s*DESCRIPTION|SUMMARY|BRIEF)${sfx}`, 'im') },
      { key: 'description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*CHI\\s*TIẾT|DETAILED\\s*DESCRIPTION|DETAIL\\s*DESCRIPTION|FULL\\s*DESCRIPTION|NỘI\\s*DUNG\\s*CHI\\s*TIẾT|NỘI\\s*DUNG\\s*SỰ\\s*KIỆN|EVENT\\s*DESCRIPTION|EVENT\\s*DETAILS?|ABOUT\\s*(?:THE\\s*)?EVENT|GIỚI\\s*THIỆU\\s*SỰ\\s*KIỆN)${sfx}`, 'im') },
      { key: 'schedule_location', regex: new RegExp(`${pfx}(?:EVENT\\s*SCHEDULE|LỊCH\\s*TRÌNH(?:\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM)?|THỜI\\s*GIAN(?:\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM)?|SCHEDULE(?:\\s*(?:AND|&)\\s*LOCATION)?|AGENDA|TIME\\s*(?:AND|&)\\s*LOCATION|DATE\\s*(?:AND|&)\\s*TIME)${sfx}`, 'im') },
      { key: 'ticket_info', regex: new RegExp(`${pfx}(?:TICKET\\s*INFORMATION|TICKET\\s*INFO|BẢNG\\s*GIÁ\\s*VÉ|THÔNG\\s*TIN\\s*VÉ|GIÁ\\s*VÉ|HẠNG\\s*VÉ|VÉ\\s*THAM\\s*GIA|TICKETS?|TICKET\\s*PRICES?|PRICING)${sfx}`, 'im') },
      { key: 'additional_terms', regex: new RegExp(`${pfx}(?:ORGANIZER\\s*NOTES?|ADDITIONAL\\s*(?:INFORMATION|NOTES?|TERMS?)|IMPORTANT\\s*NOTES?|CHÍNH\\s*SÁCH\\s*VÉ|ĐIỀU\\s*KHOẢN\\s*(?:&|VÀ)\\s*QUY\\s*ĐỊNH(?:\\s+DÀNH\\s+CHO\\s+[^\\n:]+)?|LƯU\\s*Ý\\s*THÊM|GHI\\s*CHÚ\\s*THÊM)${sfx}`, 'im') },
    ];

    const foundHeaders = [];
    for (const def of headerDefs) {
      const match = def.regex.exec(norm);
      if (match) {
        foundHeaders.push({
          key: def.key,
          singleLine: def.singleLine,
          index: match.index,
          headerFullLength: match[0].length,
          inlineValue: match[1] ? match[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim() : '',
        });
      }
    }

    // Nếu chưa tìm thấy description theo các từ khóa chi tiết, tìm MÔ TẢ / DESCRIPTION chung xuất hiện TRƯỚC schedule/tickets
    if (!foundHeaders.some((h) => h.key === 'description')) {
      const genericDescRegex = new RegExp(`${pfx}(?:MÔ\\s*TẢ(?!(?:\\s*NGẮN|\\s*CỦA))|DESCRIPTION|NỘI\\s*DUNG|GIỚI\\s*THIỆU)${sfx}`, 'im');
      const match = genericDescRegex.exec(norm);
      if (match) {
        // Chỉ chấp nhận nếu xuất hiện trước schedule hoặc ticket
        const firstSchedOrTicket = foundHeaders.find((h) => h.key === 'schedule_location' || h.key === 'ticket_info');
        if (!firstSchedOrTicket || match.index < firstSchedOrTicket.index) {
          foundHeaders.push({
            key: 'description',
            singleLine: false,
            index: match.index,
            headerFullLength: match[0].length,
            inlineValue: match[1] ? match[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim() : '',
          });
        }
      }
    }

    foundHeaders.sort((a, b) => a.index - b.index);

    const sections = {};
    for (let i = 0; i < foundHeaders.length; i++) {
      const current = foundHeaders[i];
      const startIndex = current.index + current.headerFullLength;
      const next = foundHeaders[i + 1];
      const endIndex = next ? next.index : norm.length;
      let block = norm.slice(startIndex, endIndex).trim();

      if (current.singleLine) {
        sections[current.key] = current.inlineValue || (block.split('\n')[0] || '').replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
      } else {
        if (current.inlineValue) {
          block = current.inlineValue + (block ? '\n' + block : '');
        }
        sections[current.key] = block;
      }
    }

    if (sections.title) {
      sections.title = this._cleanDocumentTitle(sections.title.split('\n')[0]);
    }

    // 1. Tìm tên chương trình / sự kiện trong văn bản tự sự (Prose event name):
    // "chương trình mang tên **Campus Creative Week 2027**", "sự kiện có tên là ...", "hoạt động mang tên ..."
    const proseTitleMatch = norm.match(/(?:chương\s*trình|sự\s*kiện|hoạt\s*động|đêm\s*nhạc|buổi\s*(?:biểu\s*diễn|nhạc)|workshop|exhibition|meetup)\s*(?:dự\s*kiến\s*)?(?:mang\s*tên|có\s*tên\s*(?:là)?|tên\s*là|called|named)\s*[:：]?\s*[\*"“”]*([^\*"“”\n,\.]{3,100}?)[\*"“”]*(?:[,\.\n]| hướng đến| dành cho| nhằm)/i);
    let proseTitle = proseTitleMatch ? this._cleanDocumentTitle(proseTitleMatch[1]) : '';

    // 2. Tìm Subject trong email nếu có:
    // **Subject:** Kế hoạch tổ chức Campus Creative Week – thông tin chuẩn bị ban đầu
    const subjectMatch = norm.match(/(?:^|\n)[ \t]*(?:\*{1,2})?Subject(?:\*{1,2})?\s*[:：\-–]\s*([^\n\r]+)/i);
    let subjectTitle = '';
    if (subjectMatch) {
      let sub = subjectMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
      const emParts = sub.split(/\s*[–—]\s*/).map((p) => p.trim()).filter(Boolean);
      if (emParts.length > 1 && emParts[emParts.length - 1].length >= 8) {
        sub = emParts[emParts.length - 1];
      } else {
        sub = sub.split(/[-–—]/)[0].trim();
      }
      sub = this._cleanDocumentTitle(sub);
      if (sub && !this._isGenericDocumentTitle(sub)) {
        subjectTitle = sub;
      }
    }

    // Nếu không tìm thấy nhãn TIÊU ĐỀ hoặc nhãn bị generic (ví dụ "# EVENT PROPOSAL", "# Email trao đổi...")
    if (!sections.title || this._isGenericDocumentTitle(sections.title)) {
      if (jsonMapped && jsonMapped.title && !this._isGenericDocumentTitle(jsonMapped.title)) {
        sections.title = jsonMapped.title;
      } else if (proseTitle && !this._isGenericDocumentTitle(proseTitle)) {
        sections.title = proseTitle;
      } else if (subjectTitle && !this._isGenericDocumentTitle(subjectTitle)) {
        sections.title = subjectTitle;
      } else {
        // Kiểm tra dòng đầu tiên của tài liệu: nếu là tiêu đề sạch, ưu tiên sử dụng!
        const lines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
        let foundLineTitle = '';
        for (const line of lines) {
          const cleanedLine = this._cleanDocumentTitle(line);
          if (this._isGenericDocumentTitle(cleanedLine)) continue;
          const isHeaderKey = /^(?:#{1,6}\s*)?(?:\*{1,2}\s*)?(?:from|to|subject|thời gian|địa điểm|địa chỉ|ngày|mô tả|kính gửi|lưu ý|giá vé|nội dung|danh mục|tags?|event\s*name|category|detailed|short|schedule|tickets?|attendee|when|where|purpose|overview|draft|status|hi|hello)/i.test(line);
          if (!isHeaderKey && cleanedLine.length >= 3 && cleanedLine.length <= 150 && !this._isGenericDocumentTitle(cleanedLine)) {
            foundLineTitle = cleanedLine;
            break;
          }
        }

        const quoted = this._extractQuotedTitles(norm);
        if (quoted.length > 0 && (!foundLineTitle || (quoted[0].length > 10 && foundLineTitle.length < 8))) {
          sections.title = quoted[0];
        } else if (foundLineTitle) {
          sections.title = foundLineTitle;
        } else if (quoted.length > 0) {
          sections.title = quoted[0];
        }
      }
    }

    if (jsonMapped) {
      if (!sections.short_description && jsonMapped.short_description) sections.short_description = jsonMapped.short_description;
      if (!sections.description && jsonMapped.description) sections.description = jsonMapped.description;
      if (!sections.tags && jsonMapped.tags) sections.tags = jsonMapped.tags;
      if (!sections.category && jsonMapped.category) sections.category = jsonMapped.category;
      if (!sections.additional_terms && jsonMapped.additional_terms) sections.additional_terms = jsonMapped.additional_terms;
    }

    return sections;
  }

  /**
   * Bóc tách phiên sự kiện và địa điểm có cấu trúc từ text
   * @param {string} text
   * @returns {object} { venue: { venue_name, address_line, district, province }, sessions: [] }
   */
  _parseTimeStr(raw, period = '') {
    if (!raw) return '';
    const clean = String(raw).trim().toLowerCase();
    let h = 0;
    let m = 0;
    const hmMatch = clean.match(/(\d{1,2})[:h](\d{2})/);
    const hOnlyMatch = clean.match(/(\d{1,2})\s*giờ(?:\s*(\d{2}))?/);
    if (hmMatch) {
      h = parseInt(hmMatch[1], 10);
      m = parseInt(hmMatch[2], 10);
    } else if (hOnlyMatch) {
      h = parseInt(hOnlyMatch[1], 10);
      m = hOnlyMatch[2] ? parseInt(hOnlyMatch[2], 10) : 0;
    } else {
      const dMatch = clean.match(/\d{1,2}/);
      if (!dMatch) return '';
      h = parseInt(dMatch[0], 10);
    }

    const p = (period || clean).toLowerCase();
    const isPM = p.includes('chiều') || p.includes('tối') || p.includes('pm');
    const isAM = p.includes('sáng') || p.includes('am');
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _parseProseSchedule(docText) {
    if (!docText || typeof docText !== 'string') return [];
    const sessions = [];

    // Match date ranges like: "ngày 14 và 15 tháng 11 năm 2027" or "từ 14 đến 15/11/2027"
    const dateRangeMatch = docText.match(/ngày\s+(\d{1,2})\s*(?:và|đến|-|–)\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i);
    let d1 = '', d2 = '', month = '', year = '';
    if (dateRangeMatch) {
      d1 = dateRangeMatch[1];
      d2 = dateRangeMatch[2];
      month = dateRangeMatch[3];
      year = dateRangeMatch[4];
    }

    // Look for day blocks: "Ngày đầu tiên ...", "Sang ngày thứ hai ..."
    const day1TextMatch = docText.match(/(?:Ngày\s*(?:đầu\s*tiên|1)|ngày\s*thứ\s*nhất)[^]*?(?=(?:Sang\s*)?ngày\s*(?:thứ\s*hai|2)|Về\s*khách\s*mời|$)/i);
    const day2TextMatch = docText.match(/(?:(?:Sang\s*)?ngày\s*(?:thứ\s*hai|2))[^]*?(?=(?:Về\s*khách\s*mời|Để\s*khuyến\s*khích|Địa\s*điểm|$))/i);

    const parseDayTimes = (dayText) => {
      let checkin = '';
      let start = '';
      let end = '';
      if (!dayText) return { checkin, start, end };

      const ciMatch = dayText.match(/(?:đón\s*khách|check[\s\-]?in|mở\s*cửa)(?:\s*từ|\s*lúc|\s*bắt\s*đầu\s*từ)?\s*(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?/i);
      if (ciMatch) checkin = this._parseTimeStr(ciMatch[1], ciMatch[2]);

      const stMatch = dayText.match(/(?:bắt\s*đầu|khai\s*mạc|khởi\s*động)(?:\s*sẽ)?(?:\s*lúc|\s*từ)?\s*(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?/i);
      if (stMatch) start = this._parseTimeStr(stMatch[1], stMatch[2]);

      const endMatches = [...dayText.matchAll(/(?:kết\s*thúc|đến|đóng\s*cửa)(?:[^\d\n]*?)\s*(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?/gi)];
      if (endMatches.length > 0) {
        const lastEnd = endMatches[endMatches.length - 1];
        end = this._parseTimeStr(lastEnd[1], lastEnd[2]);
      }

      return { checkin, start, end };
    };

    if (d1 && d2 && month && year) {
      const s1Date = `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
      const s2Date = `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;

      const t1 = parseDayTimes(day1TextMatch ? day1TextMatch[0] : '');
      const t2 = parseDayTimes(day2TextMatch ? day2TextMatch[0] : '');

      sessions.push({
        session_name: 'Phiên 1 (Ngày 1)',
        start_date: s1Date,
        start_time: t1.start,
        end_date: s1Date,
        end_time: t1.end,
        checkin_start_time: t1.checkin,
      });

      sessions.push({
        session_name: 'Phiên 2 (Ngày 2)',
        start_date: s2Date,
        start_time: t2.start,
        end_date: s2Date,
        end_time: t2.end,
        checkin_start_time: t2.checkin,
      });
    }

    return sessions;
  }

  _parseProseLocation(docText) {
    if (!docText || typeof docText !== 'string') return { venue_name: '', address_line: '', district: '', province: '' };
    let venue_name = '';
    let district = '';
    let province = '';

    const locMatch = docText.match(/tại\s+([A-Za-z0-9\sÀ-ỹ\-]+?),\s*(?:khu\s*vực\s+)?([A-Za-z0-9\sÀ-ỹ\-]+?),\s*([A-Za-z0-9\sÀ-ỹ\-]+?)(?:[\.\n]| Ngày| Buổi|$)/i);
    if (locMatch) {
      venue_name = locMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
      district = locMatch[2].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
      province = locMatch[3].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
    } else {
      const vAlt = docText.match(/([A-Za-z0-9\sÀ-ỹ\-]{3,50}?)\s+(?:đã\s*được\s*đề\s*xuất\s*làm\s*nơi\s*tổ\s*chức|được\s*chọn\s*làm\s*địa\s*điểm)/i);
      if (vAlt) venue_name = vAlt[1].trim();
    }

    return { venue_name, address_line: '', district, province };
  }

  _parseProseTickets(docText) {
    if (!docText || typeof docText !== 'string') return [];
    const tickets = [];
    const ticketRegex = /vé\s+\*?\*?([A-Za-z0-9\sÀ-ỹ\-_]+?)\*?\*?\s*(?:có\s*giá|giá)?\s*[:：]?\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:đồng|vnd|vnđ|đ|k)\b(?:\s*,\s*(?:dự\s*kiến\s*phát\s*hành|số\s*lượng(?:\s*dự\s*kiến)?(?:\s*là)?)\s*(\d+)\s*vé)?(?:\s*,\s*dành\s*cho\s*([^\.\n]+))?/gi;
    let tm;
    while ((tm = ticketRegex.exec(docText)) !== null) {
      tickets.push({
        name: tm[1].trim(),
        price: Number(tm[2].replace(/[^\d]/g, '')),
        quantity_total: tm[3] ? Number(tm[3]) : null,
        description: tm[4] ? tm[4].trim() : '',
      });
    }
    return tickets;
  }

  /**
   * Bóc tách bảng lịch trình từ định dạng bảng Markdown hoặc tab-delimited
   */
  _parseMarkdownScheduleTable(text) {
    if (!text || typeof text !== 'string') return { sessions: [], venue: {} };
    const converted = this._convertTabsToMarkdownTable(text);
    const lines = converted.split('\n').map((l) => l.trim());
    const sessions = [];
    const venue = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('|') || !line.endsWith('|')) continue;

      const lower = line.toLowerCase();
      const hasDateCol = lower.includes('ngày') || lower.includes('date');
      const hasTimeCol =
        lower.includes('bắt đầu') ||
        lower.includes('start') ||
        lower.includes('thời gian') ||
        lower.includes('check-in') ||
        lower.includes('checkin') ||
        lower.includes('kết thúc');

      if (hasDateCol && hasTimeCol) {
        const headers = line.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());

        const dateIdx = headers.findIndex((h) => h.includes('ngày') || h.includes('date'));
        const checkinIdx = headers.findIndex((h) => h.includes('check-in') || h.includes('checkin') || h.includes('đón khách') || h.includes('mở cửa'));
        const startIdx = headers.findIndex((h) => h.includes('bắt đầu') || h.includes('start') || (h.includes('thời gian') && !h.includes('kết thúc')));
        const endIdx = headers.findIndex((h) => h.includes('kết thúc') || h.includes('end'));
        const venueIdx = headers.findIndex((h) => h.includes('địa điểm') || h.includes('venue') || h.includes('nơi tổ chức'));
        const locIdx = headers.findIndex((h) => h.includes('quận') || h.includes('thành phố') || h.includes('city') || h.includes('district') || h.includes('tỉnh'));
        const nameIdx = headers.findIndex((h) => h.includes('phiên') || h.includes('session') || h.includes('buổi') || (h.includes('tên') && !h.includes('vé')));

        let r = i + 1;
        if (r < lines.length && lines[r].includes('---')) {
          r++;
        }

        let sessionCount = 0;
        while (r < lines.length && lines[r].startsWith('|') && lines[r].endsWith('|')) {
          const cells = lines[r].split('|').slice(1, -1).map((c) => c.trim());
          if (cells.length >= 2 && !cells.every((c) => !c || c.includes('---'))) {
            sessionCount++;

            const rawDate = dateIdx >= 0 ? cells[dateIdx] : '';
            let sDate = '';
            const dMatch = rawDate.match(/(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}|\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4})/);
            if (dMatch) {
              const rd = dMatch[1];
              if (/^\d{4}/.test(rd)) {
                const [y, m, d] = rd.split(/[\-\/\.]/);
                sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              } else {
                const [d, m, y] = rd.split(/[\-\/\.]/);
                sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              }
            }

            const normTime = (t) => {
              if (!t) return '';
              const m = t.match(/(\d{1,2})[:h](\d{2})/i);
              return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
            };

            const sCheckin = checkinIdx >= 0 ? normTime(cells[checkinIdx]) : '';
            const sStart = startIdx >= 0 ? normTime(cells[startIdx]) : '';
            const sEnd = endIdx >= 0 ? normTime(cells[endIdx]) : '';
            const sName = nameIdx >= 0 && cells[nameIdx] ? cells[nameIdx] : `Phiên ${sessionCount}`;

            if (venueIdx >= 0 && cells[venueIdx] && !venue.venue_name) {
              venue.venue_name = cells[venueIdx];
            }
            if (locIdx >= 0 && cells[locIdx]) {
              const locText = cells[locIdx];
              const parts = locText.split(/[\-–—,]/).map((p) => p.trim());
              if (parts.length >= 2) {
                if (!venue.district) venue.district = parts[0];
                if (!venue.province) venue.province = parts[1];
              } else if (!venue.province) {
                venue.province = locText;
              }
            }

            sessions.push({
              session_name: sName,
              start_date: sDate,
              start_time: sStart,
              end_date: sDate,
              end_time: sEnd,
              checkin_start_time: sCheckin,
            });
          }
          r++;
        }
        i = r - 1;
      }
    }

    return { sessions, venue };
  }

  /**
   * Bóc tách bảng loại vé từ định dạng bảng Markdown hoặc tab-delimited
   */
  _parseMarkdownTicketTable(text) {
    if (!text || typeof text !== 'string') return [];
    const converted = this._convertTabsToMarkdownTable(text);
    const lines = converted.split('\n').map((l) => l.trim());
    const tickets = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('|') || !line.endsWith('|')) continue;

      const lower = line.toLowerCase();
      const hasTicketCol = lower.includes('vé') || lower.includes('ticket') || lower.includes('hạng');
      const hasPriceCol = lower.includes('giá') || lower.includes('price') || lower.includes('vnd') || lower.includes('vnđ');

      if (hasTicketCol && hasPriceCol) {
        const headers = line.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());

        const nameIdx = headers.findIndex((h) => h.includes('tên') || (h.includes('vé') && !h.includes('giá') && !h.includes('loại')) || h.includes('ticket name') || h.includes('hạng vé'));
        const priceIdx = headers.findIndex((h) => h.includes('giá') || h.includes('price'));
        const qtyIdx = headers.findIndex((h) => h.includes('số lượng') || h.includes('quantity') || h.includes('qty'));
        const descIdx = headers.findIndex((h) => h.includes('quyền lợi') || h.includes('mô tả') || h.includes('benefit') || h.includes('description'));

        let r = i + 1;
        if (r < lines.length && lines[r].includes('---')) {
          r++;
        }

        let ticketCount = 0;
        while (r < lines.length && lines[r].startsWith('|') && lines[r].endsWith('|')) {
          const cells = lines[r].split('|').slice(1, -1).map((c) => c.trim());
          if (cells.length >= 2 && !cells.every((c) => !c || c.includes('---'))) {
            ticketCount++;

            const rawName = nameIdx >= 0 ? cells[nameIdx] : `Hạng vé ${ticketCount}`;
            const rawPrice = priceIdx >= 0 ? cells[priceIdx].replace(/[^\d]/g, '') : '0';
            const priceNum = Number(rawPrice) || 0;

            let qtyNum = null;
            if (qtyIdx >= 0 && cells[qtyIdx]) {
              const parsedQty = Number(cells[qtyIdx].replace(/[^\d]/g, ''));
              if (!isNaN(parsedQty) && parsedQty > 0) {
                qtyNum = parsedQty;
              }
            }

            const desc = descIdx >= 0 ? cells[descIdx] : '';

            tickets.push({
              name: rawName,
              price: priceNum,
              quantity_total: qtyNum,
              description: desc,
            });
          }
          r++;
        }
        i = r - 1;
      }
    }

    return tickets;
  }

  /**
   * Bóc tách phiên sự kiện và địa điểm có cấu trúc từ text
   * @param {string} text
   * @returns {object} { venue: { venue_name, address_line, district, province }, sessions: [] }
   */
  _parseStructuredScheduleAndLocation(text) {
    if (!text || typeof text !== 'string') return { sessions: [], venue: {} };

    let venueName = '';
    let addressLine = '';
    let district = '';
    let city = '';

    const jsonDoc = this._tryParseEventJson(text);
    const jsonMapped = jsonDoc ? this._mapJsonEventDocument(jsonDoc) : null;
    if (jsonMapped && jsonMapped.sessions.length > 0) {
      return {
        venue: jsonMapped.venue,
        sessions: jsonMapped.sessions,
      };
    }

    // 1. Ưu tiên hàng đầu: Thử bóc tách từ bảng Markdown / Tab-delimited
    const tableSched = this._parseMarkdownScheduleTable(text);
    if (tableSched.venue?.venue_name) venueName = tableSched.venue.venue_name;
    if (tableSched.venue?.address_line) addressLine = tableSched.venue.address_line;
    if (tableSched.venue?.district) district = tableSched.venue.district;
    if (tableSched.venue?.province) city = tableSched.venue.province;

    // 2. Nếu chưa có từ bảng, mới tìm qua các nhãn key-value (bỏ qua các dòng bảng | hoặc \t)
    const nonTableText = text.split('\n').filter(l => !l.trim().startsWith('|') && !l.includes('\t')).join('\n');

    if (!venueName) {
      const vMatch = nonTableText.match(/(?:Venue(?:\s*Name)?|Tên\s*địa\s*điểm|Địa\s*điểm|Location|Where)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (vMatch) {
        const fullLoc = vMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
        const distPipe = fullLoc.match(/District\s*[:：]?\s*([^|]+)/i);
        const cityPipe = fullLoc.match(/City\s*[:：]?\s*([^|]+)/i);
        if (distPipe && !district) district = distPipe[1].trim();
        if (cityPipe && !city) city = cityPipe[1].trim();
        const venuePart = fullLoc.split('|')[0].replace(/\s*(?:District|City)\s*[:：].*$/i, '').replace(/\.\s.*$/, '').trim();
        const parts = venuePart.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
        const lastPart = parts[parts.length - 1] || '';
        if (parts.length >= 2 && /da nang|đà nẵng|hồ chí minh|ho chi minh|hue city|huế|cần thơ|can tho|hà nội|ha noi/i.test(lastPart)) {
          if (!city) city = lastPart;
          venueName = parts.slice(0, -1).join(', ');
        } else if (parts.length >= 3) {
          venueName = parts[0].trim();
          addressLine = parts.slice(1, -2).join(', ').trim() || parts[1].trim();
          if (!district) district = parts[parts.length - 2].trim();
          if (!city) city = parts[parts.length - 1].trim();
        } else if (parts.length === 2) {
          venueName = parts[0].trim();
          if (!city) city = parts[1].trim();
        } else {
          venueName = venuePart || fullLoc;
        }
      }
    }

    if (!district) {
      const dMatch = nonTableText.match(/(?:District|Quận|Huyện)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (dMatch) district = dMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
    }

    if (!city) {
      const cMatch = nonTableText.match(/(?:City|Province|Tỉnh|Thành\s*phố)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (cMatch) city = cMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
    }

    if (!addressLine) {
      const aMatch = nonTableText.match(/(?:Street\s*Address|Address|Địa\s*chỉ)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (aMatch) addressLine = aMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
    }

    // Nếu bảng đã trích xuất được phiên, hoàn tất
    if (tableSched.sessions.length > 0) {
      return {
        venue: {
          venue_name: venueName,
          address_line: addressLine,
          district,
          province: city,
        },
        sessions: tableSched.sessions,
      };
    }

    // Bổ sung quét địa điểm từ văn bản tự sự (Prose) nếu chưa tìm thấy
    if (!venueName) {
      const pLoc = this._parseProseLocation(text);
      if (pLoc.venue_name) {
        venueName = pLoc.venue_name;
        if (!district && pLoc.district) district = pLoc.district;
        if (!city && pLoc.province) city = pLoc.province;
      }
    }

    const sessionBlocks = [];
    const sessionHeaderRegex = /(?:^|\n)[ \t]*(?:\*{1,2})?(?:Session\s*\d+|Phiên\s*\d+|Buổi\s*\d+|Ca\s*\d+)(?:\*{1,2})?[^\n]*/gi;
    const matches = [...text.matchAll(sessionHeaderRegex)];

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index;
        const endIdx = matches[i + 1] ? matches[i + 1].index : text.length;
        const block = text.slice(startIdx, endIdx).trim();
        const firstLine = block.split('\n')[0].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();

        const dateMatch = block.match(/(?:Date|Ngày)\s*[:：\-–]\s*(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}|\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4})/i);
        let sDate = '';
        if (dateMatch) {
          const rawDate = dateMatch[1];
          if (/^\d{4}/.test(rawDate)) {
            const [y, m, d] = rawDate.split(/[\-\/\.]/);
            sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          } else {
            const [d, m, y] = rawDate.split(/[\-\/\.]/);
            sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          }
        }

        const stMatch = block.match(/(?:Start(?:\s*Time)?|Giờ\s*bắt\s*đầu|Bắt\s*đầu)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
        const etMatch = block.match(/(?:End(?:\s*Time)?|Giờ\s*kết\s*thúc|Kết\s*thúc)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
        const ciMatch = block.match(/(?:Check-?in(?:\s*Time)?|Giờ\s*check-?in|Đón\s*khách)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);

        const normTime = (t) => {
          if (!t) return '';
          const m = t.match(/(\d{1,2})[:h](\d{2})/);
          return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
        };

        sessionBlocks.push({
          session_name: firstLine || `Phiên ${i + 1}`,
          start_date: sDate,
          start_time: normTime(stMatch?.[1]),
          end_date: sDate,
          end_time: normTime(etMatch?.[1]),
          checkin_start_time: normTime(ciMatch?.[1]),
        });
      }
    }

    // Nếu không có Session 1, Session 2 dạng khối, tìm ngày & giờ đơn lẻ trong văn bản có cấu trúc
    if (sessionBlocks.length === 0) {
      const dateMatch = nonTableText.match(/(?:Date|Ngày(?:\s*bắt\s*đầu|\s*tổ\s*chức)?)\s*[:：\-–]\s*(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}|\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4})/i);
      const whenMatch = nonTableText.match(/(?:When|Date discussed)\s*[:：\-–]\s*([^\n\r]+)/i);
      const stMatch = nonTableText.match(/(?:Start(?:\s*Time)?|Giờ\s*bắt\s*đầu|Giờ\s*khai\s*mạc|Bắt\s*đầu)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
      const etMatch = nonTableText.match(/(?:End(?:\s*Time)?|Giờ\s*kết\s*thúc|Kết\s*thúc)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
      const ciMatch = nonTableText.match(/(?:Check-?in(?:\s*Time)?|Giờ\s*check-?in|Giờ\s*mở\s*cửa(?:\s*đón\s*khách)?|Đón\s*khách|Registration\s*opens|Gates?\s*open|Doors?(?:\s*open|\s*at)?)\s*[:：\-–]?\s*(?:từ\s*|from\s*|at\s*|lúc\s*|khoảng\s*)?(\d{1,2}[:h]\d{2})/i);
      const hours = this._extractPrimaryHours(nonTableText);

      let sDate = '';
      if (dateMatch) {
        sDate = this._formatIsoDate(dateMatch[1]);
      } else if (whenMatch) {
        sDate = this._parseEnglishDateToIso(whenMatch[1]) || this._formatIsoDate(whenMatch[1]);
      }
      const startTime = hours.start || (stMatch ? this._normalizeTime(stMatch[1], '') : '');
      const endTime = hours.end || (etMatch ? this._normalizeTime(etMatch[1], '') : '');
      const checkinTime = hours.checkin || (ciMatch ? this._normalizeTime(ciMatch[1], '') : '');

      if (sDate) {
        sessionBlocks.push({
          session_name: 'Phiên sự kiện',
          start_date: sDate,
          start_time: startTime,
          end_date: sDate,
          end_time: endTime,
          checkin_start_time: checkinTime,
        });
      }
    }

    // Nếu vẫn không có phiên, tìm theo tự sự / ngày tiếng Anh / nhiều ngày
    if (sessionBlocks.length === 0) {
      const dayBlocks = this._parseDayNumberedBlocks(text);
      if (dayBlocks.length > 0) {
        sessionBlocks.push(...dayBlocks);
      }
    }
    if (sessionBlocks.length === 0) {
      const rangeSessions = this._parseEnglishDateRangeSessions(text);
      if (rangeSessions.length > 0) {
        sessionBlocks.push(...rangeSessions);
      }
    }
    if (sessionBlocks.length === 0) {
      const pSessions = this._parseProseSchedule(text);
      if (pSessions.length > 0) {
        sessionBlocks.push(...pSessions);
      }
    }
    if (sessionBlocks.length === 0) {
      const loose = this._parseLooseSingleSession(text);
      if (loose) sessionBlocks.push(loose);
    }
    if (sessionBlocks.length === 0) {
      const hours = this._extractPrimaryHours(nonTableText);
      sessionBlocks.push({
        session_name: 'Phiên sự kiện',
        start_date: '',
        start_time: hours.start,
        end_date: '',
        end_time: hours.end,
        checkin_start_time: hours.checkin,
      });
    }

    if (!venueName || !district || !city) {
      const flex = this._parseFlexibleLocation(text);
      if (!venueName && flex.venue_name) venueName = flex.venue_name;
      if (!addressLine && flex.address_line) addressLine = flex.address_line;
      if (!district && flex.district) district = flex.district;
      if (!city && flex.province) city = flex.province;
    }

    return {
      venue: {
        venue_name: venueName,
        address_line: addressLine,
        district,
        province: city,
      },
      sessions: sessionBlocks,
    };
  }

  _parseLooseSingleSession(text) {
    if (!text) return null;
    let iso = '';
    const enRe = new RegExp(`(?:date(?:\\s*discussed)?\\s*[:：]?\\s*)?(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b,?\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`, 'i');
    const enMatch = text.match(enRe);
    if (enMatch && !this._isSkippedDateContext(text, enMatch.index)) {
      iso = this._toIsoDate(enMatch[3], EN_MONTHS[enMatch[2].toLowerCase()], enMatch[1]);
    }
    if (!iso) {
      const numRe = /(?:ngày|sáng|chiều)?\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/gi;
      let nm;
      while ((nm = numRe.exec(text)) !== null) {
        if (this._isSkippedDateContext(text, nm.index)) continue;
        iso = this._toIsoDate(nm[3], nm[2], nm[1]);
        break;
      }
    }
    const hours = this._extractPrimaryHours(text);
    if (!iso && !hours.start && !hours.checkin) return null;
    return {
      session_name: 'Phiên sự kiện',
      start_date: iso,
      start_time: hours.start,
      end_date: iso,
      end_time: hours.end,
      checkin_start_time: hours.checkin,
    };
  }

  /**
   * Bóc tách các hạng vé có cấu trúc từ text
   * @param {string} text
   * @returns {Array<object>} [{ name, price, quantity_total, description }]
   */
  _parseStructuredTickets(text) {
    if (!text || typeof text !== 'string') return [];

    const jsonDoc = this._tryParseEventJson(text);
    const jsonMapped = jsonDoc ? this._mapJsonEventDocument(jsonDoc) : null;
    if (jsonMapped && jsonMapped.tickets.length > 0) {
      return jsonMapped.tickets;
    }

    // 1. Ưu tiên hàng đầu: Thử bóc tách từ bảng Markdown / Tab-delimited
    const tableTickets = this._parseMarkdownTicketTable(text);
    if (tableTickets.length > 0) {
      return tableTickets;
    }

    const tickets = [];
    const ticketHeaderRegex = /(?:^|\n)[ \t]*(?:\*{1,2})?(?:Ticket\s*\d+|Vé\s*\d+|Hạng\s*(?:vé\s*)?\d+)(?:\*{1,2})?[^\n]*/gi;
    const matches = [...text.matchAll(ticketHeaderRegex)];

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index;
        const endIdx = matches[i + 1] ? matches[i + 1].index : text.length;
        const block = text.slice(startIdx, endIdx).trim();

        const nameMatch = block.match(/(?:Name|Tên\s*(?:vé|hạng\s*vé)?)\s*[:：\-–]\s*([^\n\r]+)/i);
        const priceMatch = block.match(/(?:Price|Giá(?:\s*vé)?)\s*[:：\-–]\s*([^\n\r]+)/i);
        const qtyMatch = block.match(/(?:Quantity|Số\s*lượng(?:\s*vé)?)\s*[:：\-–]\s*([^\n\r]+)/i);

        let tName = nameMatch ? nameMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim() : `Hạng vé ${i + 1}`;
        let tPrice = 0;
        if (priceMatch) {
          const pNum = Number(priceMatch[1].replace(/[^\d]/g, ''));
          tPrice = isNaN(pNum) ? 0 : pNum;
        }
        let tQty = null;
        if (qtyMatch) {
          const qNum = Number(qtyMatch[1].replace(/[^\d]/g, ''));
          tQty = isNaN(qNum) ? null : qNum;
        }

        let tDesc = '';
        const descIdx = block.search(/(?:Description|Mô\s*tả(?:\s*quyền\s*lợi)?)\s*[:：\-–]/i);
        if (descIdx !== -1) {
          const afterDesc = block.slice(descIdx).replace(/^(?:Description|Mô\s*tả(?:\s*quyền\s*lợi)?)\s*[:：\-–]\s*/i, '');
          const cleanDesc = afterDesc.split(/\n\s*(?:[A-Z][a-zA-Z\s]+:)/)[0].trim();
          tDesc = cleanDesc.replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
        }

        tickets.push({
          name: tName,
          price: tPrice,
          quantity_total: tQty,
          description: tDesc,
        });
      }
    }

    // 2. Thử bóc tách qua looseTickets (hỗ trợ bullet tiếng Việt, tiếng Anh, bảng pipe, prose, định dạng 1,000, places, v.v.)
    if (tickets.length === 0) {
      const looseTickets = this._parseLooseTickets(text);
      if (looseTickets.length > 0) {
        tickets.push(...looseTickets);
      }
    }

    // 3. Nếu chưa có, tìm các dòng gạch đầu dòng (bullet) vé dự phòng
    if (tickets.length === 0) {
      const bulletRegex = /(?:^|\n)[ \t]*[\-•\*]\s*(?:Vé|Hạng\s*vé)?\s*([^\n:：]+?)\s*[:：\-–]\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:vnđ|vnd|đ|k)\b(?:\s*[,;]\s*(?:số\s*lượng(?:\s*là)?|dự\s*kiến\s*phát\s*hành|proposed\s*quantity|quantity)\s*([0-9\.,]+)(?:\s*(?:vé|places?|bundles?))?)?(?:\s*[,;]\s*([^\.\n]+))?/gi;
      let bm;
      while ((bm = bulletRegex.exec(text)) !== null) {
        const rawName = bm[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
        const rawPrice = bm[2].replace(/[^\d]/g, '');
        const priceNum = Number(rawPrice);
        const qtyNum = bm[3] ? Number(bm[3].replace(/[^\d]/g, '')) : null;
        const desc = bm[4] ? bm[4].trim() : '';
        if (rawName && !isNaN(priceNum)) {
          tickets.push({
            name: rawName,
            price: priceNum,
            quantity_total: qtyNum,
            description: desc,
          });
        }
      }
    }
    if (tickets.length === 0) {
      const pTickets = this._parseProseTickets(text);
      if (pTickets.length > 0) {
        tickets.push(...pTickets);
      }
    }

    return tickets;
  }

  /**
   * Bộ lọc quy tắc dự phòng khi Ollama offline
   */
  _heuristicExtraction(text, categories = [], sections = {}, options = {}) {
    const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    
    // Loại bỏ tiền tố nhãn nếu có
    const cleanLine = (line) =>
      line.replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|TITLE|MÔ TẢ NGẮN|MÔ TẢ|DESCRIPTION|ĐỊA ĐIỂM|NƠI TỔ CHỨC|VENUE|THỜI GIAN|TIME)\s*[:：\-–]\s*/i, '').trim();

    const title = sections.title
      ? cleanLine(sections.title)
      : (rawLines[0] ? cleanLine(rawLines[0]).slice(0, 150) : 'Sự kiện mới từ tài liệu');

    // Tìm ngày (dd/mm/yyyy hoặc yyyy-mm-dd hoặc dd.mm.yyyy)
    let foundDate = null;
    const enDateHit = text.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`, 'i'));
    if (enDateHit && !this._isSkippedDateContext(text, enDateHit.index)) {
      foundDate = this._toIsoDate(enDateHit[3], EN_MONTHS[enDateHit[2].toLowerCase()], enDateHit[1]);
    }
    if (!foundDate) {
      const dateRe = /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/g;
      let dateMatch;
      while ((dateMatch = dateRe.exec(text)) !== null) {
        if (this._isSkippedDateContext(text, dateMatch.index)) continue;
        foundDate = this._toIsoDate(dateMatch[3], dateMatch[2], dateMatch[1]);
        break;
      }
    }

    // Tìm giờ (HH:mm)
    let startTime = '';
    let endTime = '';
    let checkinTime = '';
    const timeMatches = [...text.matchAll(/(\b\d{1,2})[:h](\d{2})\b/gi)];
    if (timeMatches.length >= 1) {
      startTime = `${String(timeMatches[0][1]).padStart(2, '0')}:${timeMatches[0][2]}`;
    }
    if (timeMatches.length >= 2) {
      endTime = `${String(timeMatches[1][1]).padStart(2, '0')}:${timeMatches[1][2]}`;
    }

    const checkinMatch = text.match(/(?:check[\s\-]?in|đón khách|mở cửa|đón tiếp)[^\d\n\r]*?(\d{1,2})[:h](\d{2})/i);
    if (checkinMatch) {

      checkinTime = `${String(checkinMatch[1]).padStart(2, '0')}:${checkinMatch[2]}`;
    }

    // Tìm địa điểm & phiên có cấu trúc
    const structuredSched = this._parseStructuredScheduleAndLocation(sections.schedule_location || text);
    const structuredTickets = this._parseStructuredTickets(sections.ticket_info || text);

    let venueName = '';
    let addressLine = '';
    let district = '';
    let province = '';

    if (structuredSched.venue) {
      if (structuredSched.venue.venue_name) venueName = structuredSched.venue.venue_name;
      if (structuredSched.venue.address_line) addressLine = structuredSched.venue.address_line;
      if (structuredSched.venue.district) district = structuredSched.venue.district;
      if (structuredSched.venue.province) province = structuredSched.venue.province;
    }

    // Tìm giá vé kèm mô tả
    const ticketTypes = [];
    if (structuredTickets.length > 0) {
      ticketTypes.push(...structuredTickets);
    } else {
      ticketTypes.push(...this._parseLooseTickets(text));
    }

    if (ticketTypes.length === 0) {
      ticketTypes.push({
        name: 'Vé Tiêu Chuẩn',
        price: 0,
        quantity_total: null,
        description: 'Hạng vé chung tham gia sự kiện',
      });
    }

    // Khớp danh mục sơ bộ
    let matchedCategory = categories[0]?.id || '';
    for (const cat of categories) {
      if (text.toLowerCase().includes(cat.name?.toLowerCase())) {
        matchedCategory = cat.id;
        break;
      }
    }

    let fallbackShortDesc = '';
    const descLines = rawLines.filter((l) => {
      const c = cleanLine(l);
      return !/^(?:from|to|subject|date|cc|bcc|chào|thân\s*gửi|kính\s*gửi)\s*[:：\-–]?/i.test(c) && c.length > 20;
    });
    if (descLines.length > 0) {
      fallbackShortDesc = cleanLine(descLines[0]).slice(0, 500);
    }

    const shortDesc = sections.short_description
      ? sections.short_description.slice(0, 500)
      : (fallbackShortDesc || title).slice(0, 500);

    const descriptionHtml = sections.description
      ? this._formatDocumentToHtml(sections.description)
      : this._formatDocumentToHtml(text, title, shortDesc);

    const organizerName = (options && options.organizerName) ? String(options.organizerName).trim() : '';
    const tags = [];
    if (organizerName) {
      tags.push(organizerName);
    }
    tags.push('Sự kiện');

    const finalSessions = structuredSched.sessions.length > 0
      ? structuredSched.sessions
      : [
          {
            session_name: 'Phiên sự kiện',
            start_date: foundDate,
            start_time: startTime,
            end_date: foundDate,
            end_time: endTime,
            checkin_start_time: checkinTime,
          },
        ];

    return {
      title,
      category_id: matchedCategory,
      short_description: shortDesc,
      description: descriptionHtml,
      additional_terms: sections.additional_terms || '',
      tags,
      venue_name: venueName,
      address_line: addressLine,
      ward: '',
      district: district || '',
      province: province || '',
      sessions: finalSessions,
      session: finalSessions[0],
      require_attendee_information: /(?:thu\s*thập\s*thông\s*tin|cung\s*cấp\s*họ\s*tên|họ\s*tên\s*và\s*email|attendee\s*info|name\s*and\s*email|họ\s*tên,\s*email|name\s*\+\s*email)/i.test(text),
      ticket_types: ticketTypes,
      refund_policy: {
        allow_refunds: !/không\s*hoàn\s*(?:vé|tiền)|không\s*được\s*hoàn\s*trả|non-refundable/i.test(text),
        deadline_days: 7,
      },
      missing_fields: venueName ? [] : ['venue_name'],
    };
  }

  /**
   * Phát hiện và loại bỏ các tiêu đề hoặc quy định giả mạo do AI tự ý bịa đặt
   * @param {string} html
   * @param {string} originalText
   * @returns {string}
   */
  _stripHallucinatedBoilerplate(html, originalText = '') {
    if (!html || typeof html !== 'string') return '';
    const normOriginal = (originalText || '').toLowerCase();

    // Các tiêu đề giả mạo mà AI thường tự sinh
    const fakeHeadings = [
      /<h3>\s*(?:Giới thiệu sự kiện|Lịch trình\s*&\s*Hoạt động nổi bật|Thông tin vé\s*&\s*Quyền lợi|Lưu ý tham gia|Lưu ý tham dự)\s*<\/h3>/gi,
      /<p><strong>\s*(?:Giới thiệu sự kiện|Lịch trình\s*&\s*Hoạt động nổi bật|Thông tin vé\s*&\s*Quyền lợi|Lưu ý tham gia|Lưu ý tham dự)\s*<\/strong><\/p>/gi,
    ];

    let cleaned = html;
    for (const fh of fakeHeadings) {
      cleaned = cleaned.replace(fh, (match) => {
        const textOnly = match.replace(/<[^>]*>/g, '').trim().toLowerCase();
        return normOriginal.includes(textOnly) ? match : '';
      });
    }

    // Các cụm từ quy tắc bịa đặt phổ biến
    const fakeRuleKeywords = [
      'có mặt trước 15 phút',
      'đồ ăn, đồ uống',
      'đồ ăn thức uống',
      'thiết bị điện tử có thể gây xao nhãng',
      'xao nhãng sự kiện',
      'vật dụng có thể gây nguy hiểm',
      'làm việc, học tập hoặc làm việc khác trong khu vực',
      'mất mát, trộm cắp hoặc gây rối',
    ];

    cleaned = cleaned.replace(/<(li|p)>([\s\S]*?)<\/\1>/gi, (match, tag, content) => {
      const lowerContent = content.toLowerCase();
      for (const kw of fakeRuleKeywords) {
        if (lowerContent.includes(kw) && !normOriginal.includes(kw)) {
          return '';
        }
      }
      return match;
    });

    cleaned = cleaned.replace(/<(ul|ol)>\s*<\/\1>/gi, '');
    return cleaned.trim();
  }

  /**
   * Làm sạch phần Thông tin sự kiện: Loại bỏ tiêu đề hoặc mô tả ngắn bị lặp lại ở đầu
   * @param {string} desc
   * @param {string} title
   * @param {string} shortDesc
   * @returns {string}
   */
  _cleanEventDescription(desc, title, shortDesc) {
    let cleaned = String(desc || '').trim();

    // 1. Chỉ loại bỏ thẻ nếu thẻ đó chỉ chứa đúng tiêu đề sự kiện (không xoá đoạn văn mô tả)
    if (title) {
      const rawCleanTitle = title.replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|KẾ HOẠCH TỔ CHỨC SỰ KIỆN:?)\s*/i, '').trim().toLowerCase();
      const firstTagMatch = cleaned.match(/^<(h[1-6]|p)>([\s\S]*?)<\/\1>/i);
      if (firstTagMatch) {
        const tagText = firstTagMatch[2].replace(/<[^>]*>/g, '').trim().toLowerCase();
        const isHeaderTag = /^h[1-2]$/i.test(firstTagMatch[1]);
        const isTitleOnly = tagText === rawCleanTitle || tagText.startsWith('tiêu đề:') || tagText.startsWith('tên sự kiện:');
        if (isHeaderTag || (isTitleOnly && tagText.length < rawCleanTitle.length + 20)) {
          cleaned = cleaned.slice(firstTagMatch[0].length).trim();
        }
      }
    }

    // 2. Chỉ loại bỏ nếu đoạn đầu tiên trùng hệt mô tả ngắn
    if (shortDesc && shortDesc.length > 20) {
      const rawShortDesc = shortDesc.trim().toLowerCase();
      const firstTagMatch = cleaned.match(/^<(h[1-6]|p)>([\s\S]*?)<\/\1>/i);
      if (firstTagMatch) {
        const tagText = firstTagMatch[2].replace(/<[^>]*>/g, '').trim().toLowerCase();
        if (tagText === rawShortDesc || (rawShortDesc.startsWith(tagText) && tagText.length > 30)) {
          cleaned = cleaned.slice(firstTagMatch[0].length).trim();
        }
      }
    }

    return cleaned;
  }

  /**
   * Chuyển đổi văn bản tài liệu thô thành định dạng HTML ngữ nghĩa chuẩn (dự phòng)
   * Tự động nhận diện danh sách, tiêu đề con, giữ nguyên vẹn 100% nội dung và emoji.
   * @param {string} text
   * @param {string} title
   * @param {string} shortDesc
   * @returns {string} HTML
   */
  _formatDocumentToHtml(text, title = '', shortDesc = '') {
    if (!text || typeof text !== 'string') return '';
    const rawLines = text.split('\n');
    const htmlParts = [];
    let inList = false;
    let listType = 'ul';
    let currentParagraphLines = [];

    const normTitle = title ? title.replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|KẾ HOẠCH TỔ CHỨC SỰ KIỆN:?)\s*/i, '').trim().toLowerCase() : '';
    const normShort = shortDesc ? shortDesc.trim().toLowerCase() : '';

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        const pText = currentParagraphLines.join('<br>');
        htmlParts.push(`<p>${pText}</p>`);
        currentParagraphLines = [];
      }
    };

    const closeList = () => {
      if (inList) {
        htmlParts.push(`</${listType}>`);
        inList = false;
      }
    };

    for (let rawLine of rawLines) {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        closeList();
        continue;
      }

      const lower = line.toLowerCase();

      // Bỏ qua dòng tiêu đề sự kiện ở đầu nếu đứng riêng lẻ một dòng
      if (htmlParts.length === 0 && currentParagraphLines.length === 0) {
        if (/^(?:TIÊU\s*ĐỀ|TÊN\s*SỰ\s*KIỆN|TITLE)\s*[:：\-–]?\s*$/i.test(line)) {
          continue;
        }
        if (normTitle && (lower === normTitle || lower === `tiêu đề: ${normTitle}` || lower === `tên sự kiện: ${normTitle}`)) {
          continue;
        }
      }

      // Bỏ qua dòng mô tả ngắn nếu lặp lại nguyên văn ở đầu
      if (htmlParts.length < 2 && currentParagraphLines.length === 0) {
        if (/^(?:MÔ\s*TẢ\s*NGẮN|TÓM\s*TẮT)\s*[:：\-–]?\s*$/i.test(line)) {
          continue;
        }
        if (normShort && lower === normShort) {
          continue;
        }
      }

      // Bỏ qua dòng nhãn "MÔ TẢ:" ở đầu phần thân
      if (/^(?:MÔ\s*TẢ(?!\s*NGẮN)|THÔNG\s*TIN\s*SỰ\s*KIỆN|THÔNG\s*TIN\s*CHI\s*TIẾT|NỘI\s*DUNG\s*SỰ\s*KIỆN|NỘI\s*DUNG|DESCRIPTION)\s*[:：\-–]?\s*$/i.test(line)) {
        continue;
      }

      // Danh sách gạch đầu dòng (-, *, •, +)
      const bulletMatch = line.match(/^[\-\*\•\+]\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        if (!inList || listType !== 'ul') {
          closeList();
          htmlParts.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        htmlParts.push(`<li>${bulletMatch[1].trim()}</li>`);
        continue;
      }

      // Mục đánh số "1. ", "2. ", "1) ", "1.\t"
      const numMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
      if (numMatch) {
        flushParagraph();
        if (!inList || listType !== 'ol') {
          closeList();
          htmlParts.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        htmlParts.push(`<li>${numMatch[2].trim()}</li>`);
        continue;
      }

      closeList();

      // Tiêu đề chương / phần con trong tài liệu
      const isHeader =
        /^#{1,4}\s+/.test(line) ||
        /^[I|V|X]+\.\s+/i.test(line) ||
        /^(?:English Below|Điều khoản và điều kiện:|Terms and Conditions:|Lưu ý:|Quy định:)$/i.test(line) ||
        (line.endsWith(':') && line.length < 80);

      if (isHeader) {
        flushParagraph();
        const headerText = line.replace(/^#{1,4}\s+/, '').trim();
        htmlParts.push(`<p><strong>${headerText}</strong></p>`);
        continue;
      }

      // Ghép hoặc tách paragraph dựa trên dấu kết thúc câu và độ dài
      if (currentParagraphLines.length > 0) {
        const lastLine = currentParagraphLines[currentParagraphLines.length - 1];
        const lastEndsClause = /[,;]$/.test(lastLine);
        if (!lastEndsClause && (/[\.!\?❤️🤙🏻🦊🍅]$/u.test(lastLine) || line.length > 60)) {
          flushParagraph();
        }
      }

      currentParagraphLines.push(line);
    }

    flushParagraph();
    closeList();

    return htmlParts.join('\n');
  }

  /**
   * Chuẩn hóa giờ sang định dạng HH:mm
   */
  _normalizeTime(timeStr, defaultTime = '') {
    if (!timeStr || typeof timeStr !== 'string') return defaultTime;
    const clean = timeStr.trim();
    if (!clean) return defaultTime;

    const ampmMatch = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const isPM = ampmMatch[3].toUpperCase() === 'PM';
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const gioMatch = clean.match(/(\d{1,2})\s*giờ(?:\s*(\d{2}))?\s*(sáng|chiều|tối)?/i);
    if (gioMatch) {
      let h = parseInt(gioMatch[1], 10);
      let m = gioMatch[2] ? parseInt(gioMatch[2], 10) : 0;
      const period = (gioMatch[3] || '').toLowerCase();
      if ((period === 'chiều' || period === 'tối') && h < 12) h += 12;
      if (period === 'sáng' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const match = clean.match(/(\d{1,2})[:h](\d{2})/i) || clean.match(/^(\d{1,2})h?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      let m = match[2] ? parseInt(match[2], 10) : 0;
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    return defaultTime;
  }

  /**
   * Chuẩn hóa và áp dụng quy tắc nghiệp vụ EventHub
   */
  _sanitizeAndValidate(raw, categories = [], warnings = [], originalText = '', sections = {}, options = {}) {
    const data = { ...raw };

    const cleanPrefix = (str) =>
      String(str || '')
        .replace(/^(?:TIÊU\s*ĐỀ|TÊN\s*SỰ\s*KIỆN|TÊN\s*HOẠT\s*ĐỘNG|EVENT\s*NAME|EVENT\s*TITLE|TITLE|MÔ\s*TẢ\s*NGẮN|SHORT\s*DESCRIPTION|MÔ\s*TẢ\s*CHI\s*TIẾT|DETAILED\s*DESCRIPTION|MÔ\s*TẢ|DESCRIPTION)\s*[:：\-–]\s*/i, '')
        .trim();

    // 1. Tiêu đề (ưu tiên Ground Truth từ sections nếu hợp lệ và không generic)
    const rawSectionTitle = sections?.title ? cleanPrefix(sections.title.split('\n')[0]).slice(0, 200) : '';
    const cleanedSecTitle = this._cleanDocumentTitle(rawSectionTitle);
    const cleanedDataTitle = this._cleanDocumentTitle(data.title ? cleanPrefix(data.title.split('\n')[0]).slice(0, 200) : '');

    if (cleanedSecTitle && !this._isGenericDocumentTitle(cleanedSecTitle)) {
      data.title = cleanedSecTitle;
    } else if (cleanedDataTitle && !this._isGenericDocumentTitle(cleanedDataTitle)) {
      data.title = cleanedDataTitle;
    } else {
      const pMatch = originalText.match(/(?:chương\s*trình|sự\s*kiện|hoạt\s*động)\s*(?:dự\s*kiến\s*)?(?:mang\s*tên|có\s*tên\s*(?:là)?|tên\s*là)\s*[:：]?\s*[\*"]*([^\*"\n,\.]{3,100}?)[\*"]*(?:[,\.\n]| hướng đến| dành cho| nhằm)/i);
      data.title = pMatch ? this._cleanDocumentTitle(pMatch[1]) : 'Sự kiện mới từ tài liệu';
    }

    const structuredSched = this._parseStructuredScheduleAndLocation(sections?.schedule_location || originalText);
    const structuredTickets = this._parseStructuredTickets(sections?.ticket_info || originalText);

    // 2. Danh mục: Ưu tiên so khớp ID, tên/slug, từ khóa ngữ nghĩa, hoặc từ khóa trong văn bản
    let validCat = categories.find((c) => String(c.id).toLowerCase() === String(data.category_id).toLowerCase());
    if (!validCat) {
      const target = String(data.category_id || '').toLowerCase().trim();
      validCat = categories.find((c) => c.name.toLowerCase() === target || (c.slug && c.slug.toLowerCase() === target));
    }
    if (!validCat && sections && sections.category) {
      const secTarget = sections.category.toLowerCase().trim();
      validCat = categories.find((c) => c.name.toLowerCase() === secTarget || (c.slug && c.slug.toLowerCase() === secTarget));
    }
    if (!validCat) {
      const semanticCategoryMap = [
        { keywords: ['environment', 'môi trường', 'sống xanh', 'sustainable', 'sustainability', 'eco', 'văn hóa', 'lễ hội', 'triển lãm', 'expo', 'ẩm thực', 'food'], targetSlug: 'le-hoi-van-hoa' },
        { keywords: ['technology', 'công nghệ', 'ai', 'autonomous', 'software', 'kinh doanh', 'business', 'startup', 'green technology', 'green tech', 'renewable energy'], targetSlug: 'kinh-doanh-cong-nghe' },
        { keywords: ['workshop', 'hội thảo', 'summit', 'conference', 'seminar', 'education', 'giáo dục', 'đào tạo', 'thiết kế', 'nhiếp ảnh', 'làm phim', 'sáng tạo nội dung'], targetSlug: 'hoi-thao-giao-duc' },
        { keywords: ['music', 'concert', 'liveshow', 'âm nhạc', 'biểu diễn', 'ca nhạc'], targetSlug: 'am-nhac-bieu-dien' },
        { keywords: ['sport', 'sports', 'marathon', 'chạy bộ', 'thể thao', 'giải đấu'], targetSlug: 'the-thao' },
      ];
      const searchText = `${sections?.category || ''} ${data.title} ${originalText}`.toLowerCase();
      for (const sem of semanticCategoryMap) {
        if (sem.keywords.some((kw) => searchText.includes(kw))) {
          validCat = categories.find((c) => c.slug === sem.targetSlug);
          if (validCat) break;
        }
      }
    }
    if (!validCat) {
      const searchText = `${data.title} ${originalText}`.toLowerCase();
      validCat = categories.find((c) => searchText.includes(c.name.toLowerCase()));
    }
    if (!validCat && categories.length > 0) {
      validCat = categories[0];
      warnings.push('Danh mục chưa xác định rõ trong tài liệu, đã đặt mặc định.');
    }
    data.category_id = validCat?.id || '';

    // 3. Tóm tắt & Mô tả đầy đủ (Thông tin sự kiện)
    if (sections && sections.short_description) {
      data.short_description = cleanPrefix(sections.short_description).slice(0, 500);
    } else {
      data.short_description = cleanPrefix(data.short_description).slice(0, 500);
    }

    // Xử lý description:
    let finalDesc = '';
    if (sections && sections.description) {
      // Nếu tài liệu có phần mô tả chi tiết, dùng 100% nội dung gốc của phần này, không cho phép AI tự ý tóm tắt hay cắt ngắn!
      finalDesc = this._formatDocumentToHtml(sections.description);
    } else {
      // Nếu tài liệu tự do không có nhãn mô tả, lọc sạch các quy tắc và tiêu đề bịa đặt/hallucination của AI
      finalDesc = String(data.description || '').trim();
      if (finalDesc) {
        finalDesc = this._stripHallucinatedBoilerplate(finalDesc, originalText);
        finalDesc = this._cleanEventDescription(finalDesc, data.title, data.short_description);
      }
      // Nếu AI hoàn toàn không tạo mô tả, hoặc quá ngắn (< 30 ký tự), dùng mô tả ngắn làm nội dung
      if (!finalDesc || finalDesc.replace(/<[^>]*>/g, '').trim().length < 30) {
        if (data.short_description) {
          finalDesc = `<p>${data.short_description}</p>`;
        }
      }
    }

    data.description = finalDesc || `<p>${data.short_description}</p>`;

    if (sections && sections.additional_terms) {
      data.additional_terms = sections.additional_terms.trim();
    } else {
      data.additional_terms = String(data.additional_terms || '').trim();
    }

    // 4. Địa điểm
    let venueName = String(data.venue_name || '').trim();
    let addressLine = String(data.address_line || '').trim();
    data.ward = String(data.ward || '').trim();
    data.district = String(data.district || '').trim();
    data.province = String(data.province || '').trim();

    // KIỂM TRA GROUND TRUTH: Nếu AI trích xuất venue_name nhưng tên này HOÀN TOÀN KHÔNG XUẤT HIỆN trong văn bản gốc
    // (hoặc AI nhầm tên nhà tổ chức thành tên địa điểm), loại bỏ hallucination này!
    if (venueName) {
      const lowerOriginal = (originalText || '').toLowerCase();
      const lowerVenue = venueName.toLowerCase();
      const lowerOrg = (options?.organizerName ? String(options.organizerName).trim() : '').toLowerCase();

      const isFakeFromOrg = lowerOrg && lowerVenue === lowerOrg && !lowerOriginal.includes(lowerOrg);
      const isHallucinated = !lowerOriginal.includes(lowerVenue) && !lowerOriginal.includes(lowerVenue.replace(/\s+/g, ' '));

      if (isFakeFromOrg || isHallucinated) {
        logger.warn(`[AiDocumentParser] Phát hiện địa điểm hallucination "${venueName}" không có trong tài liệu gốc. Đã xóa bỏ.`);
        venueName = '';
        addressLine = '';
      }
    }

    const isGenericUnnamedVenue = (name) =>
      /^(?:a|an)\s+(?:gallery|coworking(?:\s*space)?|cultural\s*center|training\s*room|indoor\s*event\s*space|quán\s*cà\s*phê)/i.test(String(name || '').trim())
      || /has not been (?:named|confirmed)|chưa\s*(?:được\s*)?(?:chốt|xác nhận)|don't use a venue name|đừng tự ghi địa chỉ/i.test(String(name || ''));

    if (venueName && isGenericUnnamedVenue(venueName)) {
      venueName = '';
    }

    // Nếu AI không trích xuất được hoặc bị xóa do hallucination nhưng tài liệu có phần schedule_location rõ ràng:
    if (structuredSched.venue?.venue_name) {
      const isProvHallucinated = data.province && !originalText.toLowerCase().includes(data.province.toLowerCase());
      if (!venueName || isProvHallucinated) {
        const structVenue = structuredSched.venue.venue_name;
        if (!isGenericUnnamedVenue(structVenue)) {
          venueName = structVenue;
        }
        if (structuredSched.venue.address_line) addressLine = structuredSched.venue.address_line;
        if (structuredSched.venue.district) data.district = structuredSched.venue.district;
        if (structuredSched.venue.province) data.province = structuredSched.venue.province;
      }
    }

    if (!venueName) {
      warnings.push('Chưa tìm thấy địa điểm cụ thể trong tài liệu. Vui lòng chọn hoặc tạo địa điểm mới.');
    }

    data.venue_name = venueName;
    data.address_line = addressLine;

    // Chuẩn hóa tên tỉnh thành về chuẩn hành chính Việt Nam
    const normProv = (data.province || '').toLowerCase();
    if (normProv.includes('is being considered')) {
      data.province = 'Thừa Thiên Huế';
    } else if (normProv.includes('đà nẵng') || normProv.includes('da nang')) {
      data.province = 'Thành phố Đà Nẵng';
    } else if (
      normProv.includes('hồ chí minh') ||
      normProv.includes('ho chi minh') ||
      normProv.includes('tp.hcm') ||
      normProv.includes('tphcm') ||
      normProv.includes('sài gòn')
    ) {
      data.province = 'Thành phố Hồ Chí Minh';
    } else if (normProv.includes('hà nội') || normProv.includes('ha noi')) {
      data.province = 'Thành phố Hà Nội';
    } else if (normProv.includes('cần thơ') || normProv.includes('can tho')) {
      data.province = 'Thành phố Cần Thơ';
    } else if (normProv.includes('hải phòng') || normProv.includes('hai phong')) {
      data.province = 'Thành phố Hải Phòng';
    } else if (normProv.includes('huế') || normProv.includes('hue')) {
      data.province = 'Thừa Thiên Huế';
    } else if (!data.province && (originalText || data.title)) {
      const normText = `${data.title} ${originalText}`.toLowerCase();
      if (
        normText.includes('đà nẵng') ||
        normText.includes('da nang')
      ) {
        data.province = 'Thành phố Đà Nẵng';
      } else if (
        normText.includes('hồ chí minh') ||
        normText.includes('ho chi minh') ||
        normText.includes('tp.hcm') ||
        normText.includes('tphcm') ||
        normText.includes('sài gòn')
      ) {
        data.province = 'Thành phố Hồ Chí Minh';
      } else if (normText.includes('hà nội') || normText.includes('ha noi')) {
        data.province = 'Thành phố Hà Nội';
      } else if (normText.includes('cần thơ') || normText.includes('can tho')) {
        data.province = 'Thành phố Cần Thơ';
      } else if (normText.includes('hải phòng') || normText.includes('hai phong')) {
        data.province = 'Thành phố Hải Phòng';
      } else if (/\bhue city\b|\bthừa thiên huế\b|\bhuế\b/i.test(normText)) {
        data.province = 'Thừa Thiên Huế';
      }
    }

    // Chuẩn hóa quận/huyện
    // CHỈ tìm trong các trường địa điểm (data.district, venue_name, address_line, structuredSched.venue)
    // TUYỆT ĐỐI KHÔNG tìm trong toàn bộ originalText để tránh ghi đè sai quận
    const locCandidates = [
      data.district,
      data.venue_name,
      data.address_line,
      structuredSched.venue?.district,
      structuredSched.venue?.venue_name,
      structuredSched.venue?.address_line,
    ].filter(Boolean).join(' ').toLowerCase();

    if (locCandidates.includes('binh thanh') || locCandidates.includes('bình thạnh')) {
      data.district = 'Bình Thạnh';
    } else if (locCandidates.includes('district 3') || locCandidates.includes('quận 3')) {
      data.district = 'Quận 3';
    } else if (locCandidates.includes('district 1') || locCandidates.includes('quận 1')) {
      data.district = 'Quận 1';
    } else if (locCandidates.includes('ngu hanh son') || locCandidates.includes('ngũ hành sơn')) {
      data.district = 'Ngũ Hành Sơn';
    } else if (locCandidates.includes('hai chau') || locCandidates.includes('hải châu')) {
      data.district = 'Hải Châu';
    } else if (locCandidates.includes('son tra') || locCandidates.includes('sơn trà')) {
      data.district = 'Sơn Trà';
    } else if (locCandidates.includes('thanh khe') || locCandidates.includes('thanh khê')) {
      data.district = 'Thanh Khê';
    } else if (locCandidates.includes('lien chieu') || locCandidates.includes('liên chiểu')) {
      data.district = 'Liên Chiểu';
    } else if (locCandidates.includes('cam le') || locCandidates.includes('cẩm lệ')) {
      data.district = 'Cẩm Lệ';
    } else if (locCandidates.includes('hoa vang') || locCandidates.includes('hòa vang')) {
      data.district = 'Hòa Vang';
    }

    if (data.district && /^(?:not\s*specified|not\s*available|none|chưa\s*có|chưa\s*xác\s*định)$/i.test(data.district.trim())) {
      data.district = '';
    }

    // 5. Phiên sự kiện: Hỗ trợ đa phiên (Multi-sessions)
    let rawSessions = [];
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      rawSessions = data.sessions;
    } else if (data.session && typeof data.session === 'object') {
      rawSessions = [data.session];
    }

    // Kiểm tra tính xác thực của sessions từ AI: nếu ngày tháng bịa đặt hoặc số phiên thiếu so với tài liệu có cấu trúc:
    const hasHallucinatedDates = rawSessions.some(
      (s) => s.start_date && !this._dateAppearsInText(s.start_date, originalText)
    );
    if (structuredSched.sessions.length > 0) {
      if (rawSessions.length === 0 || hasHallucinatedDates || rawSessions.length < structuredSched.sessions.length) {
        logger.info(`[AiDocumentParser] Sử dụng ${structuredSched.sessions.length} phiên sự kiện trích xuất chính xác từ tài liệu.`);
        rawSessions = structuredSched.sessions;
      } else {
        // Bổ sung giờ / ngày bị thiếu từ structuredSched vào rawSessions
        rawSessions.forEach((s, i) => {
          const struct = structuredSched.sessions[i];
          if (struct) {
            if (!s.start_time && struct.start_time) s.start_time = struct.start_time;
            if (!s.end_time && struct.end_time) s.end_time = struct.end_time;
            if (!s.checkin_start_time && struct.checkin_start_time) s.checkin_start_time = struct.checkin_start_time;
            if ((!s.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(s.start_date)) && struct.start_date) {
              s.start_date = struct.start_date;
              s.end_date = struct.end_date || struct.start_date;
            }
          }
        });
      }
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const hasAnyTimeInDoc = /(?:\d{1,2}[:h]\d{2}|\d{1,2}\s*(?:giờ|h)(?:\s*\d{1,2})?|\d{1,2}\s*(?:am|pm))/i.test(originalText);
    const hasCheckinMention = /(?:check[\s\-_]?in|đón khách|mở cửa|đón tiếp|khách\s*bắt\s*đầu\s*vào|doors?\s*(?:at|open)|registration\s*opens?|gates?\s*open)/i.test(originalText);

    const sanitizedSessions = [];
    rawSessions.forEach((s, idx) => {
      let startDate = s?.start_date;
      const isValidFormat = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate);

      if (isValidFormat) {
        const parsedDate = new Date(`${startDate}T00:00:00`);
        const diffDays = Math.ceil((parsedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          warnings.push(`Ngày sự kiện trong tài liệu (${startDate}) đã diễn ra trong quá khứ. Vui lòng chọn ngày trong tương lai.`);
        } else if (diffDays <= 10 && idx === 0) {
          warnings.push(
            'Hệ thống có thể sẽ mất khoảng từ 3 đến 4 ngày hoặc có thể hơn để duyệt sự bạn, hãy đảm bảo rằng điều đó sẽ không ảnh hưởng đến kế hoạch diễn ra sự kiện sắp tới của bạn. Hãy đảm bảo rằng bạn đã có kế hoạch và sẵn sàng nếu sự kiện được duyệt trễ hơn dự kiện.'
          );
        }
      } else {
        startDate = this.getSuggestedMinDate();
        warnings.push(`Chưa tìm thấy ngày diễn ra cho phiên ${idx + 1}, hệ thống đã gợi ý ngày ${startDate}.`);
      }

      let startTime = '';
      let endTime = '';
      let checkinTime = '';

      if (hasAnyTimeInDoc) {
        startTime = this._normalizeTime(s?.start_time, '');
        endTime = this._normalizeTime(s?.end_time, '');

        if (startTime && endTime && endTime <= startTime) {
          const [sh, sm] = startTime.split(':').map(Number);
          const newEh = Math.min(23, sh + 2);
          endTime = `${String(newEh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
          if (endTime <= startTime) {
            endTime = '23:59';
          }
        }

        if (s?.checkin_start_time) {
          checkinTime = this._normalizeTime(s.checkin_start_time, '');
        } else if (hasCheckinMention && startTime) {
          const [sh, sm] = startTime.split(':').map(Number);
          const totalMin = Math.max(0, sh * 60 + sm - 30);
          const chH = Math.floor(totalMin / 60);
          const chM = totalMin % 60;
          checkinTime = `${String(chH).padStart(2, '0')}:${String(chM).padStart(2, '0')}`;
        }
      }

      const sName = String(s?.session_name || '').trim() || (rawSessions.length > 1 ? `Phiên ${idx + 1}` : 'Phiên sự kiện');

      sanitizedSessions.push({
        session_name: sName,
        start_date: startDate,
        start_time: startTime,
        end_date: s?.end_date || startDate,
        end_time: endTime,
        checkin_start_time: checkinTime,
      });
    });

    if (sanitizedSessions.length === 0) {
      const defaultDate = this.getSuggestedMinDate();
      sanitizedSessions.push({
        session_name: 'Phiên sự kiện',
        start_date: defaultDate,
        start_time: '',
        end_date: defaultDate,
        end_time: '',
        checkin_start_time: '',
      });
      warnings.push('Chưa tìm thấy thông tin phiên sự kiện trong tài liệu. Vui lòng bổ sung ở Bước 2.');
    } else if (!hasAnyTimeInDoc) {
      warnings.push('Chưa tìm thấy giờ bắt đầu / kết thúc trong tài liệu. Vui lòng bổ sung ở Bước 2.');
    }

    data.sessions = sanitizedSessions;
    data.session = sanitizedSessions[0]; // Giữ tương thích ngược

    // 5.1. Yêu cầu thu thập thông tin người tham dự
    const jsonAttendee = (() => {
      const jsonObj = this._tryParseEventJson(originalText);
      if (!jsonObj) return null;
      const mapped = this._mapJsonEventDocument(jsonObj);
      return mapped ? Boolean(mapped.require_attendee_information) : null;
    })();
    data.require_attendee_information = Boolean(
      jsonAttendee === true
        ? true
        : sections?.attendee_info
          ? /yes|có|required|bắt\s*buộc|full name|email|họ tên/i.test(sections.attendee_info)
          : (data.require_attendee_information ?? /(?:thu\s*thập\s*thông\s*tin|cung\s*cấp\s*họ\s*tên|full name(?:\s*and|,)\s*email|họ tên và email|thông\s*tin\s*người\s*tham\s*dự|attendee\s*info|name and email)/i.test(originalText))
    );

    // 6. Hạng vé (ticket_types)
    let rawTickets = Array.isArray(data.ticket_types) ? data.ticket_types : [];
    const isTicketInDoc = (t) => {
      if (!t || !t.name) return false;
      const lowerName = String(t.name).toLowerCase().trim();
      const stripped = lowerName.replace(/^(?:vé\s+|hạng\s*vé\s+|ticket\s+)/i, '').trim();
      const lowerDoc = originalText.toLowerCase();
      return lowerDoc.includes(lowerName) || (stripped.length >= 2 && lowerDoc.includes(stripped));
    };

    const hasHallucinatedTickets = rawTickets.some((t) => !isTicketInDoc(t));
    if (structuredTickets.length > 0) {
      if (rawTickets.length === 0 || hasHallucinatedTickets || rawTickets.length < structuredTickets.length) {
        logger.info(`[AiDocumentParser] Sử dụng ${structuredTickets.length} hạng vé trích xuất chính xác từ tài liệu.`);
        rawTickets = structuredTickets;
      }
    } else if (hasHallucinatedTickets) {
      // Loại bỏ các vé bịa đặt hoàn toàn không có trong văn bản
      rawTickets = rawTickets.filter(isTicketInDoc);
    }

    const validTickets = [];
    const hasAnyQtyMention = /(?:số\s*lượng|quy\s*mô|quantity|places?|bundles?|\b\d+\s*(?:vé|chỗ|suất|slot|tickets?)(?!\w))/iu.test(originalText);

    rawTickets.forEach((t, idx) => {
      const name = String(t.name || '').trim() || `Hạng vé ${idx + 1}`;
      const price = Math.max(0, Math.round(Number(t.price) || 0));

      let quantity = null;
      if (t.quantity_total !== null && t.quantity_total !== undefined && !isNaN(Number(t.quantity_total))) {
        const qNum = Math.round(Number(t.quantity_total));
        if (qNum > 0 && (hasAnyQtyMention || originalText.includes(String(qNum)) || originalText.includes(qNum.toLocaleString('en-US')))) {
          quantity = qNum;
        }
      }

      validTickets.push({
        name,
        price,
        quantity_total: quantity,
        description: String(t.description || '').trim(),
      });
    });

    if (validTickets.length === 0) {
      validTickets.push({
        name: 'Vé Tiêu Chuẩn',
        price: 0,
        quantity_total: null,
        description: 'Hạng vé chung tham gia sự kiện',
      });
      warnings.push('Tài liệu chưa có thông tin giá vé. Hệ thống đã khởi tạo 1 hạng vé mặc định.');
    } else if (validTickets.some((t) => t.quantity_total === null)) {
      warnings.push('Một số hạng vé chưa có số lượng trong tài liệu. Vui lòng nhập số lượng vé khi chỉnh sửa.');
    }

    data.ticket_types = validTickets;

    // 7. Chính sách hoàn tiền
    const isNonRefundableInText = /không\s*hoàn\s*(?:vé|tiền)|không\s*được\s*hoàn\s*trả|không\s*hoàn\s*trả|non-refundable/i.test(originalText || '');
    data.refund_policy = {
      allow_refunds: isNonRefundableInText ? false : Boolean(data.refund_policy?.allow_refunds),
      deadline_days: Number(data.refund_policy?.deadline_days) || 7,
    };

    // 8. Tags: Tôn trọng 100% tags được bóc tách từ sections.tags hoặc AI
    const organizerName = (options && options.organizerName) ? String(options.organizerName).trim() : '';
    let rawTags = [];
    if (sections && sections.tags) {
      const secTags = sections.tags
        .split(/[,;\n]/)
        .map((t) => t.replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim())
        .filter(Boolean);
      rawTags.push(...secTags);
    } else if (Array.isArray(data.tags) && data.tags.length > 0) {
      rawTags.push(...data.tags);
    }

    let cleanTags = rawTags
      .map((t) => String(t || '').trim())
      .filter((t) => t.length > 0 && !/^eventhub$/i.test(t));

    // Chỉ tự động tìm từ khóa theo chủ đề nếu tài liệu KHÔNG có sẵn thẻ tags
    if (cleanTags.length === 0) {
      const topicKeywords = [
        { kw: 'thiết kế', tag: 'Thiết kế' },
        { kw: 'nhiếp ảnh', tag: 'Nhiếp ảnh' },
        { kw: 'làm phim', tag: 'Làm phim' },
        { kw: 'phim ngắn', tag: 'Phim ngắn' },
        { kw: 'sáng tạo nội dung', tag: 'Sáng tạo nội dung' },
        { kw: 'sinh viên', tag: 'Sinh viên' },
        { kw: 'workshop', tag: 'Workshop' },
        { kw: 'triển lãm', tag: 'Triển lãm' },
        { kw: 'công nghệ', tag: 'Công nghệ' },
        { kw: 'trí tuệ nhân tạo', tag: 'Trí tuệ nhân tạo' },
        { kw: 'ẩm thực', tag: 'Ẩm thực' },
        { kw: 'âm nhạc', tag: 'Âm nhạc' },
      ];
      const textLower = originalText.toLowerCase();
      for (const item of topicKeywords) {
        if (textLower.includes(item.kw) && !cleanTags.some((t) => t.toLowerCase() === item.tag.toLowerCase())) {
          cleanTags.push(item.tag);
        }
      }
    }

    if (organizerName && !cleanTags.some((t) => t.toLowerCase() === organizerName.toLowerCase())) {
      cleanTags.unshift(organizerName);
    }
    if (cleanTags.length === 0) {
      cleanTags = organizerName ? [organizerName, 'Sự kiện'] : ['Sự kiện'];
    }
    data.tags = [...new Set(cleanTags)].slice(0, 8);

    return data;
  }
}

module.exports = new AiDocumentParserService();
