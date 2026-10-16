const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const eventsAdminRepository = require('./events.repository');
const systemSettingsRepository = require('./systemSettings.repository');
const reviewCriteriaRepository = require('./reviewCriteria.repository');
const notificationsService = require('../notifications/notifications.service');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const { collectAllEventImages, fetchImageAsBase64, extractImagesFromHtml, fetchDocumentContent } = require('../../common/utils/htmlImageParser.util');

const REVIEWABLE_STATUSES  = new Set(['PENDING_REVIEW']);
const HIDEABLE_STATUSES    = new Set(['PUBLISHED', 'COMPLETED']);
const UNHIDEABLE_STATUSES  = new Set(['HIDDEN']);

// Trạng thái tiến trình quét duyệt AI đơn lẻ hiện tại
let currentScanState = {
  isRunning: false,
  eventId: null,
  eventTitle: null,
  startedAt: null,
  scanMode: null, // 'MANUAL' | 'SCHEDULED'
  triggeredBy: null,
  abortController: null,
  isCancelled: false,
};

function buildAiReviewSystemPrompt(activeCriteria = []) {
  let criteriaSection = '';
  if (Array.isArray(activeCriteria) && activeCriteria.length > 0) {
    criteriaSection = activeCriteria.map((c, idx) => {
      const severityText = c.severity === 'CRITICAL'
        ? 'BẮT BUỘC / QUAN TRỌNG NHẤT (Nếu vi phạm -> BẮT BUỘC xếp vào "critical_violations" và BẮT BUỘC REJECT)'
        : c.severity === 'WARNING'
          ? 'CẢNH BÁO / LƯU Ý (Xếp vào "warnings", trừ điểm chất lượng, đề xuất NEEDS_REVIEW nếu cần điều chỉnh)'
          : 'KHUYẾN NGHỊ / GỢI Ý (Xếp vào "suggestions" để BTC hoàn thiện)';
      return `${idx + 1}. [${c.code}] ${c.title} — (${severityText}):\n   ${c.rule_content.split('\n').join('\n   ')}`;
    }).join('\n\n');
  } else {
    criteriaSection = `1. [TERMS_ORGANIZER] ĐIỀU KHOẢN TỔ CHỨC (CRITICAL): Cấm lừa đảo tài chính, cấm cam kết x100 lợi nhuận/bao lỗ, cấm Ponzi, cấm cờ bạc/tài xỉu/nội dung độc hại.
2. [PAYMENT_POLICY] KÊNH THANH TOÁN (CRITICAL): Mọi giao dịch qua EventHub. Nghiêm cấm kêu gọi chuyển khoản STK cá nhân, né phí sàn qua Zalo/Telegram.
3. [REFUND_POLICY] CHÍNH SÁCH HOÀN TIỀN (CRITICAL): Đảm bảo quyền lợi người mua khi hoãn/hủy sự kiện. Nghiêm cấm quy định "hủy sự kiện vẫn không hoàn tiền dưới mọi lý do".
4. [TICKET_POLICY] CHÍNH SÁCH VÉ & ĐỊA ĐIỂM (WARNING): Giá vé minh bạch, quyền lợi rõ ràng. Địa chỉ sự kiện cụ thể, không giấu địa chỉ.
5. [SESSION_SCHEDULE] LỊCH TRÌNH CÁC PHIÊN (CRITICAL): Thời gian không nằm trong quá khứ, giờ kết thúc phải sau giờ bắt đầu.
6. [IMAGE_POLICY] KIỂM DUYỆT HÌNH ẢNH (CRITICAL): Poster & Banner rõ nét, phù hợp ngữ cảnh. Cấm 18+ khiêu dâm đồi trụy, bạo lực máu me.
7. [CONTENT_SPELLING] SOÁT LỖI CHÍNH TẢ & VĂN BẢN (INFO/WARNING): Soát lỗi dấu/telex tiếng Việt. Tiêu đề không giật tít lừa đảo, mô tả mạch lạc.
8. [VALUABLE_SUGGESTIONS] GỢI Ý CẢI THIỆN CÓ GIÁ TRỊ (INFO): Gợi ý hotline, check-in, phân đoạn nội dung. Không spam gợi ý chỉnh kích thước ảnh.`;
  }

  return `Bạn là Chuyên gia Kiểm duyệt & Thẩm định Toàn diện Sự kiện của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, đối chiếu thông tin và đánh giá sự kiện KHÁCH QUAN, CHUẨN XÁC, CÔNG BẰNG dựa trên BỘ ĐIỀU KHOẢN VÀ TIÊU CHÍ HIỆN HÀNH DƯỚI ĐÂY.

BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN HIỆN HÀNH (${activeCriteria.length} điều khoản):
${criteriaSection}

NGUYÊN TẮC CỐT LÕI VỀ KIỂM DUYỆT & ĐIỀU KHOẢN BẮT BUỘC:
1. ĐIỀU KHOẢN BẮT BUỘC (CRITICAL MANDATORY):
   - BẤT KỲ SỰ KIỆN NÀO VI PHẠM DÙ CHỈ 1 ĐIỀU KHOẢN BẮT BUỘC -> BẮT BUỘC RA QUYẾT ĐỊNH "REJECT" (TUYỆT ĐỐI KHÔNG APPROVE / KHÔNG NEEDS_REVIEW).
   - Bao gồm: Lừa đảo tài chính/Ponzi/cam kết x100 lợi nhuận, cờ bạc/tài xỉu, 18+ khiêu dâm đồi trụy, chuyển khoản cá nhân ngoài sàn EventHub, tuyên bố hủy show không hoàn tiền, thời gian sự kiện trong quá khứ, treo đầu dê bán thịt chó.

2. LƯU Ý VỀ TỆP ĐÍNH KÈM (PDF):
   - Ràng buộc định dạng PDF đã được Backend kiểm tra và xác thực hợp lệ khi tải lên. Do đó AI KHÔNG CẦN quan tâm hay bắt lỗi về định dạng file PDF.
   - Nếu có tài liệu đính kèm: AI chỉ đọc nội dung để kiểm tra tính nhất quán, không chứa nội dung lừa đảo hay phi pháp.
   - Không tự ý từ chối (REJECT) chỉ vì sự kiện chưa đính kèm giấy phép nếu là sự kiện thông thường, hội thảo nhỏ, meetup nội bộ hợp lệ.

3. CƠ CHẾ TÍNH ĐIỂM CHUẨN XÁC & TRỪ ĐIỂM LINH HOẠT:
   - THANG ĐIỂM CHẤT LƯỢNG (quality_score: 0 -> 100, Khởi điểm 100 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Trừ -40 đến -50 điểm / lỗi. (Có lỗi bắt buộc thì quality_score tối đa chỉ còn 50).
     * Mỗi cảnh báo LƯU Ý (WARNING): Trừ -10 đến -20 điểm / lỗi (thiếu hotline, chưa rõ quyền lợi vé, mô tả sơ sài...).
     * Mỗi lỗi NHẸ / CHÍNH TẢ (INFO / SPELLING): Trừ -2 đến -5 điểm / lỗi (lỗi gõ telex, thiếu phân đoạn...).
     * Công thức: quality_score = Max(0, 100 - Tổng điểm trừ).
   - THANG ĐIỂM RỦI RO (risk_score: 0 -> 100, Khởi điểm 0 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Cộng +70 đến +90 điểm rủi ro (lập tức vào vùng đỏ nguy hiểm).
     * Mỗi cảnh báo LƯU Ý (WARNING): Cộng +15 đến +25 điểm rủi ro.
     * Mỗi lỗi nhẹ / chính tả: Cộng +2 đến +5 điểm rủi ro.
     * Công thức: risk_score = Min(100, Tổng điểm rủi ro).
   - QUYẾT ĐỊNH (decision):
     * "REJECT": Có ít nhất 1 lỗi CRITICAL HOẶC risk_score >= 65 HOẶC quality_score < 50.
     * "NEEDS_REVIEW": 0 lỗi CRITICAL, nhưng có từ 1-2 lỗi WARNING quan trọng (HOẶC risk_score từ 30 đến 64 HOẶC quality_score từ 50 đến 74).
     * "APPROVE": 100% tuân thủ các điều khoản bắt buộc, 0 lỗi CRITICAL, rủi ro thấp (risk_score < 30 và quality_score >= 75).

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON THUẦN TÚY):
Trả về DUY NHẤT 01 chuỗi JSON hợp lệ (KHÔNG dùng <think>, KHÔNG thêm text ngoài JSON) theo cấu trúc:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <0 đến 100, tính theo quy tắc cộng điểm rủi ro>,
  "quality_score": <0 đến 100, tính theo quy tắc trừ điểm>,
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
        "suggestion": "<Gợi ý cải thiện thiết thực>"
      }
    ]
  },
  "compliant_checks": ["<Tiêu chí thực sự đạt chuẩn>"],
  "critical_violations": [
    {"policy_code": "<Mã điều khoản vi phạm>", "issue": "<Mô tả lỗi vi phạm nghiêm trọng>", "highlighted_text": "<Trích dẫn>"}
  ],
  "warnings": [
    {"policy_code": "<Mã điều khoản lưu ý>", "issue": "<Mô tả điểm cần lưu ý>", "highlighted_text": "<Trích dẫn>"}
  ],
  "suggestions": ["<Lời khuyên cải thiện thực sự có giá trị cho BTC>"]
}`;
}

/**
 * Kiểm tra xem nội dung văn bản trích xuất từ tệp có thực sự là tài liệu vi phạm pháp luật / lừa đảo hay không.
 */
function inspectDocumentLegality(extractedText, fileName = '', event = {}) {
  const lowerText = String(extractedText || '').toLowerCase();
  const lowerName = String(fileName || '').toLowerCase();

  // Dấu hiệu nội dung vi phạm pháp luật / lừa đảo / độc hại / cấm trong tài liệu
  const severeViolationPatterns = [
    /\b(lừa đảo|lua dao|scam|ponzi|đa cấp biến tướng)\b/i,
    /\b(cờ bạc|co bac|tài xỉu|tai xiu|cá độ|betting|casino)\b/i,
    /\b(khiêu dâm|khieu dam|18\+|porn|đồi trụy|gái gọi)\b/i,
    /\b(vũ khí|vu khi|súng đạn|thuốc nổ|chất cấm|ma túy)\b/i,
    /\b(cam kết x100|lợi nhuận 30%|bao lỗ 100%|tiền ảo lậu)\b/i,
  ];

  const matchedSevere = severeViolationPatterns.filter((p) => p.test(lowerText) || p.test(lowerName));
  if (matchedSevere.length > 0) {
    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'Nội dung tài liệu vi phạm pháp luật / lừa đảo',
      reason: `Tài liệu đính kèm có dấu hiệu chứa nội dung vi phạm nghiêm trọng hoặc gian lận (${matchedSevere.join(', ')}).`,
    };
  }

  // Các tài liệu thông thường (giới thiệu, syllabus, đề cương, hợp đồng, giấy phép...) đều hợp lệ
  return {
    isValidLegalDocument: true,
    isSubstanceViolation: false,
  };
}

/**
 * Đánh giá an toàn và tính hợp lệ của ảnh / tài liệu từ mô tả Vision AI.
 */
function assessImageSafety(description, source = '') {
  const desc = String(description || '').toLowerCase();
  const isPermit = typeof source === 'string' && source.startsWith('PERMIT');

  if (!desc || desc.length < 15 || desc.includes('không thể tải') || desc.includes('failed to load') || desc.includes('error')) {
    return {
      status: 'WARNING',
      issues: [isPermit ? 'Chưa quét được đầy đủ nội dung tệp đính kèm qua AI Vision.' : 'Không thể tải hoặc chưa quét được đầy đủ nội dung ảnh qua AI Vision.'],
      suggestion: isPermit ? 'Vui lòng kiểm tra lại đường dẫn tệp đính kèm.' : 'Vui lòng kiểm tra lại đường dẫn và định dạng hình ảnh.',
    };
  }

  // Đánh giá riêng cho tài liệu đính kèm (Permits/Documents)
  if (isPermit) {
    if (
      desc.includes('lừa đảo') ||
      desc.includes('cờ bạc') ||
      desc.includes('khiêu dâm') ||
      desc.includes('vũ khí') ||
      desc.includes('vi phạm nghiêm trọng')
    ) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu đính kèm có dấu hiệu chứa nội dung vi phạm pháp luật hoặc lừa đảo gian lận.'],
        suggestion: 'Kiểm tra và thay thế tệp tài liệu tuân thủ quy chuẩn của nền tảng.',
      };
    }
    if (desc.includes('giả mạo') || desc.includes('fraudulent')) {
      return {
        status: 'WARNING',
        issues: ['Tài liệu đính kèm có dấu hiệu cần đối chiếu kỹ về tính xác thực.'],
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

  const isForeignOrGibberish = (str) => {
    if (!str || typeof str !== 'string') return true;
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(str)) return true;
    if (/(.)\1{4,}/.test(str) || /(.{2,8})\1{3,}/.test(str)) return true;
    return false;
  };

  const items = imageAnalysisResults.map((img) => {
    const aiItem = aiItems.find((it) => it.source === img.source);
    const safety = assessImageSafety(img.description, img.source);

    let status = safety.status;
    let issues = [...safety.issues];
    let suggestion = safety.suggestion;
    let analysis = cleanAiOutputText(img.description || (img.source.startsWith('PERMIT') ? 'Đã kiểm tra tài liệu giấy phép qua AI Vision.' : 'Đã kiểm duyệt hình ảnh và OCR bằng AI Vision.'));

    if (aiItem) {
      if (aiItem.analysis && aiItem.analysis.length > 10 && !isForeignOrGibberish(aiItem.analysis)) {
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

    // Bảo đảm analysis luôn sạch sẽ, chuẩn tiếng Việt và không bị rỗng sau khi lọc
    if (isForeignOrGibberish(analysis) || analysis.length < 15) {
      const sourceName = img.source === 'MAIN_POSTER'
        ? 'Ảnh đại diện chính (Poster)'
        : img.source === 'COVER_BANNER'
          ? 'Ảnh bìa (Cover Banner)'
          : img.source.startsWith('PERMIT')
            ? 'Tài liệu giấy phép'
            : 'Ảnh trong bài viết mô tả';
      analysis = `${sourceName} có bố cục trực quan rõ nét, chủ đề phù hợp và không chứa nội dung nhạy cảm hay vi phạm quy định.`;
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
    // Loại bỏ hoàn toàn ký tự tiếng Thái, Khmer, Lào, Myanmar, Devanagari bị lỗi rác nếu có
    .replace(/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/g, '')
    // Loại bỏ chuỗi ký tự thoái hóa lặp vô nghĩa (ví dụ "aaaaa" hoặc chuỗi subword lặp 3 lần trở lên)
    .replace(/(.)\1{4,}/g, '')
    .replace(/(.{2,8})\1{3,}/g, '')
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

  async runAiReview(eventId, options = {}) {
    const isDirectInvocation = !currentScanState.isRunning;
    let localAbortController = null;
    let effectiveSignal = options.signal;

    if (isDirectInvocation) {
      localAbortController = new AbortController();
      effectiveSignal = localAbortController.signal;
      currentScanState = {
        isRunning: true,
        eventId,
        eventTitle: null,
        startedAt: new Date().toISOString(),
        scanMode: 'DIRECT_REVIEW',
        abortController: localAbortController,
        isCancelled: false,
      };
    }

    const checkCancellation = () => {
      if (effectiveSignal?.aborted || currentScanState.isCancelled) {
        const cancelErr = new AppError('Tiến trình quét AI đã bị hủy theo yêu cầu của quản trị viên.', 499, 'SCAN_CANCELLED');
        cancelErr.name = 'AbortError';
        throw cancelErr;
      }
    };
    checkCancellation();

    try {
      const event = await eventsAdminRepository.findEventFullDetailForAi(eventId);
      if (!event) {
        throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
      }
      if (isDirectInvocation) {
        currentScanState.eventTitle = event.title;
      }

    let recommendation = 'APPROVE';
    let warnings = [];

    // Tải bộ điều khoản kiểm duyệt đang kích hoạt từ database
    const activeCriteria = await reviewCriteriaRepository.findActive();
    const activeCodes = new Set(activeCriteria.map((c) => c.code));

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

Hãy đối chiếu toàn bộ thông tin sự kiện và kết quả phân tích tài liệu/hình ảnh ở trên với Bộ tiêu chí kiểm duyệt EventHub trong System Prompt để thẩm định và xuất ra JSON đánh giá chính xác.`;
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
          checkCancellation();
          const isPermit = item.source && item.source.startsWith('PERMIT');

          if (isPermit) {
            const docResult = await fetchDocumentContent(item.url, { fileName: item.fileName, type: item.fileType }, 15000);
            if (docResult) {
              if (docResult.type === 'INVALID_FORMAT') {
                // Backend đã có kiểm tra định dạng; nếu tệp đính kèm là ảnh thì gửi qua vision để đọc
                const b64 = await fetchImageAsBase64(item.url, 8000);
                if (b64) {
                  imagesWithBase64.push({
                    source: item.source,
                    url: item.url,
                    fileName: item.fileName,
                    base64: b64,
                  });
                } else {
                  imageAnalysisResults.push({
                    source: item.source,
                    url: item.url || '',
                    fileName: item.fileName || '',
                    description: `[TÀI LIỆU ĐÍNH KÈM]: Đã ghi nhận tệp '${item.fileName || 'tài liệu'}'.`,
                  });
                }
                continue;
              } else if (docResult.type === 'DOWNLOAD_FAILED') {
                imageAnalysisResults.push({
                  source: item.source,
                  url: item.url || '',
                  fileName: item.fileName || '',
                  isDownloadFailed: true,
                  description: `[LƯU Ý TẢI TỆP]: Không thể tải tệp '${item.fileName || 'tài liệu'}' từ máy chủ lưu trữ (có thể link hết hạn tạm thời).`,
                });
                continue;
              } else if (docResult.type === 'PDF_DOCUMENT') {
                if (docResult.hasText) {
                  const cleanPreview = docResult.text.slice(0, 3500);
                  const legality = inspectDocumentLegality(cleanPreview, item.fileName, event);

                  if (legality.isSubstanceViolation) {
                    imageAnalysisResults.push({
                      source: item.source,
                      url: item.url || '',
                      fileName: item.fileName || '',
                      isSubstanceViolation: true,
                      detectedCategory: legality.category,
                      extractedText: cleanPreview,
                      description: `[VI PHẠM NỘI DUNG TÀI LIỆU]: Tệp '${item.fileName || 'Tài liệu'}' có dấu hiệu vi phạm: ${legality.reason}. Trích xuất: ${cleanPreview.slice(0, 300)}...`,
                    });
                  } else {
                    imageAnalysisResults.push({
                      source: item.source,
                      url: item.url || '',
                      fileName: item.fileName || '',
                      extractedText: cleanPreview,
                      description: `[NỘI DUNG TỆP ĐÍNH KÈM '${item.fileName || 'Tài liệu'}']:\n${cleanPreview}`,
                    });
                  }
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
                    description: `[THÔNG TIN TỆP ĐÍNH KÈM]: Tệp '${item.fileName || 'tài liệu'}' định dạng PDF dạng bản quét hoặc không chứa văn bản thuần.`,
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
          checkCancellation();
          const visionResults = await ollamaClient.describeImageBatch(
            imagesWithBase64,
            event.title || 'Sự kiện EventHub',
            effectiveSignal
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
          // Truncate non-permit image descriptions to 450 chars, but allow permit documents up to 2500 chars so legal details are fully evaluated
          const isPermit = r.source && r.source.startsWith('PERMIT');
          const maxLen = isPermit ? 2500 : 450;
          const desc = (r.description || '').slice(0, maxLen);
          return `[${sourceLabel}]:\n${desc}`;
        }).join('\n\n');

        // Cap total vision summary to avoid token overflow
        if (visionAnalysisSummary.length > 5500) {
          visionAnalysisSummary = visionAnalysisSummary.slice(0, 5500) + '\n... (đã rút gọn)';
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
      checkCancellation();
      const systemPrompt = buildAiReviewSystemPrompt(activeCriteria);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: eventPromptWithVision }
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.15,
        max_tokens: 900,
        num_ctx: 16384,
        signal: effectiveSignal,
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

        // 1. Kiểm tra tài liệu đính kèm (nếu có): Chỉ bắt lỗi khi nội dung là tài liệu spam/phi pháp lý
        imageAnalysisResults.forEach((imgRes) => {
          if (imgRes.source && imgRes.source.startsWith('PERMIT') && imgRes.isSubstanceViolation) {
            const issueMsg = `Tệp tài liệu "${imgRes.fileName || 'tài liệu'}" có dấu hiệu không liên quan đến sự kiện (phát hiện nội dung là ${imgRes.detectedCategory || 'tài liệu học tập/từ vựng/phi pháp lý'}).`;
            if (!criticalViolations.some((v) => v.issue.includes(imgRes.fileName || 'không liên quan'))) {
              criticalViolations.unshift({
                policy_code: activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER',
                issue: issueMsg,
                highlighted_text: `Tên tệp: ${imgRes.fileName || 'Tài liệu không phù hợp'}`,
              });
            }
          }
        });

        if (permitFiles.length > 0 && !imageAnalysisResults.some((r) => r.source?.startsWith('PERMIT') && r.isSubstanceViolation)) {
          compliantChecks.push(`Đã đính kèm ${permitFiles.length} tài liệu hợp lệ`);
        }

        // 2. Kiểm tra Poster chính (nếu IMAGE_POLICY đang kích hoạt)
        if (activeCodes.has('IMAGE_POLICY')) {
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

        // 5. RÀNG BUỘC CỐT LÕI: Vi phạm điều khoản BẮT BUỘC (CRITICAL) -> BẮT BUỘC REJECT (KHÔNG ĐƯỢC DUYỆT)
        if (criticalViolations.length > 0) {
          recommendation = 'REJECT';
        } else if (yellowWarnings.length > 0) {
          recommendation = 'NEEDS_REVIEW';
        } else {
          recommendation = 'APPROVE';
        }

        // 6. ĐÁNH GIÁ TRỪ ĐIỂM LINH HOẠT THEO MỨC ĐỘ NGHIÊM TRỌNG CỦA ĐIỀU KHOẢN VI PHẠM
        let calculatedQuality = 100;
        calculatedQuality -= (criticalViolations.length * 45); // Mỗi vi phạm bắt buộc trừ 45 điểm
        calculatedQuality -= (yellowWarnings.length * 15);     // Mỗi cảnh báo lưu ý trừ 15 điểm
        const spellingCount = Array.isArray(parsedJson.content_review?.spelling_grammar_issues)
          ? parsedJson.content_review.spelling_grammar_issues.length
          : 0;
        calculatedQuality -= Math.min(spellingCount * 3, 15);   // Lỗi chính tả nhỏ trừ 3 điểm/từ

        let calculatedRisk = 0;
        calculatedRisk += (criticalViolations.length * 80);    // Mỗi vi phạm bắt buộc cộng 80 điểm rủi ro
        calculatedRisk += (yellowWarnings.length * 20);        // Mỗi cảnh báo lưu ý cộng 20 điểm rủi ro
        calculatedRisk += Math.min(spellingCount * 2, 10);     // Lỗi chính tả cộng 2 điểm rủi ro

        let parsedQuality = parsedJson.quality_score !== undefined && !isNaN(Number(parsedJson.quality_score))
          ? Math.round(Number(parsedJson.quality_score))
          : calculatedQuality;
        let parsedRisk = parsedJson.risk_score !== undefined && !isNaN(Number(parsedJson.risk_score))
          ? Math.round(Number(parsedJson.risk_score))
          : calculatedRisk;

        // Điểm số linh hoạt: Đảm bảo có vi phạm thì trừ điểm chuẩn xác theo mức độ nghiêm trọng
        let finalQualityScore = Math.min(parsedQuality, calculatedQuality);
        let finalRiskScore = Math.max(parsedRisk, calculatedRisk);

        // ÉP RÀNG BUỘC THEO ĐIỀU KHOẢN BẮT BUỘC & ĐIỂM SỐ:
        if (criticalViolations.length > 0) {
          // BẮT BUỘC: Khi vi phạm điều khoản bắt buộc -> TUYỆT ĐỐI KHÔNG ĐƯỢC DUYỆT (REJECT)
          recommendation = 'REJECT';
          finalQualityScore = Math.min(finalQualityScore, 50);
          finalRiskScore = Math.max(finalRiskScore, 75);
        } else if (yellowWarnings.length > 0) {
          // Có cảnh báo lưu ý -> Cần Admin xem xét
          recommendation = (finalRiskScore >= 35 || finalQualityScore < 75 || yellowWarnings.length >= 2)
            ? 'NEEDS_REVIEW'
            : (parsedJson.decision === 'APPROVE' ? 'APPROVE' : 'NEEDS_REVIEW');
          finalQualityScore = Math.min(finalQualityScore, 85);
          finalRiskScore = Math.max(finalRiskScore, 15);
        } else {
          // Không có vi phạm bắt buộc, không có cảnh báo -> Phê duyệt (APPROVE)
          recommendation = 'APPROVE';
          finalQualityScore = Math.min(100, Math.max(75, finalQualityScore));
          finalRiskScore = Math.max(0, Math.min(25, finalRiskScore));
        }

        finalQualityScore = Math.max(0, Math.min(100, finalQualityScore));
        finalRiskScore = Math.max(0, Math.min(100, finalRiskScore));

        // 7. Ảnh trong mô tả: Nếu chưa có -> thêm vào gợi ý (suggestions)
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
          summary: parsedJson.summary || (recommendation === 'APPROVE' ? 'Sự kiện tuân thủ tốt các chính sách EventHub.' : (recommendation === 'REJECT' ? 'Sự kiện vi phạm điều khoản bắt buộc, không đủ điều kiện phê duyệt.' : 'Cần xem xét các lưu ý trước khi phê duyệt.')),
          risk_score: finalRiskScore,
          quality_score: finalQualityScore,
          compliant_checks: compliantChecks,
          critical_violations: criticalViolations,
          warnings: yellowWarnings,
          suggestions: suggestions.length > 0 ? suggestions : criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
          flat_warnings: warnings,
          content_review: parsedJson.content_review || null,
          image_review: finalImageReview,
          applied_criteria: activeCriteria.map((c) => ({
            code: c.code,
            title: c.title,
            category: c.category,
            severity: c.severity,
          })),
          vision_analysis: imageAnalysisResults.length > 0 ? imageAnalysisResults.map((r) => ({
            source: r.source,
            fileName: r.fileName || '',
            url: r.url || '',
            extractedText: r.extractedText || null,
            description: cleanAiOutputText(r.description || ''),
          })) : null,
        };

        checkCancellation();
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
      const isAborted = (
        aiErr.name === 'AbortError' ||
        aiErr.code === 'SCAN_CANCELLED' ||
        effectiveSignal?.aborted ||
        options.signal?.aborted ||
        currentScanState.isCancelled ||
        String(aiErr.message || '').toLowerCase().includes('abort') ||
        String(aiErr.message || '').toLowerCase().includes('cancel') ||
        String(aiErr.message || '').toLowerCase().includes('hủy')
      );
      if (isAborted) {
        logger.info(`[AiReview] Quét AI sự kiện ${eventId} bị ngắt/hủy ngay lập tức theo yêu cầu.`);
        const cancelErr = new AppError('Tiến trình quét AI đã bị dừng theo yêu cầu của quản trị viên.', 499, 'SCAN_CANCELLED');
        cancelErr.name = 'AbortError';
        cancelErr.code = 'SCAN_CANCELLED';
        throw cancelErr;
      }
      logger.warn(`[AiReview] Ollama failed or offline (${aiErr.message}), falling back to heuristic rule checks.`);

      // Heuristic fallback
      warnings = [];
      const criticalViolations = [];
      const yellowWarnings = [];
      let compliantChecks = [];
      const suggestions = [];

      // 1. Kiểm tra tài liệu đính kèm (nếu có)
      if (permitFiles.length > 0) {
        let hasPermitError = false;
        imageAnalysisResults.forEach((imgRes) => {
          if (imgRes.source?.startsWith('PERMIT') && imgRes.isSubstanceViolation) {
            hasPermitError = true;
            criticalViolations.push({
              policy_code: activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER',
              issue: `Tệp tài liệu "${imgRes.fileName || 'tài liệu'}" có dấu hiệu không liên quan đến sự kiện (phát hiện: ${imgRes.detectedCategory || 'tài liệu học tập/từ vựng/phi pháp lý'}).`,
              highlighted_text: `Tên tệp: ${imgRes.fileName || 'Tài liệu không phù hợp'}`,
            });
          }
        });

        if (!hasPermitError) {
          compliantChecks.push(`Đã đính kèm ${permitFiles.length} tài liệu hợp lệ`);
        }
      }

      // 2. Kiểm tra hình ảnh (nếu IMAGE_POLICY đang kích hoạt)
      if (activeCodes.has('IMAGE_POLICY')) {
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
      }

      // 3. Kiểm tra thông tin cơ bản & nội dung (nếu CONTENT_SPELLING đang kích hoạt)
      if (activeCodes.has('CONTENT_SPELLING')) {
        if (!event.title || event.title.trim().length < 5) {
          yellowWarnings.push({ policy_code: 'CONTENT_SPELLING', issue: 'Tiêu đề sự kiện quá ngắn hoặc chưa có (tối thiểu 5 ký tự).' });
        }
        if (!event.short_description) {
          yellowWarnings.push({ policy_code: 'CONTENT_SPELLING', issue: 'Sự kiện chưa có phần mô tả ngắn tóm tắt.' });
        }
        if (!event.description || event.description.trim().length < 30) {
          yellowWarnings.push({ policy_code: 'CONTENT_SPELLING', issue: 'Nội dung mô tả chi tiết sự kiện quá ngắn (dưới 30 ký tự).' });
        }
      }

      // 4. Kiểm tra Lịch các phiên (Sessions & Timing Logic) (nếu SESSION_SCHEDULE đang kích hoạt)
      if (activeCodes.has('SESSION_SCHEDULE')) {
        if (sessionList.length === 0) {
          yellowWarnings.push({ policy_code: 'SESSION_SCHEDULE', issue: 'Sự kiện chưa thiết lập lịch trình các phiên diễn ra (Sessions).' });
        } else {
          let hasSessionTimingError = false;
          sessionList.forEach((s, idx) => {
            if (s.start_time && s.end_time) {
              const sStart = new Date(s.start_time).getTime();
              const sEnd = new Date(s.end_time).getTime();
              if (sEnd <= sStart) {
                hasSessionTimingError = true;
                criticalViolations.push({
                  policy_code: 'SESSION_SCHEDULE',
                  issue: `Phiên ${idx + 1} "${s.session_name || 'Phiên'}" có thời gian kết thúc trước hoặc trùng thời gian bắt đầu (${s.start_time} - ${s.end_time}).`,
                });
              }
            }
          });
          if (!hasSessionTimingError) {
            compliantChecks.push(`Lịch trình ${sessionList.length} phiên sự kiện được sắp xếp logic, thời gian bắt đầu và kết thúc hợp lý`);
          }
        }
      }

      // 5. Kiểm tra Cơ cấu loại vé (Ticket Types & Pricing) (nếu TICKET_POLICY đang kích hoạt)
      if (activeCodes.has('TICKET_POLICY')) {
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
      }

      // 6. Kiểm tra thời gian tổng thể
      if (activeCodes.has('SESSION_SCHEDULE') && event.start_time && event.end_time) {
        const start = new Date(event.start_time).getTime();
        const end = new Date(event.end_time).getTime();
        if (end <= start) {
          criticalViolations.push({ policy_code: 'SESSION_SCHEDULE', issue: 'Thời gian kết thúc tổng thể sự kiện phải diễn ra sau thời gian bắt đầu.' });
        }
        if (start < Date.now() - 24 * 3600 * 1000) {
          criticalViolations.push({ policy_code: 'SESSION_SCHEDULE', issue: 'Thời gian bắt đầu sự kiện nằm trong quá khứ.' });
        }
      }

      // 7. Kiểm tra từ khóa cấm / gian lận (nếu PAYMENT_POLICY đang kích hoạt)
      if (activeCodes.has('PAYMENT_POLICY')) {
        const textContent = `${event.title || ''} ${event.short_description || ''} ${cleanDescription}`.toLowerCase();
        const sensitiveWords = ['lừa đảo', 'cờ bạc', 'bạo lực', 'vũ khí', 'hàng cấm', 'chuyển khoản stk', 'crypto x100', 'bao lỗ 100%'];
        sensitiveWords.forEach((word) => {
          if (textContent.includes(word)) {
            criticalViolations.push({ policy_code: 'PAYMENT_POLICY', issue: `Phát hiện nội dung có nguy cơ vi phạm chính sách / từ khóa cấm: "${word}".` });
          }
        });
      }

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

      // Tính điểm trừ linh hoạt trong fallback
      let calculatedQuality = 100;
      calculatedQuality -= (criticalViolations.length * 45);
      calculatedQuality -= (yellowWarnings.length * 15);
      let calculatedRisk = 0;
      calculatedRisk += (criticalViolations.length * 80);
      calculatedRisk += (yellowWarnings.length * 20);

      let finalQualityScore = Math.max(0, Math.min(100, calculatedQuality));
      let finalRiskScore = Math.max(0, Math.min(100, calculatedRisk));

      if (criticalViolations.length > 0) {
        recommendation = 'REJECT';
        finalQualityScore = Math.min(finalQualityScore, 50);
        finalRiskScore = Math.max(finalRiskScore, 75);
      } else if (yellowWarnings.length > 0) {
        recommendation = 'NEEDS_REVIEW';
        finalQualityScore = Math.min(finalQualityScore, 75);
        finalRiskScore = Math.max(finalRiskScore, 30);
      } else {
        recommendation = 'APPROVE';
        finalQualityScore = Math.max(75, finalQualityScore);
        finalRiskScore = Math.min(25, finalRiskScore);
        compliantChecks.push('Không phát hiện từ khóa vi phạm hoặc gian lận thanh toán');
      }

      const rawSavedData = {
        summary: recommendation === 'APPROVE'
          ? 'Sự kiện tuân thủ tốt các chính sách EventHub.'
          : criticalViolations.length > 0
            ? 'Phát hiện vi phạm điều khoản bắt buộc, không đủ điều kiện phê duyệt.'
            : 'Sự kiện cần bổ sung thêm một số thông tin trước khi duyệt mở bán.',
        risk_score: finalRiskScore,
        quality_score: finalQualityScore,
        compliant_checks: compliantChecks,
        critical_violations: criticalViolations,
        warnings: yellowWarnings,
        suggestions: criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
        flat_warnings: warnings,
        content_review: null,
        image_review: fallbackImageReview,
        applied_criteria: activeCriteria.map((c) => ({
          code: c.code,
          title: c.title,
          category: c.category,
          severity: c.severity,
        })),
        vision_analysis: imageAnalysisResults.length > 0 ? imageAnalysisResults.map((r) => ({
          source: r.source,
          fileName: r.fileName || '',
          description: cleanAiOutputText(r.description || ''),
        })) : null,
      };

      checkCancellation();
      const savedData = cleanAiOutputObject(rawSavedData);

      const saved = await eventsAdminRepository.saveAiReview({
        eventId,
        recommendation,
        warnings: savedData,
      });

      return saved;
    }
  } finally {
    if (isDirectInvocation) {
      currentScanState = {
        isRunning: false,
        eventId: null,
        eventTitle: null,
        startedAt: null,
        scanMode: null,
        triggeredBy: null,
        abortController: null,
        isCancelled: false,
      };
    }
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

  async processAutoReviewForEvent(eventId, { isManual = false, signal = null } = {}) {
    const settings = await systemSettingsRepository.getAutoReviewSettings();
    if (!isManual && !settings.auto_review_enabled) {
      logger.info(`[AutoReview] Skipped for event ${eventId}: Auto-review is disabled in system settings.`);
      return { skipped: true, reason: 'AUTO_REVIEW_DISABLED' };
    }

    try {
      logger.info(`[AutoReview] Triggering AI evaluation pipeline for event ${eventId}...`);
      const aiResult = await this.runAiReview(eventId, { signal });

      if (signal?.aborted || currentScanState.isCancelled) {
        return { eventId, cancelled: true, reason: 'CANCELLED_BY_USER' };
      }

      const event = await eventsAdminRepository.findByIdForAdmin(eventId);
      if (!event || event.status !== 'PENDING_REVIEW') {
        logger.info(`[AutoReview] Event ${eventId} is not in PENDING_REVIEW status (${event?.status}). Skipped status transition.`);
        return { eventId, skipped: true, reason: 'NOT_PENDING_REVIEW', aiResult };
      }

      // NẾU ADMIN KHÔNG BẬT TỰ ĐỘNG DUYỆT (auto_approve_enabled = false):
      // AI chỉ quét review trước cho admin và đưa ra kết quả, giữ nguyên trạng thái PENDING_REVIEW!
      if (!settings.auto_approve_enabled) {
        logger.info(`[AutoReview] Event ${eventId} ("${event.title}"): Auto-approve is disabled. Completed pre-review without status transition.`);
        return {
          eventId,
          eventTitle: event.title,
          action: 'PRE_REVIEWED',
          event,
          aiResult,
          message: `Đã hoàn tất quét review trước cho sự kiện "${event.title}". Kết quả thẩm định đã sẵn sàng cho Admin kiểm tra.`,
        };
      }

      // NẾU ADMIN BẬT TỰ ĐỘNG DUYỆT (auto_approve_enabled = true):
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
        return { eventId, eventTitle: event.title, action: finalAction, event: updated, aiResult };
      }

      logger.info(`[AutoReview] Event ${eventId} evaluated as NEEDS_REVIEW (requires manual admin review)`);
      return {
        eventId,
        eventTitle: event.title,
        action: 'NEEDS_REVIEW',
        event,
        aiResult,
        message: `Sự kiện "${event.title}" cần Admin xem xét thêm (Điểm chất lượng: ${qualityScore}, Điểm rủi ro: ${riskScore}).`,
      };
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || signal?.aborted) {
        return { eventId, cancelled: true, reason: 'CANCELLED_BY_USER' };
      }
      logger.error(`[AutoReview] Error processing auto-review for event ${eventId}: ${err.message}`);
      return { eventId, error: err.message };
    }
  }

  /**
   * Chạy quét duyệt duy nhất 01 sự kiện (Single Event Review)
   * Phù hợp với cả nút bấm thủ công và Trình lập lịch Scheduler định kỳ 15 phút.
   */
  async runSingleAutoReview(adminId = null, scanMode = 'MANUAL') {
    if (currentScanState.isRunning) {
      throw new AppError(
        `Đang có tiến trình quét AI sự kiện "${currentScanState.eventTitle || currentScanState.eventId}" đang chạy. Vui lòng chờ hoặc bấm Hủy tiến trình.`,
        409,
        ErrorCodes.RESOURCE_ALREADY_EXISTS,
      );
    }

    const settings = await systemSettingsRepository.getAutoReviewSettings();
    if (scanMode === 'SCHEDULED' && !settings.auto_review_enabled) {
      return { skipped: true, reason: 'AUTO_REVIEW_DISABLED' };
    }

    // Nếu không bật tự động duyệt: Chỉ tìm sự kiện CHƯA được review trước để không bị lặp vô tận cùng 1 sự kiện
    // Nếu bật tự động duyệt: Tìm sự kiện PENDING_REVIEW (ưu tiên chưa review trước) để duyệt
    const target = await systemSettingsRepository.getNextPendingEventForReview({
      onlyUnreviewed: !settings.auto_approve_enabled,
    });

    if (!target) {
      const stats = await systemSettingsRepository.getAutoReviewStats();
      return {
        processed: 0,
        message: !settings.auto_approve_enabled
          ? 'Tất cả sự kiện đang chờ duyệt đều đã được AI quét review trước. Không có sự kiện mới.'
          : 'Không có sự kiện nào đang chờ duyệt trong hệ thống.',
        stats,
      };
    }

    const abortController = new AbortController();
    currentScanState = {
      isRunning: true,
      eventId: target.id,
      eventTitle: target.title,
      startedAt: new Date().toISOString(),
      scanMode,
      triggeredBy: adminId,
      abortController,
      isCancelled: false,
    };

    try {
      const result = await this.processAutoReviewForEvent(target.id, {
        isManual: scanMode === 'MANUAL',
        signal: abortController.signal,
      });

      const stats = await systemSettingsRepository.getAutoReviewStats();

      if (result.cancelled) {
        return {
          processed: 0,
          cancelled: true,
          eventId: target.id,
          eventTitle: target.title,
          message: `Tiến trình quét cho sự kiện "${target.title}" đã được hủy theo yêu cầu.`,
          stats,
        };
      }

      return {
        processed: 1,
        eventId: target.id,
        eventTitle: target.title,
        action: result.action,
        result,
        stats,
      };
    } finally {
      currentScanState = {
        isRunning: false,
        eventId: null,
        eventTitle: null,
        startedAt: null,
        scanMode: null,
        triggeredBy: null,
        abortController: null,
        isCancelled: false,
      };
    }
  }

  getActiveScanStatus() {
    return {
      isRunning: currentScanState.isRunning,
      eventId: currentScanState.eventId,
      eventTitle: currentScanState.eventTitle,
      startedAt: currentScanState.startedAt,
      scanMode: currentScanState.scanMode,
    };
  }

  cancelActiveScan() {
    if (!currentScanState.isRunning) {
      return {
        success: false,
        message: 'Hiện tại không có tiến trình quét AI nào đang chạy.',
      };
    }

    currentScanState.isCancelled = true;
    if (currentScanState.abortController) {
      try {
        currentScanState.abortController.abort();
      } catch (err) {
        // ignore
      }
    }

    const cancelledTitle = currentScanState.eventTitle || currentScanState.eventId;
    logger.info(`[AutoReview] Yêu cầu hủy tiến trình quét AI sự kiện: "${cancelledTitle}".`);

    return {
      success: true,
      message: `Đã gửi lệnh hủy tiến trình quét sự kiện "${cancelledTitle}".`,
    };
  }

  async runBatchAutoReview(adminId) {
    // Luôn tuân thủ quy tắc: Mỗi lần chạy chỉ review đúng 1 sự kiện duy nhất
    return this.runSingleAutoReview(adminId, 'MANUAL');
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

  // ============================================================
  // AI REVIEW CRITERIA / POLICIES CRUD
  // ============================================================
  async listReviewCriteria(filter = {}) {
    return reviewCriteriaRepository.findAll(filter);
  }

  async getReviewCriteriaById(id) {
    const item = await reviewCriteriaRepository.findById(id);
    if (!item) {
      throw new AppError('Điều khoản kiểm duyệt không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return item;
  }

  async createReviewCriteria(adminId, payload) {
    const existing = await reviewCriteriaRepository.findByCode(payload.code);
    if (existing) {
      throw new AppError(`Mã điều khoản "${payload.code}" đã tồn tại. Vui lòng chọn mã khác.`, 409, ErrorCodes.RESOURCE_ALREADY_EXISTS);
    }
    return reviewCriteriaRepository.create(payload, adminId);
  }

  async updateReviewCriteria(adminId, id, payload) {
    const item = await reviewCriteriaRepository.findById(id);
    if (!item) {
      throw new AppError('Điều khoản kiểm duyệt không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    if (payload.code && payload.code.trim().toUpperCase() !== item.code) {
      const existing = await reviewCriteriaRepository.findByCode(payload.code);
      if (existing && existing.id !== id) {
        throw new AppError(`Mã điều khoản "${payload.code}" đã được sử dụng bởi điều khoản khác.`, 409, ErrorCodes.RESOURCE_ALREADY_EXISTS);
      }
    }
    return reviewCriteriaRepository.update(id, payload, adminId);
  }

  async deleteReviewCriteria(id) {
    const item = await reviewCriteriaRepository.findById(id);
    if (!item) {
      throw new AppError('Điều khoản kiểm duyệt không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const deleted = await reviewCriteriaRepository.delete(id);
    return { success: deleted, id };
  }

  async resetDefaultReviewCriteria(adminId) {
    return reviewCriteriaRepository.resetDefaults(adminId);
  }
}

module.exports = new EventsAdminService();


