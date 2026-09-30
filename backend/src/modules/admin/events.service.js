const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const eventsAdminRepository = require('./events.repository');
const systemSettingsRepository = require('./systemSettings.repository');
const notificationsService = require('../notifications/notifications.service');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const { collectAllEventImages, fetchImageAsBase64, extractImagesFromHtml, fetchDocumentContent } = require('../../common/utils/htmlImageParser.util');

const REVIEWABLE_STATUSES  = new Set(['PENDING_REVIEW']);
const HIDEABLE_STATUSES    = new Set(['PUBLISHED', 'COMPLETED']);
const UNHIDEABLE_STATUSES  = new Set(['HIDDEN']);

const AI_REVIEW_SYSTEM_PROMPT = `Bạn là Chuyên gia Kiểm duyệt & Thẩm định Toàn diện Sự kiện của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, đối chiếu thông tin và đánh giá sự kiện KHÁCH QUAN, CHUẨN XÁC, THẤU ĐÁO VÀ HỢP LÝ.

BỘ ĐIỀU KHOẢN & QUY ĐỊNH NỀN TẢNG (PLATFORM POLICIES & TERMS):
1. GIẤY PHÉP & HỒ SƠ PHÁP LÝ (TERMS_ORGANIZER) — QUY ĐỊNH BẮT BUỘC:
   - YÊU CẦU 1 — ĐỊNH DẠNG TỆP BẮT BUỘC LÀ PDF (.PDF):
     + Tất cả giấy phép và hồ sơ pháp lý đính kèm BẮT BUỘC phải là tệp PDF (.pdf).
     + Nếu tệp tải lên là Word (.docx, .doc), ảnh (.jpg, .png), file nén, hoặc bất kỳ định dạng nào khác không phải PDF -> BẮT BUỘC xếp vào "critical_violations" (REJECT) và yêu cầu Organizer chuyển đổi sang PDF (.pdf) trước khi xét duyệt.
   
   - YÊU CẦU 2 — THẨM ĐỊNH NỘI DUNG TỆP PDF (KHÔNG PHẢI CỨ CÓ FILE LÀ ĐẠT):
     + Đọc kỹ toàn bộ nội dung văn bản trích xuất từ tệp PDF (PERMIT_DOCUMENT_*).
     + NỘI DUNG RỖNG / LỖI MỞ TỆP: Nếu file PDF rỗng hoặc không có văn bản pháp lý hợp lệ -> Xếp vào "critical_violations" (REJECT).
     + VIẾT LINH TINH / TROLL / KÝ TỰ VÔ NGHĨA: Nếu nội dung chứa ký tự gõ bừa (asdf, 123...), đùa cợt, lặp từ vô nghĩa, không có thông tin pháp lý -> Xếp vào "critical_violations" (REJECT).
     + LẠC ĐỀ / KHÔNG ĐÚNG VỚI SỰ KIỆN: Nếu nội dung file PDF nói về chủ đề khác (ví dụ: tài liệu học tập, công thức nấu ăn, hợp đồng bán hàng của tổ chức khác không liên quan...) không liên quan gì đến sự kiện hoặc nhà tổ chức -> Xếp vào "critical_violations" (REJECT).
     + HỢP LỆ (VALID): Chỉ khi tài liệu là Giấy phép biểu diễn/tổ chức do cơ quan thẩm quyền cấp, Quyết định thành lập / ĐKKD của đơn vị tổ chức, Hợp đồng thuê địa điểm/mặt bằng, hoặc Văn bản ủy quyền có thông tin khớp hoặc liên quan đúng đến sự kiện/đơn vị tổ chức -> Đánh giá HỢP LỆ (VALID) và ghi nhận vào "compliant_checks".

2. NỘI DUNG & CHÍNH TẢ (CONTENT & SPELLING):
   - Soát lỗi chính tả tiếng Việt trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết (gõ sai dấu, sai telex, từ viết sai).
   - Liệt kê các từ viết sai và từ đúng gợi ý vào "content_review.spelling_grammar_issues".
   - Đánh giá tiêu đề và mô tả không được chứa nội dung giật tít lừa đảo, cờ bạc, cam kết lợi nhuận phi pháp.

3. HÌNH ẢNH & OCR (IMAGE_POLICY):
   - Poster chính (Thumbnail) và Cover Banner là bắt buộc; Ảnh trong mô tả là tùy chọn.
   - Phân tích kết quả AI Vision cho từng ảnh: phát hiện ảnh khiêu dâm/18+, bạo lực máu me, cờ bạc, ma túy.
   - Không đánh đồng ảnh nghệ thuật, bơi lội, thể thao, sân khấu với nội dung vi phạm.

4. LỊCH TRÌNH, CƠ CẤU VÉ & CHÍNH SÁCH HOÀN TIỀN (TICKET_POLICY & REFUND_POLICY):
   - Lịch trình các phiên (Sessions) phải có logic thời gian: giờ kết thúc sau giờ bắt đầu.
   - Cơ cấu vé (Tickets) minh bạch về tên loại vé, giá tiền (không âm) và số lượng.
   - Chính sách hoàn tiền rõ ràng.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON THUẦN TÚY):
Trả về duy nhất 01 chuỗi JSON hợp lệ (KHÔNG dùng <think>, KHÔNG thêm text ngoài JSON) theo cấu trúc:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <0 đến 100>,
  "quality_score": <0 đến 100>,
  "summary": "<Tóm tắt 1-2 câu lý do phê duyệt/từ chối/lưu ý>",
  "content_review": {
    "title_status": "VALID" | "NEEDS_IMPROVEMENT" | "VIOLATION",
    "title_analysis": "<Đánh giá tiêu đề>",
    "description_status": "VALID" | "NEEDS_IMPROVEMENT" | "VIOLATION",
    "description_analysis": "<Đánh giá mô tả chi tiết>",
    "spelling_grammar_issues": ["<Lỗi chính tả kèm từ đúng>"]
  },
  "image_review": {
    "overall_image_verdict": "SAFE" | "WARNING" | "VIOLATION",
    "items": [
      {
        "source": "MAIN_POSTER | COVER_BANNER | DESCRIPTION_IMAGE_1 | PERMIT_DOCUMENT_1",
        "status": "VALID | WARNING | VIOLATION | MISSING",
        "analysis": "<Đánh giá nội dung và OCR trên ảnh hoặc tài liệu giấy phép>",
        "issues": ["<Vấn đề phát hiện nếu có>"],
        "suggestion": "<Gợi ý cải thiện chỉ khi thực sự cần thiết>"
      }
    ]
  },
  "compliant_checks": ["<Tiêu chí thực sự đạt chuẩn>"],
  "critical_violations": [
    {"policy_code": "TERMS_ORGANIZER | IMAGE_POLICY | REFUND_POLICY | PAYMENT_POLICY | TICKET_POLICY", "issue": "<Mô tả lỗi vi phạm nghiêm trọng>", "highlighted_text": "<Trích dẫn>"}
  ],
  "warnings": [
    {"policy_code": "TERMS_ORGANIZER | IMAGE_POLICY | REFUND_POLICY | PAYMENT_POLICY | TICKET_POLICY", "issue": "<Mô tả điểm cần lưu ý>", "highlighted_text": "<Trích dẫn>"}
  ],
  "suggestions": ["<Lời khuyên cải thiện thực sự có giá trị cho BTC>"]
}`;

/**
 * Đánh giá an toàn và tính hợp lệ của ảnh / tài liệu từ mô tả Vision AI.
 */
function assessImageSafety(description, source = '') {
  const desc = String(description || '').toLowerCase();
  const isPermit = typeof source === 'string' && source.startsWith('PERMIT');

  if (!desc || desc.length < 15 || desc.includes('không thể tải') || desc.includes('failed to load') || desc.includes('error')) {
    return {
      status: 'WARNING',
      issues: [isPermit ? 'Không thể tải hoặc chưa quét được nội dung tài liệu giấy phép qua AI Vision.' : 'Không thể tải hoặc chưa quét được đầy đủ nội dung ảnh qua AI Vision.'],
      suggestion: isPermit ? 'Vui lòng kiểm tra lại đường dẫn và định dạng tệp giấy phép đính kèm.' : 'Vui lòng kiểm tra lại đường dẫn và định dạng hình ảnh.',
    };
  }

  // Đánh giá riêng cho tài liệu giấy phép pháp lý (Permits)
  if (isPermit) {
    if (desc.includes('vi phạm định dạng') || desc.includes('không phải định dạng pdf') || desc.includes('lỗi định dạng')) {
      return {
        status: 'VIOLATION',
        issues: ['Tệp tài liệu đính kèm không đúng định dạng PDF (.pdf). Bắt buộc phải chuyển đổi sang file .pdf để được xét duyệt.'],
        suggestion: 'Vui lòng lưu/xuất tài liệu sang định dạng PDF (.pdf) và tải lên lại.',
      };
    }
    if (desc.includes('viết linh tinh') || desc.includes('vô nghĩa') || desc.includes('troll') || desc.includes('spam')) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu giấy phép chứa nội dung viết linh tinh, không nghiêm túc hoặc không có giá trị pháp lý.'],
        suggestion: 'Cung cấp văn bản giấy phép hoặc hợp đồng pháp lý chính thống.',
      };
    }
    if (desc.includes('lạc đề') || desc.includes('không liên quan')) {
      return {
        status: 'VIOLATION',
        issues: ['Nội dung tài liệu giấy phép lạc đề, không liên quan đến sự kiện hoặc đơn vị tổ chức.'],
        suggestion: 'Tải lên đúng giấy phép hoặc hợp đồng địa điểm của sự kiện này.',
      };
    }
    if (desc.includes('rỗng') || desc.includes('không trích xuất được')) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu giấy phép rỗng hoặc không có nội dung văn bản pháp lý hợp lệ.'],
        suggestion: 'Kiểm tra lại tệp PDF đảm bảo có đầy đủ nội dung chữ rõ ràng.',
      };
    }
    if (desc.includes('giả mạo') || desc.includes('fraudulent') || desc.includes('hết hạn rõ ràng') || desc.includes('severely expired')) {
      return {
        status: 'WARNING',
        issues: ['Tài liệu giấy phép có dấu hiệu cần lưu ý về thời hạn hoặc tính pháp lý.'],
        suggestion: 'Admin đối chiếu kỹ ngày hiệu lực và đơn vị cấp phép trong tài liệu.',
      };
    }
    return {
      status: 'VALID',
      issues: [],
      suggestion: '',
    };
  }

  const violationKeywords = [
    'nude', 'naked', 'nudity', 'nsfw', 'porn', 'erotic', 'breasts', 'penis', 'vagina', 'bikini', 'underwear',
    'khỏa thân', 'hở hang', 'khiêu dâm', 'nhạy cảm',
    'blood', 'gore', 'weapon', 'violence', 'gun', 'knife', 'bạo lực', 'máu me', 'vũ khí', 'súng', 'dao',
    'gambling', 'casino', 'betting', 'cờ bạc', 'lừa đảo', 'cá cược'
  ];

  const matchedViolations = violationKeywords.filter((kw) => desc.includes(kw));
  if (matchedViolations.length > 0) {
    return {
      status: 'VIOLATION',
      issues: [`Hình ảnh có dấu hiệu vi phạm chính sách nội dung (${matchedViolations.slice(0, 3).join(', ')}).`],
      suggestion: 'Bắt buộc thay thế hình ảnh phù hợp và tuân thủ tiêu chuẩn cộng đồng EventHub.',
    };
  }

  return {
    status: 'VALID',
    issues: [],
    suggestion: '',
  };
}

/**
 * Xây dựng image_review có kiểm chứng đa chiều giữa Vision quét thực tế và nhận định từ LLM.
 */
function buildValidatedImageReview(imageAnalysisResults = [], aiImageReview = null) {
  const aiItems = Array.isArray(aiImageReview?.items) ? aiImageReview.items : [];

  const items = imageAnalysisResults.map((img) => {
    const aiItem = aiItems.find((it) => it.source === img.source);
    const safety = assessImageSafety(img.description, img.source);

    let status = safety.status;
    let issues = [...safety.issues];
    let suggestion = safety.suggestion;
    let analysis = cleanAiOutputText(img.description || (img.source.startsWith('PERMIT') ? 'Đã kiểm tra tài liệu giấy phép qua AI Vision.' : 'Đã kiểm duyệt hình ảnh và OCR bằng AI Vision.'));

    if (aiItem) {
      if (aiItem.analysis && aiItem.analysis.length > 10) {
        analysis = cleanAiOutputText(aiItem.analysis);
      }
      if (Array.isArray(aiItem.issues) && aiItem.issues.length > 0) {
        issues = Array.from(new Set([...issues, ...aiItem.issues.map(cleanAiOutputText)]));
      }
      if (aiItem.suggestion) {
        suggestion = cleanAiOutputText(aiItem.suggestion);
      }
      if (aiItem.status === 'VIOLATION' || aiItem.status === 'WARNING') {
        status = aiItem.status;
      }
    }

    if (safety.status === 'VIOLATION') {
      status = 'VIOLATION';
    } else if (safety.status === 'WARNING' && status === 'VALID') {
      status = 'WARNING';
    }

    return {
      source: img.source,
      status,
      analysis,
      issues,
      suggestion,
    };
  });

  const hasViolation = items.some((it) => it.status === 'VIOLATION');
  const hasWarning = items.some((it) => it.status === 'WARNING');
  const overall_image_verdict = hasViolation ? 'VIOLATION' : hasWarning ? 'WARNING' : 'SAFE';

  return {
    overall_image_verdict,
    items,
  };
}

function sanitizeCompliantChecks({
  compliantChecks = [],
  criticalViolations = [],
  yellowWarnings = [],
  permitFiles = [],
  hasThumbnail = false,
  hasBanner = false,
  hasDescImages = false,
  imageReview = null,
}) {
  const allViolations = [...criticalViolations, ...yellowWarnings];

  // 1. Kiểm tra giấy phép
  const hasNoPermit = permitFiles.length === 0;
  const hasPermitViolation = hasNoPermit || allViolations.some((v) =>
    v.policy_code === 'TERMS_ORGANIZER' && /giấy phép|pháp lý|permit/i.test(v.issue)
  );

  // 2. Kiểm tra trạng thái duyệt thực tế của AI đối với từng ảnh:
  // "Không phải cứ có ảnh post lên là đạt chuẩn. Chỉ khi AI quét nội dung không vi phạm mới được gọi là đạt."
  const imageItems = Array.isArray(imageReview?.items) ? imageReview.items : [];

  const posterItem = imageItems.find((it) => it.source === 'MAIN_POSTER');
  const isPosterVerifiedSafe = Boolean(
    hasThumbnail &&
    posterItem &&
    posterItem.status === 'VALID' &&
    (!posterItem.issues || posterItem.issues.length === 0) &&
    !allViolations.some((v) => /thumbnail|ảnh đại diện|poster/i.test(v.issue))
  );

  const bannerItem = imageItems.find((it) => it.source === 'COVER_BANNER');
  const isBannerVerifiedSafe = Boolean(
    hasBanner &&
    bannerItem &&
    bannerItem.status === 'VALID' &&
    (!bannerItem.issues || bannerItem.issues.length === 0) &&
    !allViolations.some((v) => /banner|ảnh bìa/i.test(v.issue))
  );

  const descItems = imageItems.filter((it) => it.source && it.source.startsWith('DESCRIPTION_IMAGE'));
  const isDescVerifiedSafe = Boolean(
    hasDescImages &&
    descItems.length > 0 &&
    descItems.every((it) => it.status === 'VALID' && (!it.issues || it.issues.length === 0))
  );

  const hasGeneralImageViolation = allViolations.some((v) =>
    v.policy_code === 'IMAGE_POLICY' && /khiêu dâm|bạo lực|cờ bạc|lừa đảo|sai lệch|không khớp|vi phạm/i.test(v.issue)
  );

  // 3. Kiểm tra vé
  const hasTicketViolation = allViolations.some((v) =>
    v.policy_code === 'TICKET_POLICY' && /vé|ticket|giá vé|hạng vé/i.test(v.issue)
  );

  // 4. Kiểm tra phiên & lịch trình
  const hasSessionViolation = allViolations.some((v) =>
    /phiên|session|lịch trình/i.test(v.issue)
  );

  // 5. Lọc bỏ mọi tiêu chí mâu thuẫn
  const filtered = compliantChecks.filter((check) => {
    if (!check || typeof check !== 'string') return false;
    const lower = check.toLowerCase();

    // Nếu không có giấy phép hoặc có lỗi giấy phép -> CẤM khen giấy phép
    if (hasPermitViolation && (lower.includes('giấy phép') || lower.includes('pháp lý') || lower.includes('permit') || lower.includes('tài liệu'))) {
      return false;
    }

    // Nếu chưa được AI quét xác nhận đạt chuẩn -> CẤM khen poster
    if (!isPosterVerifiedSafe && (lower.includes('poster') || lower.includes('ảnh đại diện'))) {
      return false;
    }

    // Nếu chưa được AI quét xác nhận đạt chuẩn -> CẤM khen banner
    if (!isBannerVerifiedSafe && (lower.includes('banner') || lower.includes('ảnh bìa'))) {
      return false;
    }

    // Nếu chưa được AI quét xác nhận đạt chuẩn -> CẤM khen ảnh mô tả
    if (!isDescVerifiedSafe && lower.includes('mô tả') && (lower.includes('ảnh') || lower.includes('hình ảnh') || lower.includes('minh họa'))) {
      return false;
    }

    // Nếu có lỗi vi phạm hình ảnh -> CẤM khen hình ảnh
    if (hasGeneralImageViolation && (lower.includes('hình ảnh') || lower.includes('poster') || lower.includes('banner'))) {
      return false;
    }

    // Nếu có lỗi vé -> CẤM khen vé
    if (hasTicketViolation && (lower.includes('vé') || lower.includes('ticket') || lower.includes('giá bán') || lower.includes('cơ cấu vé'))) {
      return false;
    }

    // Nếu có lỗi phiên -> CẤM khen phiên
    if (hasSessionViolation && (lower.includes('phiên') || lower.includes('session') || lower.includes('lịch trình'))) {
      return false;
    }

    return true;
  });

  // Nếu thực sự có giấy phép và không có lỗi giấy phép mà danh sách chưa có -> bổ sung
  if (!hasPermitViolation && permitFiles.length > 0 && !filtered.some((c) => /giấy phép|pháp lý/i.test(c))) {
    filtered.push(`Đã đính kèm giấy phép tổ chức hợp lệ (${permitFiles.length} tài liệu)`);
  }

  // CHỈ bổ sung khen Poster khi AI đã quét và xác nhận đạt chuẩn nội dung
  if (isPosterVerifiedSafe && !hasGeneralImageViolation && !filtered.some((c) => /poster|ảnh đại diện/i.test(c))) {
    filtered.push('Ảnh đại diện chính (Poster) đã được AI quét và xác nhận đạt chuẩn, phù hợp nội dung');
  }

  // CHỈ bổ sung khen Banner khi AI đã quét và xác nhận đạt chuẩn nội dung
  if (isBannerVerifiedSafe && !hasGeneralImageViolation && !filtered.some((c) => /banner|ảnh bìa/i.test(c))) {
    filtered.push('Ảnh bìa (Cover Banner) đã được AI quét và xác nhận đạt chuẩn, không vi phạm');
  }

  // CHỈ bổ sung khen ảnh mô tả khi AI đã quét và xác nhận đạt chuẩn nội dung
  if (isDescVerifiedSafe && !hasGeneralImageViolation && !filtered.some((c) => /mô tả/i.test(c))) {
    filtered.push('Hình ảnh trong bài viết mô tả đã được AI quét và phù hợp nội dung');
  }

  return Array.from(new Set(filtered));
}

/**
 * Xóa sạch toàn bộ URL ảnh (Cloudinary, web, https://...) và chuỗi Base64 dài
 * khỏi bất kỳ trường text nào trả về từ AI, thay bằng nhãn mô tả tiếng Việt thân thiện.
 */
function cleanAiOutputText(text) {
  if (typeof text !== 'string') return text;
  return text
    // Thay thế chuỗi Data URI Base64 dạng text
    .replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[a-zA-Z0-9+/=]+/gi, '[Hình ảnh]')
    // Thay thế chuỗi Base64 dài độc lập (> 60 ký tự không có khoảng trắng)
    .replace(/\b[A-Za-z0-9+/=]{60,}\b/g, '[Dữ liệu ảnh]')
    // Thay thế link URL ảnh (Cloudinary / CDN / Image URLs)
    .replace(/https?:\/\/[^\s)\]"'>]+/gi, (url) => {
      if (
        url.includes('cloudinary.com') ||
        url.includes('res.cloudinary') ||
        /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(url)
      ) {
        return '[Hình ảnh]';
      }
      return url;
    })
    // Thay thế các mã enum nguồn ảnh sang tiếng Việt thân thiện
    .replace(/\bMAIN_POSTER\b/g, 'Ảnh đại diện chính (Poster)')
    .replace(/\bCOVER_BANNER\b/g, 'Ảnh bìa (Cover Banner)')
    .replace(/\bDESCRIPTION_IMAGE_(\d+)\b/g, 'Ảnh trong mô tả $1')
    .replace(/\bPERMIT_DOCUMENT_(\d+)\b/g, 'Tài liệu giấy phép $1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đệ quy làm sạch mọi chuỗi text bên trong object/array kết quả AI
 */
function cleanAiOutputObject(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    return cleanAiOutputText(data);
  }
  if (Array.isArray(data)) {
    return data.map((item) => cleanAiOutputObject(item));
  }
  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (['decision', 'status', 'policy_code', 'risk_score', 'quality_score', 'source', 'title_status', 'description_status', 'overall_image_verdict', 'overall_verdict'].includes(key)) {
        cleaned[key] = value;
      } else {
        cleaned[key] = cleanAiOutputObject(value);
      }
    }
    return cleaned;
  }
  return data;
}

class EventsAdminService {
  async getEventDetail(eventId) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async reviewEvent(adminId, eventId, payload) {
    // 1. Fetch event (with organizer contact info for notification)
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 2. Guard: only PENDING_REVIEW events can be reviewed
    if (!REVIEWABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be reviewed in its current status: ${event.status}. Only events with status PENDING_REVIEW are reviewable.`,
        400,
        ErrorCodes.EVENT_NOT_REVIEWABLE,
      );
    }

    // 3. Perform the review inside a DB transaction
    const updated = await eventsAdminRepository.reviewEvent({
      eventId,
      reviewedBy: adminId,
      status: payload.status,       // 'APPROVED' | 'REJECTED'
      reviewNote: payload.review_note ?? null,
    });

    if (!updated) {
      throw new AppError(
        'Failed to update event during review',
        500,
        ErrorCodes.INTERNAL_SERVER_ERROR,
      );
    }

    // 4. Notify organizer (fire-and-forget — never fail the HTTP response)
    this._notifyReview({
      organizerUserId: event.organizer_user_id,
      organizerEmail:  event.organizer_business_email || event.organizer_user_email,
      eventId:         event.id,
      eventTitle:      event.title,
      status:          payload.status,
      reviewNote:      payload.review_note,
    }).catch((err) => logger.warn(`[reviewEvent] notification failed: ${err.message}`));

    return updated;
  }

  async hideEvent(adminId, eventId, payload) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!HIDEABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be hidden in its current status: ${event.status}. Only events with status PUBLISHED or COMPLETED can be hidden.`,
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    const updated = await eventsAdminRepository.hideEvent(eventId, payload.reason);

    this._notifyHide({
      organizerUserId: event.organizer_user_id,
      organizerEmail:  event.organizer_business_email || event.organizer_user_email,
      eventId:         event.id,
      eventTitle:      event.title,
      hideNote:        payload.reason,
    }).catch((err) => logger.warn(`[hideEvent] notification failed: ${err.message}`));

    return updated;
  }

  async unhideEvent(adminId, eventId) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!UNHIDEABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be unhidden in its current status: ${event.status}. Only HIDDEN events can be unhidden.`,
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    const updated = await eventsAdminRepository.unhideEvent(eventId);

    this._notifyUnhide({
      organizerUserId: event.organizer_user_id,
      organizerEmail:  event.organizer_business_email || event.organizer_user_email,
      eventId:         event.id,
      eventTitle:      event.title,
    }).catch((err) => logger.warn(`[unhideEvent] notification failed: ${err.message}`));

    return updated;
  }

  async _notifyReview({ organizerUserId, organizerEmail, eventId, eventTitle, status, reviewNote }) {
    if (!organizerUserId) return;

    const isApproved = status === 'APPROVED';
    const title = isApproved
      ? `Sự kiện "${eventTitle}" đã được phê duyệt`
      : `Sự kiện "${eventTitle}" bị từ chối`;

    let content = isApproved
      ? `Sự kiện "${eventTitle}" của bạn đã được Admin phê duyệt. Bạn có thể xuất bản sự kiện bất cứ lúc nào từ trang quản lý sự kiện.`
      : `Sự kiện "${eventTitle}" của bạn đã bị Admin từ chối.`;

    if (!isApproved && reviewNote) {
      content += `\n\nLý do: ${reviewNote}`;
    }

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async _notifyHide({ organizerUserId, organizerEmail, eventId, eventTitle, hideNote }) {
    if (!organizerUserId) return;

    const title = `Sự kiện "${eventTitle}" đã bị ẩn`;
    let content = `Sự kiện "${eventTitle}" của bạn đã bị Admin ẩn khỏi nền tảng do phát hiện vi phạm hoặc vấn đề cần xem xét.`;
    if (hideNote) {
      content += `\n\nLý do: ${hideNote}`;
    }
    content += '\n\nVui lòng liên hệ hỗ trợ để biết thêm thông tin.';

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async _notifyUnhide({ organizerUserId, organizerEmail, eventId, eventTitle }) {
    if (!organizerUserId) return;

    const title = `Sự kiện "${eventTitle}" đã được khôi phục`;
    const content = `Sự kiện "${eventTitle}" của bạn đã được Admin khôi phục và hiện đang hiển thị công khai trên nền tảng.`;

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async getAiReview(eventId) {
    const existing = await eventsAdminRepository.getLatestAiReview(eventId);
    return existing;
  }

  async runAiReview(eventId) {
    const event = await eventsAdminRepository.findEventFullDetailForAi(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    let recommendation = 'APPROVE';
    let warnings = [];

    // Strip HTML and large base64 strings from description for clean, compact prompt
    const cleanDescription = String(event.description || '')
      .replace(/data:image\/[^;]+;base64,[^\s"'>]+/gi, '[Hình ảnh đính kèm]')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);

    const cleanShortDesc = String(event.short_description || '')
      .replace(/data:image\/[^;]+;base64,[^\s"'>]+/gi, '[Hình ảnh đính kèm]')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);

    // Check permits
    const permitFiles = Array.isArray(event.permits)
      ? event.permits
      : Array.isArray(event.refund_policy?.permit_files)
        ? event.refund_policy.permit_files
        : [];

    const permitSummary = permitFiles.length > 0
      ? `${permitFiles.length} tài liệu đính kèm:\n` +
        permitFiles.map((f, idx) => {
          const name = f.file_name || f.name || `Tài liệu ${idx + 1}`;
          const type = f.type || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/document');
          return `  + [Tài liệu #${idx + 1}] "${name}" (${type})`;
        }).join('\n')
      : 'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM';

    // Format image sources & presence status
    const hasThumbnail = Boolean(event.thumbnail_url && event.thumbnail_url.trim());
    const hasBanner = Boolean(event.banner_url && event.banner_url.trim());
    const descImages = extractImagesFromHtml(event.description);
    const hasDescImages = descImages.length > 0;

    const imageSummary = [
      `- Ảnh đại diện chính (Main Poster): ${hasThumbnail ? 'ĐÃ CÓ (Đã tải lên)' : 'CHƯA CÓ (BẮT BUỘC BỔ SUNG)'}`,
      `- Ảnh bìa (Cover Banner): ${hasBanner ? 'ĐÃ CÓ (Đã tải lên)' : 'CHƯA CÓ (CẦN BỔ SUNG)'}`,
      `- Ảnh trong bài viết mô tả: ${hasDescImages ? `ĐÃ CÓ (${descImages.length} ảnh dạng text/nhúng trong bài viết)` : 'CHƯA CÓ (Tùy chọn - không bắt buộc)'}`,
    ].join('\n');

    // Format ticket types and sessions summary
    const ticketList = event.ticket_types || [];
    const ticketSummary = ticketList.length > 0
      ? ticketList.map((t) => `${t.name}: ${Number(t.price).toLocaleString('vi-VN')} VNĐ (${t.quantity} vé)`).join(', ')
      : 'CHƯA CÓ THÔNG TIN VÉ';

    const sessionList = event.sessions || [];
    const sessionSummary = sessionList.length > 0
      ? sessionList.map((s, idx) => `Phiên ${idx + 1} [${s.session_name || 'Phiên'}]: ${s.start_time || ''} - ${s.end_time || ''}`).join('; ')
      : 'CHƯA CÓ LỊCH TRÌNH PHIÊN';

    const refundSummary = typeof event.refund_policy === 'string'
      ? event.refund_policy
      : event.refund_policy?.description ||
        (event.refund_policy && typeof event.refund_policy === 'object' && Object.keys(event.refund_policy).length > 0
          ? (event.refund_policy.allow_refund
              ? `Cho phép hoàn vé trước ${event.refund_policy.refund_before_days || 0} ngày (Tỷ lệ: ${event.refund_policy.refund_rate || 100}%)`
              : 'Sự kiện không hỗ trợ hoàn tiền.')
          : 'Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.');

    const eventPromptText = `Tên sự kiện: ${event.title || 'Chưa có tên'}
Thể loại / Định dạng: ${event.format || 'OFFLINE'}
Mô tả ngắn: ${cleanShortDesc || 'Không có'}
Mô tả chi tiết: ${cleanDescription || 'Không có'}
Hình ảnh sự kiện đã đăng:
${imageSummary}
Thời gian tổng thể: ${event.start_time || 'Chưa rõ'} đến ${event.end_time || 'Chưa rõ'}
Hồ sơ Giấy phép & Tài liệu đính kèm:
${permitSummary}
Lịch trình (Sessions): ${sessionSummary}
Cơ cấu vé (Tickets): ${ticketSummary}
Chính sách hoàn tiền sự kiện: ${refundSummary}

YÊU CẦU THẨM ĐỊNH & ĐÁNH GIÁ ĐA CHIỀU:
1. THẨM ĐỊNH HỒ SƠ GIẤY PHÉP (PERMITS & DOCUMENTS REVIEW):
   - Đọc kỹ kết quả AI VISION / OCR của TỪNG TÀI LIỆU (PERMIT_DOCUMENT_*) bên dưới.
   - Thẩm định xem tài liệu có phải là Giấy phép tổ chức, Giấy phép ĐKKD, Hợp đồng địa điểm, hoặc Giấy tờ pháp lý hợp lệ không.
   - NGUYÊN TẮC: Khách quan, thiết thực, KHÔNG QUÁ NHẠY CẢM. Không bắt bẻ tiểu tiết nếu tài liệu đã thể hiện quyền tổ chức hoặc thỏa thuận địa điểm rõ ràng.
   - Nếu tài liệu hợp lệ -> Đánh giá VALID trong image_review và ghi nhận vào "compliant_checks".
   - Nếu có điểm cần lưu ý nhỏ (như ngày cấp, phụ lục bổ sung) -> Đưa vào "warnings" hoặc "suggestions" mang tính xây dựng, KHÔNG tự ý REJECT.
   - NẾU "KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM" hoặc giấy phép hết hạn/giả mạo nghiêm trọng -> BẮT BUỘC đưa vào "critical_violations" (TERMS_ORGANIZER) và KHÔNG khen trong compliant_checks.
2. SOÁT LỖI CHÍNH TẢ & VĂN BẢN (Title & Description):
   - Soát kỹ từng từ trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết để phát hiện lỗi chính tả tiếng Việt (gõ sai dấu, sai telex, từ viết sai).
   - Liệt kê các từ sai chính tả vào "spelling_grammar_issues" cùng với gợi ý từ đúng.
   - Đánh giá tiêu đề có bị giật tít, lừa đảo, hứa hẹn phi lý không.
3. DUYỆT HÌNH ẢNH & OCR (Image Moderation):
   - Đọc kết quả từ AI VISION cho Poster, Banner, ảnh mô tả.
   - Phát hiện ảnh vi phạm (bạo lực, 18+, cờ bạc, lừa đảo). Không cấm ảnh nghệ thuật/thể thao.
4. LỊCH TRÌNH, VÉ & HOÀN TIỀN:
   - Kiểm tra logic giờ các phiên và tính minh bạch của cơ cấu vé.
5. ĐỀ XUẤT CẢI THIỆN:
   - Đưa ra danh sách gợi ý thiết thực để Nhà tổ chức chỉnh sửa hoàn thiện sự kiện.`;
    const imageSources = collectAllEventImages(event);
    const imageAnalysisResults = []; // { source, url, fileName, description }
    let visionAnalysisSummary = '';

    try {
      // 1. Check if Ollama is available
      const isOllamaUp = await ollamaClient.isHealthy();
      if (!isOllamaUp) {
        throw new Error('Ollama service is not reachable');
      }

      // ============================================================
      // STAGE 1: Vision Analysis & Document Parsing
      // ============================================================
      if (imageSources.length > 0) {
        logger.info(`[AiReview] Bắt đầu phân tích ${imageSources.length} ảnh và tài liệu...`);

        // Download images / extract document content
        const imagesWithBase64 = [];
        for (const item of imageSources) {
          const isPermit = item.source && item.source.startsWith('PERMIT');

          if (isPermit) {
            const docResult = await fetchDocumentContent(item.url, { fileName: item.fileName, type: item.fileType }, 15000);
            if (docResult) {
              if (docResult.type === 'INVALID_FORMAT') {
                imageAnalysisResults.push({
                  source: item.source,
                  url: item.url || '',
                  fileName: item.fileName || '',
                  isFormatViolation: true,
                  detectedFormat: docResult.detectedFormat,
                  description: `[VI PHẠM ĐỊNH DẠNG TỆP]: Tệp tài liệu '${item.fileName || 'giấy phép'}' không phải định dạng PDF (.pdf) mà là định dạng ${docResult.detectedFormat || 'không xác định'}. Quy định bắt buộc phải chuyển đổi sang file .pdf để được xét duyệt.`,
                });
                continue;
              } else if (docResult.type === 'DOWNLOAD_FAILED') {
                imageAnalysisResults.push({
                  source: item.source,
                  url: item.url || '',
                  fileName: item.fileName || '',
                  isDownloadFailed: true,
                  description: `[LỖI TẢI TỆP]: Không thể tải tệp giấy phép '${item.fileName || 'tài liệu'}' từ máy chủ lưu trữ.`,
                });
                continue;
              } else if (docResult.type === 'PDF_DOCUMENT') {
                if (docResult.hasText) {
                  const cleanPreview = docResult.text.slice(0, 1500);
                  imageAnalysisResults.push({
                    source: item.source,
                    url: item.url || '',
                    fileName: item.fileName || '',
                    extractedText: cleanPreview,
                    description: `[VĂN BẢN ĐỌC TỪ TỆP PDF '${item.fileName || 'Tài liệu'}']:\n${cleanPreview}`,
                  });
                  continue;
                } else if (docResult.imageBase64Fallback) {
                  imagesWithBase64.push({
                    source: item.source,
                    url: item.url,
                    fileName: item.fileName,
                    base64: docResult.imageBase64Fallback,
                  });
                  continue;
                } else {
                  imageAnalysisResults.push({
                    source: item.source,
                    url: item.url || '',
                    fileName: item.fileName || '',
                    description: `[CẢNH BÁO NỘI DUNG PDF]: Tệp PDF '${item.fileName || 'tài liệu'}' rỗng hoặc không trích xuất được nội dung văn bản.`,
                  });
                  continue;
                }
              }
            }
          }

          const b64 = await fetchImageAsBase64(item.url, 8000);
          if (b64) {
            imagesWithBase64.push({
              source: item.source,
              url: item.url,
              fileName: item.fileName,
              base64: b64,
            });
          } else {
            logger.warn(`[AiReview] Không thể tải ảnh/tài liệu [${item.source}]: ${item.url.slice(0, 80)}`);
            imageAnalysisResults.push({
              source: item.source,
              url: item.url || '',
              fileName: item.fileName || '',
              description: 'KHÔNG THỂ TẢI TÀI LIỆU / ẢNH — URL không truy cập được hoặc đã hết hạn.',
            });
          }
        }

        // Call vision model for images requiring OCR/Visual Inspection
        if (imagesWithBase64.length > 0) {
          const visionResults = await ollamaClient.describeImageBatch(
            imagesWithBase64,
            event.title || 'Sự kiện EventHub'
          );
          imageAnalysisResults.push(...visionResults);
        }

        // Build vision analysis summary for the text model (truncate to fit context)
        visionAnalysisSummary = imageAnalysisResults.map((r) => {
          const sourceLabel = r.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : r.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : r.source.startsWith('PERMIT')
                ? `Tài liệu giấy phép (${r.fileName || r.source})`
                : `Ảnh trong mô tả (${r.source})`;
          // Truncate each description to 450 chars to allow sufficient document text
          const desc = (r.description || '').slice(0, 450);
          return `[${sourceLabel}]:\n${desc}`;
        }).join('\n\n');

        // Cap total vision summary to avoid token overflow (model context = 4096)
        if (visionAnalysisSummary.length > 2500) {
          visionAnalysisSummary = visionAnalysisSummary.slice(0, 2500) + '\n... (đã rút gọn)';
        }

        logger.info(`[AiReview] Phân tích hình ảnh và tài liệu hoàn tất. ${imageAnalysisResults.length} mục đã được kiểm tra.`);
      }

      // ============================================================
      // STAGE 2: Text Review — Gửi mô tả ảnh + thông tin sự kiện cho text model
      // ============================================================
      const imageSection = visionAnalysisSummary
        ? `\n\n=== KẾT QUẢ PHÂN TÍCH TÀI LIỆU & HÌNH ẢNH TỪ HỆ THỐNG ===\n${visionAnalysisSummary}\n=== KẾT THÚC PHÂN TÍCH TÀI LIỆU & HÌNH ẢNH ===`
        : '';

      const eventPromptWithVision = eventPromptText + imageSection;

      // 2. Call Ollama Chat API with EventHub Policy System Prompt
      const messages = [
        { role: 'system', content: AI_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: eventPromptWithVision }
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.15,
        max_tokens: 1000,
      });

      logger.info(`[AiReview] LLM output received (${aiResponse.content.length} chars). Extracting JSON...`);
      const parsedJson = ollamaClient.extractJSON(aiResponse.content);

      if (parsedJson && (parsedJson.decision || parsedJson.recommendation)) {
        recommendation = parsedJson.decision || parsedJson.recommendation;

        let criticalViolations = (Array.isArray(parsedJson.critical_violations) ? parsedJson.critical_violations : [])
          .filter((v) => v && v.issue && !/^<.*>$/i.test(v.issue.trim()));
        let yellowWarnings = (Array.isArray(parsedJson.warnings) ? parsedJson.warnings : [])
          .filter((v) => v && v.issue && !/^<.*>$/i.test(v.issue.trim()));
        let compliantChecks = Array.isArray(parsedJson.compliant_checks)
          ? parsedJson.compliant_checks
          : [];
        const suggestions = Array.isArray(parsedJson.suggestions)
          ? parsedJson.suggestions
          : [];

        // 1. Kiểm tra giấy phép và định dạng PDF bắt buộc
        if (permitFiles.length === 0) {
          if (!criticalViolations.some((v) => /giấy phép|pháp lý|permit/i.test(v.issue))) {
            criticalViolations.unshift({
              policy_code: 'TERMS_ORGANIZER',
              issue: 'Sự kiện thiếu Giấy phép tổ chức / tài liệu pháp lý đính kèm bắt buộc.',
              highlighted_text: 'Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM',
            });
          }
          recommendation = 'REJECT';
        } else {
          // Kiểm tra từng tệp giấy phép xem có tệp nào vi phạm định dạng không phải PDF hoặc lỗi tải
          imageAnalysisResults.forEach((imgRes) => {
            if (imgRes.source && imgRes.source.startsWith('PERMIT')) {
              if (imgRes.isFormatViolation) {
                const issueMsg = `Tệp tài liệu "${imgRes.fileName || 'giấy phép'}" không đúng định dạng PDF (.pdf) (phát hiện: ${imgRes.detectedFormat || 'khác'}). Theo quy định, tài liệu pháp lý bắt buộc phải là tệp PDF (.pdf).`;
                if (!criticalViolations.some((v) => v.issue.includes(imgRes.fileName || 'không đúng định dạng PDF'))) {
                  criticalViolations.unshift({
                    policy_code: 'TERMS_ORGANIZER',
                    issue: issueMsg,
                    highlighted_text: `Tên tệp: ${imgRes.fileName || 'Không phải PDF'}`,
                  });
                }
                recommendation = 'REJECT';
              } else if (imgRes.isDownloadFailed) {
                const issueMsg = `Không thể tải tệp giấy phép "${imgRes.fileName || 'tài liệu'}" từ máy chủ lưu trữ. Vui lòng kiểm tra lại đường dẫn tệp.`;
                if (!criticalViolations.some((v) => v.issue.includes(imgRes.fileName || 'Không thể tải tệp'))) {
                  criticalViolations.unshift({
                    policy_code: 'TERMS_ORGANIZER',
                    issue: issueMsg,
                  });
                }
                recommendation = 'REJECT';
              }
            }
          });
        }

        // Nếu thực tế ĐÃ CÓ giấy phép đính kèm -> Lọc bỏ các cảnh báo sai lệch về việc "thiếu giấy phép" (tránh false positives từ AI)
        if (permitFiles.length > 0) {
          criticalViolations = criticalViolations.filter((v) => {
            if (v.policy_code === 'TERMS_ORGANIZER' && /chưa có giấy phép|thiếu giấy phép|không có giấy phép|chưa tải lên giấy phép/i.test(v.issue)) {
              return false;
            }
            return true;
          });
          yellowWarnings = yellowWarnings.filter((w) => {
            if (w.policy_code === 'TERMS_ORGANIZER' && /chưa có giấy phép|thiếu giấy phép|không có giấy phép|chưa tải lên giấy phép/i.test(w.issue)) {
              return false;
            }
            return true;
          });
        }

        // 2. Kiểm tra Poster chính
        if (!hasThumbnail && !criticalViolations.concat(yellowWarnings).some((v) => /thumbnail|ảnh đại diện|poster/i.test(v.issue))) {
          yellowWarnings.push({
            policy_code: 'IMAGE_POLICY',
            issue: 'Sự kiện chưa có ảnh đại diện chính (Main Poster). Vui lòng tải lên ảnh đại diện để sự kiện hiển thị trực quan.',
            highlighted_text: 'Ảnh đại diện chính (Thumbnail): CHƯA CÓ',
          });
        }

        // 3. Kiểm tra Cover Banner
        if (!hasBanner && !criticalViolations.concat(yellowWarnings).some((v) => /banner|ảnh bìa/i.test(v.issue))) {
          yellowWarnings.push({
            policy_code: 'IMAGE_POLICY',
            issue: 'Sự kiện chưa có ảnh bìa (Cover Banner). Cần bổ sung ảnh bìa để trang sự kiện được đẹp mắt và chuyên nghiệp hơn.',
            highlighted_text: 'Ảnh bìa (Cover Banner): CHƯA CÓ',
          });
        }

        // 4. Lọc bỏ cảnh báo không hợp lý về ảnh:
        // - Ảnh trong mô tả là tùy chọn -> KHÔNG bao giờ coi việc thiếu ảnh mô tả là warning/violation
        // - Chỉ lọc bỏ cảnh báo "thiếu ảnh" nếu thực tế đã có ảnh đó
        // - GIỮ NGUYÊN các cảnh báo do Vision AI phát hiện (không khớp nội dung, chữ sai lệch, ảnh vi phạm...)
        yellowWarnings = yellowWarnings.filter((w) => {
          if (w.policy_code === 'IMAGE_POLICY') {
            // Không cảnh báo thiếu ảnh trong mô tả
            if (/mô tả|bài viết/i.test(w.issue) && /thiếu|chưa có|không có|bổ sung ảnh/i.test(w.issue)) {
              return false;
            }
            // Nếu đã có thumbnail/poster thì không cảnh báo thiếu thumbnail
            if (hasThumbnail && /chưa có ảnh đại diện|thiếu ảnh đại diện|chưa có thumbnail|thiếu poster|chưa có poster/i.test(w.issue)) {
              return false;
            }
            // Nếu đã có banner thì không cảnh báo thiếu banner
            if (hasBanner && /chưa có ảnh bìa|thiếu ảnh bìa|chưa có banner/i.test(w.issue)) {
              return false;
            }
          }
          return true;
        });

        criticalViolations = criticalViolations.filter((v) => {
          if (v.policy_code === 'IMAGE_POLICY' && /mô tả/i.test(v.issue) && /thiếu|chưa có|không có/i.test(v.issue)) {
            return false;
          }
          return true;
        });

        // Tự động điều chỉnh lại decision nếu không còn critical_violations
        if (criticalViolations.length === 0 && recommendation === 'REJECT') {
          recommendation = yellowWarnings.length > 0 ? 'NEEDS_REVIEW' : 'APPROVE';
        }

        // 5. Ảnh trong mô tả: Nếu chưa có -> thêm vào gợi ý (suggestions)
        if (!hasDescImages && !suggestions.some((s) => /mô tả|minh họa/i.test(s))) {
          suggestions.push('Gợi ý bổ sung thêm hình ảnh minh họa bên trong phần mô tả chi tiết để người xem dễ hình dung và tăng tính hấp dẫn cho sự kiện.');
        }

        // Đảm bảo image_review luôn được kiểm chứng đa chiều giữa Vision quét thực tế và nhận định từ LLM
        const finalImageReview = buildValidatedImageReview(imageAnalysisResults, parsedJson.image_review);

        // Sanitize compliant checks để triệt tiêu mọi mâu thuẫn (CHỈ khen ảnh khi AI Vision thực sự quét và xác nhận đạt chuẩn)
        compliantChecks = sanitizeCompliantChecks({
          compliantChecks,
          criticalViolations,
          yellowWarnings,
          permitFiles,
          hasThumbnail,
          hasBanner,
          hasDescImages,
          imageReview: finalImageReview,
        });

        // Legacy/fallback compatibility: collect flat list
        criticalViolations.forEach((v) => {
          warnings.push(`[HIGH] [${v.policy_code || 'CHÍNH SÁCH'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
        });
        yellowWarnings.forEach((v) => {
          warnings.push(`[MEDIUM] [${v.policy_code || 'LƯU Ý'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
        });

        // Store rich object into DB (xóa sạch toàn bộ URL thô / base64 khỏi tất cả các trường text)
        const rawSavedData = {
          summary: parsedJson.summary || (recommendation === 'APPROVE' ? 'Sự kiện tuân thủ tốt các chính sách EventHub.' : 'Cần xem xét các lưu ý trước khi phê duyệt.'),
          risk_score: Number(parsedJson.risk_score ?? (recommendation === 'REJECT' ? 85 : recommendation === 'NEEDS_REVIEW' ? 45 : 5)),
          quality_score: Number(parsedJson.quality_score ?? (criticalViolations.length > 0 ? 50 : 85)),
          compliant_checks: compliantChecks,
          critical_violations: criticalViolations,
          warnings: yellowWarnings,
          suggestions: suggestions.length > 0 ? suggestions : criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
          flat_warnings: warnings,
          content_review: parsedJson.content_review || null,
          image_review: finalImageReview,
          vision_analysis: imageAnalysisResults.length > 0 ? imageAnalysisResults.map((r) => ({
            source: r.source,
            fileName: r.fileName || '',
            description: cleanAiOutputText(r.description || ''),
          })) : null,
        };

        const savedData = cleanAiOutputObject(rawSavedData);

        const saved = await eventsAdminRepository.saveAiReview({
          eventId,
          recommendation,
          warnings: savedData,
        });

        return saved;
      } else {
        throw new Error('Could not parse valid JSON from AI output');
      }
    } catch (aiErr) {
      logger.warn(`[AiReview] Ollama failed or offline (${aiErr.message}), falling back to heuristic rule checks.`);

      // Heuristic fallback
      warnings = [];
      const criticalViolations = [];
      const yellowWarnings = [];
      let compliantChecks = [];
      const suggestions = [];

      // 1. Kiểm tra Giấy phép tổ chức (Permits)
      if (permitFiles.length === 0) {
        criticalViolations.push({
          policy_code: 'TERMS_ORGANIZER',
          issue: 'Sự kiện thiếu Giấy phép tổ chức sự kiện hoặc tài liệu pháp lý đính kèm. Theo quy định EventHub, sự kiện thiếu giấy tờ pháp lý sẽ KHÔNG được phê duyệt.',
          highlighted_text: 'Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM',
        });
      } else {
        let hasInvalidFormat = false;
        permitFiles.forEach((file, idx) => {
          const fileUrl = typeof file === 'string' ? file : file?.file_url || file?.url || file?.path || '';
          const fileName = file?.file_name || file?.name || `Tài liệu ${idx + 1}`;
          const isPdf = fileUrl.toLowerCase().includes('.pdf') || (typeof file === 'object' && file?.type?.includes('pdf'));
          if (!isPdf) {
            hasInvalidFormat = true;
            criticalViolations.push({
              policy_code: 'TERMS_ORGANIZER',
              issue: `Tệp tài liệu "${fileName}" không đúng định dạng PDF (.pdf). Theo quy định, giấy phép và hồ sơ pháp lý bắt buộc phải được chuyển đổi và tải lên ở định dạng PDF (.pdf) mới được xét duyệt.`,
              highlighted_text: `Tên tệp: ${fileName}`,
            });
          }
        });
        if (!hasInvalidFormat) {
          compliantChecks.push(`Đã đính kèm giấy phép tổ chức / tài liệu pháp lý định dạng PDF hợp lệ (${permitFiles.length} tài liệu)`);
        }
      }

      // 2. Kiểm tra hình ảnh
      if (!hasThumbnail) {
        yellowWarnings.push({
          policy_code: 'IMAGE_POLICY',
          issue: 'Sự kiện chưa có ảnh đại diện chính (Main Poster). Vui lòng tải lên ảnh đại diện để sự kiện hiển thị trực quan.',
          highlighted_text: 'Ảnh đại diện chính (Thumbnail): CHƯA CÓ',
        });
      }
      if (!hasBanner) {
        yellowWarnings.push({
          policy_code: 'IMAGE_POLICY',
          issue: 'Sự kiện chưa có ảnh bìa (Cover Banner). Cần bổ sung ảnh bìa để trang sự kiện được đẹp mắt và chuyên nghiệp hơn.',
          highlighted_text: 'Ảnh bìa (Cover Banner): CHƯA CÓ',
        });
      }
      if (!hasDescImages) {
        suggestions.push('Gợi ý bổ sung thêm hình ảnh minh họa bên trong phần mô tả chi tiết để người xem dễ hình dung và tăng tính hấp dẫn cho sự kiện.');
      }

      // 3. Kiểm tra thông tin cơ bản
      if (!event.title || event.title.trim().length < 5) {
        yellowWarnings.push({ policy_code: 'TICKET_POLICY', issue: 'Tiêu đề sự kiện quá ngắn hoặc chưa có (tối thiểu 5 ký tự).' });
      }
      if (!event.short_description) {
        yellowWarnings.push({ policy_code: 'TICKET_POLICY', issue: 'Sự kiện chưa có phần mô tả ngắn tóm tắt.' });
      }
      if (!event.description || event.description.trim().length < 30) {
        yellowWarnings.push({ policy_code: 'TICKET_POLICY', issue: 'Nội dung mô tả chi tiết sự kiện quá ngắn (dưới 30 ký tự).' });
      }

      // 4. Kiểm tra Lịch các phiên (Sessions & Timing Logic)
      if (sessionList.length === 0) {
        yellowWarnings.push({ policy_code: 'TICKET_POLICY', issue: 'Sự kiện chưa thiết lập lịch trình các phiên diễn ra (Sessions).' });
      } else {
        let hasSessionTimingError = false;
        sessionList.forEach((s, idx) => {
          if (s.start_time && s.end_time) {
            const sStart = new Date(s.start_time).getTime();
            const sEnd = new Date(s.end_time).getTime();
            if (sEnd <= sStart) {
              hasSessionTimingError = true;
              criticalViolations.push({
                policy_code: 'TICKET_POLICY',
                issue: `Phiên ${idx + 1} "${s.session_name || 'Phiên'}" có thời gian kết thúc trước hoặc trùng thời gian bắt đầu (${s.start_time} - ${s.end_time}).`,
              });
            }
          }
        });
        if (!hasSessionTimingError) {
          compliantChecks.push(`Lịch trình ${sessionList.length} phiên sự kiện được sắp xếp logic, thời gian bắt đầu và kết thúc hợp lý`);
        }
      }

      // 5. Kiểm tra Cơ cấu loại vé (Ticket Types & Pricing)
      if (ticketList.length === 0) {
        yellowWarnings.push({ policy_code: 'TICKET_POLICY', issue: 'Sự kiện chưa có hạng vé nào được mở bán.' });
      } else {
        let hasTicketError = false;
        ticketList.forEach((t) => {
          if (Number(t.price) < 0) {
            hasTicketError = true;
            criticalViolations.push({
              policy_code: 'TICKET_POLICY',
              issue: `Hạng vé "${t.name}" có mức giá không hợp lệ (giá âm: ${t.price} VNĐ).`,
            });
          }
          if (Number(t.quantity) <= 0) {
            yellowWarnings.push({
              policy_code: 'TICKET_POLICY',
              issue: `Hạng vé "${t.name}" có số lượng vé bằng 0.`,
            });
          }
        });
        if (!hasTicketError) {
          compliantChecks.push(`Cơ cấu loại vé (${ticketList.length} loại vé) minh bạch về giá bán và số lượng`);
        }
      }

      // 6. Kiểm tra thời gian tổng thể
      if (event.start_time && event.end_time) {
        const start = new Date(event.start_time).getTime();
        const end = new Date(event.end_time).getTime();
        if (end <= start) {
          criticalViolations.push({ policy_code: 'TICKET_POLICY', issue: 'Thời gian kết thúc tổng thể sự kiện phải diễn ra sau thời gian bắt đầu.' });
        }
        if (start < Date.now() - 24 * 3600 * 1000) {
          criticalViolations.push({ policy_code: 'TICKET_POLICY', issue: 'Thời gian bắt đầu sự kiện nằm trong quá khứ.' });
        }
      }

      // 7. Kiểm tra từ khóa cấm / gian lận
      const textContent = `${event.title || ''} ${event.short_description || ''} ${cleanDescription}`.toLowerCase();
      const sensitiveWords = ['lừa đảo', 'cờ bạc', 'bạo lực', 'vũ khí', 'hàng cấm', 'chuyển khoản stk', 'crypto x100', 'bao lỗ 100%'];
      sensitiveWords.forEach((word) => {
        if (textContent.includes(word)) {
          criticalViolations.push({ policy_code: 'TERMS_ORGANIZER', issue: `Phát hiện nội dung có nguy cơ vi phạm chính sách / từ khóa cấm: "${word}".` });
        }
      });

      // Xây dựng fallback image_review có kiểm duyệt an toàn từ kết quả AI Vision đã quét ở Stage 1 (nếu có)
      const fallbackImageReview = imageAnalysisResults.length > 0
        ? buildValidatedImageReview(imageAnalysisResults)
        : null;

      // Sanitize compliant checks để triệt tiêu mọi mâu thuẫn (CHỈ khen ảnh khi AI Vision thực sự quét và xác nhận đạt chuẩn)
      compliantChecks = sanitizeCompliantChecks({
        compliantChecks,
        criticalViolations,
        yellowWarnings,
        permitFiles,
        hasThumbnail,
        hasBanner,
        hasDescImages,
        imageReview: fallbackImageReview,
      });

      if (criticalViolations.length > 0) {
        recommendation = 'REJECT';
      } else if (yellowWarnings.length > 0) {
        recommendation = 'NEEDS_REVIEW';
      } else {
        recommendation = 'APPROVE';
        compliantChecks.push('Không phát hiện từ khóa vi phạm hoặc gian lận thanh toán');
      }

      const rawSavedData = {
        summary: recommendation === 'APPROVE'
          ? 'Sự kiện đáp ứng đầy đủ giấy phép, lịch trình phiên logic, cơ cấu vé minh bạch và tuân thủ các chính sách EventHub.'
          : criticalViolations.length > 0
            ? 'Phát hiện vi phạm chính sách nghiêm trọng (thiếu giấy phép hoặc sai lệch thông tin cốt lõi).'
            : 'Sự kiện cần bổ sung thêm một số thông tin trước khi duyệt mở bán.',
        risk_score: recommendation === 'REJECT' ? 85 : recommendation === 'NEEDS_REVIEW' ? 40 : 5,
        quality_score: recommendation === 'APPROVE' ? 95 : 65,
        compliant_checks: compliantChecks,
        critical_violations: criticalViolations,
        warnings: yellowWarnings,
        suggestions: criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
        flat_warnings: warnings,
        content_review: null,
        image_review: fallbackImageReview,
        vision_analysis: imageAnalysisResults.length > 0 ? imageAnalysisResults.map((r) => ({
          source: r.source,
          fileName: r.fileName || '',
          description: cleanAiOutputText(r.description || ''),
        })) : null,
      };

      const savedData = cleanAiOutputObject(rawSavedData);

      const saved = await eventsAdminRepository.saveAiReview({
        eventId,
        recommendation,
        warnings: savedData,
      });

      return saved;
    }
  }

  async getAutoReviewSettings() {
    const settings = await systemSettingsRepository.getAutoReviewSettings();
    const stats = await systemSettingsRepository.getAutoReviewStats();
    return {
      settings,
      stats,
    };
  }

  async updateAutoReviewSettings(adminId, payload) {
    const updated = await systemSettingsRepository.saveAutoReviewSettings(payload, adminId);
    const stats = await systemSettingsRepository.getAutoReviewStats();
    return {
      settings: updated,
      stats,
    };
  }

  async processAutoReviewForEvent(eventId) {
    const settings = await systemSettingsRepository.getAutoReviewSettings();
    if (!settings.auto_review_enabled) {
      logger.info(`[AutoReview] Skipped for event ${eventId}: Auto-review is disabled in system settings.`);
      return { skipped: true, reason: 'AUTO_REVIEW_DISABLED' };
    }

    try {
      logger.info(`[AutoReview] Triggering AI evaluation pipeline for event ${eventId}...`);
      const aiResult = await this.runAiReview(eventId);

      const event = await eventsAdminRepository.findByIdForAdmin(eventId);
      if (!event || event.status !== 'PENDING_REVIEW') {
        logger.info(`[AutoReview] Event ${eventId} is not in PENDING_REVIEW status (${event?.status}). Skipped status transition.`);
        return { eventId, skipped: true, reason: 'NOT_PENDING_REVIEW', aiResult };
      }

      const recommendation = aiResult?.recommendation || 'NEEDS_REVIEW';
      const rawWarnings = aiResult?.warnings || {};
      const qualityScore = typeof rawWarnings.quality_score === 'number' ? rawWarnings.quality_score : 80;
      const riskScore = typeof rawWarnings.risk_score === 'number' ? rawWarnings.risk_score : 10;
      const criticalViolations = Array.isArray(rawWarnings.critical_violations) ? rawWarnings.critical_violations : [];
      const yellowWarnings = Array.isArray(rawWarnings.warnings) ? rawWarnings.warnings : [];
      const suggestions = Array.isArray(rawWarnings.suggestions) ? rawWarnings.suggestions : [];
      const spellingIssues = Array.isArray(rawWarnings.content_review?.spelling_grammar_issues) ? rawWarnings.content_review.spelling_grammar_issues : [];

      let finalAction = 'NEEDS_REVIEW';
      let reviewNote = '';

      if (
        settings.auto_approve_enabled &&
        recommendation === 'APPROVE' &&
        criticalViolations.length === 0 &&
        qualityScore >= (settings.min_quality_score || 75) &&
        riskScore <= (settings.max_risk_score || 25)
      ) {
        finalAction = 'APPROVED';
        reviewNote = `[TỰ ĐỘNG DUYỆT BỞI AI] ${rawWarnings.summary || 'Sự kiện đáp ứng đầy đủ tiêu chuẩn kiểm duyệt của EventHub.'}`;
      } else if (
        settings.auto_reject_enabled &&
        (recommendation === 'REJECT' || criticalViolations.length > 0 || riskScore >= 70)
      ) {
        finalAction = 'REJECTED';
        reviewNote = `[TỰ ĐỘNG TỪ CHỐI BỞI AI] ${rawWarnings.summary || 'Sự kiện chưa đạt yêu cầu kiểm duyệt hoặc vi phạm chính sách nền tảng.'}`;
      }

      if (finalAction === 'APPROVED' || finalAction === 'REJECTED') {
        const updated = await eventsAdminRepository.reviewEvent({
          eventId,
          reviewedBy: null, // Auto AI
          status: finalAction,
          reviewNote,
        });

        if (settings.auto_notify_organizer) {
          this._notifyAutoReview({
            organizerUserId: event.organizer_user_id,
            organizerEmail:  event.organizer_business_email || event.organizer_user_email,
            eventId:         event.id,
            eventTitle:      event.title,
            status:          finalAction,
            reviewNote,
            criticalViolations,
            warnings:        yellowWarnings,
            suggestions,
            spellingIssues,
          }).catch((err) => logger.warn(`[processAutoReviewForEvent] notification failed: ${err.message}`));
        }

        logger.info(`[AutoReview] Event ${eventId} automatically transitioned to ${finalAction}`);
        return { eventId, action: finalAction, event: updated, aiResult };
      }

      logger.info(`[AutoReview] Event ${eventId} evaluated as NEEDS_REVIEW (requires manual admin review)`);
      return { eventId, action: 'NEEDS_REVIEW', event, aiResult };
    } catch (err) {
      logger.error(`[AutoReview] Error processing auto-review for event ${eventId}: ${err.message}`);
      return { eventId, error: err.message };
    }
  }

  async runBatchAutoReview(adminId) {
    const pendingEvents = await systemSettingsRepository.getPendingEventIds();
    const results = [];
    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let errorCount = 0;

    for (const pending of pendingEvents) {
      try {
        const res = await this.processAutoReviewForEvent(pending.id);
        if (res.action === 'APPROVED') approvedCount++;
        else if (res.action === 'REJECTED') rejectedCount++;
        else if (res.action === 'NEEDS_REVIEW') pendingCount++;
        else if (res.error) errorCount++;
        results.push(res);
      } catch (e) {
        errorCount++;
        results.push({ eventId: pending.id, error: e.message });
      }
    }

    const stats = await systemSettingsRepository.getAutoReviewStats();
    return {
      total_processed: pendingEvents.length,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      needs_review_count: pendingCount,
      error_count: errorCount,
      results,
      stats,
    };
  }

  async _notifyAutoReview({
    organizerUserId,
    organizerEmail,
    eventId,
    eventTitle,
    status,
    reviewNote,
    criticalViolations = [],
    warnings = [],
    suggestions = [],
    spellingIssues = [],
  }) {
    if (!organizerUserId) return;

    const isApproved = status === 'APPROVED';
    const title = isApproved
      ? `[Hệ thống AI] Sự kiện "${eventTitle}" đã được tự động phê duyệt`
      : `[Hệ thống AI] Sự kiện "${eventTitle}" chưa đạt yêu cầu kiểm duyệt`;

    let content = isApproved
      ? `Chúc mừng bạn! Sự kiện "${eventTitle}" đã vượt qua quá trình thẩm định tự động của Hệ thống AI và được phê duyệt. Bạn có thể xuất bản sự kiện bất cứ lúc nào từ trang quản lý sự kiện.`
      : `Sự kiện "${eventTitle}" của bạn chưa đạt yêu cầu kiểm duyệt tự động từ Hệ thống AI và đã bị từ chối.`;

    if (reviewNote) {
      content += `\n\n📌 Đánh giá tổng quan: ${reviewNote.replace('[TỰ ĐỘNG DUYỆT BỞI AI] ', '').replace('[TỰ ĐỘNG TỪ CHỐI BỞI AI] ', '')}`;
    }

    if (criticalViolations.length > 0) {
      content += '\n\n❌ Các vi phạm cần khắc phục:';
      criticalViolations.forEach((v, idx) => {
        content += `\n  ${idx + 1}. [${v.policy_code || 'QUY ĐỊNH'}] ${v.issue}`;
        if (v.highlighted_text) content += ` (Trích dẫn: "${v.highlighted_text}")`;
      });
    }

    if (warnings.length > 0) {
      content += '\n\n⚠️ Cảnh báo & Lưu ý:';
      warnings.forEach((w, idx) => {
        content += `\n  ${idx + 1}. ${w.issue}`;
      });
    }

    if (spellingIssues.length > 0) {
      content += '\n\n📝 Gợi ý sửa lỗi chính tả & câu chữ:';
      spellingIssues.forEach((s, idx) => {
        content += `\n  ${idx + 1}. ${s}`;
      });
    }

    if (suggestions.length > 0) {
      content += '\n\n💡 Đề xuất cải thiện từ AI:';
      suggestions.forEach((sg, idx) => {
        content += `\n  - ${sg}`;
      });
    }

    if (!isApproved) {
      content += '\n\nVui lòng điều chỉnh lại thông tin, bổ sung giấy phép/hình ảnh phù hợp và gửi lại yêu cầu duyệt để được hỗ trợ.';
    }

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }
}

module.exports = new EventsAdminService();


