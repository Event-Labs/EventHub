const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventCategoriesRepository = require('../admin/eventCategories.repository');
const logger = require('../../core/logger');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

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
   * Kiểm tra xem tài liệu có phải là kế hoạch hoặc thông tin về sự kiện hay không
   * @param {string} text - Nội dung tài liệu
   * @param {string} userNote - Ghi chú thêm từ người dùng
   * @returns {{ isEvent: boolean, reason?: string, score?: number }}
   */
  _validateIsEventDocument(text, userNote = '') {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return {
        isEvent: false,
        reason: 'Nội dung tài liệu trống. Vui lòng tải lên file tài liệu hoặc nhập văn bản kế hoạch sự kiện.',
      };
    }

    const clean = (text + '\n' + (userNote || '')).trim();
    if (clean.length < 15) {
      return {
        isEvent: false,
        reason: 'Nội dung tài liệu quá ngắn để phân tích sự kiện (tối thiểu 15 ký tự). Vui lòng cung cấp thêm thông tin.',
      };
    }

    // -------------------------------------------------------------
    // 1. NHÓM DẤU HIỆU LOẠI TRỪ NGAY (DISQUALIFIERS)
    // Các tài liệu này chắc chắn KHÔNG PHẢI là kế hoạch tổ chức sự kiện.
    // -------------------------------------------------------------

    // A. Đề thi / Câu hỏi trắc nghiệm / Ngân hàng câu hỏi / Bài tập ôn tập
    const multipleChoiceMatches = clean.match(/(?:^|\n)\s*(?:[A-Da-d][\.\)]|\([A-Da-d]\)|Câu\s*\d+[:\.]|Question\s*\d+[:\.])\s+[^\n]+/g) || [];
    const examKeywords = (clean.match(/\b(?:câu\s*\d+|kiểu\s*hỏi(?:\s*khác)?|đáp\s*án(?:\s*đúng|\s*sai|\s*chính\s*xác)?|chọn\s*(?:câu|phương\s*án)\s*trả\s*lời|chọn\s*đáp\s*án|điền\s*từ\s*còn\s*thiếu|trắc\s*nghiệm|đề\s*thi|bộ\s*đề|ngân\s*hàng\s*câu\s*hỏi|bài\s*tập\s*ôn\s*tập|multiple\s*choice|correct\s*answer)\b/gi) || []).length;
    const isExamOrQuiz = multipleChoiceMatches.length >= 3 || examKeywords >= 2 || (multipleChoiceMatches.length >= 2 && examKeywords >= 1);
    if (isExamOrQuiz) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là đề thi / câu hỏi trắc nghiệm / tài liệu học tập, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // B. Đoạn mã lập trình (Source code)
    const codeLines = clean.match(/(?:^|\n)\s*(?:import\s+.*from|export\s+(?:default\s+)?|const\s+[\w\[\]\{\},\s]+\s*=|let\s+[\w\[\]\{\},\s]+\s*=|var\s+[\w\[\]\{\},\s]+\s*=|function\s*\w*\(|class\s+\w+|def\s+\w+\(|public\s+class|#include\s*<|SELECT\s+.*\s+FROM|<!DOCTYPE html|<html)/gi) || [];
    if (codeLines.length >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là đoạn mã nguồn lập trình, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // C. Hóa đơn / Biên lai / Sao kê ngân hàng thuần túy
    const invoiceKeywords = (clean.match(/\b(?:hóa\s*đơn\s*(?:gtgt|giá\s*trị\s*gia\s*tăng|bán\s*lẻ|điện\s*tử)|phiếu\s*thu|biên\s*lai|lệnh\s*chuyển\s*tiền(?:\s*thành\s*công)?|sao\s*kê\s*tài\s*khoản|ủy\s*nhiệm\s*chi|số\s*dư\s*khả\s*dụng|tài\s*khoản\s*trích\s*nợ)\b/gi) || []).length;
    if (invoiceKeywords >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là hóa đơn / chứng từ thanh toán ngân hàng, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // D. Hồ sơ xin việc / CV / Sơ yếu lý lịch
    const cvKeywords = (clean.match(/\b(?:curriculum\s*vitae|sơ\s*yếu\s*lý\s*lịch|đơn\s*xin\s*việc|thông\s*tin\s*ứng\s*viên|kinh\s*nghiệm\s*làm\s*việc|kỹ\s*năng\s*chuyên\s*môn|trình\s*độ\s*học\s*vấn|mục\s*tiêu\s*nghề\s*nghiệp)\b/gi) || []).length;
    if (cvKeywords >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là hồ sơ xin việc / CV cá nhân, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // E. Công thức nấu ăn thuần túy
    const recipeKeywords = (clean.match(/\b(?:công\s*thức\s*(?:nấu|làm|pha)|nguyên\s*liệu\s*(?:chuẩn\s*bị)?|sơ\s*chế\s*nguyên\s*liệu|hướng\s*dẫn\s*nấu|các\s*bước\s*thực\s*hiện\s*món|nêm\s*nếm\s*gia\s*vị)\b/gi) || []).length;
    if (recipeKeywords >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là công thức nấu ăn, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // F. Giáo trình / Đề cương học phần / Luận văn nghiên cứu khoa học
    const academicKeywords = (clean.match(/\b(?:giáo\s*trình\s*môn\s*học|đề\s*cương\s*(?:chi\s*tiết\s*)?học\s*phần|luận\s*văn\s*tốt\s*nghiệp|tóm\s*tắt\s*luận\s*án|nghiên\s*cứu\s*khoa\s*học|tài\s*liệu\s*giảng\s*dạy|mã\s*học\s*phần|số\s*tín\s*chỉ)\b/gi) || []).length;
    if (academicKeywords >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là giáo trình / đề cương môn học / tài liệu nghiên cứu, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // G. Hợp đồng / Văn bản hành chính pháp lý thuần túy
    const contractKeywords = (clean.match(/\b(?:hợp\s*đồng\s*(?:kinh\s*tế|lao\s*động|dịch\s*vụ|mua\s*bán)|bên\s*a\s*:|bên\s*b\s*:|quyền\s*và\s*nghĩa\s*vụ\s*của\s*các\s*bên|điều\s*khoản\s*chấm\s*dứt\s*hợp\s*đồng)\b/gi) || []).length;
    if (contractKeywords >= 2) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp là hợp đồng / văn bản pháp lý, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    // -------------------------------------------------------------
    // 2. PHÂN TÍCH CÁC TRỤ CỘT DỮ LIỆU SỰ KIỆN (EVENT PILLARS)
    // -------------------------------------------------------------

    // 2.1 Từ khóa xác định loại hình sự kiện
    const eventTypesMatch = clean.match(/\b(?:sự\s*kiện|hội\s*(?:nghị|thảo|chợ)|triển\s*lãm|lễ\s*hội|festival|concert|workshop|webinar|gala|diễn\s*đàn|forum|cuộc\s*thi|giải\s*(?:chạy|đấu|bóng|thể\s*thao)|marathon|khóa\s*học|buổi\s*(?:diễn|hòa\s*nhạc|chia\s*sẻ|giao\s*lưu|biểu\s*diễn|đào\s*tạo)|talkshow|expo|summit|conference|seminar|showcase|đại\s*nhạc\s*hội|ngày\s*hội|fan\s*meeting|live\s*music|âm\s*nhạc\s*(?:sống|ngoài\s*trời)|acoustic\s*night|events?|talks?|tech\s*talk|meetups?|hackathon|ceremony|party|launch\s*event|tour|kịch\s*nghệ)\b/gi) || [];

    // 2.2 Từ khóa tổ chức và văn bản sự kiện
    const eventOrgMatch = clean.match(/\b(?:ban\s*tổ\s*chức|kế\s*hoạch\s*tổ\s*chức\s*(?:sự\s*kiện|chương\s*trình)?|đề\s*án\s*tổ\s*chức|event\s*proposal|thư\s*mời\s*tham\s*dự|thông\s*cáo\s*báo\s*chí|kính\s*mời\s*(?:quý\s*khách|các\s*bạn|quý\s*đại\s*biểu|quý\s*vị)|người\s*tham\s*(?:dự|gia)|khách\s*tham\s*(?:dự|quan)|diễn\s*giả|speaker|khách\s*mời|đơn\s*vị\s*tổ\s*chức|nhà\s*tài\s*trợ|event\s*name|event\s*title|organizers?|hosted\s*by)\b/gi) || [];

    // 2.3 Lịch trình & Khung giờ sự kiện
    const scheduleMatch = clean.match(/\b(?:lịch\s*trình|agenda|timeline|thời\s*gian\s*diễn\s*ra|diễn\s*ra\s*vào|đón\s*khách|check[\s\-]in|khai\s*mạc|bế\s*mạc|phiên\s*(?:sáng|chiều|khai\s*mạc|\d)|sân\s*khấu\s*(?:chính|phụ)|hội\s*trường|phòng\s*hội\s*thảo)\b/gi) || [];

    // 2.4 Vé & Đăng ký tham gia
    const ticketMatch = clean.match(/\b(?:giá\s*vé|hạng\s*vé|loại\s*vé|vé\s*(?:vào\s*cửa|tham\s*gia|early\s*bird|standard|vip|tiêu\s*chuẩn|single\s*day|weekend|thường)|ticket|tickets|pass\b|đăng\s*ký\s*tham\s*(?:gia|dự)|mua\s*vé|mở\s*bán\s*vé|phí\s*tham\s*dự|miễn\s*phí\s*vào\s*cửa|giá\s*tầm\s*\d+)\b/gi) || [];

    // 2.5 Có ngày tháng và giờ cụ thể đi kèm địa điểm
    const hasDateTime = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b|\b\d{1,2}[:h]\d{2}\b/i.test(clean);
    const hasVenueSignal = /\b(?:địa\s*điểm|venue|location|trung\s*tâm\s*hội\s*nghị|nhà\s*văn\s*hóa|công\s*viên|khách\s*sạn|sân\s*vận\s*động)\b/i.test(clean);

    let eventScore = 0;
    if (eventTypesMatch.length > 0) eventScore += Math.min(eventTypesMatch.length * 2, 8);
    if (eventOrgMatch.length > 0) eventScore += Math.min(eventOrgMatch.length * 2, 6);
    if (scheduleMatch.length > 0) eventScore += Math.min(scheduleMatch.length * 2, 6);
    if (ticketMatch.length > 0) eventScore += Math.min(ticketMatch.length * 2, 6);
    if (hasDateTime && hasVenueSignal) eventScore += 3;

    const hasEventContext =
      scheduleMatch.length > 0 ||
      ticketMatch.length > 0 ||
      eventOrgMatch.length > 0 ||
      (hasVenueSignal && hasDateTime);

    // Điều kiện chấp nhận: Tài liệu phải có dấu hiệu rõ ràng về kế hoạch/thông tin sự kiện
    if (eventScore < 2 || (eventScore < 4 && !hasEventContext)) {
      return {
        isEvent: false,
        reason: 'Tài liệu được cung cấp không chứa thông tin về sự kiện (thiếu tên sự kiện, thời gian, địa điểm hoặc hoạt động tổ chức). Vui lòng kiểm tra lại và tải lên tài liệu sự kiện hợp lệ.',
      };
    }

    return { isEvent: true, score: eventScore };
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

    // 0. Kiểm tra tài liệu có phải là kế hoạch/thông tin sự kiện hay không
    const validation = this._validateIsEventDocument(text, userNote);
    if (!validation.isEvent) {
      logger.warn(`[AiDocumentParser] Từ chối xử lý tài liệu không phải sự kiện: ${validation.reason}`);
      throw new AppError(validation.reason, 400, ErrorCodes.INVALID_INPUT);
    }

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
0. KIỂM TRA TÍNH HỢP LỆ VỀ SỰ KIỆN: Nếu tài liệu được cung cấp hoàn toàn KHÔNG PHẢI là kế hoạch, thông báo hay thông tin về sự kiện (ví dụ: đề thi trắc nghiệm, bài tập ôn tập, tài liệu học tập thuần túy, đoạn mã code, hóa đơn thu tiền, CV xin việc, công thức nấu ăn...), bạn BẮT BUỘC trả về JSON:
{
  "is_event": false,
  "error_message": "Tài liệu được cung cấp không phải là kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ."
}
1. CHỈ TRÍCH XUẤT THÔNG TIN CÓ THẬT TRONG TÀI LIỆU.
2. TUYỆT ĐỐI KHÔNG tự sáng tác thêm các tiêu đề hoặc quy định cấm đoán generic nếu tài liệu không đề cập.
3. QUY TẮC TRÍCH XUẤT GIỜ GIẤC & LỊCH TRÌNH:
   - Cột hoặc dòng "Check-in" / "Đón khách" BẮT BUỘC map vào "checkin_start_time".
   - Cột hoặc dòng "Bắt đầu" / "Start" BẮT BUỘC map vào "start_time".
   - Cột hoặc dòng "Kết thúc" / "End" BẮT BUỘC map vào "end_time".
   - Giờ check-in LUÔN diễn ra trước hoặc cùng giờ bắt đầu (checkin_start_time <= start_time). TUYỆT ĐỐI KHÔNG ĐẢO NGƯỢC HOẶC GÁN NHẦM GIỜ CHECK-IN VÀO START_TIME.
   - Với các mốc giờ viết bằng chữ tiếng Việt (ví dụ: "8 giờ 30 sáng" -> "08:30", "9 giờ 15" -> "09:15", "17 giờ" -> "17:00", "16 giờ" -> "16:00"): BẮT BUỘC trích xuất chính xác theo định dạng HH:mm.
   - TUYỆT ĐỐI KHÔNG GỘP CÁC PHIÊN CÙNG NGÀY: Nếu tài liệu mô tả sự kiện có nhiều phiên hoặc nhiều buổi trong cùng một ngày (ví dụ: phiên sáng và phiên chiều, ca sáng và ca chiều, hoặc các workshop diễn ra riêng biệt sáng/chiều), BẮT BUỘC trích xuất thành các phần tử riêng biệt trong mảng "sessions". Mỗi phiên phải có tên phiên, giờ check-in, giờ bắt đầu và giờ kết thúc riêng biệt. TUYỆT ĐỐI KHÔNG gộp chung buổi sáng và buổi chiều lại thành 1 phiên duy nhất.
4. ĐẶC BIỆT VỚI TÀI LIỆU DẠNG EMAIL, THƯ TỪ, CHAT, JSON, THÔNG CÁO BÁO CHÍ HOẶC VĂN BẢN TỰ SỰ:
   - "title": Tìm tên sự kiện từ nhãn Event name / Event / Subject, từ cụm "mang tên/tên là/called", hoặc tên trong dấu ngoặc kép. TUYỆT ĐỐI KHÔNG lấy dòng tiêu đề chung (như "Email trao đổi...", "Event Proposal", "FOR IMMEDIATE RELEASE", "FOOD FESTIVAL DATA SHEET", "rough notes").
   - "sessions": Nếu sự kiện diễn ra nhiều ngày (Day 1/2/3, "22–24 January 2028", "ngày DD và DD tháng MM năm YYYY") hoặc nhiều phiên trong cùng một ngày (phiên sáng, phiên chiều), BẮT BUỘC tách từng phiên riêng biệt với ĐÚNG NĂM và ĐÚNG NGÀY trong tài liệu. TUYỆT ĐỐI KHÔNG gộp phiên sáng và phiên chiều cùng ngày thành 1 phiên. Ngày tiếng Anh ("13 March 2027") phải ra YYYY-MM-DD. TUYỆT ĐỐI không lấy mốc "last edited" / "copied from".
   - Giờ có thể viết "09:00–12:00", "Operating hours", "doors at", "xuất phát", "100k" = 100000 VND.
   - Nếu tài liệu là JSON, map title/sessions/tickets/venue từ JSON (check_in_time → checkin_start_time, tickets[].quantity → quantity_total).
   - "ticket_types": Đọc kỹ các câu mô tả vé (pipe "| 150000 VND | quantity 200", "vé 5 km là 100k", "day ticket for 70,000 VND"). CHỈ TRÍCH XUẤT HẠNG VÉ THỰC SỰ ĐƯỢC NÊU. TUYỆT ĐỐI KHÔNG TỰ BỊA "General Admission" HAY "Non-refundable" NẾU TÀI LIỆU KHÔNG NÊU!
   - "venue_name": Tìm địa điểm sau "tại ...", "Venue:", "Location:", "Where:". Nếu tài liệu nói địa điểm chưa chốt / don't use a venue name, để venue_name rỗng nhưng vẫn lấy quận/tỉnh nếu có.
5. CÁC TRƯỜNG DỮ LIỆU CẦN XUẤT:
   - "title": ${detectedSections.title && !this._isGenericDocumentTitle(detectedSections.title) ? `"${detectedSections.title}" (đã xác định chính xác từ tài liệu, TUYỆT ĐỐI không đổi sang tiêu đề chung như EVENT PROPOSAL và TUYỆT ĐỐI không kèm theo hậu tố loại văn bản như "– Thư mời tham dự...").` : 'Tên chính thức của sự kiện (chỉ lấy tên sự kiện, ví dụ "FutureTech Vietnam 2027", không kèm danh mục hay tags, tuyệt đối không lấy tiêu đề chung như EVENT PROPOSAL hay ĐỀ XUẤT SỰ KIỆN, và tuyệt đối không kèm các cụm từ hành chính/tiêu đề thư như "– Thư mời tham dự...", "– Giấy mời...", "– Thông báo...").'}
   - "category_id": ID phù hợp nhất lấy từ danh mục hệ thống ở trên.
   - "short_description": ${hasStructuredShortDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu).' : 'Tóm tắt 1 - 2 câu mở đầu (tối đa 300 ký tự). BẮT BUỘC giữ nguyên ngôn ngữ gốc của tài liệu (nếu tài liệu là tiếng Việt thì BẮT BUỘC viết bằng 100% tiếng Việt, TUYỆT ĐỐI KHÔNG DỊCH HOẶC TỰ BỊA TIẾNG ANH).'}
   - "description": ${hasStructuredDesc ? 'Để chuỗi rỗng "" (hệ thống đã lưu trữ sẵn 100% nguyên văn từ tài liệu để tối ưu tốc độ).' : 'Nội dung chi tiết của sự kiện theo HTML (<p>, <ul>, <li>, <strong>). BẮT BUỘC giữ nguyên ngôn ngữ gốc của tài liệu (nếu tài liệu tiếng Việt thì BẮT BUỘC viết bằng 100% tiếng Việt, TUYỆT ĐỐI KHÔNG TỰ BỊA CÁC BULLET POINTS TIẾNG ANH GENERIC như "Attendees can participate...", "Live performances...", "Exhibitions will showcase..."). BẮT BUỘC TRÍCH XUẤT ĐẦY ĐỦ, TOÀN DIỆN MỌI THÔNG TIN VỀ SỰ KIỆN TỪ TÀI LIỆU: bao gồm đoạn giới thiệu, mục tiêu, đối tượng hướng đến, các chủ đề nổi bật, TẤT CẢ các hoạt động, workshop, tiết mục biểu diễn, khu vực trải nghiệm, và các lưu ý/quy định dành cho người tham dự. TUYỆT ĐỐI KHÔNG RÚT NGẮN, KHÔNG ĐƯỢC BỎ BỚT THÔNG TIN HOẠT ĐỘNG VÀ WORKSHOP CỦA SỰ KIỆN. Trình bày đẹp mắt bằng các thẻ HTML (<p>, <strong>, <ul>, <li>, <em>).'}
   - "venue_name": Tên địa điểm cụ thể (ví dụ: "Trung tâm Hội nghị ABC", "Nhà hát Bến Thành"). NẾU TÀI LIỆU KHÔNG GHI ĐỊA ĐIỂM CỤ THỂ, BẮT BUỘC ĐỂ CHUỖI RỖNG "". TUYỆT ĐỐI KHÔNG tự bịa và TUYỆT ĐỐI KHÔNG lấy tên nhà tổ chức${organizerName ? ` ("${organizerName}")` : ''} để làm địa điểm nếu tài liệu không đề cập.
   - "address_line": Địa chỉ chi tiết nếu có trong tài liệu. Nếu không có để chuỗi rỗng "".
   - "district": Quận/Huyện nếu tài liệu có ghi (ví dụ: "Ngũ Hành Sơn", "Hải Châu", "Liên Chiểu", "Quận 1").
   - "province": Tỉnh/Thành phố nếu tài liệu có ghi (ví dụ: "Thành phố Hồ Chí Minh", "Thành phố Hà Nội", "Thành phố Đà Nẵng").
   - "sessions": Mảng chứa ĐẦY ĐỦ tất cả các phiên diễn ra sự kiện (nếu sự kiện có nhiều ca/buổi/phiên như Sáng, Chiều hoặc nhiều ngày, BẮT BUỘC trích xuất riêng từng phiên vào mảng này, TUYỆT ĐỐI KHÔNG GỘP PHIÊN SÁNG VÀ CHIỀU). Mỗi phiên gồm:
     * "session_name": Tên phiên (ví dụ: lấy tên từ dấu ngoặc kép hoặc tên hoạt động như "AI and the Future of Software Engineering", hoặc "Phiên Sáng: ...", "Phiên Chiều: ...", hoặc "Phiên 1", "Phiên 2").
     * "start_date": Ngày diễn ra theo định dạng YYYY-MM-DD. Lấy chính xác ngày và năm ghi trong tài liệu.
     * "checkin_start_time": Giờ bắt đầu check-in / đón khách theo định dạng HH:mm (lấy chính xác từ cột/câu "Check-in" hoặc "Đón khách", ví dụ: "08:30"). NẾU TÀI LIỆU KHÔNG GHI GIỜ CHECK-IN, BẮT BUỘC ĐỂ "".
     * "start_time": Giờ bắt đầu sự kiện theo định dạng HH:mm (lấy chính xác từ cột/câu "Bắt đầu" hoặc "Start", ví dụ: "09:15"). NẾU TÀI LIỆU KHÔNG GHI GIỜ BẮT ĐẦU, BẮT BUỘC ĐỂ "".
     * "end_time": Giờ kết thúc theo định dạng HH:mm (lấy từ cột/câu "Kết thúc", ví dụ: "17:00"). NẾU TÀI LIỆU KHÔNG GHI GIỜ KẾT THÚC, BẮT BUỘC ĐỂ "".
   - "ticket_types": Mảng chứa ĐẦY ĐỦ TẤT CẢ các hạng vé xuất hiện trong tài liệu (ví dụ: Standard Pass, VIP Pass, Student Pass, vé thường...). Mỗi vé gồm:
     * "name": Tên chính xác của hạng vé (ví dụ: "Standard Pass", "VIP Pass", "Student Pass").
     * "price": Giá vé bằng số nguyên VND (ví dụ: 350000, 750000, 150000).
     * "quantity_total": Số lượng vé được phát hành nếu tài liệu có ghi (ví dụ: "200 vé được phát hành" -> 200, "giới hạn ở 50 vé" -> 50, "số lượng 100 vé" -> 100). NẾU TÀI LIỆU KHÔNG GHI RÕ SỐ LƯỢNG VÉ, BẮT BUỘC ĐỂ null.
     * "description": Mô tả đầy đủ quyền lợi, điều kiện sử dụng của hạng vé đó từ tài liệu (ví dụ: "Loại vé này cho phép người tham dự tham gia các phiên hội nghị theo chương trình, nhận tài liệu sự kiện và kết nối với cộng đồng", hoặc "Có chỗ ngồi ưu tiên và tham gia phiên networking dành riêng cho khách VIP", hoặc "Dành cho sinh viên (Người mua vé sinh viên có thể được yêu cầu xuất trình thẻ sinh viên khi check-in)"). NẾU TÀI LIỆU CÓ MÔ TẢ QUYỀN LỢI VÉ, BẮT BUỘC TRÍCH XUẤT VÀO ĐÂY, không để trống!
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
      if (parsed && (parsed.is_event === false || parsed.is_not_event === true)) {
        const errorMsg = parsed.error_message || 'Tài liệu được cung cấp không phải là kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.';
        throw new AppError(errorMsg, 400, ErrorCodes.INVALID_INPUT);
      }
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
      if (err instanceof AppError) {
        throw err;
      }
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
          if (fbErr instanceof AppError) {
            throw fbErr;
          }
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

    // Loại bỏ tiền tố mẫu tài liệu dạng "TÀI LIỆU 1:", "DOCUMENT 2:", "PHỤ LỤC A:"
    clean = clean.replace(/^(?:tài\s*liệu(?:\s*\d+)?|document(?:\s*\d+)?)\s*[:：\-–—]\s*/i, '').trim();

    // 0. Xử lý trường hợp phân tách bởi gạch nối (–, —, -) hoặc dấu hai chấm kèm từ khóa loại văn bản/thư mời
    const docTypePattern = /(?:thư\s*mời(?:\s*và\s*báo\s*giá)?(?:\s*tham\s*dự|\s*tham\s*gia)?|giấy\s*mời(?:\s*tham\s*dự|\s*tham\s*gia)?|lời\s*mời|thông\s*báo(?:\s*nội\s*bộ)?(?:\s*về\s*(?:sự\s*kiện|việc\s*)?)?|kế\s*hoạch(?:\s*(?:triển\s*khai|tổ\s*chức|thực\s*hiện))?|biên\s*bản(?:\s*họp(?:\s*tổ\s*chức)?)?|phiếu\s*cập\s*nhật(?:\s*chương\s*trình)?|thỏa\s*thuận(?:\s*tổ\s*chức(?:\s*và\s*tài\s*trợ)?)?|đề\s*án|hồ\s*sơ|invitation(?:\s*letter)?|announcement|call\s*for\s*papers?|event\s*proposal)/i;

    const dashParts = clean.split(/\s+[–—\-]\s+/);
    if (dashParts.length === 2) {
      const part1 = dashParts[0].trim();
      const part2 = dashParts[1].trim();
      if (docTypePattern.test(part2) && !docTypePattern.test(part1) && part1.length >= 3) {
        clean = part1;
      } else if (docTypePattern.test(part1) && !docTypePattern.test(part2) && part2.length >= 3) {
        clean = part2;
      }
    }

    if (clean.includes(':') || clean.includes('：')) {
      const colonParts = clean.split(/[:：]/).map((p) => p.trim()).filter(Boolean);
      if (colonParts.length === 2) {
        const [p1, p2] = colonParts;
        if (docTypePattern.test(p2) && !docTypePattern.test(p1) && p1.length >= 3) {
          clean = p1;
        } else if (docTypePattern.test(p1) && !docTypePattern.test(p2) && p2.length >= 3) {
          clean = p2;
        }
      }
    }

    clean = clean.replace(/\s*[\(\[–—\-]\s*(?:thư\s*mời|giấy\s*mời|thông\s*báo|kế\s*hoạch|invitation)[^\)\]\n]*[\)\]]?$/i, '').trim();

    const prefixRegex = /^(?:kế\s*hoạch\s*(?:triển\s*khai|tổ\s*chức|thực\s*hiện)?|thông\s*báo\s*(?:nội\s*bộ\s*(?:về\s*(?:sự\s*kiện)?)?|về\s*(?:việc\s*)?tổ\s*chức)?|biên\s*bản\s*(?:họp\s*(?:tổ\s*chức)?)?|thư\s*mời\s*(?:và\s*báo\s*giá\s*)?(?:tham\s*dự)?|phiếu\s*cập\s*nhật\s*(?:chương\s*trình)?|thỏa\s*thuận\s*(?:tổ\s*chức\s*(?:và\s*tài\s*trợ)?)?|hồ\s*sơ\s*yêu\s*cầu\s*(?:tổ\s*chức(?:\s*triển\s*lãm)?)?|hồ\s*sơ\s*cuộc\s*thi(?:\s*học\s*thuật)?|sổ\s*tay\s*vận\s*hành(?:\s*hội\s*chợ)?|bản\s*phát\s*hành\s*album(?:\s*và\s*lịch\s*biểu\s*diễn)?|đặc\s*tả\s*giải\s*(?:thể\s*thao|chạy)?|nhật\s*ký\s*điều\s*phối(?:\s*và\s*bản\s*ghi\s*cập\s*nhật)?|kịch\s*bản\s*(?:điều\s*phối(?:\s*sân\s*khấu)?)?|bản\s*tin\s*(?:trải\s*nghiệm(?:\s*và\s*lịch\s*trình(?:\s*du\s*lịch)?)?)?|phiếu\s*yêu\s*cầu\s*(?:dịch\s*vụ(?:\s*và\s*đăng\s*ký(?:\s*hội\s*thảo)?)?)?|bản\s*ghi\s*(?:dữ\s*liệu(?:\s*sự\s*kiện)?)?(?:\s*nhập\s*từ\s*nhiều\s*nguồn)?|đề\s*án\s*tổ\s*chức|email\s*trao\s*đổi\s*về|xác\s*nhận\s*thông\s*tin(?:\s*tổ\s*chức)?|thông\s*tin\s*tổ\s*chức|tài\s*liệu(?:\s*\d+)?\s*[:：\-–]?|tài\s*liệu\s*mẫu\s*kiểm\s*thử\s*(?:chức\s*năng\s*)?trích\s*xuất\s*thông\s*tin\s*sự\s*kiện\s*[:：\-–]?|thư\s*mời\s*tham\s*dự|tiêu\s*đề\s*[:：\-–]|tên\s*chương\s*trình\s*[:：\-–]|tên\s*sự\s*kiện\s*[:：\-–]|tên\s*hoạt\s*động\s*[:：\-–]|chương\s*trình|workshop\s*brief|program\s*overview|please\s*hold\s*the\s*date|food\s*festival\s*data\s*sheet|subject\s*[:：\-–—]?\s*(?:please\s*hold\s*the\s*date\s*[—\-–]?\s*)?|name\s*maybe)\s*(?:sự\s*kiện\s*)?[:：\-–—]?\s*/i;
    let stripped = clean;
    while (prefixRegex.test(stripped)) {
      stripped = stripped.replace(prefixRegex, '').trim();
    }

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

    stripped = stripped.replace(/[\.\s]+$/, '').trim();

    if (stripped.length >= 3 && !this._isGenericDocumentTitle(stripped)) {
      return stripped;
    }
    return clean.replace(/[\.\s]+$/, '').trim();
  }

  /**
   * Kiểm tra xem một chuỗi có phải là tiêu đề chung/tên loại văn bản chứ không chứa tên sự kiện cụ thể
   */
  _isGenericDocumentTitle(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.replace(/^[#\*\s\-–—"':]+|[#\*\s\-–—"':]+$/g, '').trim().toLowerCase();
    if (!clean || clean.length < 3) return true;

    const genericExactPatterns = [
      /^(?:event\s*proposal|proposal|kế\s*hoạch\s*(?:triển\s*khai|tổ\s*chức\s*)?sự\s*kiện|đề\s*xuất\s*sự\s*kiện|kịch\s*bản\s*sự\s*kiện|tài\s*liệu\s*(?:mẫu|sự\s*kiện|kiểm\s*thử)|eventhub|event\s*plan|event\s*outline)$/i,
      /^(?:email|thư|thư\s*điện\s*tử|tin\s*nhắn|thông\s*báo|thông\s*điệp|trao\s*đổi|biên\s*bản|dự\s*thảo|kế\s*hoạch|đề\s*án|tờ\s*trình|báo\s*cáo|memo|notes?|minutes)$/i,
      /^(?:email\s*trao\s*đổi\s*về\s*sự\s*kiện|kế\s*hoạch\s*tổ\s*chức\s*sự\s*kiện|đề\s*xuất\s*tổ\s*chức\s*sự\s*kiện)$/i,
      /^(?:thỏa\s*thuận(?:\s*tổ\s*chức(?:\s*và\s*tài\s*trợ)?)?(?:\s*sự\s*kiện)?|biên\s*bản(?:\s*họp(?:\s*tổ\s*chức)?)?(?:\s*sự\s*kiện)?|thông\s*báo(?:\s*nội\s*bộ)?(?:\s*về\s*sự\s*kiện)?|kế\s*hoạch(?:\s*triển\s*khai)?(?:\s*sự\s*kiện)?|phiếu\s*cập\s*nhật(?:\s*chương\s*trình)?)$/i,
      /^(?:hồ\s*sơ(?:\s*yêu\s*cầu(?:\s*tổ\s*chức(?:\s*triển\s*lãm)?)?|\s*mời\s*thầu|\s*dự\s*án|\s*cuộc\s*thi(?:\s*học\s*thuật)?)?)$/i,
      /^(?:sổ\s*tay(?:\s*vận\s*hành(?:\s*hội\s*chợ)?)?)$/i,
      /^(?:bản\s*phát\s*hành(?:\s*album(?:\s*và\s*lịch\s*biểu\s*diễn)?)?)$/i,
      /^(?:đặc\s*tả(?:\s*giải(?:\s*thể\s*thao)?)?)$/i,
      /^(?:nhật\s*ký(?:\s*điều\s*phối(?:\s*và\s*bản\s*ghi\s*cập\s*nhật)?)?)$/i,
      /^(?:kịch\s*bản(?:\s*điều\s*phối(?:\s*sân\s*khấu)?)?|kịch\s*bản\s*biểu\s*diễn)$/i,
      /^(?:bản\s*tin(?:\s*trải\s*nghiệm(?:\s*và\s*lịch\s*trình(?:\s*du\s*lịch)?)?)?)$/i,
      /^(?:phiếu\s*yêu\s*cầu(?:\s*dịch\s*vụ(?:\s*và\s*đăng\s*ký(?:\s*hội\s*thảo)?)?)?)$/i,
      /^(?:bản\s*ghi(?:\s*dữ\s*liệu(?:\s*sự\s*kiện)?)?(?:\s*nhập\s*từ\s*nhiều\s*nguồn)?)$/i,
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

  _parseProgramDaySessions(text) {
    const sessions = [];
    if (!text || typeof text !== 'string') return sessions;

    const dayHeaderRegex = /(?:^|\n)[ \t]*(?:CHƯƠNG\s*TRÌNH|LỊCH\s*TRÌNH|HOẠT\s*ĐỘNG)?\s*NGÀY\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4})/gi;
    const matches = [...text.matchAll(dayHeaderRegex)];
    if (matches.length === 0) return sessions;

    for (let d = 0; d < matches.length; d++) {
      const startIdx = matches[d].index + matches[d][0].length;
      const nextIdx = matches[d + 1] ? matches[d + 1].index : text.length;
      const rawDate = matches[d][1];
      const [dStr, mStr, yStr] = rawDate.split(/[\/\.-]/);
      const isoDate = `${yStr}-${String(mStr).padStart(2, '0')}-${String(dStr).padStart(2, '0')}`;

      const dayText = text.slice(startIdx, nextIdx);
      const timeRegex = /(?:^|\n)[ \t]*Thời\s*gian\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})/gi;
      const timeMatches = [...dayText.matchAll(timeRegex)];

      for (let t = 0; t < timeMatches.length; t++) {
        const tm = timeMatches[t];
        const sStart = tm[1].replace('h', ':');
        const sEnd = tm[2].replace('h', ':');

        const prevEnd = t === 0 ? 0 : timeMatches[t - 1].index + timeMatches[t - 1][0].length;
        const leadingChunk = dayText.slice(prevEnd, tm.index).trim();
        const leadingLines = leadingChunk
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !/^(?:Địa\s*điểm|Nội\s*dung|Thời\s*gian|Khách)/i.test(l));
        const rawTitle = leadingLines[leadingLines.length - 1] || `Phiên ${sessions.length + 1}`;

        const nextTimeIdx = timeMatches[t + 1] ? timeMatches[t + 1].index : dayText.length;
        const sessionBody = dayText.slice(tm.index, nextTimeIdx);
        let checkin = '';
        const ciMatch = sessionBody.match(/(?:check[\s\-]?in|đón\s*khách)[^\d\n\r]{0,30}?(?:từ\s*|lúc\s*)?(\d{1,2}[:h]\d{2})/i);
        if (ciMatch) {
          checkin = ciMatch[1].replace('h', ':');
        }

        sessions.push({
          session_name: rawTitle,
          start_date: isoDate,
          start_time: sStart,
          end_date: isoDate,
          end_time: sEnd,
          checkin_start_time: checkin,
        });
      }
    }

    return sessions;
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

  _parseBulletTicketBlocks(text) {
    const tickets = [];
    if (!text || typeof text !== 'string') return tickets;

    let ticketSection = text;
    const ticketSectionIdx = text.search(/THÔNG\s*TIN\s*VÉ|BẢNG\s*GIÁ\s*VÉ|GIÁ\s*VÉ|DANH\s*MỤC\s*VÉ|VÉ\s*THAM\s*DỰ|TICKETS?|Quy\s*định\s*đăng\s*ký|Hạng\s*mục\s*đăng\s*ký/i);
    if (ticketSectionIdx >= 0) {
      const firstPriceIdx = text.search(/(?:Giá(?:\s*bán|\s*vé)?|Phí(?:\s*tham\s*gia|\s*đăng\s*ký)?)\s*[:：\-–]\s*([0-9\.,]+|miễn\s*phí|free)/i);
      if (firstPriceIdx === -1 || ticketSectionIdx <= firstPriceIdx) {
        ticketSection = text.slice(ticketSectionIdx);
      }
    }

    const blockRegex = /(?:^|\n)[ \t]*(?:#{1,4}\s*)?(?:\*{1,2})?(Gói\s+[A-Za-z0-9]+[^\n\*]*|[A-Za-z0-9À-ỹ\s\-_–—]{2,60}?(?:Pass|Ticket|Seat|Entry|VIP|Admission|Experience|Pro|Standard|Plus|Tier\s*\d+|Thường|Tiêu\s*chuẩn|Sinh\s*viên|Registration|Runner[^\n\*]*|Challenge[^\n\*]*))(?:\*{1,2})?\s*\n\s*[\-•\*]\s*(?:Giá(?:\s*bán|\s*vé)?|Phí(?:\s*tham\s*gia|\s*đăng\s*ký)?)\s*[:：\-–]\s*([0-9\.,]+|miễn\s*phí|free)\s*(?:VND|VNĐ|đồng|đ|k|\/vé|\/đội|\/người)?\b([\s\S]*?)(?=(?:\n[ \t]*(?:#{1,4}\s*)?(?:\*{1,2})?(?:Gói\s+[A-Za-z0-9]+[^\n\*]*|[A-Za-z0-9À-ỹ\s\-_–—]{2,60}?(?:Pass|Ticket|Seat|Entry|VIP|Admission|Experience|Registration|Runner|Challenge))\b(?:\*{1,2})?\s*\n\s*[\-•\*]\s*(?:Giá|Phí))|(?:\n[ \t]*(?:Tổng\s*số\s*vé|Người\s*mua|ĐĂNG\s*KÝ|CHÍNH\s*SÁCH|LƯU\s*Ý|ĐIỀU\s*KHOẢN|ĐIỀU\s*\d+|PHỤ\s*LỤC|##))|$)/gi;

    let m;
    while ((m = blockRegex.exec(ticketSection)) !== null) {
      let name = m[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
      name = name.split('\n').pop().trim();
      name = name.replace(/^(?:THÔNG\s*TIN\s*VÉ|BẢNG\s*GIÁ\s*VÉ|GIÁ\s*VÉ|DANH\s*MỤC\s*VÉ|VÉ\s*THAM\s*DỰ|TICKETS?)\s*/i, '').trim();
      const rawPrice = m[2];
      const priceNum = /miễn\s*phí|free/i.test(rawPrice) ? 0 : Number(rawPrice.replace(/[^\d]/g, ''));
      const body = m[3] || '';

      const qtyMatch = body.match(/[\-•\*]\s*(?:Số\s*lượng(?:\s*phát\s*hành)?|Hạn\s*mức)\s*[:：\-–]\s*([0-9\.,]+)\s*(?:vé|đội|suất|chỗ|người)?/i);
      const qty = qtyMatch ? Number(qtyMatch[1].replace(/[^\d]/g, '')) : null;

      const descLines = [];
      const qlMatch = body.match(/[\-•\*]\s*(?:Quyền\s*lợi|Nội\s*dung)\s*[:：\-–]\s*([^\n]+)/i);
      if (qlMatch) descLines.push(qlMatch[1].trim());

      const dtMatch = body.match(/[\-•\*]\s*Đối\s*tượng\s*[:：\-–]\s*([^\n]+)/i);
      if (dtMatch) descLines.push(`Đối tượng: ${dtMatch[1].trim()}`);

      const dkMatch = body.match(/[\-•\*]\s*Điều\s*kiện\s*[:：\-–]\s*([^\n]+)/i);
      if (dkMatch) descLines.push(`Điều kiện: ${dkMatch[1].trim()}`);

      const fullDesc = descLines.join('. ').replace(/\.\./g, '.').trim();

      tickets.push({
        name,
        price: isNaN(priceNum) ? 0 : priceNum,
        quantity_total: qty,
        description: fullDesc,
      });
    }

    return tickets;
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
      if (/^(admission|draft|status|missing|note|contact|organizer|prices?|ideas?|giá|mức\s*giá)$/i.test(cleanName)) return;
      if (/(?:booth|gian\s*hàng|thuê)/i.test(cleanName)) return;
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

    const lineRe = /(?:^|\n)[ \t]*[•\-\*]?[ \t]*(?:\*{1,2})?([A-Za-z0-9][A-Za-z0-9 \tÀ-ỹ/'&+]{1,50}?)(?:\*{1,2})?[ \t]*[—\-–:]+[ \t]*([0-9][0-9\.,]*)[ \t]*(k\b|vnd|vnđ|đồng)\b([^.\n]*)/gi;
    while ((m = lineRe.exec(text)) !== null) {
      const priceToken = m[3].toLowerCase() === 'k' ? `${m[2]}k` : m[2];
      const tail = m[4] || '';
      const qtyHit = tail.match(/(?:quantity|places?|chỗ|bundles?|vé|suất|hạn\s*mức)[ \t]*([0-9][0-9\.,]*)/i)
        || tail.match(/([0-9][0-9\.,]*)[ \t]*(?:places?|teams?|bundles?|chỗ|vé|suất)/i);
      const desc = qtyHit
        ? tail.replace(/(?:số\s*lượng(?:\s*là)?|proposed\s*quantity|quantity|places?|chỗ|bundles?|vé|suất|hạn\s*mức)[ \t]*[0-9][0-9\.,]*\s*(?:places?|teams?|bundles?|chỗ|vé|suất)?/i, '').replace(/^[—\-–:,;\s]+|[—\-–:,;\s]+$/g, '').trim()
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
    const labeled = text.match(/(?:Venue(?:\s*Name)?|Location|Where|Địa\s*điểm(?:\s*trung\s*tâm|\s*chính)?|Nơi\s*tổ\s*chức)\s*[:：\-–]\s*([^\n\r]+)/i);
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
      if (named && !/gallery|coworking|cultural center|indoor event space|quán cà phê|việt\s*nam|vietnam/i.test(named[1])) {
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
      { key: 'title', singleLine: true, regex: new RegExp(`${pfx}(?:TIÊU\\s*ĐỀ|TÊN\\s*CHƯƠNG\\s*TRÌNH|TÊN\\s*SỰ\\s*KIỆN|TÊN\\s*HOẠT\\s*ĐỘNG|EVENT\\s*NAME|EVENT\\s*TITLE|NAME\\s*OF\\s*EVENT|TITLE|(?<![A-Za-z0-9])EVENT(?!\\s*(?:NAME|TITLE|SCHEDULE|DETAILS?|DESCRIPTION|PROPOSAL|HUB)))[:：\\-–]\\s*([^\\n]+)$`, 'im') },
      { key: 'category', singleLine: true, regex: new RegExp(`${pfx}(?:DANH\\s*MỤC|THỂ\\s*LOẠI|CHỦ\\s*ĐỀ|EVENT\\s*CATEGORY|CATEGORY|GENRE|TOPIC)${sfx}`, 'im') },
      { key: 'tags', singleLine: true, regex: new RegExp(`${pfx}(?:TAGS?|TỪ\\s*KHÓA|TỪ\\s*KHOÁ|NHÃN|KEYWORDS?)${sfx}`, 'im') },
      { key: 'short_description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*NGẮN|TÓM\\s*TẮT|GIỚI\\s*THIỆU\\s*NGẮN|SHORT\\s*DESCRIPTION|BRIEF\\s*DESCRIPTION|SUMMARY|BRIEF)${sfx}`, 'im') },
      { key: 'description', regex: new RegExp(`${pfx}(?:MÔ\\s*TẢ\\s*CHI\\s*TIẾT|DETAILED\\s*DESCRIPTION|DETAIL\\s*DESCRIPTION|FULL\\s*DESCRIPTION|NỘI\\s*DUNG\\s*CHI\\s*TIẾT|NỘI\\s*DUNG\\s*SỰ\\s*KIỆN|EVENT\\s*DESCRIPTION|EVENT\\s*DETAILS?|ABOUT\\s*(?:THE\\s*)?EVENT|GIỚI\\s*THIỆU\\s*SỰ\\s*KIỆN)${sfx}`, 'im') },
      { key: 'schedule_location', regex: new RegExp(`${pfx}(?:EVENT\\s*SCHEDULE|LỊCH\\s*TRÌNH(?:\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM)?|HOẠT\\s*ĐỘNG\\s*TRONG\\s*CHƯƠNG\\s*TRÌNH|CÁC\\s*HOẠT\\s*ĐỘNG(?:\\s*CHÍNH)?|CHƯƠNG\\s*TRÌNH\\s*(?:CHI\\s*TIẾT|DỰ\\s*KIẾN|CHÍNH\\s*THỨC)|THỜI\\s*GIAN\\s*(?:VÀ|&)\\s*ĐỊA\\s*ĐIỂM|SCHEDULE(?:\\s*(?:AND|&)\\s*LOCATION)?|AGENDA|TIME\\s*(?:AND|&)\\s*LOCATION|DATE\\s*(?:AND|&)\\s*TIME)${sfx}`, 'im') },
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

    // 1.1 Tìm tên sự kiện sử dụng trên hệ thống đăng ký (rất phổ biến trong email/brief BTC):
    // "Tên sự kiện sử dụng trên hệ thống đăng ký là Green Future Day 2027."
    const sysTitleMatch = norm.match(/(?:tên\s*sự\s*kiện|tên\s*chương\s*trình)\s*(?:sử\s*dụng\s*trên\s*hệ\s*thống(?:\s*đăng\s*ký)?|chính\s*thức)?\s*(?:là|mang\s*tên)\s*[:：]?\s*[\*"“”]*([^\*"“”\n,\.]{3,100}?)[\*"“”]*(?:[,\.\n]|$)/i);
    let sysTitle = sysTitleMatch ? this._cleanDocumentTitle(sysTitleMatch[1]) : '';

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

    // Nếu có tên sự kiện sử dụng trên hệ thống đăng ký (Ground Truth cao nhất)
    if (sysTitle && !this._isGenericDocumentTitle(sysTitle)) {
      sections.title = sysTitle;
    } else if (!sections.title || this._isGenericDocumentTitle(sections.title)) {
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

    // Match date ranges like: "ngày 15 và 16 tháng 5 năm 2027", "trong hai ngày 04 và 05/12/2027", or "18–19/09/2027"
    const dateRangeMatch = docText.match(/ngày\s+(\d{1,2})\s*(?:và|đến|-|–)\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i)
      || docText.match(/(?:trong\s*(?:hai|2)?\s*ngày\s*)?(\d{1,2})\s*(?:và|đến|-|–)\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i)
      || docText.match(/(\d{1,2})[–\-](\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
    let d1 = '', d2 = '', month = '', year = '';
    if (dateRangeMatch) {
      d1 = dateRangeMatch[1];
      d2 = dateRangeMatch[2];
      month = dateRangeMatch[3];
      year = dateRangeMatch[4];
    }

    // Chia nhỏ văn bản thành các đoạn (paragraphs), hỗ trợ cả tài liệu chỉ có dấu xuống dòng đơn \n
    const rawParas = docText.split(/\n\s*\n/).flatMap((p) => {
      const times = [...p.matchAll(/(?:\d{1,2}[:h]\d{2}|\d{1,2}\s*giờ)/g)];
      if (times.length > 1 && p.includes('\n')) {
        return p.split('\n');
      }
      return [p];
    });
    const paragraphs = rawParas
      .map((p) => p.trim())
      .filter(Boolean);

    // Phân tích từng đoạn có chứa thông tin phiên / lịch trình
    // Hỗ trợ cả trường hợp 1 đoạn chứa cả phiên sáng và phiên chiều
    const candidateBlocks = [];
    let currentParaDate = '';
    const VN_UPPER = '[A-Z0-9ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]';

    for (const para of paragraphs) {
      // Negative constraint: Bỏ qua đề xuất nội bộ chưa duyệt hoặc không đưa vào lịch trình chính thức
      if (/(?:chưa\s*được\s*(?:ban\s*tổ\s*chức\s*)?phê\s*duyệt|không\s*đưa\s*vào\s*lịch\s*trình|đề\s*xuất\s*nội\s*bộ|chưa\s*có\s*địa\s*điểm\s*xác\s*nhận|chưa\s*được\s*phê\s*duyệt)/i.test(para)) {
        continue;
      }
      // Negative constraint: Bỏ qua các câu nhắc nhở quy định / chính sách hoàn tiền
      if (/(?:chính\s*sách\s*hoàn\s*tiền|không\s*ghi\s*nội\s*dung|được\s*hoàn\s*tiền\s*trong\s*vòng|chưa\s*có\s*căn\s*cứ\s*xác\s*nhận)/i.test(para)) {
        continue;
      }
      let paraDate = '';
      const isoMatch = para.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
      if (isoMatch) {
        paraDate = `${isoMatch[3]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[1]).padStart(2, '0')}`;
      } else {
        const shortMatch = para.match(/(?:ngày\s+)?(\d{1,2})\/(\d{1,2})(?!\d)/i);
        if (shortMatch && year) {
          paraDate = `${year}-${String(shortMatch[2]).padStart(2, '0')}-${String(shortMatch[1]).padStart(2, '0')}`;
        }
      }
      if (!paraDate && d1 && d2 && month && year) {
        if (/(?:ngày\s*(?:đầu\s*tiên|1)|ngày\s*thứ\s*nhất)/i.test(para.slice(0, 50))) {
          paraDate = `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
        } else if (/(?:(?:sang\s*)?ngày\s*(?:thứ\s*hai|2)|chủ\s*nhật)/i.test(para.slice(0, 50))) {
          paraDate = `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
        }
      }
      if (!paraDate && currentParaDate) {
        paraDate = currentParaDate;
      }
      if (paraDate) currentParaDate = paraDate;

      const hasTime = /(?:\d{1,2}[:h]\d{2}|\d{1,2}\s*giờ(?:\s*\d{2})?)/i.test(para);
      const hasSchedSignal = /(?:tham\s*gia|[“"«]|check[\s\-]?in|bắt\s*đầu|kết\s*thúc|khai\s*mạc|diễn\s*thuyết|hội\s*thảo|phiên|buổi\s*(?:sáng|chiều|tối)|ca\s*(?:sáng|chiều|tối)|diễn\s*ra|chương\s*trình|hoạt\s*động|lịch\s*trình|tổ\s*chức|mở\s*cửa|tổng\s*kết|bế\s*mạc)/i.test(para);

      if (hasTime && hasSchedSignal) {
        // Tách nếu trong cùng đoạn có cả phiên sáng và phiên chiều/tối hoặc nhiều phiên
        const morningAfternoonSplit = /(?<=[.!?\n;])\s*(?=(?:Tiếp\s*theo|Sau\s*đó|Sau\s*(?:phần|lễ)\s*khai\s*mạc|Chương\s*trình\s+(?!buổi|kết\s*thúc|diễn\s*ra)|Hoạt\s*động\s+(?!buổi|kết\s*thúc|diễn\s*ra)|Diễn\s*đàn\s+(?!buổi|kết\s*thúc|diễn\s*ra)|Phiên\b|Từ\s*\d{1,2}[:h]\d{2}|Lúc\s*\d{1,2}[:h]\d{2}|Vào\s*lúc\s*\d{1,2}[:h]\d{2}|Cũng\s*trong\s*ngày|Buổi\s*(?:sáng|chiều|tối)|Phiên\s*(?:sáng|chiều|tối)|Chiều\s*cùng\s*ngày|Vào\s*buổi\s*(?:sáng|chiều|tối)|Sáng\s*cùng\s*ngày|(?:Một|Các)?\s*phiên|Đến\s*(?:buổi\s*)?chiều|Sang\s*(?:buổi\s*)?chiều|(?:Vào\s*)?(?:buổi\s*)?chiều\b|Sau\s*giờ\s*nghỉ\s*trưa|Vào\s*đầu\s*giờ\s*chiều))/i;
        const subParts = para.split(morningAfternoonSplit).map((s) => s.trim()).filter(Boolean);
        for (const sp of subParts) {
          if (/(?:\d{1,2}[:h]\d{2}|\d{1,2}\s*giờ(?:\s*\d{2})?)/i.test(sp)) {
            candidateBlocks.push({ text: sp, inheritedDate: currentParaDate });
          }
        }
      }
    }

    let initialDate = '';
    if (d1 && month && year) {
      initialDate = `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    } else {
      const numRe = /(?:ngày\s+)?(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/gi;
      let nm;
      while ((nm = numRe.exec(docText)) !== null) {
        if (this._isSkippedDateContext(docText, nm.index)) continue;
        initialDate = this._toIsoDate(nm[3], nm[2], nm[1]);
        if (initialDate) break;
      }
      if (!initialDate) {
        const vnDate = docText.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
        if (vnDate && !this._isSkippedDateContext(docText, vnDate.index)) {
          initialDate = this._toIsoDate(vnDate[3], vnDate[2], vnDate[1]);
        }
      }
      if (!initialDate) {
        const enDateHit = docText.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`, 'i'));
        if (enDateHit && !this._isSkippedDateContext(docText, enDateHit.index)) {
          initialDate = this._toIsoDate(enDateHit[3], EN_MONTHS[enDateHit[2].toLowerCase()], enDateHit[1]);
        }
      }
    }
    let lastKnownDate = initialDate;
    let pendingCheckin = '';
    let pendingCheckinDate = '';
    let pendingSessionName = '';

    for (let idx = 0; idx < candidateBlocks.length; idx++) {
      const item = candidateBlocks[idx];
      const block = item.text;

      // 1. Xác định ngày của phiên
      let sDate = '';

      // a) Ngày cụ thể dạng DD/MM/YYYY hoặc YYYY-MM-DD
      const isoDateMatch = block.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
      if (isoDateMatch) {
        sDate = `${isoDateMatch[3]}-${String(isoDateMatch[2]).padStart(2, '0')}-${String(isoDateMatch[1]).padStart(2, '0')}`;
      } else {
        const shortDateMatch = block.match(/(?:ngày\s+)?(\d{1,2})\/(\d{1,2})(?!\d)/i);
        if (shortDateMatch && year) {
          sDate = `${year}-${String(shortDateMatch[2]).padStart(2, '0')}-${String(shortDateMatch[1]).padStart(2, '0')}`;
        }
      }

      if (!sDate && item.inheritedDate) {
        sDate = item.inheritedDate;
      }

      // b) Ngày tiếng Việt: "ngày 15 tháng 5" hoặc "15 tháng 5"
      if (!sDate) {
        const vnDateMatch = block.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i);
        if (vnDateMatch) {
          const y = vnDateMatch[3] || year || (lastKnownDate ? lastKnownDate.split('-')[0] : '');
          if (y) {
            sDate = `${y}-${String(vnDateMatch[2]).padStart(2, '0')}-${String(vnDateMatch[1]).padStart(2, '0')}`;
          }
        }
      }

      // c) Ngày tiếng Anh: "9 April 2027"
      if (!sDate) {
        const enDateHit = block.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH_ALT})\\s+(\\d{4})`, 'i'));
        if (enDateHit) {
          sDate = this._toIsoDate(enDateHit[3], EN_MONTHS[enDateHit[2].toLowerCase()], enDateHit[1]);
        }
      }

      // d) Ngày thứ nhất / Ngày đầu tiên / Sang ngày thứ hai
      if (!sDate && d1 && d2 && month && year) {
        if (/(?:ngày\s*(?:đầu\s*tiên|1)|ngày\s*thứ\s*nhất)/i.test(block)) {
          sDate = `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
        } else if (/(?:(?:sang\s*)?ngày\s*(?:thứ\s*hai|2))/i.test(block)) {
          sDate = `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
        }
      }

      // e) Kế thừa ngày từ ngữ cảnh ("cũng trong ngày", "buổi chiều cùng ngày", "chiều nay"...)
      if (!sDate && lastKnownDate && /(?:cũng\s*trong\s*ngày|cùng\s*ngày|chiều\s*nay|buổi\s*chiều|buổi\s*tối)/i.test(block)) {
        sDate = lastKnownDate;
      }

      if (sDate) {
        lastKnownDate = sDate;
      } else if (lastKnownDate) {
        sDate = lastKnownDate;
      }

      // 2. Xác định giờ checkin, start, end
      let checkin = '';
      let start = '';
      let end = '';

      // Checkin:
      const cleanBlock = block.replace(/\[\d{1,2}:\d{2}\]/g, '');
      const ciMatchPost = cleanBlock.match(/(?:đón\s*khách|check[\s\-]?in|mở\s*(?:cửa|cổng)(?:\s*đón\s*khách)?|cổng(?:\s*[A-Za-z0-9\sÀ-ỹ]+?)?\s*(?:dự\s*kiến\s*)?mở|đón\s*tiếp|khách\s*bắt\s*đầu\s*vào|có\s*mặt|tập\s*trung(?!\s*vào)|ổn\s*định\s*chỗ\s*ngồi)[^\d\n\r.;!?]{0,35}?(?:từ\s*|lúc\s*|khoảng\s*)?(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?/i);
      const ciMatchPre = cleanBlock.match(/(?:từ\s*)?(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?[^\n\r.;!?]{0,45}?(?:khách\s*(?:mời|tham\s*dự)?\s*có\s*thể\s*check[\s\-]?in|check[\s\-]?in|đón\s*khách|có\s*mặt|tập\s*trung(?!\s*vào))/i);

      if (ciMatchPost) {
        checkin = this._parseTimeStr(ciMatchPost[1], ciMatchPost[2]);
      } else if (ciMatchPre) {
        checkin = this._parseTimeStr(ciMatchPre[1], ciMatchPre[2]);
      }

      // Start:
      const stMatch = block.match(/(?:hoạt\s*động(?:\s*chính)?\s*bắt\s*đầu|phiên\s*(?:diễn\s*thuyết|chuyên\s*đề)?\s*bắt\s*đầu|diễn\s*thuyết\s*bắt\s*đầu|bắt\s*đầu|khai\s*mạc|khởi\s*động|triển\s*lãm[^\d\n\r]{0,40}?mở\s*cửa|khu\s*(?:vực\s*)?triển\s*lãm[^\d\n\r]{0,40}?mở\s*cửa)(?:\s*sẽ)?(?:\s*lúc|\s*từ|\s*vào)?\s*(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|am|pm)?/i);
      if (stMatch) {
        start = this._parseTimeStr(stMatch[1], stMatch[2]);
      }

      // End:
      const endMatches = [...block.matchAll(/(?:kết\s*thúc|đến|đóng\s*cửa|khép\s*lại)(?:[^\d\n\r]*?)\s*(\d{1,2}(?:[:h]\d{2}|\s*giờ(?:\s*\d{2})?))\s*(sáng|chiều|tối|trưa|am|pm)?/gi)];
      if (endMatches.length > 0) {
        const lastEnd = endMatches[endMatches.length - 1];
        end = this._parseTimeStr(lastEnd[1], lastEnd[2]);
      }

      // Nếu start hoặc end chưa có nhưng có dải giờ dạng "13:30 - 16:30"
      if (!start || !end) {
        const rangeMatch = block.match(/(\d{1,2}[:h]\d{2})\s*(?:đến|-|–)\s*(\d{1,2}[:h]\d{2})/);
        if (rangeMatch) {
          if (!start) start = this._parseTimeStr(rangeMatch[1]);
          if (!end) end = this._parseTimeStr(rangeMatch[2]);
        }
      }

      // Negative constraint: nếu giờ kết thúc chưa chốt / chưa xác nhận thì để trống end
      if (/(?:chưa\s*nên\s*đưa\s*\d{1,2}[:h]\d{2}\s*thành\s*giờ\s*kết\s*thúc|giờ\s*kết\s*thúc\s*(?:vẫn\s*)?cần\s*(?:được\s*)?xác\s*nhận|chưa\s*xác\s*nhận\s*giờ\s*kết\s*thúc|chưa\s*chốt\s*giờ\s*kết\s*thúc)/i.test(block)) {
        end = '';
      }

      // Tự động suy luận PM cho buổi chiều nếu giờ bắt đầu/kết thúc < 12
      const isMorningBlock = /buổi\s*sáng|phiên\s*sáng|sáng\s*thứ|sáng\s*ngày/i.test(block);
      const isAfternoonBlock = /buổi\s*chiều|phiên\s*chiều|chiều\s*cùng\s*ngày|chiều\s*thứ/i.test(block);
      if (isAfternoonBlock && !isMorningBlock) {
        if (start) {
          let [sh, sm] = start.split(':').map(Number);
          if (sh < 12 && sh >= 1) start = `${String(sh + 12).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
        }
        if (end) {
          let [eh, em] = end.split(':').map(Number);
          if (eh < 12 && eh >= 1) end = `${String(eh + 12).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        }
        if (checkin) {
          let [ch, cm] = checkin.split(':').map(Number);
          if (ch < 12 && ch >= 1) checkin = `${String(ch + 12).padStart(2, '0')}:${String(cm).padStart(2, '0')}`;
        }
      }

      // 3. Xác định tên phiên
      let sessionName = '';
      const quotedMatch = block.match(/(?:phiên|hội\s*thảo|workshop|chương\s*trình|hoạt\s*động|diễn\s*thuyết)(?:[^\n“"”’]{0,40}?)(?:mang\s*tên|tên\s*là|called|named)?\s*[“"«]([^”"»\r\n]{3,80})[”"»]/i)
        || block.match(/[“"«]([^”"»\r\n]{5,80})[”"»]/);

      if (quotedMatch) {
        sessionName = quotedMatch[1].trim();
      } else {
        const mSubj = block.match(new RegExp(`(?:(?:Một|Các)?\\s*phiên(?:\\s*khai\\s*mạc|\\s*thảo\\s*luận)?|chương\\s*trình(?:\\s*mở\\s*màn)?(?:\\s*mang\\s*tên)?|hoạt\\s*động(?:\\s*khai\\s*mạc)?|diễn\\s*đàn|workshop|buổi\\s*tổng\\s*kết|khu\\s*vực\\s*triển\\s*lãm)\\s+(${VN_UPPER}[A-Za-z0-9\\sÀ-ỹ\\-_&]{2,60}?)(?=[,\\.\\n\\r]|$|\\s+(?:sẽ\\b|diễn\\s*ra|bắt\\s*đầu|kết\\s*thúc|tiếp\\s*nối|được\\s*tổ\\s*chức|mở\\s*cửa|tập\\s*trung|dự\\s*kiến|tại|ở|lúc|vào|từ\\s+\\d))`, 'i'));
        const mIntro = block.match(new RegExp(`(?:trong\\s+chương\\s*trình|chuyển\\s*sang\\s*chương\\s*trình|lễ\\s*hội\\s*kết\\s*thúc\\s*bằng\\s*hoạt\\s*động|sân\\s*khấu(?:\\s*chính)?\\s*sẽ\\s*tổ\\s*chức|tham\\s*dự)\\s+(${VN_UPPER}[A-Za-z0-9\\sÀ-ỹ\\-_&]{2,60}?)(?=[,\\.\\n\\r]|$|\\s+(?:sẽ|diễn\\s*ra|bắt\\s*đầu|lúc|tại|với))`, 'i'));
        const proseName = block.match(/(?:Một|Các)?\s*phiên\s+([^\n,;\.]{5,80}?)(?=\s+(?:sẽ\s*diễn\s*ra|diễn\s*ra|bắt\s*đầu|tại|ở|lúc|vào|được\s*tổ\s*chức))/i);

        if (mSubj) {
          sessionName = mSubj[1].trim();
        } else if (mIntro) {
          sessionName = mIntro[1].trim();
        } else if (proseName) {
          let pName = proseName[1].trim();
          sessionName = pName.charAt(0).toUpperCase() + pName.slice(1);
        }
      }

      if (sessionName) {
        while (sessionName && /(?:\s+(?:dự\s*kiến|sẽ)$|^(?:buổi\s*tổng\s*kết|lễ\s*tổng\s*kết|khu\s*vực\s*triển\s*lãm)\s+)/i.test(sessionName)) {
          sessionName = sessionName.replace(/\s+(?:dự\s*kiến|sẽ)$/i, '').trim();
          sessionName = sessionName.replace(/^(?:buổi\s*tổng\s*kết|lễ\s*tổng\s*kết|khu\s*vực\s*triển\s*lãm)\s+/i, '').trim();
        }
        if (/^(?:bắt\s*đầu|kết\s*thúc|diễn\s*ra|mở\s*cửa|đón\s*khách|chính|chính\s*thức)$/i.test(sessionName)) {
          sessionName = '';
        } else {
          sessionName = sessionName.charAt(0).toUpperCase() + sessionName.slice(1);
        }
      }

      // Nếu block này CHỈ có checkin mà không có start, end
      if (checkin && !start && !end) {
        pendingCheckin = checkin;
        pendingCheckinDate = sDate;
        if (sessionName) pendingSessionName = sessionName;
        continue;
      }
      if (!checkin && pendingCheckin) {
        if (!sDate || sDate === pendingCheckinDate) {
          checkin = pendingCheckin;
          if (!sDate) sDate = pendingCheckinDate;
          if (!sessionName && pendingSessionName) sessionName = pendingSessionName;
        }
        pendingCheckin = '';
        pendingCheckinDate = '';
        pendingSessionName = '';
      }

      if (!sessionName) {
        if (pendingSessionName) {
          sessionName = pendingSessionName;
          pendingSessionName = '';
        } else {
          const isMorning = /buổi\s*sáng|phiên\s*sáng|sáng/i.test(block);
          const isAfternoon = /buổi\s*chiều|phiên\s*chiều|chiều/i.test(block);
          const isEvening = /buổi\s*tối|phiên\s*tối|tối/i.test(block);

          if (isMorning) sessionName = `Phiên sáng`;
          else if (isAfternoon) sessionName = `Phiên chiều`;
          else if (isEvening) sessionName = `Phiên tối`;
          else sessionName = `Phiên ${idx + 1}`;
        }
      }

      if (start && end) {
        sessions.push({
          session_name: sessionName,
          start_date: sDate,
          start_time: start,
          end_date: sDate,
          end_time: end,
          checkin_start_time: checkin,
        });
      } else if (start && sessionName && !/^(?:phiên\s*(?:sáng|chiều|tối|\d+)|buổi\s*(?:sáng|chiều|tối))$/i.test(sessionName) && /(?:chưa\s*nên\s*đưa\s*\d{1,2}[:h]\d{2}\s*thành\s*giờ\s*kết\s*thúc|giờ\s*kết\s*thúc\s*(?:vẫn\s*)?cần\s*(?:được\s*)?xác\s*nhận|chưa\s*xác\s*nhận\s*giờ\s*kết\s*thúc|chưa\s*chốt\s*giờ\s*kết\s*thúc)/i.test(block)) {
        sessions.push({
          session_name: sessionName,
          start_date: sDate,
          start_time: start,
          end_date: sDate,
          end_time: '',
          checkin_start_time: checkin,
        });
      }
    }

    // Fallback nếu không bóc tách được candidateBlocks
    if (sessions.length === 0 && d1 && d2 && month && year) {
      const s1Date = `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
      const s2Date = `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
      sessions.push({
        session_name: 'Phiên 1 (Ngày 1)',
        start_date: s1Date,
        start_time: '',
        end_date: s1Date,
        end_time: '',
        checkin_start_time: '',
      });
      sessions.push({
        session_name: 'Phiên 2 (Ngày 2)',
        start_date: s2Date,
        start_time: '',
        end_date: s2Date,
        end_time: '',
        checkin_start_time: '',
      });
    }

    return sessions;
  }

  /**
   * Phân tích chuỗi địa chỉ tiếng Việt đa thành phần thành venue_name, address_line, district, province
   * @param {string} locStr
   * @returns {object} { venue_name, address_line, district, province }
   */
  _parseVietnameseAddress(locStr) {
    let venue_name = '';
    let address_line = '';
    let district = '';
    let province = '';

    if (!locStr) return { venue_name, address_line, district, province };

    const parts = locStr
      .split(/[,;]\s*/)
      .map((p) => p.replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:\.]+$|\.$/g, '').trim())
      .filter((p) => p.length > 0 && !/^(?:trong\s*(?:hai|vòng|\d+)\s*ngày|vào\s*ngày)/i.test(p));

    if (parts.length === 0) return { venue_name, address_line, district, province };

    // 1. Kiểm tra tỉnh/thành phố từ phần tử cuối
    const lastPart = parts[parts.length - 1];
    const provRe = /(?:thành\s*phố|tp\.?|tỉnh)?\s*(hồ\s*chí\s*minh|hà\s*nội|đà\s*nẵng|cần\s*thơ|hải\s*phòng|thừa\s*thiên\s*huế|huế|bình\s*dương|đồng\s*nai|bà\s*rịa\s*[-–]?\s*vũng\s*tàu|khánh\s*hòa|lâm\s*đồng)/i;
    if (provRe.test(lastPart)) {
      province = lastPart;
      parts.pop();
    }

    // 2. Kiểm tra quận/huyện từ phần tử kế cuối
    if (parts.length > 1) {
      const candidateDist = parts[parts.length - 1];
      const distRe = /^(?:quận|huyện|thị\s*xã|thành\s*phố|tp\.?)\s+([A-Za-z0-9À-ỹ\s]+)$/i;
      const knownDists = /^(?:phú\s*nhuận|bình\s*thạnh|hải\s*châu|ngũ\s*hành\s*sơn|sơn\s*trà|thanh\s*khê|liên\s*chiểu|cẩm\s*lệ|hòa\s*vang|gò\s*vấp|tân\s*bình|tân\s*phú|bình\s*tân|thủ\s*đức|quận\s*\d+)$/i;
      const mDist = candidateDist.match(distRe);
      if (mDist) {
        district = mDist[1].trim();
        parts.pop();
      } else if (knownDists.test(candidateDist)) {
        district = candidateDist.trim();
        parts.pop();
      }
    }

    // 3. Phần tử đầu tiên là tên địa điểm (venue_name) hoặc số phòng
    if (parts.length > 1 && /^(?:room|phòng|tầng|floor)\b/i.test(parts[0])) {
      venue_name = parts[1];
      address_line = parts[0] + (parts.length > 2 ? ', ' + parts.slice(2).join(', ') : '');
    } else {
      venue_name = parts[0] || '';
      // Các phần tử còn lại ở giữa là địa chỉ chi tiết (số nhà, đường, phường/xã)
      if (parts.length > 1) {
        address_line = parts.slice(1).join(', ').trim();
      }
    }

    if (province) {
      if (/hồ\s*chí\s*minh|ho\s*chi\s*minh|tphcm|tp\.hcm/i.test(province)) province = 'Thành phố Hồ Chí Minh';
      else if (/hà\s*nội|ha\s*noi/i.test(province)) province = 'Thành phố Hà Nội';
      else if (/đà\s*nẵng|da\s*nang/i.test(province)) province = 'Thành phố Đà Nẵng';
      else if (/cần\s*thơ|can\s*tho/i.test(province)) province = 'Thành phố Cần Thơ';
      else if (/hải\s*phòng|hai\s*phong/i.test(province)) province = 'Thành phố Hải Phòng';
      else if (/huế/i.test(province)) province = 'Thừa Thiên Huế';
    }

    return { venue_name, address_line, district, province };
  }

  _parseProseLocation(docText) {
    if (!docText || typeof docText !== 'string') return { venue_name: '', address_line: '', district: '', province: '' };
    let venue_name = '';
    let address_line = '';
    let district = '';
    let province = '';

    let locStr = '';
    const isSubVenueOrRoom = (name) => {
      if (!name || typeof name !== 'string') return false;
      const n = name.trim();
      return /^(?:lecture\s*hall|main\s*auditorium|auditorium|foyer(?:\s*gallery)?|design\s*stage|workshop\s*corner|hall|room|phòng|tầng|floor|stage|lab|sảnh|studio|zone|lounge|khu\s*vực|khu\s*sinh\s*hoạt|area|networking|conference|innovation|tent|route|plaza|điểm\s*tập\s*kết|tập\s*kết)\b/i.test(n)
        || /\b(?:stage|hall|room|phòng|lab|studio|zone|lounge|gallery|auditorium)\s*[A-Za-z0-9]*$/i.test(n);
    };

    const mExplicit = docText.match(/(?:Địa\s*điểm\s*tổ\s*chức|Nơi\s*tổ\s*chức)\s*(?:là|tại|:)\s*([^\.\n\r]+?)(?=(?:\.|\r?\n|,\s*vào\s*ngày|,\s*trong\s*(?:hai|vòng|\d+)\s*ngày| Ngày| Buổi|$))/i);
    const mAction = docText.match(/(?:diễn\s*ra|trở\s*lại|tổ\s*chức)[^\.\n\r]*?\btại\s+([^\.\n\r]+?)(?=(?:\.|\r?\n|,\s*vào\s*ngày|,\s*trong\s*(?:hai|vòng|\d+)\s*ngày| Ngày| Buổi|$))/i);
    const mField = docText.match(/(?:Địa\s*điểm)\s*(?:là|tại|:)\s*([^\.\n\r]+?)(?=(?:\.|\r?\n|,\s*vào\s*ngày|,\s*trong\s*(?:hai|vòng|\d+)\s*ngày| Ngày| Buổi|$))/i);
    const mGeneral = docText.match(/\btại\s+([^\.\n\r]+?)(?=(?:\.|\r?\n|,\s*vào\s*ngày|,\s*trong\s*(?:hai|vòng|\d+)\s*ngày| Ngày| Buổi|$))/i);

    if (mExplicit && !isSubVenueOrRoom(mExplicit[1])) {
      locStr = mExplicit[1];
    } else if (mAction && !isSubVenueOrRoom(mAction[1])) {
      locStr = mAction[1];
    } else if (mField && !isSubVenueOrRoom(mField[1])) {
      locStr = mField[1];
    } else if (mGeneral && !isSubVenueOrRoom(mGeneral[1])) {
      locStr = mGeneral[1];
    }

    if (locStr) {
      const parsedLoc = this._parseVietnameseAddress(locStr);
      venue_name = /^(?:điểm\s*tập\s*kết|tập\s*kết)\b/i.test(parsedLoc.venue_name) ? '' : parsedLoc.venue_name;
      address_line = parsedLoc.address_line;
      district = parsedLoc.district;
      province = parsedLoc.province;
    } else {
      const vAlt = docText.match(/([A-Za-z0-9\sÀ-ỹ\-]{3,50}?)\s+(?:đã\s*được\s*đề\s*xuất\s*làm\s*nơi\s*tổ\s*chức|được\s*chọn\s*làm\s*địa\s*điểm)/i);
      if (vAlt && !/^(?:điểm\s*tập\s*kết|tập\s*kết)\b/i.test(vAlt[1].trim())) venue_name = vAlt[1].trim();
    }

    return { venue_name, address_line, district, province };
  }

  _parseProseTickets(docText) {
    if (!docText || typeof docText !== 'string') return [];
    const tickets = [];

    const rawSentences = docText
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const parsePrice = (str) => {
      const pMatch = str.match(/(?:có\s*giá|mức\s*giá|với\s*(?:mức\s*)?giá|giá|trị\s*giá|chỉ|đồng\s*giá|là|for|at|:)?\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:đồng|vnd|vnđ|đ|k)\b/i);
      if (!pMatch) return null;
      let numStr = pMatch[1].replace(/[\.,]/g, '');
      let num = Number(numStr);
      if (pMatch[0].toLowerCase().endsWith('k')) num *= 1000;
      return num > 0 ? num : null;
    };

    const parseQuantity = (str) => {
      const qMatch = str.match(/(?:^|[^\d])(\d{1,3}(?:[\.,]\d{3})*|\d{1,6})\s*(?:vé|places?|seats?|slots?|suất|chỗ)(?:[^\wÀ-ỹ]|$)/iu)
        || str.match(/(?:số\s*lượng(?:\s*vé)?|hạn\s*mức(?:\s*vé)?|phát\s*hành(?:\s*tối\s*đa)?|quantity|places?|seats?)[^\d\n\r]{0,30}?(\d{1,3}(?:[\.,]\d{3})*|\d{1,6})(?:[^\wÀ-ỹ]|$)/iu);
      if (!qMatch) return null;
      const num = Number(qMatch[1].replace(/[\.,]/g, ''));
      return !isNaN(num) && num > 0 ? num : null;
    };

    const cleanStopwords = (n) => {
      let res = n.trim();
      const stopRe = /(?:\s+(?:được\s*(?:mở\s*)?bán|mở\s*bán|dự\s*kiến|áp\s*dụng|phát\s*hành|cung\s*cấp(?:\s*với\s*giá\s*ưu\s*đãi)?|với\s*(?:mức\s*)?giá|với|có|là|cho|tại|giá|sẽ|được|mức|mức\s*giá|ưu\s*đãi))+$/i;
      while (stopRe.test(res)) {
        res = res.replace(stopRe, '').trim();
      }
      return res;
    };

    const findTicketName = (str) => {
      // a) Vé / Hạng vé / Gói vé ...
      const vMatch = str.match(/(?:vé|hạng\s*vé|gói\s*vé)\s+([A-Za-z0-9\sÀ-ỹ\-_]{2,30}?)(?=\s+(?:có\s*giá|với\s*giá|giá|với|dành|cho|được|chỉ|là|sẽ|[:：\.,]|$))/i);
      if (vMatch) {
        let name = vMatch[1].trim().replace(/^(?:này|đó)\s*/i, '');
        name = cleanStopwords(name);
        if (name.length >= 2 && !/^(?:này|đó|điện\s*tử|chính|phụ)$/i.test(name)) return name;
      }
      // b) [Multi-word Name] Pass / Ticket / Seat / Entry / Bundle
      const pMatch = str.match(/\b([A-Za-z0-9À-ỹ\-_]+(?:\s+[A-Za-z0-9À-ỹ\-_]+){0,2}\s+(?:Pass|Ticket|Seat|Entry|Bundle))\b/i);
      if (pMatch) {
        let name = pMatch[1].trim().replace(/^(?:lựa\s*chọn|chọn|đăng\s*ký|mua|sở\s*hữu|loại|hạng|gói|cung\s*cấp)\s+/i, '');
        name = cleanStopwords(name);
        return name;
      }
      // c) Các tên vé phổ biến
      const knownMatch = str.match(/\b(VIP\s*Pass|Standard\s*Pass|Student\s*Pass|VIP|Standard|Student|Early\s*Bird|Vé\s*Thường|Vé\s*VIP|Vé\s*Tiêu\s*Chuẩn|Vé\s*Sinh\s*Viên)\b/i);
      if (knownMatch) return knownMatch[1].trim();

      return null;
    };

    const isQtyNoise = (txt) => /(?:số\s*lượng\s*)?dành\s*cho\s*hạng\s*vé\s*này\s*là\s*\d+|chỉ\s*có\s*\d+\s*vé|giới\s*hạn\s*(?:ở\s*)?\d+\s*vé/i.test(txt);

    const cleanDesc = (d) => {
      let res = d.replace(/^[\s,;:–—\.-]+|[\s,;:–—\.-]+$/g, '').trim();
      res = res.replace(/^(?:chỉ\s*có\s*\d+\s*vé\s*(?:và\s*)?|giới\s*hạn\s*(?:ở\s*)?\d+\s*vé\s*(?:và\s*)?)/i, '');
      res = res.replace(/^(?:với\s*|và\s*)/i, '');
      res = res.trim();
      if (res.length > 0) res = res.charAt(0).toUpperCase() + res.slice(1);
      return res;
    };

    const extractDescription = (s, nextS = '', ticketName = '') => {
      // 1. "Nếu muốn [có chỗ ngồi ưu tiên / tham gia cả hai ngày ...], bạn có thể ..."
      const neuMuonMatch = s.match(/(?:Nếu\s*(?:muốn)?\s*)([^,]+?)(?=,\s*(?:khách|bạn|người))/i);
      if (neuMuonMatch) {
        const raw = neuMuonMatch[1].trim();
        if (raw.length > 5) return cleanDesc(raw);
      }

      // 2. "Đối với khách muốn..."
      const doiVoiMatch = s.match(/(?:Đối\s*với\s*khách\s*(?:muốn)?\s*)([^,]+?)(?=,\s*(?:vé|[A-Za-z0-9\s]+pass))/i);
      if (doiVoiMatch) {
        const raw = doiVoiMatch[1].trim();
        if (raw.length > 5) return cleanDesc(raw);
      }

      // 3. Quyền lợi trong chính câu s ("cho phép ...", "bao gồm ...", "có hiệu lực trong ...", "được tham gia ...")
      const benefitMatch = s.match(/(?:,\s*|\.\s*|;\s*|\bvới\s+)?(cho\s*phép\s*[^,\.;]+|bao\s*gồm\s*[^,\.;]+|có\s*hiệu\s*lực\s*[^,\.;]+|được\s*(?:tham\s*gia|vào|hưởng)\s*[^,\.;]+|dành\s*cho\s*[^,\.;]+|[^,\.;]*?ưu\s*tiên\s*[^,\.;]+)/i);
      if (benefitMatch) {
        const raw = benefitMatch[1].trim();
        if (!isQtyNoise(raw)) {
          return cleanDesc(raw);
        }
      }

      // 4. Nếu s không có quyền lợi, mới kiểm tra nextS (chỉ khi nextS mô tả vé này)
      if (nextS) {
        const rawKey = ticketName.replace(/^Vé\s+/i, '').trim();
        const isNextDescribingThis = !rawKey || nextS.toLowerCase().includes(rawKey.toLowerCase()) || /^(?:loại\s*vé\s*này|vé\s*này|hạng\s*vé\s*này|bao\s*gồm|quyền\s*lợi)/i.test(nextS);
        if (isNextDescribingThis) {
          const nextBenefit = nextS.match(/(?:quyền\s*lợi|lợi\s*ích|bao\s*gồm|ưu\s*tiên|cho\s*phép|áp\s*dụng\s*cho)\s*[:：\-–]?\s*([^\n\r]+)/i);
          if (nextBenefit && !isQtyNoise(nextBenefit[1])) {
            if (/^(?:loại\s*vé\s*này|vé\s*này)\s+/i.test(nextS)) {
              return cleanDesc(nextS.split('.')[0]);
            }
            return cleanDesc(nextBenefit[0]);
          }
        }
      }

      return '';
    };

    for (let i = 0; i < rawSentences.length; i++) {
      const s = rawSentences[i];
      if (/\b(?:booth|gian\s*hàng)\b/i.test(s)) continue;
      const price = parsePrice(s);
      if (price !== null) {
        const name = findTicketName(s);
        if (name) {
          let qty = parseQuantity(s);
          const nextS = i + 1 < rawSentences.length ? rawSentences[i + 1] : '';

          const desc = extractDescription(s, nextS, name);
          const formattedName = name.startsWith('Vé ') || name.endsWith('Pass') || name.endsWith('Ticket') || name.endsWith('Entry') || name.endsWith('Registration') || name.endsWith('Package') ? name : `Vé ${name}`;
          const key = name.toLowerCase().trim();

          const existingIdx = tickets.findIndex(
            (t) =>
              t.name.toLowerCase() === key ||
              t.name.toLowerCase() === formattedName.toLowerCase() ||
              (t.price === price && (t.name.toLowerCase().includes(key) || key.includes(t.name.replace(/^Vé\s+/i, '').toLowerCase())))
          );

          if (existingIdx >= 0) {
            if (!tickets[existingIdx].quantity_total && qty) tickets[existingIdx].quantity_total = qty;
            if (!tickets[existingIdx].description && desc) tickets[existingIdx].description = desc.trim();
          } else {
            tickets.push({
              name: formattedName,
              price,
              quantity_total: qty,
              description: desc.trim(),
            });
          }
        }
      }
    }

    // Fallback regex
    const ticketRegex = /vé\s+\*?\*?([A-Za-z0-9\sÀ-ỹ\-_]+?)\*?\*?\s*(?:có\s*giá|với\s*giá|giá)?\s*[:：]?\s*(\d{1,3}(?:[\.,]\d{3})*|\d+)\s*(?:đồng|vnd|vnđ|đ|k)\b(?:\s*,\s*(?:dự\s*kiến\s*phát\s*hành|số\s*lượng(?:\s*dự\s*kiến)?(?:\s*là)?|với)\s*(\d+)\s*vé)?(?:\s*,\s*dành\s*cho\s*([^\.\n]+))?/gi;
    let tm;
    while ((tm = ticketRegex.exec(docText)) !== null) {
      let rawN = cleanStopwords(tm[1].trim());
      const formattedN = rawN.startsWith('Vé ') || rawN.endsWith('Pass') || rawN.endsWith('Ticket') ? rawN : `Vé ${rawN}`;
      const pVal = Number(tm[2].replace(/[^\d]/g, ''));
      const existingIdx = tickets.findIndex(
        (t) =>
          t.name.toLowerCase() === rawN.toLowerCase() ||
          t.name.toLowerCase() === formattedN.toLowerCase() ||
          (t.price === pVal && (t.name.toLowerCase().includes(rawN.toLowerCase()) || rawN.toLowerCase().includes(t.name.replace(/^Vé\s+/i, '').toLowerCase())))
      );
      if (existingIdx < 0) {
        tickets.push({
          name: formattedN,
          price: pVal,
          quantity_total: tm[3] ? Number(tm[3]) : null,
          description: tm[4] ? tm[4].trim() : '',
        });
      }
    }

    // Cross-sentence quantities
    for (const t of tickets) {
      if (!t.quantity_total) {
        const rawKey = t.name.replace(/^Vé\s+/i, '').trim();
        const baseKey = rawKey.replace(/\s+(?:Pass|Ticket)$/i, '').trim();
        const keys = [rawKey];
        if (baseKey && baseKey !== rawKey) keys.push(baseKey);

        for (const k of keys) {
          const mPre = docText.match(new RegExp(`(\\d{1,3}(?:[\\.,]\\d{3})*|\\d+)\\s*vé\\s+${k}`, 'i'));
          if (mPre) {
            t.quantity_total = Number(mPre[1].replace(/[\.,]/g, ''));
            break;
          }
          const mPost = docText.match(new RegExp(`${k}[^\\.\\n\\r]{0,80}?(?:phát\\s*hành|số\\s*lượng|giới\\s*hạn(?:\\s*ở)?|tối\\s*đa|khoảng)\\s*(?:là\\s*)?(\\d{1,3}(?:[\\.,]\\d{3})*|\\d+)\\s*vé?`, 'i'));
          if (mPost) {
            t.quantity_total = Number(mPost[1].replace(/[\.,]/g, ''));
            break;
          }
          const mQty = docText.match(new RegExp(`(?:số\\s*lượng\\s*(?:vé\\s*)?|vé\\s*)${k}[^\\.\\n\\r]{0,80}?(?:giới\\s*hạn(?:\\s*ở)?|là|tối\\s*đa)\\s*(\\d{1,3}(?:[\\.,]\\d{3})*|\\d+)`, 'i'));
          if (mQty) {
            t.quantity_total = Number(mQty[1].replace(/[\.,]/g, ''));
            break;
          }
        }
      }
    }

    return tickets;
  }
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

      const hasActivityCol = lower.includes('hoạt động') || lower.includes('phiên') || lower.includes('session') || lower.includes('nội dung');

      if ((hasDateCol && hasTimeCol) || (hasTimeCol && hasActivityCol)) {
        const headers = line.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());

        let baseDate = '';
        const baseDateMatch = text.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (baseDateMatch) {
          baseDate = `${baseDateMatch[3]}-${String(baseDateMatch[2]).padStart(2, '0')}-${String(baseDateMatch[1]).padStart(2, '0')}`;
        }

        const dateIdx = headers.findIndex((h) => h.includes('ngày') || h.includes('date'));
        const checkinIdx = headers.findIndex((h) => h.includes('check-in') || h.includes('checkin') || h.includes('đón khách') || h.includes('mở cửa'));
        const startIdx = headers.findIndex((h) => h.includes('bắt đầu') || h.includes('start') || (h.includes('thời gian') && !h.includes('kết thúc')));
        const endIdx = headers.findIndex((h) => h.includes('kết thúc') || h.includes('end'));
        const venueIdx = headers.findIndex((h) => h.includes('địa điểm') || h.includes('venue') || h.includes('nơi tổ chức'));
        const locIdx = headers.findIndex((h) => h.includes('quận') || h.includes('thành phố') || h.includes('city') || h.includes('district') || h.includes('tỉnh'));
        const nameIdx = headers.findIndex((h) => h.includes('phiên') || h.includes('session') || h.includes('buổi') || h.includes('hoạt động') || h.includes('activity') || h.includes('nội dung') || h.includes('chương trình') || (h.includes('tên') && !h.includes('vé')));

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
            } else if (baseDate) {
              sDate = baseDate;
            }

            const normTime = (t) => {
              if (!t) return '';
              const m = t.match(/(\d{1,2})[:h](\d{2})/i);
              return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
            };

            const sCheckin = checkinIdx >= 0 ? normTime(cells[checkinIdx]) : '';
            let sStart = startIdx >= 0 ? normTime(cells[startIdx]) : '';
            let sEnd = endIdx >= 0 ? normTime(cells[endIdx]) : '';

            if (startIdx >= 0 && (!sEnd || endIdx < 0)) {
              const rangeM = cells[startIdx].match(/(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/);
              if (rangeM) {
                sStart = normTime(rangeM[1]);
                sEnd = normTime(rangeM[2]);
              }
            }

            const sName = nameIdx >= 0 && cells[nameIdx] ? cells[nameIdx] : `Phiên ${sessionCount}`;

            if (venueIdx >= 0 && cells[venueIdx] && !venue.venue_name) {
              const cellVenue = cells[venueIdx].trim();
              const isRoomOrHall = /^(?:hall|lecture\s*hall|room|phòng|tầng|floor|stage|lab|sảnh|studio|zone|lounge|khu\s*vực|khu\s*sinh\s*hoạt|area|networking|conference|innovation|main\s*auditorium|auditorium|tent|registration\s*tent|plaza|main\s*event\s*plaza|route)\b/i.test(cellVenue);
              if (!isRoomOrHall) {
                venue.venue_name = cellVenue;
              }
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
              location_detail: (venueIdx >= 0 && cells[venueIdx]) ? cells[venueIdx].trim() : '',
            });
          }
          r++;
        }
        i = r - 1;
      }
    }

    // Bổ sung hoạt động Workshop Corner nếu có (ví dụ Doc 2: Ceramic Painting Workshop, Handmade Paper Craft)
    const workshopCornerMatch = text.match(/###\s*Hoạt\s*động\s*tại\s*Workshop\s*Corner([\s\S]*?)(?=(?:\n##\s*|\n###\s*|$))/i);
    if (workshopCornerMatch) {
      const cornerText = workshopCornerMatch[1];
      const wsBlocks = [...cornerText.matchAll(/(?:\*{1,2})?([A-Za-z0-9\sÀ-ỹ\-]+Workshop|[A-Za-z0-9\sÀ-ỹ\-]+Craft|[A-Za-z0-9\sÀ-ỹ\-]+Demonstration)(?:\*{1,2})?([\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?[A-Za-z0-9\sÀ-ỹ\-]+(?:Workshop|Craft|Demonstration)|Tất\s*cả|$))/gi)];
      for (const wsb of wsBlocks) {
        const rawName = wsb[1].trim();
        const body = wsb[2];

        // Nếu số chỗ chưa xác nhận và văn bản ghi rõ "Tất cả sáu hoạt động" -> ưu tiên các hoạt động đã xác định sức chứa
        if (/số\s*chỗ\s*[:：\-–]\s*chưa\s*xác\s*nhận/i.test(body) && /Tất\s*cả\s*sáu\s*hoạt\s*động/i.test(text)) {
          continue;
        }

        const dateM = body.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        const timeM = body.match(/(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/);
        if (dateM && timeM) {
          const sDate = `${dateM[3]}-${String(dateM[2]).padStart(2, '0')}-${String(dateM[1]).padStart(2, '0')}`;
          const normTime = (t) => {
            const m = t.match(/(\d{1,2})[:h](\d{2})/i);
            return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
          };
          sessions.push({
            session_name: rawName,
            start_date: sDate,
            start_time: normTime(timeM[1]),
            end_date: sDate,
            end_time: normTime(timeM[2]),
            checkin_start_time: '',
            location_detail: 'Workshop Corner',
          });
        }
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
      // Bỏ qua bảng gian hàng triển lãm (không phải vé dành cho khách tham quan)
      if (lower.includes('gian hàng') || lower.includes('booth') || /thuê\s*gian\s*hàng|không\s*phải\s*giá\s*vé/i.test(text.slice(Math.max(0, text.indexOf(line) - 100), text.indexOf(line) + 200))) {
        continue;
      }

      const hasTicketCol = lower.includes('vé') || lower.includes('ticket') || lower.includes('hạng') || lower.includes('gói') || lower.includes('hình thức') || lower.includes('pass') || lower.includes('loại');
      const hasPriceCol = lower.includes('giá') || lower.includes('price') || lower.includes('phí') || lower.includes('fee') || lower.includes('vnd') || lower.includes('vnđ');

      if (hasTicketCol && hasPriceCol) {
        const headers = line.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());

        let nameIdx = headers.findIndex((h) =>
          !h.includes('mã') && !h.includes('code') && !h.includes('id') &&
          (h.includes('tên vé') ||
          h.includes('tên gói') ||
          h.includes('loại vé') ||
          h.includes('hạng vé') ||
          h.includes('tên') ||
          h.includes('gói') ||
          h.includes('hình thức') ||
          (h.includes('vé') && !h.includes('giá')) ||
          h.includes('ticket') ||
          h.includes('pass'))
        );
        if (nameIdx < 0) {
          nameIdx = headers.findIndex((h) =>
            h.includes('loại vé') ||
            h.includes('hạng vé') ||
            h.includes('tên') ||
            h.includes('gói') ||
            h.includes('hình thức') ||
            (h.includes('vé') && !h.includes('giá')) ||
            h.includes('ticket') ||
            h.includes('pass')
          );
        }
        const priceIdx = headers.findIndex((h) => h.includes('giá') || h.includes('price') || h.includes('phí') || h.includes('fee'));
        const qtyIdx = headers.findIndex((h) => h.includes('số lượng') || h.includes('quantity') || h.includes('qty') || h.includes('hạn mức') || h.includes('giới hạn') || h.includes('quota'));
        const descIdx = headers.findIndex((h) => h.includes('quyền lợi') || h.includes('mô tả') || h.includes('benefit') || h.includes('description') || h.includes('nội dung'));
        const statusIdx = headers.findIndex((h) => h.includes('trạng thái') || h.includes('status'));

        let r = i + 1;
        if (r < lines.length && lines[r].includes('---')) {
          r++;
        }

        let ticketCount = 0;
        while (r < lines.length && lines[r].startsWith('|') && lines[r].endsWith('|')) {
          const cells = lines[r].split('|').slice(1, -1).map((c) => c.trim());
          if (cells.length >= 2 && !cells.every((c) => !c || c.includes('---'))) {
            // Bỏ qua các vé nháp / đề xuất chưa duyệt (ví dụ Doc 5: Premium Family Package status = Draft)
            if (statusIdx >= 0 && cells[statusIdx]) {
              const st = cells[statusIdx].toLowerCase();
              if (/draft|nháp|đề\s*xuất|unapproved|chưa\s*(?:được\s*)?duyệt/i.test(st)) {
                r++;
                continue;
              }
            }

            ticketCount++;

            const rawName = nameIdx >= 0 && cells[nameIdx] ? cells[nameIdx] : `Hạng vé ${ticketCount}`;
            let priceNum = 0;
            if (priceIdx >= 0) {
              const cellP = cells[priceIdx].toLowerCase().trim();
              if (/miễn\s*phí|free|^\s*0(?:\s*vnd|\s*vnđ|\s*đ|\s*k)?$/i.test(cellP)) {
                priceNum = 0;
              } else {
                const rawPrice = cellP.replace(/[^\d]/g, '');
                priceNum = Number(rawPrice) || 0;
              }
            }

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
   * Bóc tách lịch trình được cập nhật/thay thế theo phiên bản (ví dụ: Phiên bản 2.0 thay thế phiên bản 1.0)
   */
  _parseVersionUpdateSchedule(text) {
    if (!text || !/(?:phiên\s*bản\s*2\.0|thay\s*đổi\s*số\s*\d+)/i.test(text)) return [];

    let sDate = '';
    const dateOrganizeMatch = text.match(/(?:ngày\s*tổ\s*chức|ngày\s*diễn\s*ra|chính\s*thức\s*diễn\s*ra\s*ngày)\s*[:：\-–]?\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
    if (dateOrganizeMatch) {
      sDate = `${dateOrganizeMatch[3]}-${String(dateOrganizeMatch[2]).padStart(2, '0')}-${String(dateOrganizeMatch[1]).padStart(2, '0')}`;
    } else {
      const allDates = [...text.matchAll(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/g)];
      for (const dm of allDates) {
        if (!this._isSkippedDateContext(text, dm.index)) {
          sDate = `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
          break;
        }
      }
    }

    const changeBlocks = [...text.matchAll(/(?:\*{1,2})?Thay\s*đổi\s*số\s*(\d+)\s*[:：\-–—]\s*([^\n\*]+)(?:\*{1,2})?([\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?Thay\s*đổi\s*số|\n[ \t]*##|\n[ \t]*\*\*|Như\s*vậy|$))/gi)];
    if (changeBlocks.length === 0) return [];

    const normTime = (t) => {
      if (!t) return '';
      const m = t.match(/(\d{1,2})[:h](\d{2})/i);
      return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
    };

    const sessions = [];
    for (const cb of changeBlocks) {
      const rawName = cb[2].trim();
      const body = cb[3];

      let startTime = '';
      let endTime = '';

      const stMatch = body.match(/(?:bắt\s*đầu\s*mới\s*là|bắt\s*đầu\s*từ|bắt\s*đầu\s*lúc)\s*(\d{1,2}[:h]\d{2})/i);
      const etMatch = body.match(/(?:kết\s*thúc\s*mới\s*là|kết\s*thúc\s*lúc|kết\s*thúc\s*vào)\s*(\d{1,2}[:h]\d{2})/i);
      if (stMatch && etMatch) {
        startTime = normTime(stMatch[1]);
        endTime = normTime(etMatch[1]);
      } else {
        const rangeMatch = body.match(/(\d{1,2}[:h]\d{2})\s*(?:[–\-—]|đến)\s*(\d{1,2}[:h]\d{2})/);
        if (rangeMatch) {
          startTime = normTime(rangeMatch[1]);
          endTime = normTime(rangeMatch[2]);
        }
      }

      if (startTime && endTime) {
        sessions.push({
          session_name: rawName,
          start_date: sDate,
          start_time: startTime,
          end_date: sDate,
          end_time: endTime,
          checkin_start_time: '',
        });
      }
    }

    return sessions;
  }

  /**
   * Bóc tách các hoạt động/phiên được đánh số hoặc gạch đầu dòng có tên in đậm
   * Hỗ trợ các định dạng:
   * - ### Phiên \d+: [Tên phiên]
   * - **Hoạt động \d+ – [Tên hoạt động]**
   * - - **[Tên hoạt động]** diễn ra ngày DD/MM/YYYY, từ HH:MM đến HH:MM...
   */
  _parseNumberedActivitySessions(text) {
    if (!text || typeof text !== 'string') return [];
    const sessions = [];

    const normTime = (t) => {
      if (!t) return '';
      const m = t.match(/(\d{1,2})[:h](\d{2})/i);
      return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
    };

    // 1. Định dạng Doc 3: ### Phiên \d+: [Tên phiên] (loại bỏ các mục chưa duyệt)
    const approvedSectionMatch = text.match(/##\s*2\.\s*Các\s*quyết\s*định\s*đã\s*thông\s*qua([\s\S]*?)(?=(?:##\s*3|\n##\s*4|$))/i);
    const searchSection = approvedSectionMatch ? approvedSectionMatch[1] : text;

    const phienBlocks = [...searchSection.matchAll(/###\s*Phiên\s*\d+\s*[:：\-–—]\s*([^\n\r]+)([\s\S]*?)(?=(?:###\s*Phiên\s*\d+|$))/gi)];
    if (phienBlocks.length > 0) {
      for (const pb of phienBlocks) {
        const rawName = pb[1].trim();
        const body = pb[2];

        const dateMatch = body.match(/(?:Ngày|Date)\s*[:：\-–]\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
        let sDate = '';
        if (dateMatch) {
          sDate = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
        }

        let startTime = '';
        let endTime = '';
        const timeMatch = body.match(/(?:Thời\s*gian|Time)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/i);
        if (timeMatch) {
          startTime = normTime(timeMatch[1]);
          endTime = normTime(timeMatch[2]);
        }

        if (startTime && endTime) {
          sessions.push({
            session_name: rawName,
            start_date: sDate,
            start_time: startTime,
            end_date: sDate,
            end_time: endTime,
            checkin_start_time: '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 2. Định dạng Doc 2: **Hoạt động \d+ – [Tên]**
    const hoatDongBlocks = [...text.matchAll(/(?:\*{1,2})?Hoạt\s*động\s*\d+\s*[–\-—:]\s*([^\n\*]+)(?:\*{1,2})?([\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?Hoạt\s*động\s*\d+|\n[ \t]*###|\n[ \t]*##|Ban\s*tổ\s*chức\s*đang\s*xem\s*xét|$))/gi)];
    if (hoatDongBlocks.length > 0) {
      let baseDate = '';
      const dateOrganizeMatch = text.match(/(?:ngày\s*tổ\s*chức|ngày\s*diễn\s*ra|chính\s*thức\s*diễn\s*ra\s*ngày)\s*[:：\-–]?\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
      if (dateOrganizeMatch) {
        baseDate = `${dateOrganizeMatch[3]}-${String(dateOrganizeMatch[2]).padStart(2, '0')}-${String(dateOrganizeMatch[1]).padStart(2, '0')}`;
      } else {
        const allDates = [...text.matchAll(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/g)];
        for (const dm of allDates) {
          if (!this._isSkippedDateContext(text, dm.index)) {
            baseDate = `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
            break;
          }
        }
      }

      for (const hb of hoatDongBlocks) {
        const rawName = hb[1].trim();
        const body = hb[2];

        let sDate = baseDate;
        const dMatch = body.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (dMatch) {
          sDate = `${dMatch[3]}-${String(dMatch[2]).padStart(2, '0')}-${String(dMatch[1]).padStart(2, '0')}`;
        }

        let startTime = '';
        let endTime = '';
        const timeMatch = body.match(/(?:Thời\s*gian|Time)?\s*[:：\-–]?\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/i);
        if (timeMatch) {
          startTime = normTime(timeMatch[1]);
          endTime = normTime(timeMatch[2]);
        }

        if (startTime && endTime) {
          sessions.push({
            session_name: rawName,
            start_date: sDate,
            start_time: startTime,
            end_date: sDate,
            end_time: endTime,
            checkin_start_time: '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 3. Định dạng Doc 6: - **[Tên]** [diễn ra ngày DD/MM/YYYY, từ HH:MM đến HH:MM...]
    const bulletActivityBlocks = [...text.matchAll(/^[ \t]*[\-•\*]\s*\*\*([^\*]+)\*\*([^\n]+(?:\n(?![ \t]*[\-•\*]|\n)[^\n]+)*)/gmi)];
    if (bulletActivityBlocks.length > 0) {
      let lastDate = '';
      for (const bab of bulletActivityBlocks) {
        const rawName = bab[1].trim();
        const content = bab[2];

        const hasTime = /(\d{1,2}[:h]\d{2})/.test(content);
        if (!hasTime) continue;

        let sDate = '';
        const dMatch = content.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (dMatch) {
          sDate = `${dMatch[3]}-${String(dMatch[2]).padStart(2, '0')}-${String(dMatch[1]).padStart(2, '0')}`;
          lastDate = sDate;
        } else if (/cùng\s*ngày/i.test(content) && lastDate) {
          sDate = lastDate;
        }

        let startTime = '';
        let endTime = '';
        let checkinTime = '';

        const ciMatch = content.match(/(?:check[\s\-]?in\s*(?:từ|lúc)?)\s*(\d{1,2}[:h]\d{2})/i);
        if (ciMatch) {
          checkinTime = normTime(ciMatch[1]);
        }

        const stEtMatch = content.match(/(?:từ\s*)?(\d{1,2}[:h]\d{2})\s*(?:đến|[–\-—]|và\s*kết\s*thúc\s*lúc)\s*(\d{1,2}[:h]\d{2})/i)
          || content.match(/bắt\s*đầu\s*lúc\s*(\d{1,2}[:h]\d{2})\s*và\s*kết\s*thúc\s*lúc\s*(\d{1,2}[:h]\d{2})/i);
        if (stEtMatch) {
          startTime = normTime(stEtMatch[1]);
          endTime = normTime(stEtMatch[2]);
        }

        if (startTime && endTime) {
          sessions.push({
            session_name: rawName,
            start_date: sDate,
            start_time: startTime,
            end_date: sDate,
            end_time: endTime,
            checkin_start_time: checkinTime,
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 4. Định dạng Hồ sơ hoạt động (Doc 1: **Hồ sơ hoạt động A-01**)
    const hoSoBlocks = [...text.matchAll(/(?:\*{1,2})?Hồ\s*sơ\s*hoạt\s*động\s*([A-Za-z0-9\-]+)(?:\*{1,2})?([\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?Hồ\s*sơ\s*hoạt\s*động|\n[ \t]*###|\n[ \t]*##|$))/gi)];
    if (hoSoBlocks.length > 0) {
      for (const hsb of hoSoBlocks) {
        const body = hsb[2];
        const nameMatch = body.match(/(?:Tên|Name)\s*[:：\-–]\s*([^\n\r]+)/i);
        const dateMatch = body.match(/(?:Ngày\s*tổ\s*chức|Ngày|Date)\s*[:：\-–]\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
        const timeMatch = body.match(/(?:Khung\s*giờ|Thời\s*gian|Time)\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/i);
        const locMatch = body.match(/(?:Khu\s*vực|Địa\s*điểm|Phòng|Room|Zone)\s*[:：\-–]\s*([^\n\r]+)/i);

        let sDate = '';
        if (dateMatch) {
          sDate = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
        }
        let startTime = '';
        let endTime = '';
        if (timeMatch) {
          startTime = normTime(timeMatch[1]);
          endTime = normTime(timeMatch[2]);
        }

        if (nameMatch && startTime && endTime) {
          sessions.push({
            session_name: nameMatch[1].trim(),
            start_date: sDate,
            start_time: startTime,
            end_date: sDate,
            end_time: endTime,
            location_detail: locMatch ? locMatch[1].trim() : '',
            checkin_start_time: '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 5. Định dạng Kịch bản biểu diễn / Cue Sheet (Doc 2: ### CUE 01 — MỞ CỔNG, ### CUE 02 — OPENING PERFORMANCE...)
    const cueBlocks = [...text.matchAll(/###\s*CUE\s*\d+\s*[—–\-:]\s*([^\n\r]+)([\s\S]*?)(?=(?:###\s*CUE|\n##\s*|\n###\s*THẺ|$))/gi)];
    if (cueBlocks.length > 0) {
      let baseDate = '';
      const dateMatch = text.match(/(?:Ngày\s*diễn|Ngày\s*tổ\s*chức|Ngày)[^\d\n\r]{0,15}?(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
      if (dateMatch) {
        baseDate = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
      }
      let commonCheckin = '';
      const cue1CheckinMatch = text.match(/(\d{1,2}[:h]\d{2})\s*[—–\-:]\s*(?:[^\n]*?)đón\s*khách|(\d{1,2}[:h]\d{2})\s*mới\s*là\s*giờ\s*mở\s*cửa/i);
      if (cue1CheckinMatch) {
        commonCheckin = normTime(cue1CheckinMatch[1] || cue1CheckinMatch[2]);
      }

      for (const cb of cueBlocks) {
        const rawCueName = cb[1].trim();
        const body = cb[2];

        // Bỏ qua CUE đề xuất chưa duyệt (ví dụ DJ After-Party proposal)
        if (/chưa\s*được\s*cấp\s*phép|chưa\s*được\s*phê\s*duyệt|không\s*đưa\s*hoạt\s*động\s*này\s*vào\s*lịch|proposal/i.test(rawCueName + ' ' + body)) {
          continue;
        }
        // Bỏ qua CUE chỉ là chuẩn bị kỹ thuật / mở cổng đón khách
        if (/mở\s*cổng|kỹ\s*thuật|chuẩn\s*bị|chỉ\s*dẫn\s*kỹ\s*thuật/i.test(rawCueName)) {
          continue;
        }

        const timeMatch = body.match(/(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/);
        const locMatch = body.match(/(?:Địa\s*điểm|Location|Stage|Sân\s*khấu)\s*[:：\-–]\s*([^\n\r.]+)/i);

        if (timeMatch) {
          const sStart = normTime(timeMatch[1]);
          const sEnd = normTime(timeMatch[2]);
          const cleanCueName = rawCueName.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          sessions.push({
            session_name: cleanCueName,
            start_date: baseDate,
            start_time: sStart,
            end_date: baseDate,
            end_time: sEnd,
            location_detail: locMatch ? locMatch[1].trim() : '',
            checkin_start_time: sessions.length === 0 ? commonCheckin : '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 6. Định dạng Lịch trình du lịch / Trải nghiệm (Doc 3: ### Hành trình ngày thứ nhất — 21/08/2028...)
    const itineraryDayBlocks = [...text.matchAll(/###\s*Hành\s*trình\s*ngày\s*([^\n—–\-]+)[—–\-]\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})([\s\S]*?)(?=(?:###\s*Hành\s*trình\s*ngày|###\s*Thông\s*tin\s*chưa\s*xác\s*nhận|###|$))/gi)];
    if (itineraryDayBlocks.length > 0) {
      for (const idb of itineraryDayBlocks) {
        const d = idb[2];
        const m = idb[3];
        const y = idb[4];
        const sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayBody = idb[5];

        const itemBlocks = [...dayBody.matchAll(/\*\*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})\s*\|\s*([^\*\n]+)\*\*([\s\S]*?)(?=(?:\n[ \t]*\*\*\d{1,2}[:h]\d{2}|$))/gi)];
        for (const ib of itemBlocks) {
          const sStart = normTime(ib[1]);
          const sEnd = normTime(ib[2]);
          const sName = ib[3].trim();
          const itemContent = ib[4];
          const locMatch = itemContent.match(/(?:Địa\s*điểm|Location|Zone|Pavilion|Stage)\s*[:：\-–]\s*([^\n\r.]+)/i);

          sessions.push({
            session_name: sName,
            start_date: sDate,
            start_time: sStart,
            end_date: sDate,
            end_time: sEnd,
            location_detail: locMatch ? locMatch[1].trim() : '',
            checkin_start_time: '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 7. Định dạng Doc 1: ### Ngày DD/MM/YYYY — [Tên vòng thi/giai đoạn]
    const daySubHeadings = [...text.matchAll(/###\s*Ngày\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4})\s*[—–\-:]?\s*([^\n\r]*)([\s\S]*?)(?=(?:###\s*Ngày|\n##\s*|$))/gi)];
    if (daySubHeadings.length > 0) {
      for (const dsh of daySubHeadings) {
        const rawDate = dsh[1];
        const [d, m, y] = rawDate.split(/[\/\.-]/);
        const sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayBody = dsh[3];

        const actBlocks = [...dayBody.matchAll(/(?:\*{1,2})?Hoạt\s*động[^\n\*]*?[:：\-–]\s*(?:\*{1,2})?\s*([^\n\*\r]+)(?:\*{1,2})?([\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?Hoạt\s*động[^\n\*]*?[:：\-–]|\n[ \t]*###|\n[ \t]*##|$))/gi)];
        for (const ab of actBlocks) {
          const actName = ab[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
          const abBody = ab[2];

          const tMatch = abBody.match(/(?:Thời\s*gian|Time)[^\n:]*?[:：\-–](?:\*{1,2})?\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/i);
          const lMatch = abBody.match(/(?:Địa\s*điểm|Location|Phòng|Hall)[^\n:]*?[:：\-–](?:\*{1,2})?\s*([^\n\r\*]+)/i);

          if (tMatch) {
            sessions.push({
              session_name: actName,
              start_date: sDate,
              start_time: normTime(tMatch[1]),
              end_date: sDate,
              end_time: normTime(tMatch[2]),
              location_detail: lMatch ? lMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim() : '',
              checkin_start_time: '',
            });
          }
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 8. Định dạng Doc 3: ### Chapter ... — [Tên]
    const chapterBlocks = [...text.matchAll(/###\s*(Chapter\s+[A-Za-z0-9]+\s*[—–\-:]\s*[^\n\r]+)([\s\S]*?)(?=(?:###\s*Chapter|\n##\s*|$))/gi)];
    if (chapterBlocks.length > 0) {
      let baseDate = '';
      const dMatch = text.match(/(?:ngày|diễn\s*ra\s*vào\s*ngày|tổ\s*chức\s*vào\s*ngày)[^\d\n\r]{0,20}?(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/i);
      if (dMatch) {
        baseDate = `${dMatch[3]}-${String(dMatch[2]).padStart(2, '0')}-${String(dMatch[1]).padStart(2, '0')}`;
      }

      for (const cb of chapterBlocks) {
        const rawName = cb[1].trim();
        const body = cb[2];

        const tMatch = body.match(/(?:Thời\s*gian|Time)[^\n:]*?[:：\-–](?:\*{1,2})?\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2})/i);
        const lMatch = body.match(/(?:Địa\s*điểm|Location)[^\n:]*?[:：\-–](?:\*{1,2})?\s*([^\n\r\*]+)/i);

        if (tMatch) {
          sessions.push({
            session_name: rawName,
            start_date: baseDate,
            start_time: normTime(tMatch[1]),
            end_date: baseDate,
            end_time: normTime(tMatch[2]),
            location_detail: lMatch ? lMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim() : '',
            checkin_start_time: '',
          });
        }
      }
      if (sessions.length > 0) return sessions;
    }

    // 9. Định dạng Doc 5: Nhật ký điều phối cập nhật theo thời gian (Timeline logs)
    if (/Nhật\s*ký\s*\d+/i.test(text)) {
      const yearMatch = text.match(/\b20\d{2}\b/);
      const baseYear = yearMatch ? yearMatch[0] : '2028';

      // 1. Khởi tạo danh sách từ Nhật ký 01 (Lịch ban đầu)
      const log1Match = text.match(/##\s*Nhật\s*ký\s*0?1[\s\S]*?(?=\n##\s*Nhật\s*ký\s*0?2|$)/i);
      if (log1Match) {
        const bulletItems = [...log1Match[0].matchAll(/^[ \t]*[\-•\*]\s*([^:]+)\s*[:：]\s*ngày\s*(\d{1,2})\/(\d{1,2}),?\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2}),?\s*([^.\n]+)/gmi)];
        for (const bi of bulletItems) {
          const sName = bi[1].trim();
          const d = bi[2];
          const m = bi[3];
          const sDate = `${baseYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const sStart = normTime(bi[4]);
          const sEnd = normTime(bi[5]);
          const sLoc = bi[6].trim();

          sessions.push({
            session_name: sName,
            start_date: sDate,
            start_time: sStart,
            end_date: sDate,
            end_time: sEnd,
            location_detail: sLoc,
            checkin_start_time: '',
          });
        }
      }

      // 2. Quét các thay đổi / cập nhật từ các Nhật ký tiếp theo
      const updateMatch = text.match(/(?:thay\s*đổi|điều\s*chỉnh)\s+([^.\n]+?)\s+từ\s+\d{1,2}[:h]\d{2}[–\-—]\d{1,2}[:h]\d{2}\s+thành\s+(\d{1,2}[:h]\d{2})[–\-—](\d{1,2}[:h]\d{2})\s+ngày\s+(\d{1,2})\/(\d{1,2})/i);
      if (updateMatch) {
        const targetName = updateMatch[1].trim().toLowerCase();
        const newStart = normTime(updateMatch[2]);
        const newEnd = normTime(updateMatch[3]);
        const targetSession = sessions.find((s) => s.session_name.toLowerCase().includes(targetName) || targetName.includes(s.session_name.toLowerCase()));
        if (targetSession) {
          targetSession.start_time = newStart;
          targetSession.end_time = newEnd;
        }
      }

      // Bổ sung hoạt động mới đã phê duyệt (ví dụ Nhật ký 04)
      const addMatch = text.match(/(?:xác\s*nhận\s*)?bổ\s*sung\s*hoạt\s*động\s+([^\n\r.]+)\.[\s\S]*?(?:Ngày\s*[:：\-–]\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4}))[\s\S]*?(?:Thời\s*gian\s*[:：\-–]\s*(\d{1,2}[:h]\d{2})\s*[–\-—]\s*(\d{1,2}[:h]\d{2}))[\s\S]*?(?:Địa\s*điểm\s*[:：\-–]\s*([^\n\r.]+))/i);
      if (addMatch) {
        const newActName = addMatch[1].trim();
        const d = addMatch[2];
        const m = addMatch[3];
        const y = addMatch[4];
        const sDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sStart = normTime(addMatch[5]);
        const sEnd = normTime(addMatch[6]);
        const sLoc = addMatch[7].trim();

        sessions.push({
          session_name: newActName,
          start_date: sDate,
          start_time: sStart,
          end_date: sDate,
          end_time: sEnd,
          location_detail: sLoc,
          checkin_start_time: '',
        });
      }

      if (sessions.length > 0) return sessions;
    }

    return sessions;
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

    // 0. Ưu tiên hàng đầu nếu có cập nhật lịch trình theo phiên bản (Version 2.0 overrides Version 1.0)
    const versionSched = this._parseVersionUpdateSchedule(text);

    // 1. Thử bóc tách từ bảng Markdown / Tab-delimited
    const tableSched = this._parseMarkdownScheduleTable(text);
    if (tableSched.venue?.venue_name) venueName = tableSched.venue.venue_name;
    if (tableSched.venue?.address_line) addressLine = tableSched.venue.address_line;
    if (tableSched.venue?.district) district = tableSched.venue.district;
    if (tableSched.venue?.province) city = tableSched.venue.province;

    // 1.5 Thử bóc tách từ các hoạt động/phiên được đánh số hoặc gạch đầu dòng
    const numberedSessions = (versionSched.length === 0 && tableSched.sessions.length === 0)
      ? this._parseNumberedActivitySessions(text)
      : [];

    // 2. Nếu chưa có từ bảng, mới tìm qua các nhãn key-value (bỏ qua các dòng bảng | hoặc \t)
    const nonTableText = text.split('\n').filter(l => !l.trim().startsWith('|') && !l.includes('\t')).join('\n');

    if (!venueName) {
      const vMatch = nonTableText.match(/(?:Venue(?:\s*Name)?|Tên\s*địa\s*điểm|Địa\s*điểm(?:\s*trung\s*tâm|\s*chính)?|Location|Where)\s*[:：\-–]\s*([^\n\r]+)/i);
      if (vMatch) {
        const fullLoc = vMatch[1].replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, '').trim();
        const distPipe = fullLoc.match(/District\s*[:：]?\s*([^|]+)/i);
        const cityPipe = fullLoc.match(/City\s*[:：]?\s*([^|]+)/i);
        if (distPipe && !district) district = distPipe[1].trim();
        if (cityPipe && !city) city = cityPipe[1].trim();
        const venuePart = fullLoc.split('|')[0].replace(/\s*(?:District|City)\s*[:：].*$/i, '').replace(/\.\s.*$/, '').trim();
        const parsedVnLoc = this._parseVietnameseAddress(venuePart);
        if (parsedVnLoc.venue_name) venueName = parsedVnLoc.venue_name;
        if (parsedVnLoc.address_line && !addressLine) addressLine = parsedVnLoc.address_line;
        if (parsedVnLoc.district && !district) district = parsedVnLoc.district;
        if (parsedVnLoc.province && !city) city = parsedVnLoc.province;
        if (!venueName) venueName = venuePart || fullLoc;
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

    // Nếu tên địa điểm chỉ là tên phòng/sảnh/khu sinh hoạt, để trống để _parseProseLocation tìm địa điểm thực tế
    const isSubVenueOrRoom = (name) => {
      if (!name || typeof name !== 'string') return false;
      const n = name.trim();
      return /^(?:lecture\s*hall|main\s*auditorium|auditorium|foyer(?:\s*gallery)?|design\s*stage|workshop\s*corner|hall|room|phòng|tầng|floor|stage|lab|sảnh|studio|zone|lounge|khu\s*vực|khu\s*sinh\s*hoạt|area|networking|conference|innovation|tent|route|plaza|điểm\s*tập\s*kết|tập\s*kết)\b/i.test(n)
        || /\b(?:stage|hall|room|phòng|lab|studio|zone|lounge|gallery|auditorium)\s*[A-Za-z0-9]*$/i.test(n);
    };

    if (isSubVenueOrRoom(venueName)) {
      venueName = '';
    }

    // Nếu có lịch trình hợp lệ từ version update, bảng hoặc numbered sessions:
    const effectiveSessions = versionSched.length > 0
      ? versionSched
      : (tableSched.sessions.length > 0 ? tableSched.sessions : numberedSessions);

    if (effectiveSessions.length > 0) {
      if (!venueName || !addressLine) {
        const pLoc = this._parseProseLocation(text);
        if (pLoc.venue_name && !venueName && !isSubVenueOrRoom(pLoc.venue_name)) {
          venueName = pLoc.venue_name;
        }
        if (pLoc.address_line && !addressLine) addressLine = pLoc.address_line;
        if (pLoc.district && !district) district = pLoc.district;
        if (pLoc.province && !city) city = pLoc.province;
      }

      return {
        venue: {
          venue_name: venueName,
          address_line: addressLine,
          district,
          province: city,
        },
        sessions: effectiveSessions,
      };
    }

    // Bổ sung quét địa điểm từ văn bản tự sự (Prose) nếu chưa tìm thấy
    if (!venueName || !addressLine) {
      const pLoc = this._parseProseLocation(text);
      if (pLoc.venue_name && !venueName) venueName = pLoc.venue_name;
      if (pLoc.address_line && !addressLine) addressLine = pLoc.address_line;
      if (pLoc.district && !district) district = pLoc.district;
      if (pLoc.province && !city) city = pLoc.province;
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

        const nameMatch = block.match(/(?:^|\n)[ \t]*(?:[-•*]\s*)?(?:Tên(?:\s*phiên|\s*hoạt\s*động)?|Name|Title)\s*[:：\-–]\s*([^\n\r]+)/i);
        const sName = (nameMatch && nameMatch[1].trim()) ? nameMatch[1].trim() : (firstLine || `Phiên ${i + 1}`);
        const locMatch = block.match(/(?:Phòng|Room|Địa\s*điểm|Khu\s*vực|Zone)\s*[:：\-–]\s*([^\n\r]+)/i);
        const sLoc = locMatch ? locMatch[1].trim() : '';

        sessionBlocks.push({
          session_name: sName,
          start_date: sDate,
          start_time: normTime(stMatch?.[1]),
          end_date: sDate,
          end_time: normTime(etMatch?.[1]),
          location_detail: sLoc,
          checkin_start_time: normTime(ciMatch?.[1]),
        });
      }
    }

    // 2. Tìm theo các khối ngày (CHƯƠNG TRÌNH NGÀY dd/mm/yyyy hoặc Day 1, Day 2...)
    if (sessionBlocks.length === 0) {
      const progSessions = this._parseProgramDaySessions(text);
      if (progSessions.length > 0) {
        sessionBlocks.push(...progSessions);
      }
    }
    if (sessionBlocks.length === 0) {
      const dayBlocks = this._parseDayNumberedBlocks(text);
      if (dayBlocks.length > 0) {
        sessionBlocks.push(...dayBlocks);
      }
    }
    // 3. Tìm theo khoảng ngày tiếng Anh (22–24 January 2028)
    if (sessionBlocks.length === 0) {
      const rangeSessions = this._parseEnglishDateRangeSessions(text);
      if (rangeSessions.length > 0) {
        sessionBlocks.push(...rangeSessions);
      }
    }
    // 4. Tìm theo tự sự đa phiên (nếu văn bản có từ 2 phiên trở lên, ví dụ phiên sáng và phiên chiều trong cùng ngày)
    if (sessionBlocks.length === 0) {
      const pSessions = this._parseProseSchedule(text);
      if (pSessions.length >= 2) {
        sessionBlocks.push(...pSessions);
      }
    }

    // 5. Nếu không có đa phiên, tìm ngày & giờ đơn lẻ trong văn bản có cấu trúc
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

    // 6. Tìm phiên đơn lẻ (Loose session)
    if (sessionBlocks.length === 0) {
      const loose = this._parseLooseSingleSession(text);
      if (loose) sessionBlocks.push(loose);
    }

    // 7. Tìm phiên đơn lẻ từ tự sự nếu còn lại
    if (sessionBlocks.length === 0) {
      const pSessions = this._parseProseSchedule(text);
      if (pSessions.length > 0) {
        sessionBlocks.push(...pSessions);
      }
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

    // 1.5 Thử bóc tách qua bullet ticket blocks (ví dụ: Standard Pass \n - Giá: 400.000 VND \n - Số lượng: 500 vé...)
    if (tickets.length === 0) {
      const bulletBlocks = this._parseBulletTicketBlocks(text);
      if (bulletBlocks.length > 0) {
        tickets.push(...bulletBlocks);
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

    let title = '';
    if (sections.title) {
      title = cleanLine(sections.title);
    } else {
      for (let i = 0; i < Math.min(rawLines.length, 5); i++) {
        const candidate = this._cleanDocumentTitle(rawLines[i]);
        if (candidate && !this._isGenericDocumentTitle(candidate)) {
          title = candidate.slice(0, 150);
          break;
        }
      }
      if (!title && rawLines[0]) {
        title = this._cleanDocumentTitle(rawLines[0]).slice(0, 150);
      }
    }
    if (!title) title = 'Sự kiện mới từ tài liệu';

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

    if (!venueName || !addressLine) {
      const pLoc = this._parseProseLocation(text);
      if (!venueName && pLoc.venue_name && !/^(?:hall|room|phòng|tầng|floor|stage|lab|sảnh|studio|zone|lounge|khu\s*vực|khu\s*sinh\s*hoạt|area|networking|conference|innovation|điểm\s*tập\s*kết|tập\s*kết)\b/i.test(pLoc.venue_name)) {
        venueName = pLoc.venue_name;
      }
      if (!addressLine && pLoc.address_line) addressLine = pLoc.address_line;
      if (!district && pLoc.district) district = pLoc.district;
      if (!province && pLoc.province) province = pLoc.province;
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

    const proseDesc = this._extractProseDescription(text, title);

    let fallbackShortDesc = '';
    const descLines = rawLines.filter((l) => {
      const c = cleanLine(l);
      return !/^(?:from|to|subject|date|cc|bcc|chào|thân\s*gửi|kính\s*gửi|tài\s*liệu(?:\s*\d+)?)\s*[:：\-–]?/i.test(c) && c.length > 20;
    });
    if (descLines.length > 0) {
      fallbackShortDesc = cleanLine(descLines[0]).slice(0, 500);
    }

    const shortDesc = sections.short_description
      ? cleanLine(sections.short_description).slice(0, 500)
      : (proseDesc.short_description || fallbackShortDesc || title).slice(0, 500);

    const descriptionHtml = sections.description
      ? this._formatDocumentToHtml(sections.description)
      : (proseDesc.description || this._formatDocumentToHtml(text, title, shortDesc));

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

    // Chỉ loại bỏ thẻ đầu tiên nếu thẻ đó chỉ chứa đúng tiêu đề sự kiện (ví dụ "<h1>Tên sự kiện</h1>")
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

    return cleaned;
  }

  /**
   * Bóc tách thông tin mô tả sự kiện (short_description và HTML description) từ văn bản tự sự / thư mời / thông cáo
   * @param {string} text
   * @param {string} title
   * @returns {{ short_description: string, description: string }}
   */
  _extractProseDescription(text, title = '') {
    if (!text || typeof text !== 'string') return { short_description: '', description: '' };

    const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawParagraphs = norm.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    const isGarbageLine = (line) => {
      const l = line.trim();
      if (!l) return true;
      if (/^(?:tài\s*liệu(?:\s*\d+)?\s*[:：\-–]?|kế\s*hoạch\s*tổ\s*chức|đề\s*án|event\s*proposal|rough\s*notes|for\s*immediate\s*release)/i.test(l)) return true;
      if (/^(?:xin\s*chào|chào\s*bạn|gửi\s*các\s*bạn|kính\s*gửi|thân\s*gửi|dear\s+all|hello)/i.test(l)) return true;
      if (title && (l.toLowerCase() === title.toLowerCase() || l.toLowerCase().startsWith(title.toLowerCase() + ' –') || l.toLowerCase().startsWith(title.toLowerCase() + ' -'))) return true;
      if (/^[\*\-_=~#]{3,}$/.test(l)) return true;
      return false;
    };

    const isPureTicketSalesParagraph = (p) => {
      const pFirstLine = p.split('\n')[0].trim();
      if (/^(?:#{1,6}\s*)?(?:bảng\s*giá\s*vé|giá\s*vé|thông\s*tin\s*vé|vé\s*tham\s*gia|ticket\s*pricing)/i.test(pFirstLine)) {
        return true;
      }
      if (/(?:được\s*(?:mở\s*)?bán\s*với\s*giá|có\s*giá|mức\s*giá)\s+\d+[\.,]?\d*\s*(?:đồng|vnd|nghìn|k)/i.test(p) && /(?:vé\s*(?:early\s*bird|standard|vip|tiêu\s*chuẩn|single\s*day|weekend|business|student)|pass\b)/i.test(p)) {
        return true;
      }
      if (/^(?:ban\s*tổ\s*chức\s*(?:dự\s*kiến\s*)?phát\s*hành|số\s*lượng\s*vé)/i.test(pFirstLine) && /\d+[\.,]?\d*\s*vé/i.test(p)) {
        return true;
      }
      if (/(?:chương\s*trình\s*ưu\s*đãi\s*cho\s*nhóm|giảm\s*\d+%\s*trên\s*(?:tổng\s*)?giá\s*vé|chính\s*sách\s*giảm\s*giá\s*nhóm)/i.test(p)) {
        return true;
      }
      return false;
    };

    const isClosingParagraph = (p) => {
      return /(?:hứa\s*hẹn\s*mang\s*đến|mong\s*muốn\s*trở\s*thành|hãy\s*cùng\s*chúng\s*tôi|chúc\s*các\s*bạn|hẹn\s*gặp\s*bạn|hẹn\s*gặp\s*lại)/i.test(p);
    };

    const isGuidelineParagraph = (p) => {
      return /(?:khách\s*tham\s*dự\s*cần\s*cung\s*cấp|tất\s*cả\s*người\s*tham\s*dự\s*cần|người\s*đăng\s*ký\s*cần|trẻ\s*em\s*dưới|vé\s*điện\s*tử\s*sẽ|lưu\s*mã\s*vé|xuất\s*trình|khuyến\s*nghị\s*khách\s*đến\s*sớm|giờ\s*cao\s*điểm|thời\s*tiết\s*(?:xấu|hoặc\s*điều\s*kiện)|phương\s*án\s*dự\s*phòng|phí\s*tham\s*dự\s*không\s*bao\s*gồm|chính\s*sách\s*hoàn\s*tiền|tuân\s*thủ\s*(?:hướng\s*dẫn|quy\s*định)|khu\s*vực\s*ẩm\s*thực\s*sẽ\s*hoạt\s*động|sử\s*dụng\s*bình\s*nước\s*cá\s*nhân|nếu\s*lịch\s*trình\s*có\s*thay\s*đổi)/i.test(p);
    };

    const isThemeParagraph = (p) => {
      return /(?:(?:các\s+)?chủ\s*đề(?:\s+chính)?(?:\s+của\s+chương\s+trình)?(?:\s+năm\s+nay)?\s+(?:gồm|là|bao\s+gồm)|(?:các\s+)?nội\s*dung(?:\s+năm\s+nay|\s+nổi\s+bật)?\s+(?:tập\s+trung\s+vào|bao\s+gồm|gồm))/i.test(p);
    };

    const isActivityOrScheduleParagraph = (p) => {
      return /\d{1,2}[:h]\d{2}|\b(?:sáng|chiều|tối)\s*(?:ngày|thứ)|(?:ngày\s*đầu\s*tiên|sang\s*ngày|cổng\s*đón\s*khách|chương\s*trình\s*mở\s*màn|phiên\s*(?:khai\s*mạc|thảo\s*luận)|diễn\s*đàn|workshop|sân\s*khấu|hall\s*[a-z0-9]|khu\s*vực\s*triển\s*lãm|showcase|parade)/i.test(p);
    };

    const introParagraphs = [];
    const activityParagraphs = [];
    const guidelineParagraphs = [];
    let closingParagraph = '';

    for (let i = 0; i < rawParagraphs.length; i++) {
      const rawP = rawParagraphs[i];
      const cleanedLines = rawP.split('\n').filter((l) => !isGarbageLine(l)).map((l) => l.trim()).filter(Boolean);
      if (cleanedLines.length === 0) continue;

      const pFirstLine = cleanedLines[0];
      if (/^(?:ban\s*tổ\s*chức|organizer|hotline|liên\s*hệ|email|phone)/i.test(pFirstLine) && cleanedLines.length <= 2) {
        continue;
      }

      const p = cleanedLines.join(' ');

      if (isClosingParagraph(p) && i >= rawParagraphs.length - 4) {
        closingParagraph = p;
        continue;
      }

      if (isPureTicketSalesParagraph(p)) {
        continue;
      }

      if (isGuidelineParagraph(p)) {
        guidelineParagraphs.push(p);
        continue;
      }

      if (isThemeParagraph(p)) {
        introParagraphs.push(p);
        continue;
      }

      if (isActivityOrScheduleParagraph(p)) {
        activityParagraphs.push(p);
        continue;
      }

      if (cleanedLines.length > 1 && cleanedLines[0].length < 60 && !/[.?!]$/.test(cleanedLines[0]) && !/(?:sẽ|diễn\s*ra|tại|vào|ngày|tháng)/i.test(cleanedLines[0])) {
        introParagraphs.push(cleanedLines[0]);
        introParagraphs.push(cleanedLines.slice(1).join(' '));
      } else {
        introParagraphs.push(p);
      }
    }

    // Generate short_description from introParagraphs
    let short_description = '';
    const cleanTitleWord = title ? title.split(/\s+/)[0].toLowerCase() : '';

    for (const p of introParagraphs) {
      if (p.length < 70 && !/[.?!]$/.test(p)) continue;
      const sentences = p.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
      for (const s of sentences) {
        if (s.endsWith('?') && sentences.length > 1) continue;
        if (cleanTitleWord && s.toLowerCase().includes(cleanTitleWord) && s.length >= 40) {
          short_description = s;
          break;
        }
      }
      if (short_description) break;
    }

    if (!short_description) {
      for (const p of introParagraphs) {
        if (p.length < 70 && !/[.?!]$/.test(p)) continue;
        const sentences = p.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
        for (const s of sentences) {
          if (s.endsWith('?') && sentences.length > 1) continue;
          if (s.length >= 40) {
            short_description = s;
            break;
          }
        }
        if (short_description) break;
      }
    }
    if (!short_description && introParagraphs.length > 0) {
      short_description = introParagraphs[0].slice(0, 300);
    }

    // Generate HTML description
    const htmlParts = [];

    // 1. Intro & Subtitle & Themes
    for (const p of introParagraphs) {
      if (p.length < 70 && !/[.?!]$/.test(p) && !/(?:sẽ|diễn\s*ra|tại|vào|ngày|tháng)/i.test(p)) {
        htmlParts.push(`<p><strong><em>${p}</em></strong></p>`);
        continue;
      }

      const themeSentenceMatches = Array.from(
        p.matchAll(/(?:(?:các\s+)?chủ\s*đề(?:\s+chính)?(?:\s+của\s+chương\s+trình)?(?:\s+năm\s+nay)?\s+(?:gồm|là|bao\s+gồm)|(?:các\s+)?nội\s*dung(?:\s+năm\s+nay|\s+nổi\s+bật)?\s+(?:tập\s+trung\s+vào|bao\s+gồm|gồm))\s*[:：]?\s*([^.]+)\./gi)
      );

      let bestMatch = null;
      let bestItems = [];
      for (const m of themeSentenceMatches) {
        const raw = m[1].trim();
        const its = raw.split(/[,;]|\s+và\s+/i).map((t) => t.trim()).filter((t) => t.length > 1);
        if (its.length > bestItems.length) {
          bestMatch = m;
          bestItems = its;
        }
      }

      if (bestMatch && bestItems.length >= 3) {
        const fullSentence = bestMatch[0];
        const pIdx = p.indexOf(fullSentence);
        const beforeText = p.slice(0, pIdx).trim();
        const afterText = p.slice(pIdx + fullSentence.length).trim();

        if (beforeText) {
          htmlParts.push(`<p>${beforeText}</p>`);
        }

        htmlParts.push(`<p><strong>Chủ đề và nội dung nổi bật:</strong></p>`);
        htmlParts.push(`<ul>\n${bestItems.map((it) => `  <li>${it}</li>`).join('\n')}\n</ul>`);

        if (afterText) {
          htmlParts.push(`<p>${afterText}</p>`);
        }
      } else {
        htmlParts.push(`<p>${p}</p>`);
      }
    }

    // 2. Activities & Highlights
    if (activityParagraphs.length > 0) {
      htmlParts.push(`<p><strong>Lịch trình & Hoạt động nổi bật:</strong></p>`);
      for (const p of activityParagraphs) {
        htmlParts.push(`<p>${p}</p>`);
      }
    }

    // 3. Attendee Guidelines & Logistics
    if (guidelineParagraphs.length > 0) {
      htmlParts.push(`<p><strong>Lưu ý dành cho người tham dự:</strong></p>`);
      for (const p of guidelineParagraphs) {
        htmlParts.push(`<p>${p}</p>`);
      }
    }

    // 4. Closing sentence
    if (closingParagraph) {
      htmlParts.push(`<p><em>${closingParagraph}</em></p>`);
    }

    return {
      short_description: short_description.slice(0, 500),
      description: htmlParts.join('\n'),
    };
  }


  /**
   * Kiểm tra xem văn bản tạo ra có phải là hallucination tiếng Anh đối với tài liệu tiếng Việt không
   */
  _isEnglishHallucinationForVietnamese(generatedStr, originalDocText) {
    if (!originalDocText || typeof originalDocText !== 'string') return false;
    const vnCharCount = (originalDocText.match(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi) || []).length;
    if (vnCharCount < 10) return false;

    if (!generatedStr || typeof generatedStr !== 'string') return false;
    const cleanStr = generatedStr.replace(/<[^>]*>/g, '').trim();
    const genVnCount = (cleanStr.match(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi) || []).length;
    if (genVnCount < 5) {
      const enIndicators = /(?:attendees\s+can|will\s+feature|held\s+throughout|exhibitions\s+will|hands-on\s+activities|is\s+a\s+cultural\s+event|celebrating|the\s+festival|interactive\s+workshops|live\s+performances)/i;
      if (enIndicators.test(cleanStr)) return true;
      const words = cleanStr.toLowerCase().split(/\s+/).filter(Boolean);
      const commonEnWords = ['the', 'is', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'will', 'can', 'be', 'of', 'as', 'by', 'from', 'event', 'festival'];
      const enWordCount = words.filter((w) => commonEnWords.includes(w)).length;
      if (words.length > 5 && (enWordCount / words.length) > 0.25) return true;
    }
    return false;
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

    // Kiểm tra an toàn tầng 2: Nếu tiêu đề trích xuất có dạng câu hỏi thi cử hoặc học tập phi sự kiện
    if (data.title && /(?:^(?:Theo\s+Hồ\s+Chí\s+Minh|Câu\s*\d+|Question\s*\d+|Bài\s*tập\s*\d+)|(?:[\?？]\s*$)|(?:=>\s*Con\s*người))/i.test(data.title)) {
      throw new AppError('Tài liệu được cung cấp là đề thi / câu hỏi trắc nghiệm / tài liệu học tập, không phải kế hoạch hoặc thông tin về sự kiện. Vui lòng kiểm tra và tải lên tài liệu sự kiện hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    const structuredSched = this._parseStructuredScheduleAndLocation(sections?.schedule_location || originalText);
    const structuredTickets = this._parseStructuredTickets(sections?.ticket_info || originalText);

    // Kiểm tra thêm từ originalText nếu structuredSched hoặc structuredTickets chưa đủ phần tử so với toàn bộ tài liệu
    const fullProgSessions = this._parseProgramDaySessions(originalText);
    if (fullProgSessions.length > structuredSched.sessions.length) {
      structuredSched.sessions = fullProgSessions;
    }
    const fullProseSessions = this._parseProseSchedule(originalText);
    if (fullProseSessions.length > structuredSched.sessions.length) {
      structuredSched.sessions = fullProseSessions;
    }
    const fullBulletTickets = this._parseBulletTicketBlocks(originalText);
    if (fullBulletTickets.length > structuredTickets.length) {
      structuredTickets.splice(0, structuredTickets.length, ...fullBulletTickets);
    }

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
    const proseDesc = this._extractProseDescription(originalText, data.title);

    if (sections && sections.short_description) {
      data.short_description = cleanPrefix(sections.short_description).slice(0, 500);
    } else {
      let rawShort = cleanPrefix(data.short_description);
      const isShortFakeEn = this._isEnglishHallucinationForVietnamese(rawShort, originalText);
      if (isShortFakeEn || !rawShort || rawShort.length < 20 || this._isGenericDocumentTitle(rawShort) || /^tài\s*liệu(?:\s*\d+)?\s*[:：\-–]?/i.test(rawShort)) {
        data.short_description = (proseDesc.short_description || rawShort).slice(0, 500);
      } else {
        data.short_description = rawShort.slice(0, 500);
      }
    }

    // Xử lý description:
    let finalDesc = '';
    if (sections && sections.description) {
      // Nếu tài liệu có phần mô tả chi tiết, dùng 100% nội dung gốc của phần này, không cho phép AI tự ý tóm tắt hay cắt ngắn!
      finalDesc = this._formatDocumentToHtml(sections.description);
    } else {
      // Nếu tài liệu tự do không có nhãn mô tả, kiểm tra hallucination tiếng Anh đối với tài liệu tiếng Việt
      const rawAiDesc = String(data.description || '').trim();
      const isFakeEn = this._isEnglishHallucinationForVietnamese(rawAiDesc, originalText);
      if (isFakeEn) {
        logger.warn('[AiDocumentParser] Phát hiện mô tả sự kiện tiếng Anh hallucination đối với tài liệu tiếng Việt. Đã tự động thay thế bằng nội dung tiếng Việt trung thực trích xuất từ tài liệu.');
        finalDesc = proseDesc.description;
      } else {
        finalDesc = rawAiDesc;
        if (finalDesc) {
          finalDesc = this._stripHallucinatedBoilerplate(finalDesc, originalText);
          finalDesc = this._cleanEventDescription(finalDesc, data.title, data.short_description);
        }
        const cleanFinalText = (finalDesc || '').replace(/<[^>]*>/g, '').trim();
        const cleanProseText = (proseDesc.description || '').replace(/<[^>]*>/g, '').trim();

        // Nếu AI hoàn toàn không tạo mô tả, hoặc quá ngắn (< 30 ký tự), hoặc bị AI tóm tắt quá mức/cắt ngắn (< 60% văn bản chi tiết từ tài liệu), dùng trích xuất đầy đủ từ tài liệu
        if (!finalDesc || cleanFinalText.length < 30 || (cleanProseText.length > 300 && cleanFinalText.length < cleanProseText.length * 0.6)) {
          finalDesc = proseDesc.description || (data.short_description ? `<p>${data.short_description}</p>` : '');
        } else {
          // Bổ sung danh sách chủ đề & nội dung nổi bật nếu AI bỏ sót
          if (proseDesc.description && proseDesc.description.includes('<ul>') && !finalDesc.includes('<ul>')) {
            const themeBlockMatch = proseDesc.description.match(/<p><strong>Chủ đề và nội dung nổi bật:<\/strong><\/p>\s*<ul>[\s\S]*?<\/ul>/i);
            if (themeBlockMatch && !finalDesc.toLowerCase().includes('chủ đề và nội dung nổi bật')) {
              finalDesc = `${finalDesc}\n${themeBlockMatch[0]}`;
            }
          }
          // Bổ sung các hoạt động nổi bật nếu AI bỏ sót
          if (proseDesc.description && proseDesc.description.includes('<strong>Lịch trình & Hoạt động nổi bật:</strong>') && !finalDesc.includes('Hoạt động nổi bật') && !finalDesc.includes('Lịch trình')) {
            const actMatch = proseDesc.description.match(/<p><strong>Lịch trình & Hoạt động nổi bật:<\/strong><\/p>[\s\S]*?(?=<p><strong>Lưu ý|<p><em>|$)/i);
            if (actMatch) {
              finalDesc = `${finalDesc}\n${actMatch[0].trim()}`;
            }
          }
          // Bổ sung các lưu ý dành cho người tham dự nếu AI bỏ sót
          if (proseDesc.description && proseDesc.description.includes('<strong>Lưu ý dành cho người tham dự:</strong>') && !finalDesc.includes('Lưu ý dành cho người tham dự') && !finalDesc.includes('Lưu ý')) {
            const guideMatch = proseDesc.description.match(/<p><strong>Lưu ý dành cho người tham dự:<\/strong><\/p>[\s\S]*?(?=<p><em>|$)/i);
            if (guideMatch) {
              finalDesc = `${finalDesc}\n${guideMatch[0].trim()}`;
            }
          }
        }
      }
    }

    data.description = finalDesc || proseDesc.description || `<p>${data.short_description}</p>`;

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
      || /^(?:lecture\s*hall|main\s*auditorium|auditorium|foyer(?:\s*gallery)?|design\s*stage|workshop\s*corner|tent|route|plaza)\b/i.test(String(name || '').trim())
      || /\b(?:stage|hall|room|phòng|lab|studio|zone|lounge|gallery|auditorium)\s*[A-Za-z0-9]*$/i.test(String(name || '').trim())
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
      }
      if (!addressLine && structuredSched.venue.address_line) addressLine = structuredSched.venue.address_line;
      if (!data.district && structuredSched.venue.district) data.district = structuredSched.venue.district;
      if (!data.province && structuredSched.venue.province) data.province = structuredSched.venue.province;
    }

    if (!venueName || !addressLine || !data.province) {
      const pLoc = this._parseProseLocation(originalText);
      if (!venueName && pLoc.venue_name && !isGenericUnnamedVenue(pLoc.venue_name)) venueName = pLoc.venue_name;
      if (!addressLine && pLoc.address_line) addressLine = pLoc.address_line;
      if (!data.district && pLoc.district) data.district = pLoc.district;
      if (!data.province && pLoc.province) data.province = pLoc.province;
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

    // Kiểm tra các mốc check-in cụ thể theo ngày trong văn bản
    const explicitCheckins = [];
    const checkinMatches = [...originalText.matchAll(/(?:check[\s\-]?in|mở\s*cửa\s*check[\s\-]?in|đón\s*khách)[^\d\n\r]{0,35}?(?:từ\s*|lúc\s*)?(\d{1,2}[:h]\d{2})(?:[^\d\n\r]{0,25}?(?:ngày\s*)?(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}))?/gi)];
    for (const cm of checkinMatches) {
      const cTime = this._normalizeTime(cm[1], '');
      let cDate = '';
      if (cm[2]) {
        const parts = cm[2].split(/[\/\.-]/);
        if (parts.length === 3) {
          cDate = `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
        }
      }
      if (cTime) explicitCheckins.push({ time: cTime, date: cDate });
    }
    const assignedCheckinDates = new Set();

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
        } else {
          const dateMatch = explicitCheckins.find((ec) => ec.date && ec.date === startDate);
          if (dateMatch && !assignedCheckinDates.has(startDate)) {
            checkinTime = dateMatch.time;
            assignedCheckinDates.add(startDate);
          } else if (idx === 0 && explicitCheckins.length > 0 && !explicitCheckins[0].date && !assignedCheckinDates.has('first')) {
            checkinTime = explicitCheckins[0].time;
            assignedCheckinDates.add('first');
          } else if (idx === 0 && hasCheckinMention && startTime && !/(?:chưa\s*(?:được\s*)?(?:quy\s*định|công\s*bố|xác\s*nhận)\s*giờ\s*check[\s\-]?in|giờ\s*check[\s\-]?in[^\n\r]*chưa\s*(?:được\s*)?(?:quy\s*định|công\s*bố|xác\s*nhận))/i.test(originalText)) {
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

    const allSessionStartDates = sanitizedSessions.map((s) => s.start_date).filter(Boolean).sort();
    const allSessionEndDates = sanitizedSessions.map((s) => s.end_date || s.start_date).filter(Boolean).sort();
    data.start_date = allSessionStartDates[0] || '';
    data.end_date = allSessionEndDates[allSessionEndDates.length - 1] || data.start_date;
    if (data.session) {
      data.session.start_date = data.start_date;
      data.session.end_date = data.end_date;
    }

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
      } else {
        // Bổ sung quantity_total và description nếu AI thiếu nhưng structuredTickets có trích xuất chính xác:
        rawTickets.forEach((t) => {
          const struct = structuredTickets.find((st) => {
            const n1 = st.name.toLowerCase().trim();
            const n2 = String(t.name || '').toLowerCase().trim();
            return n1 === n2 || n1.includes(n2) || n2.includes(n1);
          });
          if (struct) {
            if ((t.quantity_total === null || t.quantity_total === undefined) && struct.quantity_total) {
              t.quantity_total = struct.quantity_total;
            }
            if (!t.description && struct.description) {
              t.description = struct.description;
            }
          }
        });
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
    const isRefundUnconfirmed = /(?:chưa\s*(?:được\s*)?(?:thống\s*nhất|công\s*bố|áp\s*dụng|phê\s*duyệt|quy\s*định|xác\s*định|xác\s*nhận|chốt)\s*(?:chính\s*sách\s*|quy\s*định\s*(?:về\s*)?)?(?:hủy\s*(?:đăng\s*ký\s*)?(?:và\s*)?)?hoàn\s*(?:tiền|phí|vé)(?:\s*(?:vé|phí))?|(?:chính\s*sách\s*|quy\s*định\s*(?:về\s*)?)(?:hủy\s*(?:đăng\s*ký\s*)?(?:và\s*)?)?hoàn\s*(?:tiền|phí|vé)(?:\s*(?:vé|phí|và\s*đổi\s*vé|đăng\s*ký))?[^\n,.;]*?(?:chưa\s*(?:được\s*)?(?:ban\s*tổ\s*chức\s*)?(?:thống\s*nhất|công\s*bố|áp\s*dụng|phê\s*duyệt|quy\s*định|xác\s*nhận|xác\s*định|chốt)|vẫn\s*đang\s*được\s*xem\s*xét)|tài\s*liệu\s*hiện\s*tại\s*chưa\s*xác\s*định\s*chính\s*sách\s*hoàn|xác\s*định\s*chính\s*sách\s*hoàn\s*tiền|không\s*ghi\s*nội\s*dung[^.\n]*hoàn\s*tiền|chưa\s*tự\s*đặt\s*chính\s*sách\s*hoàn\s*tiền|không\s*có\s*điều\s*khoản\s*nào[^.\n]*hoàn\s*tiền|không\s*xác\s*lập\s*thời\s*hạn\s*hoặc\s*tỷ\s*lệ\s*hoàn\s*tiền|không\s*quy\s*định\s*thời\s*hạn\s*hoàn\s*tiền|không\s*có\s*dữ\s*liệu\s*(?:được\s*phê\s*duyệt\s*)?về\s*chính\s*sách\s*hủy)/i.test(originalText || '');
    const isNonRefundableInText = isRefundUnconfirmed || /không\s*hoàn\s*(?:vé|tiền)|không\s*được\s*hoàn\s*trả|không\s*hoàn\s*trả|non-refundable/i.test(originalText || '');
    data.refund_policy = {
      allow_refunds: isNonRefundableInText ? false : Boolean(data.refund_policy?.allow_refunds),
      deadline_days: Number(data.refund_policy?.deadline_days) || 7,
    };

    if (data.description) {
      data.description = data.description
        .replace(/(?:không\s*ghi\s*nội\s*dung\s*)?[“"«]?(?:được\s*)?hoàn\s*tiền\s*trong\s*vòng\s*7\s*ngày[”"»]?[^\n.]*[\n.]?/gi, '')
        .trim();
    }

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

    if (rawTags.length === 0 && originalText) {
      const topicMatch = originalText.match(/(?:chủ\s*đề\s*(?:chính)?\s*(?:gồm|là)?|main\s*topics?\s*(?:include)?|topics?)\s*[:：]?\s*([^\n\r.]+)/i);
      if (topicMatch) {
        const proseTopics = topicMatch[1]
          .split(/[,;\/|]|\s+(?:và|and)\s+/i)
          .map((t) => t.trim().replace(/^[#\*\s\-–—:]+|[#\*\s\-–—:]+$/g, ''))
          .filter((t) => t.length >= 2 && t.length <= 40);
        if (proseTopics.length > 0) {
          rawTags.push(...proseTopics);
        }
      }
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
