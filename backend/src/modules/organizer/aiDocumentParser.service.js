const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventCategoriesRepository = require('../admin/eventCategories.repository');
const logger = require('../../core/logger');

const PRIMARY_MODEL = process.env.OLLAMA_EXTRACTION_MODEL || 'qwen3-eventhub-Q4_K_M.gguf';
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'qwen3-eventhub-Q4_K_M.gguf';
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);

class AiDocumentParserService {
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
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        rawText = parsed.value || '';
      } catch (err) {
        logger.error(`[AiDocumentParser] Lỗi đọc DOCX: ${err.message}`);
        throw new Error(`Không thể đọc nội dung file Word (.docx): ${err.message}`);
      }
    } else if (mime.startsWith('text/') || ext === 'txt' || ext === 'md') {
      rawText = file.buffer.toString('utf-8');
    } else {
      throw new Error('Định dạng file không được hỗ trợ. Vui lòng tải file PDF, Word (.docx) hoặc Text (.txt)');
    }

    const cleaned = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
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

    // Dọn dẹp khoảng trắng dư thừa nhưng BẢO TOÀN NGUYÊN VẸN NỘI DUNG (hỗ trợ tài liệu lớn tới 15.000 ký tự)
    const cleanedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
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
3. CÁC TRƯỜNG DỮ LIỆU CẦN XUẤT:
   - "title": ${detectedSections.title && !this._isGenericDocumentTitle(detectedSections.title) ? `"${detectedSections.title}" (đã xác định chính xác từ tài liệu, TUYỆT ĐỐI không đổi sang tiêu đề chung như EVENT PROPOSAL).` : 'Tên chính thức của sự kiện (chỉ lấy tên sự kiện, không kèm danh mục hay tags, tuyệt đối không lấy tiêu đề chung như EVENT PROPOSAL hay ĐỀ XUẤT SỰ KIỆN).'}
   - "category_id": ID phù hợp nhất lấy từ danh mục hệ thống ở trên.
   - "short_description": ${hasStructuredShortDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu).' : 'Tóm tắt 1 - 2 câu mở đầu (tối đa 300 ký tự).'}
   - "description": ${hasStructuredDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu để tối ưu tốc độ).' : 'Nội dung chi tiết của sự kiện theo HTML (<p>, <ul>, <li>, <strong>).'}
   - "venue_name": Tên địa điểm cụ thể (ví dụ: "Trung tâm Hội nghị ABC", "Nhà hát Bến Thành"). NẾU TÀI LIỆU KHÔNG GHI ĐỊA ĐIỂM CỤ THỂ, BẮT BUỘC ĐỂ CHUỖI RỖNG "". TUYỆT ĐỐI KHÔNG tự bịa và TUYỆT ĐỐI KHÔNG lấy tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} để làm địa điểm nếu tài liệu không đề cập.
   - "address_line": Địa chỉ chi tiết nếu có trong tài liệu. Nếu không có để chuỗi rỗng "".
   - "province": Tỉnh/Thành phố nếu tài liệu có ghi (ví dụ: "Thành phố Hồ Chí Minh", "Hà Nội").
   - "sessions": Mảng chứa ĐẦY ĐỦ tất cả các phiên diễn ra sự kiện (nếu sự kiện có nhiều ca/buổi/phiên như Sáng, Chiều hoặc nhiều ngày, BẮT BUỘC trích xuất riêng từng phiên vào mảng này). Mỗi phiên gồm:
     * "session_name": Tên phiên (ví dụ: "Phiên Sáng: Keynote & Panels", "Phiên Chiều: Workshop & Tech Talks", hoặc "Phiên sự kiện").
     * "start_date": Ngày diễn ra theo định dạng YYYY-MM-DD. Lấy chính xác ngày ghi trong tài liệu.
     * "start_time": Giờ bắt đầu theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ BẮT ĐẦU, BẮT BUỘC ĐỂ "". TUYỆT ĐỐI KHÔNG TỰ BỊA GIỜ.
     * "end_time": Giờ kết thúc theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ KẾT THÚC, BẮT BUỘC ĐỂ "". TUYỆT ĐỐI KHÔNG TỰ BỊA GIỜ.
     * "checkin_start_time": Giờ bắt đầu check-in / đón khách theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ CHECK-IN, BẮT BUỘC ĐỂ "".
   - "ticket_types": Mảng chứa ĐẦY ĐỦ các hạng vé với tên, giá tiền VNĐ chính xác, số lượng và mô tả quyền lợi [{ "name": string, "price": number, "quantity_total": number | null, "description": string }].
     * "quantity_total": Số lượng vé tương ứng. NẾU TÀI LIỆU KHÔNG GHI RÕ SỐ LƯỢNG VÉ, BẮT BUỘC ĐỂ null. TUYỆT ĐỐI KHÔNG ĐIỀN 100 HAY BẤT KỲ SỐ NÀO NẾU TÀI LIỆU KHÔNG NÊU.
     * "description": Mô tả quyền lợi của vé. Nếu không có để "".
   - "refund_policy": { "allow_refunds": boolean, "deadline_days": number } (nếu ghi vé không hoàn trả hoặc non-refundable thì allow_refunds là false).
   - "require_attendee_information": boolean (true nếu tài liệu yêu cầu thu thập thông tin người tham dự như họ tên, email, sđt...; ngược lại false).
   - "additional_terms": ${hasStructuredTerms ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn).' : 'Các điều khoản riêng nếu có.'}
   - "tags": Mảng các từ khóa liên quan đến sự kiện. TUYỆT ĐỐI KHÔNG chứa tag "EventHub" hay "eventhub". BẮT BUỘC bao gồm tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} trong danh sách tags.
4. Chỉ xuất ra DUY NHẤT một chuỗi JSON hợp lệ theo cấu trúc mẫu, không giải thích thêm:

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
   * Kiểm tra xem một chuỗi có phải là tiêu đề chung/tên văn bản đề xuất chứ không phải tên sự kiện
   */
  _isGenericDocumentTitle(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.replace(/^[#\*\s\-–—"':]+|[#\*\s\-–—"':]+$/g, '').trim().toLowerCase();
    return !clean ||
           /^(?:event\s*proposal|proposal|kế\s*hoạch\s*(?:tổ\s*chức\s*)?sự\s*kiện|đề\s*xuất\s*sự\s*kiện|kịch\s*bản\s*sự\s*kiện|tài\s*liệu\s*(?:mẫu|sự\s*kiện|kiểm\s*thử)|eventhub|event\s*plan|event\s*outline)$/i.test(clean) ||
           clean.startsWith('event proposal') ||
           clean.startsWith('kế hoạch tổ chức sự kiện') ||
           clean.startsWith('đề xuất sự kiện');
  }

  /**
   * Bóc tách các phần cấu trúc rõ ràng trong tài liệu (Ground Truth Extraction)
   * Giúp bảo toàn 100% nguyên văn mô tả, tiêu đề, tóm tắt khi tài liệu đã có cấu trúc (kể cả định dạng Markdown #, **, v.v.)
   * @param {string} text
   * @returns {object} { title, short_description, description, additional_terms, schedule_location, ticket_info, attendee_info, category, tags }
   */
  _extractDocumentSections(text) {
    if (!text || typeof text !== 'string') return {};
    const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const pfx = '^[ \\t]*(?:#{1,6}\\s*)?(?:\\*{1,2}\\s*)?(?:\\d+[\\.\\)]\\s*)?(?:\\*{1,2}\\s*)?';
    const sfx = '(?:\\*{1,2})?\\s*[:：\\-–]?\\s*(?:\\*{1,2})?\\s*([^\\n]*)$';

    const headerDefs = [
      { key: 'title', singleLine: true, regex: new RegExp(`${pfx}(?:TIÊU\\s*ĐỀ|TÊN\\s*SỰ\\s*KIỆN|TÊN\\s*HOẠT\\s*ĐỘNG|EVENT\\s*NAME|EVENT\\s*TITLE|NAME\\s*OF\\s*EVENT|TITLE)${sfx}`, 'im') },
      { key: 'category', singleLine: true, regex: new RegExp(`${pfx}(?:DANH\\s*MỤC|THỂ\\s*LOẠI|CHỦ\\s*ĐỀ|EVENT\\s*CATEGORY|CATEGORY|GENRE|TOPIC)${sfx}`, 'im') },
      { key: 'tags', singleLine: true, regex: new RegExp(`${pfx}(?:TAGS?|TỪ\\s*KHÓA|TỪ\\s*KHOÁ|NHÃN|KEYWORDS?)${sfx}`, 'im') },
      { key: 'short_description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*NGẮN|TÓM\\s*TẮT|GIỚI\\s*THIỆU\\s*NGẮN|SHORT\\s*DESCRIPTION|BRIEF\\s*DESCRIPTION|SUMMARY|BRIEF)${sfx}`, 'im') },
      { key: 'description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*CHI\\s*TIẾT|DETAILED\\s*DESCRIPTION|DETAIL\\s*DESCRIPTION|FULL\\s*DESCRIPTION|NỘI\\s*DUNG\\s*CHI\\s*TIẾT|NỘI\\s*DUNG\\s*SỰ\\s*KIỆN|EVENT\\s*DESCRIPTION|EVENT\\s*DETAILS?|ABOUT\\s*(?:THE\\s*)?EVENT|GIỚI\\s*THIỆU\\s*SỰ\\s*KIỆN)${sfx}`, 'im') },
      { key: 'schedule_location', regex: new RegExp(`${pfx}(?:EVENT\\s*SCHEDULE|LỊCH\\s*TRÌNH(?:\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM)?|THỜI\\s*GIAN(?:\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM)?|SCHEDULE(?:\\s*(?:AND|&)\\s*LOCATION)?|AGENDA|TIME\\s*(?:AND|&)\\s*LOCATION|DATE\\s*(?:AND|&)\\s*TIME)${sfx}`, 'im') },
      { key: 'ticket_info', regex: new RegExp(`${pfx}(?:TICKET\\s*INFORMATION|TICKET\\s*INFO|BẢNG\\s*GIÁ\\s*VÉ|THÔNG\\s*TIN\\s*VÉ|GIÁ\\s*VÉ|HẠNG\\s*VÉ|VÉ\\s*THAM\\s*GIA|TICKETS?|TICKET\\s*PRICES?|PRICING)${sfx}`, 'im') },
      { key: 'attendee_info', regex: new RegExp(`${pfx}(?:ATTENDEE\\s*INFORMATION|ATTENDEE\\s*INFO|YÊU\\s*CẦU\\s*THU\\s*THẬP\\s*THÔNG\\s*TIN\\s*NGƯỜI\\s*THAM\\s*DỰ|THÔNG\\s*TIN\\s*NGƯỜI\\s*THAM\\s*DỰ|THU\\s*THẬP\\s*THÔNG\\s*TIN|PARTICIPANT\\s*INFORMATION)${sfx}`, 'im') },
      { key: 'additional_terms', regex: new RegExp(`${pfx}(?:ORGANIZER\\s*NOTES?|ADDITIONAL\\s*(?:INFORMATION|NOTES?|TERMS?)|IMPORTANT\\s*NOTES?|CHÍNH\\s*SÁCH\\s*VÉ|ĐIỀU\\s*KHOẢN|TERMS\\s*(?:AND|&)\\s*CONDITIONS|LƯU\\s*Ý\\s*THÊM|GHI\\s*CHÚ\\s*THÊM)${sfx}`, 'im') },
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
      sections.title = sections.title.split('\n')[0].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
    }

    // Nếu không tìm thấy nhãn TIÊU ĐỀ hoặc nhãn bị generic (ví dụ "# EVENT PROPOSAL"), tìm dòng phù hợp
    if (!sections.title || this._isGenericDocumentTitle(sections.title)) {
      const lines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
      sections.title = '';
      for (const line of lines) {
        if (this._isGenericDocumentTitle(line)) continue;
        const isHeaderKey = /^(?:#{1,6}\s*)?(?:\*{1,2}\s*)?(?:thời gian|địa điểm|địa chỉ|ngày|mô tả|kính gửi|lưu ý|giá vé|nội dung|danh mục|tags?|event\s*name|category|detailed|short|schedule|tickets?|attendee)/i.test(line);
        const cleanLine = line.replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
        if (!isHeaderKey && cleanLine.length <= 150 && !this._isGenericDocumentTitle(cleanLine)) {
          sections.title = cleanLine;
          break;
        }
      }
    }

    return sections;
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

    const vMatch = text.match(/(?:Venue\s*Name|Tên\s*địa\s*điểm|Địa\s*điểm)\s*[:：\-–]\s*([^\n\r]+)/i);
    if (vMatch) venueName = vMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();

    const dMatch = text.match(/(?:District|Quận|Huyện)\s*[:：\-–]\s*([^\n\r]+)/i);
    if (dMatch) district = dMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();

    const cMatch = text.match(/(?:City|Province|Tỉnh|Thành\s*phố)\s*[:：\-–]\s*([^\n\r]+)/i);
    if (cMatch) city = cMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();

    const aMatch = text.match(/(?:Street\s*Address|Address|Địa\s*chỉ)\s*[:：\-–]\s*([^\n\r]+)/i);
    if (aMatch) addressLine = aMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();

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

        const stMatch = block.match(/(?:Start\s*Time|Giờ\s*bắt\s*đầu|Bắt\s*đầu)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
        const etMatch = block.match(/(?:End\s*Time|Giờ\s*kết\s*thúc|Kết\s*thúc)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);
        const ciMatch = block.match(/(?:Check-?in\s*Time|Giờ\s*check-?in|Đón\s*khách)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})/i);

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

  /**
   * Bóc tách các hạng vé có cấu trúc từ text
   * @param {string} text
   * @returns {Array<object>} [{ name, price, quantity_total, description }]
   */
  _parseStructuredTickets(text) {
    if (!text || typeof text !== 'string') return [];

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
    const dateMatch = text.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (dateMatch) {
      const dd = String(dateMatch[1]).padStart(2, '0');
      const mm = String(dateMatch[2]).padStart(2, '0');
      const yyyy = dateMatch[3];
      foundDate = `${yyyy}-${mm}-${dd}`;
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

    if (structuredSched.venue?.venue_name) {
      venueName = structuredSched.venue.venue_name;
      addressLine = structuredSched.venue.address_line || '';
      district = structuredSched.venue.district || '';
      province = structuredSched.venue.province || '';
    } else {
      const venueMatch = text.match(/(?:Địa điểm|Nơi tổ chức|Venue|Địa chỉ)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (venueMatch) {
        const fullLoc = cleanLine(venueMatch[1]).trim();
        const parts = fullLoc.split(/[,-]\s*/);
        if (parts.length > 1) {
          venueName = parts[0].trim();
          addressLine = parts.slice(1).join(', ').trim();
        } else {
          venueName = fullLoc;
        }
      }
    }

    // Tìm giá vé kèm mô tả
    const ticketTypes = [];
    if (structuredTickets.length > 0) {
      ticketTypes.push(...structuredTickets);
    } else {
      const priceRegex = /(?:[•\-\*\+]|\d+[\.\)])?\s*([A-Za-z0-9\sÀ-ỹ]+?)\s*[:\-–]\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:vnđ|vnd|đ|k)(?:\s*[\(\-–:]\s*([^\n\)]+)\)?)?/gi;
      let pMatch;
      while ((pMatch = priceRegex.exec(text)) !== null) {
        const rawName = cleanLine(pMatch[1]).replace(/^[•\-\*\+]\s*/, '').trim();
        const rawPrice = pMatch[2].replace(/[\.,]/g, '');
        const priceNum = Number(rawPrice);
        const desc = pMatch[3] ? pMatch[3].trim() : '';
        if (rawName.length > 1 && rawName.length < 50 && !isNaN(priceNum) && priceNum >= 0 && !ticketTypes.some((t) => t.name.toLowerCase() === rawName.toLowerCase())) {
          let quantityNum = null;
          const qtyMatch = pMatch[0].match(/(\d+)\s*(?:vé|chỗ|suất|slot)/i) ||
                           text.match(new RegExp(`${rawName}[^\\n]*?(\\d+)\\s*(?:vé|chỗ|suất|slot)`, 'i'));
          if (qtyMatch) {
            quantityNum = Number(qtyMatch[1]);
          }
          ticketTypes.push({
            name: rawName,
            price: priceNum,
            quantity_total: quantityNum,
            description: desc,
          });
        }
      }
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

    const shortDesc = sections.short_description
      ? sections.short_description.slice(0, 500)
      : (cleanLine(rawLines.slice(1, 3).join(' ')).slice(0, 500) || title).slice(0, 500);

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
      require_attendee_information: /thu\s*thập\s*thông\s*tin\s*người\s*tham\s*dự|thông\s*tin\s*người\s*tham\s*dự|attendee\s*info/i.test(text),
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
    if (rawSectionTitle && !this._isGenericDocumentTitle(rawSectionTitle)) {
      data.title = rawSectionTitle;
    } else {
      data.title = cleanPrefix((data.title || '').split('\n')[0]).slice(0, 200) || 'Sự kiện mới từ tài liệu';
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
        { keywords: ['workshop', 'hội thảo', 'summit', 'conference', 'seminar', 'education', 'giáo dục', 'đào tạo'], targetSlug: 'hoi-thao-giao-duc' },
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

    // Nếu AI không trích xuất được hoặc bị xóa do hallucination nhưng tài liệu có phần schedule_location rõ ràng:
    if (structuredSched.venue?.venue_name) {
      const isProvHallucinated = data.province && !originalText.toLowerCase().includes(data.province.toLowerCase());
      if (!venueName || isProvHallucinated) {
        venueName = structuredSched.venue.venue_name;
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
    if (normProv.includes('đà nẵng') || normProv.includes('da nang')) {
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
      }
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
      (s) => s.start_date && !originalText.includes(s.start_date) && !originalText.includes(s.start_date.split('-').reverse().join('/'))
    );
    if (structuredSched.sessions.length > 0 && (rawSessions.length === 0 || hasHallucinatedDates || rawSessions.length < structuredSched.sessions.length)) {
      logger.info(`[AiDocumentParser] Sử dụng ${structuredSched.sessions.length} phiên sự kiện trích xuất chính xác từ tài liệu.`);
      rawSessions = structuredSched.sessions;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const hasAnyTimeInDoc = /(?:\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s*(?:giờ|h)\b|\b\d{1,2}\s*(?:am|pm)\b)/i.test(originalText);
    const hasCheckinMention = /(?:check[\s\-]?in|đón khách|mở cửa|đón tiếp)/i.test(originalText);

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

        if (hasCheckinMention) {
          checkinTime = this._normalizeTime(s?.checkin_start_time, '');
          if (!checkinTime && startTime) {
            const [sh, sm] = startTime.split(':').map(Number);
            const totalMin = Math.max(0, sh * 60 + sm - 30);
            const chH = Math.floor(totalMin / 60);
            const chM = totalMin % 60;
            checkinTime = `${String(chH).padStart(2, '0')}:${String(chM).padStart(2, '0')}`;
          }
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
    data.require_attendee_information = Boolean(
      sections?.attendee_info
        ? /yes|có|required|bắt\s*buộc/i.test(sections.attendee_info)
        : (data.require_attendee_information ?? /(?:thu\s*thập\s*thông\s*tin\s*người\s*tham\s*dự|thông\s*tin\s*người\s*tham\s*dự|attendee\s*info)/i.test(originalText))
    );

    // 6. Hạng vé (ticket_types)
    let rawTickets = Array.isArray(data.ticket_types) ? data.ticket_types : [];
    const hasHallucinatedTickets = rawTickets.some(
      (t) => t.name && !originalText.toLowerCase().includes(t.name.toLowerCase())
    );
    if (structuredTickets.length > 0 && (rawTickets.length === 0 || hasHallucinatedTickets || rawTickets.length < structuredTickets.length)) {
      logger.info(`[AiDocumentParser] Sử dụng ${structuredTickets.length} hạng vé trích xuất chính xác từ tài liệu.`);
      rawTickets = structuredTickets;
    }

    const validTickets = [];
    const hasAnyQtyMention = /(?:số\s*lượng|quy\s*mô|\b\d+\s*(?:vé|chỗ|suất|slot|tickets?)(?!\w))/iu.test(originalText);

    rawTickets.forEach((t, idx) => {
      const name = String(t.name || '').trim() || `Hạng vé ${idx + 1}`;
      const price = Math.max(0, Math.round(Number(t.price) || 0));

      let quantity = null;
      if (t.quantity_total !== null && t.quantity_total !== undefined && !isNaN(Number(t.quantity_total))) {
        const qNum = Math.round(Number(t.quantity_total));
        if (qNum > 0 && (hasAnyQtyMention || originalText.includes(String(qNum)))) {
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

    // 8. Tags: Không cần tag eventhub, lấy tên nhà tổ chức gắn cho tags
    const organizerName = (options && options.organizerName) ? String(options.organizerName).trim() : '';
    let rawTags = Array.isArray(data.tags) ? data.tags : [];
    if (sections && sections.tags) {
      const secTags = sections.tags
        .split(/[,;\n]/)
        .map((t) => t.replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim())
        .filter(Boolean);
      rawTags = [...rawTags, ...secTags];
    }
    let cleanTags = rawTags
      .map((t) => String(t || '').trim())
      .filter((t) => t.length > 0 && !/^eventhub$/i.test(t));

    if (organizerName && !cleanTags.some((t) => t.toLowerCase() === organizerName.toLowerCase())) {
      cleanTags.unshift(organizerName);
    }
    if (cleanTags.length === 0) {
      cleanTags = organizerName ? [organizerName, 'Sự kiện'] : ['Sự kiện'];
    }
    data.tags = [...new Set(cleanTags)];

    return data;
  }
}

module.exports = new AiDocumentParserService();
