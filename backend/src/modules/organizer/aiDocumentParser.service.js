const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventCategoriesRepository = require('../admin/eventCategories.repository');
const logger = require('../../core/logger');

const PRIMARY_MODEL = process.env.OLLAMA_EXTRACTION_MODEL || process.env.OLLAMA_MODEL || 'qwen3-event-extractor-2';
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'eventhub-qwen3';
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
const MIN_WEEKS_DAYS = 21; // Tối thiểu 3 tuần

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
        const parsed = await pdfParse(file.buffer);
        rawText = parsed.text || '';
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
   * Tính toán ngày tối thiểu (hôm nay + 22 ngày)
   */
  getSuggestedMinDate() {
    const d = new Date();
    d.setDate(d.getDate() + MIN_WEEKS_DAYS + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Phân tích văn bản và trích xuất dữ liệu sự kiện
   * @param {string} text - Nội dung tài liệu
   * @param {string} userNote - Ghi chú thêm từ BTC nếu có
   * @returns {Promise<object>}
   */
  async extractEventFromText(text, userNote = '') {
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

    // Rút gọn văn bản nếu quá dài (tối đa 6000 ký tự)
    const truncatedText = text.slice(0, 6000);

    const prompt = `Bạn là Trợ lý AI chuyên trách bóc tách tài liệu sự kiện của nền tảng EventHub (Model: ${PRIMARY_MODEL}).
Nhiệm vụ của bạn: Đọc kỹ tài liệu sự kiện đính kèm bên dưới và trích xuất TOÀN BỘ thông tin thành một JSON duy nhất theo đúng cấu trúc yêu cầu.

=== DANH SÁCH DANH MỤC HỢP LỆ (BẮT BUỘC CHỌN 1 ID PHÙ HỢP NHẤT) ===
${categoriesPrompt || 'Chưa có danh mục cụ thể, hãy để trống category_id'}

=== QUY TẮC TRÍCH XUẤT CỰC KỲ QUAN TRỌNG ===
1. "title": Tên chính thức của sự kiện, viết hoa chữ cái đầu hoặc theo phong cách poster/tài liệu, KHÔNG chứa các tiền tố như "TIÊU ĐỀ:".
2. "short_description": BẮT BUỘC DƯỚI 140 KÝ TỰ (TUYỆT ĐỐI KHÔNG ĐƯỢC QUÁ 150 KÝ TỰ). Viết một câu tóm tắt thật lôi cuốn, súc tích về điểm nổi bật nhất của sự kiện.
3. "description": Viết mô tả chi tiết, đầy đủ và chuyên nghiệp bằng HTML (sử dụng <h3>, <p>, <strong>, <ul>, <li>). BẮT BUỘC PHẢI BAO GỒM ĐỦ CÁC MỤC SAU nếu tài liệu có đề cập:
   - <h3>Giới thiệu sự kiện</h3>: Mục đích, ý nghĩa, bối cảnh, sự tham gia của các nghệ sĩ/khách mời/diễn giả đặc biệt.
   - <h3>Lịch trình & Hoạt động nổi bật</h3>: Các tiết mục, khung giờ biểu diễn, trò chơi tương tác, trải nghiệm độc quyền.
   - <h3>Thông tin vé & Quyền lợi</h3>: Chi tiết quyền lợi của từng hạng vé (nếu có).
   - <h3>Lưu ý & Quy định tham gia</h3>: Quy định độ tuổi, thời gian check-in, tư trang cấm mang theo.
4. "additional_terms": Trích xuất riêng các điều khoản, quy định hủy vé/đổi trả/VAT vào trường này (văn bản thuần).
5. Ngày sự kiện (start_date) định dạng YYYY-MM-DD. Giờ bắt đầu (start_time) và kết thúc (end_time) định dạng HH:mm.
6. "ticket_types": Mảng các loại vé. "price" là số nguyên (VNĐ), "quantity_total" là số lượng vé.
7. Chỉ trả về DUY NHẤT 1 khối JSON hợp lệ, KHÔNG thêm bất kỳ lời giải thích nào ngoài JSON.

${userNote ? `Lưu ý thêm từ Ban tổ chức: "${userNote}"` : ''}

=== TÀI LIỆU CẦN TRÍCH XUẤT ===
${truncatedText}

=== CẤU TRÚC JSON MẪU BẮT BUỘC ===
{
  "title": "Tên sự kiện chính xác",
  "category_id": "ID danh mục từ danh sách",
  "short_description": "Tóm tắt súc tích, hấp dẫn dưới 140 ký tự",
  "description": "<h3>Giới thiệu sự kiện</h3><p>...</p><h3>Lịch trình & Hoạt động nổi bật</h3><ul><li>...</li></ul><h3>Lưu ý tham dự</h3><p>...</p>",
  "additional_terms": "Quy định hoàn vé, đổi trả hoặc điều khoản riêng (nếu có)",
  "tags": ["tag1", "tag2"],
  "venue_name": "Tên địa điểm / Sân vận động / Khách sạn (nếu có)",
  "address_line": "Số nhà, tên đường (nếu có)",
  "ward": "",
  "district": "",
  "province": "Tỉnh/Thành phố",
  "session": {
    "start_date": "YYYY-MM-DD",
    "start_time": "HH:mm",
    "end_time": "HH:mm"
  },
  "ticket_types": [
    {
      "name": "Tên hạng vé",
      "price": 100000,
      "quantity_total": 100,
      "description": "Mô tả quyền lợi vé"
    }
  ],
  "refund_policy": {
    "allow_refunds": false,
    "deadline_days": 7
  },
  "missing_fields": []
}`;

    let parsedData = null;
    let usedModel = PRIMARY_MODEL;
    let warnings = [];

    // Helper: Gọi Ollama kèm timeout
    const callOllamaModel = async (modelName) => {
      logger.info(`[AiDocumentParser] Đang gọi Ollama model: ${modelName} (Timeout: ${TIMEOUT_MS}ms)`);
      const raw = await Promise.race([
        ollamaClient.generate(prompt, {
          model: modelName,
          format: 'json',
          think: false,
          temperature: 0.1,
          max_tokens: 2500,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Ollama extraction timeout sau ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
        ),
      ]);
      return ollamaClient.extractJSON(raw);
    };

    // 2. Thử gọi mô hình mới PRIMARY_MODEL (qwen3-event-extractor-2)
    try {
      parsedData = await callOllamaModel(PRIMARY_MODEL);
      if (parsedData && parsedData.title) {
        logger.info(`[AiDocumentParser] Trích xuất thành công bằng ${PRIMARY_MODEL}`);
      } else {
        parsedData = null;
      }
    } catch (err) {
      logger.warn(`[AiDocumentParser] Model ${PRIMARY_MODEL} không khả dụng (${err.message})`);
      // Thử fallback sang FALLBACK_MODEL nếu model mới chưa được tạo trong Ollama
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
      parsedData = this._heuristicExtraction(text, categories);
    }

    // 4. Chuẩn hóa và làm sạch dữ liệu (Data Sanitization & Business Rules)
    const sanitized = this._sanitizeAndValidate(parsedData, categories, warnings);

    return {
      success: true,
      data: sanitized,
      model_used: usedModel,
      warnings,
    };
  }

  /**
   * Bộ lọc quy tắc dự phòng khi Ollama offline
   */
  _heuristicExtraction(text, categories = []) {
    const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    
    // Loại bỏ tiền tố nhãn nếu có
    const cleanLine = (line) =>
      line.replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|TITLE|MÔ TẢ NGẮN|MÔ TẢ|DESCRIPTION)\s*[:：\-–]\s*/i, '').trim();

    const title = rawLines[0] ? cleanLine(rawLines[0]).slice(0, 150) : 'Sự kiện mới từ tài liệu';

    // Tìm ngày (dd/mm/yyyy hoặc yyyy-mm-dd)
    let foundDate = null;
    const dateMatch = text.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (dateMatch) {
      const dd = String(dateMatch[1]).padStart(2, '0');
      const mm = String(dateMatch[2]).padStart(2, '0');
      const yyyy = dateMatch[3];
      foundDate = `${yyyy}-${mm}-${dd}`;
    }

    // Tìm giờ (HH:mm)
    let startTime = '09:00';
    let endTime = '17:00';
    const timeMatches = [...text.matchAll(/(\b\d{1,2})[:h](\d{2})\b/gi)];
    if (timeMatches.length >= 1) {
      startTime = `${String(timeMatches[0][1]).padStart(2, '0')}:${timeMatches[0][2]}`;
    }
    if (timeMatches.length >= 2) {
      endTime = `${String(timeMatches[1][1]).padStart(2, '0')}:${timeMatches[1][2]}`;
    }

    // Tìm giá vé
    const ticketTypes = [];
    const priceRegex = /([A-Za-z0-9\sÀ-ỹ]+?)\s*[:\-–]\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:vnđ|vnd|đ|k)/gi;
    let pMatch;
    while ((pMatch = priceRegex.exec(text)) !== null) {
      const rawName = cleanLine(pMatch[1]).trim();
      const rawPrice = pMatch[2].replace(/[\.,]/g, '');
      const priceNum = Number(rawPrice);
      if (rawName.length < 40 && !isNaN(priceNum) && priceNum >= 0) {
        ticketTypes.push({
          name: rawName,
          price: priceNum,
          quantity_total: 100,
          description: '',
        });
      }
    }

    if (ticketTypes.length === 0) {
      ticketTypes.push({
        name: 'Vé Tiêu Chuẩn',
        price: 0,
        quantity_total: 100,
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

    const shortDesc = (cleanLine(rawLines.slice(1, 3).join(' ')).slice(0, 140) || title).slice(0, 150);
    const bodyHtml = rawLines.map((l) => `<p>${cleanLine(l)}</p>`).join('');

    return {
      title,
      category_id: matchedCategory,
      short_description: shortDesc,
      description: bodyHtml,
      additional_terms: '',
      tags: ['Sự kiện', 'EventHub'],
      venue_name: '',
      address_line: '',
      ward: '',
      district: '',
      province: '',
      session: {
        start_date: foundDate,
        start_time: startTime,
        end_time: endTime,
      },
      ticket_types: ticketTypes,
      refund_policy: {
        allow_refunds: false,
        deadline_days: 7,
      },
      missing_fields: ['venue_name', 'address_line'],
    };
  }

  /**
   * Chuẩn hóa và áp dụng quy tắc nghiệp vụ EventHub
   */
  _sanitizeAndValidate(raw, categories = [], warnings = []) {
    const data = { ...raw };

    const cleanPrefix = (str) =>
      String(str || '')
        .replace(/^(TIÊU ĐỀ|TÊN SỰ KIỆN|TITLE|MÔ TẢ NGẮN|MÔ TẢ|DESCRIPTION)\s*[:：\-–]\s*/i, '')
        .trim();

    // 1. Tiêu đề
    data.title = cleanPrefix(data.title).slice(0, 200) || 'Sự kiện mới từ tài liệu';

    // 2. Danh mục
    const validCat = categories.find((c) => c.id === data.category_id);
    if (!validCat && categories.length > 0) {
      data.category_id = categories[0]?.id || '';
      warnings.push('Danh mục chưa xác định rõ trong tài liệu, đã đặt mặc định.');
    }

    // 3. Tóm tắt & Mô tả
    data.short_description = cleanPrefix(data.short_description).slice(0, 150);
    data.description = String(data.description || '').trim() || `<p>${data.short_description}</p>`;
    data.additional_terms = String(data.additional_terms || '').trim();

    // 4. Địa điểm
    data.venue_name = String(data.venue_name || '').trim();
    data.address_line = String(data.address_line || '').trim();
    data.ward = String(data.ward || '').trim();
    data.district = String(data.district || '').trim();
    data.province = String(data.province || '').trim();

    // 5. Phiên sự kiện & Kiểm tra quy tắc 3 tuần
    const minValidDate = this.getSuggestedMinDate();
    let startDate = data.session?.start_date;

    const isValidFormat = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate);
    let isFarEnough = false;

    if (isValidFormat) {
      const parsedDate = new Date(`${startDate}T00:00:00`);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((parsedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= MIN_WEEKS_DAYS) {
        isFarEnough = true;
      }
    }

    if (!isFarEnough) {
      warnings.push(
        `Ngày sự kiện trong tài liệu (${startDate || 'chưa có'}) không đáp ứng quy định tối thiểu 3 tuần trước ngày tổ chức. Hệ thống đã gợi ý ngày hợp lệ là ${minValidDate}.`
      );
      startDate = minValidDate;
    }

    const startTime = data.session?.start_time || '09:00';
    const endTime = data.session?.end_time || '17:00';

    data.sessions = [
      {
        start_date: startDate,
        start_time: startTime,
        end_time: endTime,
      },
    ];

    // 6. Hạng vé (ticket_types)
    const rawTickets = Array.isArray(data.ticket_types) ? data.ticket_types : [];
    const validTickets = [];

    rawTickets.forEach((t, idx) => {
      const name = String(t.name || '').trim() || `Hạng vé ${idx + 1}`;
      const price = Math.max(0, Math.round(Number(t.price) || 0));
      const quantity = Math.max(1, Math.round(Number(t.quantity_total) || 100));
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
        quantity_total: 100,
        description: 'Hạng vé chung tham gia sự kiện',
      });
      warnings.push('Tài liệu chưa có thông tin giá vé. Hệ thống đã khởi tạo 1 hạng vé mặc định.');
    }

    data.ticket_types = validTickets;

    // 7. Chính sách hoàn tiền
    data.refund_policy = {
      allow_refunds: Boolean(data.refund_policy?.allow_refunds),
      deadline_days: Number(data.refund_policy?.deadline_days) || 7,
    };

    return data;
  }
}

module.exports = new AiDocumentParserService();
