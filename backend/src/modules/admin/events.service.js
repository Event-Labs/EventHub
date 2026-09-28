const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const eventsAdminRepository = require('./events.repository');
const notificationsService = require('../notifications/notifications.service');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const { collectAllEventImages, fetchImageAsBase64, extractImagesFromHtml } = require('../../common/utils/htmlImageParser.util');

const REVIEWABLE_STATUSES  = new Set(['PENDING_REVIEW']);
const HIDEABLE_STATUSES    = new Set(['PUBLISHED', 'COMPLETED']);
const UNHIDEABLE_STATUSES  = new Set(['HIDDEN']);

const AI_REVIEW_SYSTEM_PROMPT = `Bạn là Chuyên gia Kiểm duyệt & Đánh giá Toàn diện Sự kiện EventHub.
Nhiệm vụ của bạn là kiểm tra, soát lỗi và đánh giá sự kiện KHÁCH QUAN, CHUẨN XÁC, trả về JSON thuần túy theo cấu trúc:
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
        "analysis": "<Đánh giá nội dung và OCR trên ảnh>",
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
}

QUY TẮC CỐT LÕI (BẮT BUỘC):
1. GIẤY PHÉP: Nếu mục Giấy phép là 'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM' -> BẮT BUỘC xếp vào critical_violations (TERMS_ORGANIZER) và TUYỆT ĐỐI KHÔNG khen giấy phép trong compliant_checks.
2. HÌNH ẢNH: Đọc kỹ kết quả AI VISION cho từng ảnh. Chỉ đánh giá 'VALID' khi ảnh đã quét và nội dung an toàn (không khiêu dâm/18+, bạo lực, cờ bạc, lừa đảo). Nếu ảnh chưa có hoặc có vấn đề -> báo warning/violation, TUYỆT ĐỐI KHÔNG đưa vào compliant_checks.
3. CHÍNH TẢ & VĂN BẢN: Soát kỹ từng từ trong Tiêu đề và Mô tả để chỉ ra các từ sai chính tả tiếng Việt.
4. ĐỊNH DẠNG: TUYỆT ĐỐI KHÔNG chèn link URL ảnh vào bất kỳ trường text nào. Trả lời súc tích, ngắn gọn, đi thẳng vào trọng tâm.`;

/**
 * Đánh giá an toàn và tính hợp lệ của ảnh từ mô tả Vision AI.
 * Đảm bảo: Không phải cứ có ảnh là đạt chuẩn. Chỉ khi AI quét xác nhận nội dung không vi phạm mới là VALID.
 */
function assessImageSafety(description) {
  const desc = String(description || '').toLowerCase();

  if (!desc || desc.length < 15 || desc.includes('không thể tải') || desc.includes('failed to load') || desc.includes('error')) {
    return {
      status: 'WARNING',
      issues: ['Không thể tải hoặc chưa quét được đầy đủ nội dung ảnh qua AI Vision.'],
      suggestion: 'Vui lòng kiểm tra lại đường dẫn và định dạng hình ảnh.',
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
    const safety = assessImageSafety(img.description);

    let status = safety.status;
    let issues = [...safety.issues];
    let suggestion = safety.suggestion;
    let analysis = cleanAiOutputText(img.description || 'Đã kiểm duyệt hình ảnh và OCR bằng AI Vision.');

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
      ? `${permitFiles.length} tài liệu đính kèm (${permitFiles.map((f) => f.file_name || f.name || 'Giấy phép').join(', ')})`
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
Giấy phép / Tài liệu đính kèm: ${permitSummary}
Lịch trình (Sessions): ${sessionSummary}
Cơ cấu vé (Tickets): ${ticketSummary}
Chính sách hoàn tiền sự kiện: ${refundSummary}

YÊU CẦU ĐÁNH GIÁ ĐA CHIỀU CHO AI:
1. SOÁT LỖI CHÍNH TẢ & VĂN BẢN (Title & Description):
   - Soát kỹ từng từ trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết để phát hiện lỗi chính tả tiếng Việt (gõ sai dấu, sai telex, từ viết sai).
   - Liệt kê các từ sai chính tả vào "spelling_grammar_issues" cùng với gợi ý từ đúng.
   - Đánh giá tiêu đề có bị giật tít, lừa đảo, hứa hẹn phi lý không.
   - Đánh giá mô tả có đầy đủ thông tin thiết yếu và cấu trúc dễ đọc không.
2. DUYỆT TẤT CẢ HÌNH ẢNH (Image & OCR Review):
   - Đọc kết quả từ AI VISION cho TỪNG ẢNH bên dưới.
   - Đánh giá mức độ phù hợp với nội dung sự kiện, phát hiện ảnh vi phạm (bạo lực, 18+, cờ bạc, lừa đảo).
   - Đọc chữ/OCR trên ảnh: phát hiện lỗi chính tả trên ảnh, mâu thuẫn ngày giờ/địa điểm trên ảnh so với bài đăng.
   - Đề xuất cải thiện cho từng ảnh trong "image_review.items".
   - Lưu ý: Ảnh Poster & Banner là bắt buộc; Ảnh trong mô tả là tùy chọn (nếu chưa có thì gợi ý bổ sung trong suggestions).
3. KIỂM TRA GIẤY PHÉP, LỊCH TRÌNH, VÉ & HOÀN TIỀN:
   - NẾU "KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM" -> BẮT BUỘC đưa vào critical_violations và TUYỆT ĐỐI KHÔNG khen giấy phép trong compliant_checks.
   - Kiểm tra logic giờ các phiên và tính minh bạch của cơ cấu vé.
4. ĐỀ XUẤT CẢI THIỆN:
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
      // STAGE 1: Vision Analysis — Dùng model moondream để "đọc" ảnh
      // ============================================================
      if (imageSources.length > 0) {
        logger.info(`[AiReview] Bắt đầu phân tích ${imageSources.length} ảnh bằng vision model '${ollamaClient.OLLAMA_VISION_MODEL}'...`);

        // Download images as Base64
        const imagesWithBase64 = [];
        for (const item of imageSources) {
          const b64 = await fetchImageAsBase64(item.url, 8000);
          if (b64) {
            imagesWithBase64.push({
              source: item.source,
              url: item.url,
              fileName: item.fileName,
              base64: b64,
            });
          } else {
            logger.warn(`[AiReview] Không thể tải ảnh [${item.source}]: ${item.url.slice(0, 80)}`);
            imageAnalysisResults.push({
              source: item.source,
              url: item.url || '',
              fileName: item.fileName || '',
              description: 'KHÔNG THỂ TẢI ẢNH — URL không truy cập được hoặc đã hết hạn.',
            });
          }
        }

        // Call vision model for each image
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
          // Truncate each description to 350 chars to avoid context overflow
          const desc = (r.description || '').slice(0, 350);
          return `[${sourceLabel}]:\n${desc}`;
        }).join('\n\n');

        // Cap total vision summary to avoid token overflow (model context = 4096)
        if (visionAnalysisSummary.length > 1800) {
          visionAnalysisSummary = visionAnalysisSummary.slice(0, 1800) + '\n... (đã rút gọn)';
        }

        logger.info(`[AiReview] Phân tích hình ảnh hoàn tất. ${imageAnalysisResults.length} ảnh đã được mô tả.`);
      }

      // ============================================================
      // STAGE 2: Text Review — Gửi mô tả ảnh + thông tin sự kiện cho text model
      // ============================================================
      const imageSection = visionAnalysisSummary
        ? `\n\n=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH TỪ AI VISION ===\n${visionAnalysisSummary}\n=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ===`
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

        // 1. Đảm bảo không bỏ sót vi phạm giấy phép nếu DB không có permit
        if (permitFiles.length === 0 && !criticalViolations.some((v) => /giấy phép|pháp lý|permit/i.test(v.issue))) {
          criticalViolations.unshift({
            policy_code: 'TERMS_ORGANIZER',
            issue: 'Sự kiện thiếu Giấy phép tổ chức / tài liệu pháp lý đính kèm bắt buộc.',
            highlighted_text: 'Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM',
          });
          recommendation = 'REJECT';
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
        compliantChecks.push(`Đã đính kèm giấy phép tổ chức / tài liệu pháp lý hợp lệ (${permitFiles.length} tài liệu)`);
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

}

module.exports = new EventsAdminService();


