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

function buildAiReviewSystemPrompt(activeCriteria = []) {
  let criteriaSection = '';
  if (Array.isArray(activeCriteria) && activeCriteria.length > 0) {
    criteriaSection = activeCriteria.map((c, idx) => {
      const severityText = c.severity === 'CRITICAL'
        ? 'BẮT BUỘC / QUAN TRỌNG NHẤT (Nếu vi phạm -> BẮT BUỘC xếp vào "critical_violations" và đề xuất REJECT)'
        : c.severity === 'WARNING'
          ? 'CẢNH BÁO / LƯU Ý (Xếp vào "warnings", đề xuất NEEDS_REVIEW nếu cần điều chỉnh)'
          : 'KHUYẾN NGHỊ / GỢI Ý (Xếp vào "suggestions" để BTC hoàn thiện)';
      return `${idx + 1}. [${c.code}] ${c.title} — (${severityText}):\n   ${c.rule_content.split('\n').join('\n   ')}`;
    }).join('\n\n');
  } else {
    criteriaSection = `1. [TERMS_ORGANIZER] GIẤY PHÉP TỔ CHỨC & PHÁP LÝ (CRITICAL): Bắt buộc có tệp PDF (.pdf) hợp lệ. Cấm cam kết x100 lợi nhuận, cấm Ponzi/cờ bạc.
2. [PAYMENT_POLICY] KÊNH THANH TOÁN (CRITICAL): Mọi giao dịch qua EventHub. Nghiêm cấm chuyển khoản STK cá nhân, né sàn qua Zalo/Telegram.
3. [REFUND_POLICY] CHÍNH SÁCH HOÀN TIỀN (WARNING): Hoãn/hủy sự kiện phải hoàn tiền. Cấm quy định "hủy show không hoàn tiền".
4. [TICKET_POLICY] CHÍNH SÁCH VÉ & ĐỊA ĐIỂM (CRITICAL): Giá vé >= 0, quyền lợi rõ ràng. Địa chỉ cụ thể, cấm giấu địa chỉ bí mật.
5. [SESSION_SCHEDULE] LỊCH TRÌNH CÁC PHIÊN (CRITICAL): Giờ kết thúc sau giờ bắt đầu, không nằm trong quá khứ.
6. [IMAGE_POLICY] KIỂM DUYỆT HÌNH ẢNH & AN TOÀN ĐÚNG NGỮ CẢNH (CRITICAL): Poster & Banner bắt buộc. Cấm 18+ đồi trụy, bạo lực máu me. Không cấm ảnh nghệ thuật/bơi lội.
7. [CONTENT_SPELLING] SOÁT LỖI CHÍNH TẢ & VĂN BẢN (WARNING): Soát lỗi dấu/telex tiếng Việt. Tiêu đề không giật tít, mô tả rõ ràng.
8. [VALUABLE_SUGGESTIONS] GỢI Ý CẢI THIỆN CÓ GIÁ TRỊ (INFO): Không spam gợi ý chỉnh kích thước ảnh. Gợi ý hotline, check-in, phân đoạn.`;
  }

  return `Bạn là Chuyên gia Kiểm duyệt & Thẩm định Toàn diện Sự kiện của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, đối chiếu thông tin và đánh giá sự kiện KHÁCH QUAN, CHUẨN XÁC, THẤU ĐÁO VÀ HỢP LÝ dựa trên BỘ ĐIỀU KHOẢN VÀ TIÊU CHÍ ĐANG ĐƯỢC KÍCH HOẠT DƯỚI ĐÂY.

BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN HIỆN HÀNH (${activeCriteria.length} điều khoản):
${criteriaSection}

QUY TRÌNH TƯ DUY KIỂM DUYỆT 3 BƯỚC BẮT BUỘC:
BƯỚC 1: SUY LUẬN CHỦ ĐỀ CỐT LÕI (CORE THEME INFERENCE):
- Phân tích: Tiêu đề, Thể loại/Định dạng, Mô tả ngắn, Mô tả chi tiết và Hình ảnh (Poster/Banner).
- Suy ra và xác định rõ: Sự kiện này thực chất là gì? (Ví dụ: Đại nhạc hội, Hội thảo công nghệ, Triển lãm nghệ thuật, Khóa học ngoại ngữ, Giải đấu thể thao...).

BƯỚC 2: ĐỐI CHIẾU TÍNH NHẤT QUÁN & LIÊN QUAN CHÉO (CROSS-COHERENCE & RELEVANCE):
- Toàn bộ nội dung sự kiện (Tiêu đề, Mô tả, Hình ảnh, Lịch trình, Hạng vé, Tài liệu đính kèm) CÓ PHÙ HỢP VÀ PHỤC VỤ CHO ĐÚNG SỰ KIỆN NÀY KHÔNG?
- Nghiêm cấm: "Treo đầu dê bán thịt chó" (Tiêu đề một đằng, mô tả/ảnh/tài liệu một nẻo). Nếu có sự mâu thuẫn hoặc nội dung/tài liệu lạc đề không liên quan -> BẮT BUỘC xếp vào "critical_violations" (EVENT_COHERENCE) và REJECT.

BƯỚC 3: THẨM ĐỊNH HỒ SƠ GIẤY PHÉP & BẢN CHẤT PHÁP LÝ (PERMITS & LEGALITY):
- Đọc kỹ kết quả AI VISION / OCR / Trích xuất văn bản của TỪNG TÀI LIỆU (PERMIT_DOCUMENT_*) bên dưới.
- QUY ĐỊNH BẮT BUỘC VỀ BẢN CHẤT GIẤY PHÉP:
  + Tài liệu giấy phép BẮT BUỘC phải là văn bản pháp lý chính thống có liên quan đến việc tổ chức sự kiện: Giấy phép tổ chức, Giấy phép biểu diễn, Giấy chứng nhận ĐKKD của đơn vị tổ chức, Hợp đồng thuê mặt bằng/địa điểm, Công văn chấp thuận của cơ quan nhà nước.
  + TUYỆT ĐỐI KHÔNG ĐƯỢC LÀ: Sách vở, giáo trình, tài liệu học tập, cuốn từ vựng ngoại ngữ (như cuốn từ vựng tiếng Nhật N5, tài liệu ôn thi tiếng Anh...), đề thi, bài tập về nhà, truyện tranh, tiểu thuyết, công thức nấu ăn, mã nguồn lập trình, nhật ký cá nhân hoặc văn bản linh tinh đối phó hệ thống.
  + NẾU TÀI LIỆU LÀ SÁCH, TỪ VỰNG HOẶC NỘI DUNG PHI PHÁP LÝ: BẮT BUỘC đánh giá VIOLATION trong image_review, BẮT BUỘC đưa vào "critical_violations" với mã TERMS_ORGANIZER hoặc LEGAL_PERMIT_AUTHENTICITY, và BẮT BUỘC RA QUYẾT ĐỊNH REJECT! Tuyệt đối không được coi là VALID!
  + Nếu tài liệu là giấy phép hợp lệ và có liên quan đến sự kiện -> Đánh giá VALID và ghi nhận vào "compliant_checks".

BƯỚC 4: QUY CHUẨN ĐÁNH GIÁ & MÔ TẢ HÌNH ẢNH (IMAGE REVIEW & OCR):
- Trong mục "image_review.items[].analysis":
  + BẮT BUỘC viết bằng tiếng Việt tự nhiên, chuẩn mực và súc tích (1-2 câu).
  + Nêu rõ: Nội dung hình ảnh thực tế (chủ đề, nhân vật/nghệ sĩ biểu diễn, bối cảnh, màu sắc), chữ/OCR phát hiện được (tên sự kiện, nghệ sĩ, ngày giờ, địa điểm) và nhận định an toàn.
  + TUYỆT ĐỐI KHÔNG sao chép các ký tự tiếng nước ngoài lạ, ký tự lặp vô nghĩa (tiếng Thái, tiếng Khmer, mã rác lặp...). Nếu ảnh có chữ tiếng nước ngoài, hãy diễn giải bằng tiếng Việt.

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
    {"policy_code": "<Mã điều khoản vi phạm, ví dụ: TERMS_ORGANIZER, EVENT_COHERENCE, LEGAL_PERMIT_AUTHENTICITY, IMAGE_POLICY...>", "issue": "<Mô tả lỗi vi phạm nghiêm trọng>", "highlighted_text": "<Trích dẫn>"}
  ],
  "warnings": [
    {"policy_code": "<Mã điều khoản lưu ý>", "issue": "<Mô tả điểm cần lưu ý>", "highlighted_text": "<Trích dẫn>"}
  ],
  "suggestions": ["<Lời khuyên cải thiện thực sự có giá trị cho BTC>"]
}`;
}

/**
 * Kiểm tra xem nội dung văn bản trích xuất từ tệp có thực sự là giấy tờ pháp lý hay là tài liệu học tập/từ vựng/lạc đề.
 */
function inspectDocumentLegality(extractedText, fileName = '', event = {}) {
  const lowerText = String(extractedText || '').toLowerCase();
  const lowerName = String(fileName || '').toLowerCase();

  // 1. Dấu hiệu tài liệu học tập, từ vựng, giáo trình, bài tập ngoại ngữ (KHÔNG PHẢI GIẤY PHÉP SỰ KIỆN)
  const educationalPatterns = [
    /\b(từ vựng|tu vung|vocabulary|vocab|kotoba|tango)\b/i,
    /\b(tiếng nhật|tieng nhat|japanese|nihongo|jlpt)\b/i,
    /\b(n5|n4|n3|n2|n1)\b/i,
    /\b(kanji|hiragana|katakana|hán tự|han tu)\b/i,
    /\b(ngữ pháp|ngu phap|grammar|bunpou)\b/i,
    /\b(tiếng anh|tieng anh|english|toeic|ielts|toefl)\b/i,
    /\b(tiếng trung|tieng trung|chinese|hsk|hskk)\b/i,
    /\b(tiếng hàn|tieng han|korean|topik)\b/i,
    /\b(giáo trình|giao trinh|sách giáo khoa|sach giao khoa|textbook)\b/i,
    /\b(bài tập về nhà|bai tap ve nha|đề thi|de thi|đáp án|dap an|homework)\b/i,
    /\b(tiểu thuyết|tieu thuyet|truyện tranh|truyen tranh|manga|comic|novel)\b/i,
    /\b(công thức nấu ăn|recipe|hướng dẫn game)\b/i,
    /\b(source code|lập trình|programming|function\s*\(|class\s+\w+|import\s+react)\b/i,
  ];

  const matchedEdu = educationalPatterns.filter((p) => p.test(lowerText) || p.test(lowerName));

  // 2. Dấu hiệu thể thức văn bản pháp lý / giấy phép / hợp đồng
  const legalMarkers = [
    /\b(giấy phép|giay phep|permit|license)\b/i,
    /\b(quyết định|quyet dinh|decision)\b/i,
    /\b(hợp đồng|hop dong|contract|agreement)\b/i,
    /\b(cộng hòa xã hội chủ nghĩa việt nam|độc lập - tự do - hạnh phúc)\b/i,
    /\b(ủy ban nhân dân|uy ban nhan dan|ubnd)\b/i,
    /\b(bộ |sở văn hóa|so van hoa|sở du lịch|so du lich|công an|cong an)\b/i,
    /\b(đăng ký kinh doanh|dang ky kinh doanh|đkkd|doanh nghiệp|mã số thuế|mst)\b/i,
    /\b(thuê địa điểm|thue dia diem|cho thuê mặt bằng|hoi truong|sân vận động)\b/i,
    /\b(bên a|ben a|bên b|ben b|điều 1|dieu 1|điều 2|dieu 2)\b/i,
    /\b(chấp thuận|chap thuan|cho phép tổ chức|tổ chức sự kiện|to chuc su kien)\b/i,
    /\b(giấy ủy quyền|giay uy quyen|biên bản thỏa thuận|bien ban thoa thuan)\b/i,
  ];

  const matchedLegal = legalMarkers.filter((p) => p.test(lowerText) || p.test(lowerName));

  if (matchedEdu.length >= 2 || (matchedEdu.length >= 1 && matchedLegal.length === 0)) {
    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'Tài liệu học tập/Từ vựng/Giáo trình',
      reason: `Tệp PDF là tài liệu học tập/từ vựng ngoại ngữ (phát hiện dấu hiệu từ vựng, tài liệu học tập), hoàn toàn không phải văn bản Giấy phép tổ chức sự kiện hay Hợp đồng pháp lý hợp lệ.`,
    };
  }

  if (lowerText.length > 60 && matchedLegal.length === 0) {
    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'Văn bản không có giá trị pháp lý',
      reason: `Nội dung tệp PDF không chứa bất kỳ thể thức văn bản pháp lý nào (không có cơ quan cấp phép, số quyết định, hợp đồng thuê địa điểm, con dấu hay điều khoản tổ chức sự kiện).`,
    };
  }

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
    if (
      desc.includes('vi phạm tài liệu pháp lý') ||
      desc.includes('tài liệu học tập') ||
      desc.includes('từ vựng') ||
      desc.includes('không có giá trị pháp lý') ||
      desc.includes('lạc đề') ||
      desc.includes('không liên quan')
    ) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu đính kèm không phải là Giấy phép tổ chức sự kiện hay Hợp đồng pháp lý hợp lệ (phát hiện nội dung là tài liệu học tập/từ vựng/phi pháp lý hoặc không liên quan đến sự kiện).'],
        suggestion: 'Bắt buộc tải lên văn bản Giấy phép tổ chức sự kiện, Giấy ĐKKD hoặc Hợp đồng thuê địa điểm hợp lệ của sự kiện.',
      };
    }
    if (desc.includes('viết linh tinh') || desc.includes('vô nghĩa') || desc.includes('troll') || desc.includes('spam')) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu giấy phép chứa nội dung viết linh tinh, không nghiêm túc hoặc không có giá trị pháp lý.'],
        suggestion: 'Cung cấp văn bản giấy phép hoặc hợp đồng pháp lý chính thống.',
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

  async runAiReview(eventId) {
    const event = await eventsAdminRepository.findEventFullDetailForAi(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
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

YÊU CẦU THẨM ĐỊNH & ĐÁNH GIÁ ĐA CHIỀU (QUY TRÌNH 3 BƯỚC BẮT BUỘC):
1. BƯỚC 1: SUY LUẬN CHỦ ĐỀ CỐT LÕI (CORE THEME INFERENCE):
   - Đọc kỹ Tiêu đề, Thể loại/Định dạng, Mô tả ngắn, Mô tả chi tiết và Poster/Banner.
   - Suy ra và xác định rõ: Sự kiện này thực chất là gì? (Ví dụ: Nhạc hội, Hội thảo công nghệ, Triển lãm nghệ thuật, Khóa học ngoại ngữ, Giải đấu thể thao...).

2. BƯỚC 2: ĐỐI CHIẾU TÍNH NHẤT QUÁN & LIÊN QUAN CHÉO (CROSS-COHERENCE & RELEVANCE):
   - Toàn bộ nội dung sự kiện (Tiêu đề, Mô tả, Hình ảnh, Lịch trình, Hạng vé, Tài liệu đính kèm) CÓ PHÙ HỢP VÀ PHỤC VỤ CHO ĐÚNG SỰ KIỆN NÀY KHÔNG?
   - Nghiêm cấm: "Treo đầu dê bán thịt chó" (Tiêu đề một đằng, mô tả/ảnh/tài liệu một nẻo). Nếu có sự mâu thuẫn hoặc nội dung/tài liệu lạc đề không liên quan -> BẮT BUỘC xếp vào "critical_violations" (EVENT_COHERENCE) và REJECT.

3. BƯỚC 3: THẨM ĐỊNH HỒ SƠ GIẤY PHÉP & BẢN CHẤT PHÁP LÝ (PERMITS & LEGALITY):
   - Đọc kỹ kết quả AI VISION / OCR / Trích xuất văn bản của TỪNG TÀI LIỆU (PERMIT_DOCUMENT_*) bên dưới.
   - QUY ĐỊNH BẮT BUỘC VỀ BẢN CHẤT GIẤY PHÉP:
     + Tài liệu giấy phép BẮT BUỘC phải là văn bản pháp lý chính thống có liên quan đến việc tổ chức sự kiện: Giấy phép tổ chức, Giấy phép biểu diễn, Giấy chứng nhận ĐKKD của đơn vị tổ chức, Hợp đồng thuê mặt bằng/địa điểm, Công văn chấp thuận của cơ quan nhà nước.
     + TUYỆT ĐỐI KHÔNG ĐƯỢC LÀ: Sách vở, giáo trình, tài liệu học tập, cuốn từ vựng ngoại ngữ (như cuốn từ vựng tiếng Nhật N5, tài liệu ôn thi tiếng Anh...), đề thi, bài tập về nhà, truyện tranh, tiểu thuyết, công thức nấu ăn, mã nguồn lập trình, nhật ký cá nhân hoặc văn bản linh tinh đối phó hệ thống.
     + NẾU TÀI LIỆU LÀ SÁCH, TỪ VỰNG HOẶC NỘI DUNG PHI PHÁP LÝ: BẮT BUỘC đánh giá VIOLATION trong image_review, BẮT BUỘC đưa vào "critical_violations" với mã TERMS_ORGANIZER hoặc LEGAL_PERMIT_AUTHENTICITY, và BẮT BUỘC RA QUYẾT ĐỊNH REJECT! Tuyệt đối không được coi là VALID!
     + Nếu tài liệu là giấy phép hợp lệ và có liên quan đến sự kiện -> Đánh giá VALID và ghi nhận vào "compliant_checks".
4. SOÁT LỖI CHÍNH TẢ & VĂN BẢN (Title & Description):
   - Soát kỹ từng từ trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết để phát hiện lỗi chính tả tiếng Việt (gõ sai dấu, sai telex, từ viết sai).
   - Liệt kê các từ sai chính tả vào "spelling_grammar_issues" cùng với gợi ý từ đúng.
5. DUYỆT HÌNH ẢNH & OCR (Image Moderation):
   - Đọc kết quả từ AI VISION cho Poster, Banner, ảnh mô tả.
   - Phát hiện ảnh vi phạm (bạo lực, 18+, cờ bạc, lừa đảo). Không cấm ảnh nghệ thuật/thể thao.
6. LỊCH TRÌNH, VÉ & HOÀN TIỀN:
   - Kiểm tra logic giờ các phiên và tính minh bạch của cơ cấu vé.
7. ĐỀ XUẤT CẢI THIỆN:
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
                      description: `[VI PHẠM TÀI LIỆU PHÁP LÝ / LẠC ĐỀ]: Tệp PDF '${item.fileName || 'Tài liệu'}' không phải là Giấy phép tổ chức sự kiện hay Hợp đồng pháp lý mà là ${legality.category}. Lý do: ${legality.reason}. Trích xuất nội dung: ${cleanPreview.slice(0, 300)}...`,
                    });
                  } else {
                    imageAnalysisResults.push({
                      source: item.source,
                      url: item.url || '',
                      fileName: item.fileName || '',
                      extractedText: cleanPreview,
                      description: `[VĂN BẢN ĐỌC TỪ TỆP PDF '${item.fileName || 'Tài liệu'}']:\n${cleanPreview}`,
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
      const systemPrompt = buildAiReviewSystemPrompt(activeCriteria);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: eventPromptWithVision }
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.15,
        max_tokens: 600,
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

        // 1. Kiểm tra giấy phép và định dạng PDF bắt buộc (nếu TERMS_ORGANIZER đang kích hoạt)
        if (activeCodes.has('TERMS_ORGANIZER')) {
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
            // Kiểm tra từng tệp giấy phép xem có tệp nào vi phạm định dạng không phải PDF, lỗi tải hoặc vi phạm bản chất pháp lý
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
                } else if (imgRes.isSubstanceViolation) {
                  const issueMsg = `Tệp tài liệu "${imgRes.fileName || 'giấy phép'}" không phải là giấy tờ pháp lý hợp lệ của sự kiện (phát hiện nội dung là ${imgRes.detectedCategory || 'tài liệu học tập/từ vựng/phi pháp lý'}, không chứng minh được tư cách pháp lý hay thẩm quyền tổ chức sự kiện). Quy định bắt buộc phải cung cấp Giấy phép tổ chức hoặc Hợp đồng pháp lý hợp lệ.`;
                  if (!criticalViolations.some((v) => v.issue.includes(imgRes.fileName || 'không phải là giấy tờ pháp lý'))) {
                    criticalViolations.unshift({
                      policy_code: activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER',
                      issue: issueMsg,
                      highlighted_text: `Tên tệp: ${imgRes.fileName || 'Tài liệu phi pháp lý'}`,
                    });
                  }
                  recommendation = 'REJECT';
                }
              }
            });
          }
        }

        // Nếu thực tế ĐÃ CÓ giấy phép đính kèm VÀ giấy phép không bị lỗi định dạng hay vi phạm bản chất
        const hasPermitViolation = imageAnalysisResults.some(
          (r) => r.source?.startsWith('PERMIT') && (r.isFormatViolation || r.isSubstanceViolation || r.isDownloadFailed)
        );

        if (permitFiles.length > 0 && !hasPermitViolation) {
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
        } else if (hasPermitViolation) {
          // Xóa các lời khen sai lệch trong compliant_checks nếu giấy phép bị vi phạm
          compliantChecks = compliantChecks.filter((c) => !/giấy phép|tài liệu pháp lý|permit|hợp lệ/i.test(String(c)));
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

      // 1. Kiểm tra Giấy phép tổ chức (Permits) (nếu TERMS_ORGANIZER đang kích hoạt)
      if (activeCodes.has('TERMS_ORGANIZER')) {
        if (permitFiles.length === 0) {
          criticalViolations.push({
            policy_code: 'TERMS_ORGANIZER',
            issue: 'Sự kiện thiếu Giấy phép tổ chức sự kiện hoặc tài liệu pháp lý đính kèm. Theo quy định EventHub, sự kiện thiếu giấy tờ pháp lý sẽ KHÔNG được phê duyệt.',
            highlighted_text: 'Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM',
          });
        } else {
          let hasPermitError = false;
          permitFiles.forEach((file, idx) => {
            const fileUrl = typeof file === 'string' ? file : file?.file_url || file?.url || file?.path || '';
            const fileName = file?.file_name || file?.name || `Tài liệu ${idx + 1}`;
            const isPdf = fileUrl.toLowerCase().includes('.pdf') || (typeof file === 'object' && file?.type?.includes('pdf'));
            if (!isPdf) {
              hasPermitError = true;
              criticalViolations.push({
                policy_code: 'TERMS_ORGANIZER',
                issue: `Tệp tài liệu "${fileName}" không đúng định dạng PDF (.pdf). Theo quy định, giấy phép và hồ sơ pháp lý bắt buộc phải được chuyển đổi và tải lên ở định dạng PDF (.pdf) mới được xét duyệt.`,
                highlighted_text: `Tên tệp: ${fileName}`,
              });
            }
          });

          imageAnalysisResults.forEach((imgRes) => {
            if (imgRes.source?.startsWith('PERMIT') && imgRes.isSubstanceViolation) {
              hasPermitError = true;
              criticalViolations.push({
                policy_code: activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER',
                issue: `Tệp tài liệu "${imgRes.fileName || 'giấy phép'}" không phải là văn bản pháp lý hợp lệ của sự kiện (phát hiện: ${imgRes.detectedCategory || 'tài liệu học tập/từ vựng/phi pháp lý'}).`,
                highlighted_text: `Tên tệp: ${imgRes.fileName || 'Tài liệu phi pháp lý'}`,
              });
            }
          });

          if (!hasPermitError) {
            compliantChecks.push(`Đã đính kèm giấy phép tổ chức / tài liệu pháp lý định dạng PDF hợp lệ (${permitFiles.length} tài liệu)`);
          }
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


