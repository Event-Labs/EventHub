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

    let textForAi = truncatedText;
    if (hasStructuredDesc && detectedSections.description.length > 500) {
      const descMainInfo = detectedSections.description.split(/(?:English Below|Terms and Conditions:)/i)[0];
      textForAi = [
        detectedSections.title ? `TIÊU ĐỀ: ${detectedSections.title}` : '',
        `THÔNG TIN SỰ KIỆN CHÍNH (THỜI GIAN, ĐỊA ĐIỂM, NỘI DUNG):\n${descMainInfo.slice(0, 1000)}`,
        detectedSections.additional_terms ? `CHÍNH SÁCH VÉ TÓM TẮT:\n${detectedSections.additional_terms.slice(0, 300)}` : '',
      ].filter(Boolean).join('\n\n');
    }  

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
   - "title": Tên chính thức của sự kiện.
   - "category_id": ID phù hợp nhất lấy từ danh mục hệ thống ở trên.
   - "short_description": ${hasStructuredShortDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu).' : 'Tóm tắt 1 - 2 câu mở đầu (tối đa 300 ký tự).'}
   - "description": ${hasStructuredDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu để tối ưu tốc độ).' : 'Nội dung chi tiết của sự kiện theo HTML (<p>, <ul>, <li>, <strong>).'}
   - "venue_name": Tên địa điểm cụ thể (ví dụ: "Trung tâm Hội nghị ABC", "Nhà hát Bến Thành"). NẾU TÀI LIỆU KHÔNG GHI ĐỊA ĐIỂM CỤ THỂ, BẮT BUỘC ĐỂ CHUỖI RỖNG "". TUYỆT ĐỐI KHÔNG tự bịa và TUYỆT ĐỐI KHÔNG lấy tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} để làm địa điểm nếu tài liệu không đề cập.
   - "address_line": Địa chỉ chi tiết nếu có trong tài liệu. Nếu không có để chuỗi rỗng "".
   - "province": Tỉnh/Thành phố nếu tài liệu có ghi (ví dụ: "Thành phố Hồ Chí Minh", "Hà Nội").
   - "session":
     * "start_date": Ngày diễn ra sự kiện theo định dạng YYYY-MM-DD. Lấy chính xác ngày ghi trong tài liệu.
     * "start_time": Giờ bắt đầu theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ BẮT ĐẦU, BẮT BUỘC ĐỂ "". TUYỆT ĐỐI KHÔNG TỰ BỊA GIỜ.
     * "end_time": Giờ kết thúc theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ KẾT THÚC, BẮT BUỘC ĐỂ "". TUYỆT ĐỐI KHÔNG TỰ BỊA GIỜ.
     * "checkin_start_time": Giờ bắt đầu check-in / đón khách theo định dạng HH:mm. NẾU TÀI LIỆU KHÔNG GHI GIỜ CHECK-IN, BẮT BUỘC ĐỂ "".
   - "ticket_types": Mảng chứa ĐẦY ĐỦ các hạng vé với tên, giá tiền VNĐ chính xác, số lượng và mô tả quyền lợi [{ "name": string, "price": number, "quantity_total": number | null, "description": string }].
     * "quantity_total": Số lượng vé tương ứng. NẾU TÀI LIỆU KHÔNG GHI RÕ SỐ LƯỢNG VÉ, BẮT BUỘC ĐỂ null. TUYỆT ĐỐI KHÔNG ĐIỀN 100 HAY BẤT KỲ SỐ NÀO NẾU TÀI LIỆU KHÔNG NÊU.
     * "description": Mô tả quyền lợi của vé. Nếu không có để "".
   - "refund_policy": { "allow_refunds": boolean, "deadline_days": number } (nếu ghi vé không hoàn trả hoặc non-refundable thì allow_refunds là false).
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
  "session": {
    "start_date": "",
    "start_time": "",
    "end_time": "",
    "checkin_start_time": ""
  },
  "ticket_types": [],
  "refund_policy": {
    "allow_refunds": false,
    "deadline_days": 7
  },
  "additional_terms": "",
  "tags": [${organizerName ? `"${organizerName}", ` : ''}"Sự kiện"]
}`;

    let parsedData = null;
    let usedModel = PRIMARY_MODEL;
    let warnings = [];

    // Helper: Gọi Ollama kèm timeout
    const maxTokens = (hasStructuredDesc && hasStructuredShortDesc) ? 350 : 2048;
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
      return ollamaClient.extractJSON(raw);
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
   * Bóc tách các phần cấu trúc rõ ràng trong tài liệu (Ground Truth Extraction)
   * Giúp bảo toàn 100% nguyên văn mô tả, tiêu đề, tóm tắt khi tài liệu đã có cấu trúc.
   * @param {string} text
   * @returns {object} { title, short_description, description, additional_terms }
   */
  _extractDocumentSections(text) {
    if (!text || typeof text !== 'string') return {};
    const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const headerDefs = [
      { key: 'title', regex: /^[ \t]*(?:TIÊU\s*ĐỀ|TÊN\s*SỰ\s*KIỆN|TITLE)\s*[:：\-–]?\s*([^\n]*)$/im },
      { key: 'short_description', regex: /^[ \t]*(?:MÔ\s*TẢ\s*NGẮN|TÓM\s*TẮT|SHORT\s*DESCRIPTION)\s*[:：\-–]?\s*([^\n]*)$/im },
      { key: 'description', regex: /^[ \t]*(?:MÔ\s*TẢ(?!\s*NGẮN)|THÔNG\s*TIN\s*SỰ\s*KIỆN|THÔNG\s*TIN\s*CHI\s*TIẾT|NỘI\s*DUNG\s*SỰ\s*KIỆN|NỘI\s*DUNG|DESCRIPTION)\s*[:：\-–]?\s*([^\n]*)$/im },
      { key: 'additional_terms', regex: /^[ \t]*(?:ĐIỀU\s*KHOẢN\s*&\s*QUY\s*ĐỊNH(?:\s*DÀNH\s*CHO\s*NGƯỜI\s*GIỮ\s*VÉ)?|ĐIỀU\s*KHOẢN\s*VÀ\s*QUY\s*ĐỊNH(?:\s*DÀNH\s*CHO\s*NGƯỜI\s*GIỮ\s*VÉ)?|QUY\s*ĐỊNH\s*DÀNH\s*CHO\s*NGƯỜI\s*GIỮ\s*VÉ|CHÍNH\s*SÁCH\s*&\s*ĐIỀU\s*KHOẢN|ADDITIONAL\s*TERMS|TERMS\s*&\s*CONDITIONS)\s*[:：\-–]?\s*([^\n]*)$/im },
    ];

    const foundHeaders = [];
    for (const def of headerDefs) {
      const match = def.regex.exec(norm);
      if (match) {
        foundHeaders.push({
          key: def.key,
          index: match.index,
          headerFullLength: match[0].length,
          inlineValue: match[1] ? match[1].trim() : '',
        });
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

      if (current.inlineValue) {
        block = current.inlineValue + (block ? '\n' + block : '');
      }
      sections[current.key] = block;
    }

    return sections;
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

    // Tìm địa điểm
    let venueName = '';
    let addressLine = '';
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

    // Tìm giá vé kèm mô tả
    const ticketTypes = [];
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
      district: '',
      province: '',
      session: {
        start_date: foundDate,
        start_time: startTime,
        end_time: endTime,
        checkin_start_time: checkinTime,
      },
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
        .replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|TITLE|MÔ TẢ NGẮN|MÔ TẢ|DESCRIPTION)\s*[:：\-–]\s*/i, '')
        .trim();

    // 1. Tiêu đề (ưu tiên Ground Truth từ sections)
    if (sections && sections.title) {
      data.title = cleanPrefix(sections.title).slice(0, 200);
    } else {
      data.title = cleanPrefix(data.title).slice(0, 200) || 'Sự kiện mới từ tài liệu';
    }

    // 2. Danh mục: Ưu tiên so khớp ID, tên/slug, hoặc từ khóa trong văn bản
    let validCat = categories.find((c) => String(c.id).toLowerCase() === String(data.category_id).toLowerCase());
    if (!validCat) {
      const target = String(data.category_id || '').toLowerCase().trim();
      validCat = categories.find((c) => c.name.toLowerCase() === target || (c.slug && c.slug.toLowerCase() === target));
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
      // Nếu tài liệu có phần "MÔ TẢ:", TUYỆT ĐỐI dùng 100% nội dung gốc của phần này, không cho phép AI tự ý tóm tắt hay cắt ngắn!
      finalDesc = this._formatDocumentToHtml(sections.description);
    } else {
      // Nếu tài liệu tự do không có nhãn "MÔ TẢ:", lọc sạch các quy tắc và tiêu đề bịa đặt/hallucination của AI
      finalDesc = String(data.description || '').trim();
      if (finalDesc) {
        finalDesc = this._stripHallucinatedBoilerplate(finalDesc, originalText);
        finalDesc = this._cleanEventDescription(finalDesc, data.title, data.short_description);
      }
      // Nếu AI tóm tắt quá ngắn so với văn bản gốc hoặc trống, giữ nguyên vẹn nội dung từ tài liệu gốc
      if (!finalDesc || finalDesc.length < 50 || (originalText.length > 500 && finalDesc.replace(/<[^>]*>/g, '').length < originalText.length * 0.25)) {
        if (originalText && originalText.trim()) {
          finalDesc = this._formatDocumentToHtml(originalText, data.title, data.short_description);
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

    if (!venueName) {
      warnings.push('Chưa tìm thấy địa điểm cụ thể trong tài liệu. Vui lòng chọn hoặc tạo địa điểm mới.');
    }

    data.venue_name = venueName;
    data.address_line = addressLine;

    // Chuẩn hóa tên tỉnh thành về chuẩn hành chính Việt Nam
    const normProv = (data.province || '').toLowerCase();
    if (
      normProv.includes('hồ chí minh') ||
      normProv.includes('ho chi minh') ||
      normProv.includes('tp.hcm') ||
      normProv.includes('tphcm') ||
      normProv.includes('sài gòn')
    ) {
      data.province = 'Thành phố Hồ Chí Minh';
    } else if (normProv.includes('hà nội') || normProv.includes('ha noi')) {
      data.province = 'Thành phố Hà Nội';
    } else if (normProv.includes('đà nẵng') || normProv.includes('da nang')) {
      data.province = 'Thành phố Đà Nẵng';
    } else if (normProv.includes('cần thơ') || normProv.includes('can tho')) {
      data.province = 'Thành phố Cần Thơ';
    } else if (normProv.includes('hải phòng') || normProv.includes('hai phong')) {
      data.province = 'Thành phố Hải Phòng';
    } else if (!data.province && (originalText || data.title)) {
      const normText = `${data.title} ${originalText}`.toLowerCase();
      if (
        normText.includes('hồ chí minh') ||
        normText.includes('ho chi minh') ||
        normText.includes('tp.hcm') ||
        normText.includes('tphcm') ||
        normText.includes('sài gòn')
      ) {
        data.province = 'Thành phố Hồ Chí Minh';
      } else if (normText.includes('hà nội') || normText.includes('ha noi')) {
        data.province = 'Thành phố Hà Nội';
      } else if (normText.includes('đà nẵng') || normText.includes('da nang')) {
        data.province = 'Thành phố Đà Nẵng';
      } else if (normText.includes('cần thơ') || normText.includes('can tho')) {
        data.province = 'Thành phố Cần Thơ';
      } else if (normText.includes('hải phòng') || normText.includes('hai phong')) {
        data.province = 'Thành phố Hải Phòng';
      }
    }

    // 5. Phiên sự kiện: Giữ nguyên ngày diễn ra chính xác từ tài liệu (bỏ ràng buộc 21 ngày)
    let startDate = data.session?.start_date;
    const isValidFormat = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (isValidFormat) {
      const parsedDate = new Date(`${startDate}T00:00:00`);
      const diffDays = Math.ceil((parsedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        warnings.push(`Ngày sự kiện trong tài liệu (${startDate}) đã diễn ra trong quá khứ. Vui lòng chọn ngày trong tương lai.`);
      } else if (diffDays <= 10) {
        warnings.push(
          'Hệ thống có thể sẽ mất khoảng từ 3 đến 4 ngày hoặc có thể hơn để duyệt sự bạn, hãy đảm bảo rằng điều đó sẽ không ảnh hưởng đến kế hoạch diễn ra sự kiện sắp tới của bạn. Hãy đảm bảo rằng bạn đã có kế hoạch và sẵn sàng nếu sự kiện được duyệt trễ hơn dự kiện.'
        );
      }
    } else {
      startDate = this.getSuggestedMinDate();
      warnings.push(`Chưa tìm thấy ngày diễn ra sự kiện trong tài liệu, hệ thống đã gợi ý ngày ${startDate}.`);
    }

    // Kiểm tra xem trong tài liệu gốc có đề cập đến giờ giấc hay không
    const hasAnyTimeInDoc = /(?:\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s*(?:giờ|h)\b|\b\d{1,2}\s*(?:am|pm)\b)/i.test(originalText);

    let startTime = '';
    let endTime = '';
    let checkinTime = '';

    if (hasAnyTimeInDoc) {
      startTime = this._normalizeTime(data.session?.start_time, '');
      endTime = this._normalizeTime(data.session?.end_time, '');

      // Đảm bảo endTime diễn ra sau startTime nếu cùng ngày
      if (startTime && endTime && endTime <= startTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const newEh = Math.min(23, sh + 2);
        endTime = `${String(newEh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
        if (endTime <= startTime) {
          endTime = '23:59';
        }
      }

      // Chỉ lấy checkinTime nếu tài liệu có đề cập đến checkin/đón khách
      const hasCheckinMention = /(?:check[\s\-]?in|đón khách|mở cửa|đón tiếp)/i.test(originalText);
      if (hasCheckinMention) {
        checkinTime = this._normalizeTime(data.session?.checkin_start_time, '');
        if (!checkinTime && startTime) {
          const [sh, sm] = startTime.split(':').map(Number);
          const totalMin = Math.max(0, sh * 60 + sm - 30);
          const chH = Math.floor(totalMin / 60);
          const chM = totalMin % 60;
          checkinTime = `${String(chH).padStart(2, '0')}:${String(chM).padStart(2, '0')}`;
        }
      }
    } else {
      logger.info('[AiDocumentParser] Tài liệu không chứa thông tin giờ giấc. Giữ trống start_time, end_time, checkin_start_time.');
      warnings.push('Chưa tìm thấy giờ bắt đầu / kết thúc và check-in trong tài liệu. Vui lòng tự bổ sung ở Bước 2.');
    }

    data.sessions = [
      {
        start_date: startDate,
        start_time: startTime,
        end_time: endTime,
        checkin_start_time: checkinTime,
      },
    ];

    // 6. Hạng vé (ticket_types)
    const rawTickets = Array.isArray(data.ticket_types) ? data.ticket_types : [];
    const validTickets = [];
    const hasAnyQtyMention = /(?:\b\d+\s*(?:vé|chỗ|suất|slot|tickets?)\b)/i.test(originalText);

    rawTickets.forEach((t, idx) => {
      const name = String(t.name || '').trim() || `Hạng vé ${idx + 1}`;
      const price = Math.max(0, Math.round(Number(t.price) || 0));

      let quantity = null;
      if (t.quantity_total !== null && t.quantity_total !== undefined && !isNaN(Number(t.quantity_total))) {
        const qNum = Math.round(Number(t.quantity_total));
        // Nếu trong tài liệu gốc KHÔNG hề có bất kỳ số lượng vé nào (ví dụ user chỉ ghi giá vé),
        // thì số 100 hay bất kỳ số nào do AI sinh ra đều là tự bịa!
        if (qNum > 0 && hasAnyQtyMention) {
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
    let cleanTags = rawTags
      .map((t) => String(t || '').trim())
      .filter((t) => t.length > 0 && !/^eventhub$/i.test(t));

    if (organizerName && !cleanTags.some((t) => t.toLowerCase() === organizerName.toLowerCase())) {
      cleanTags.unshift(organizerName);
    }
    if (cleanTags.length === 0) {
      cleanTags = organizerName ? [organizerName, 'Sự kiện'] : ['Sự kiện'];
    }
    data.tags = cleanTags;

    return data;
  }
}

module.exports = new AiDocumentParserService();
