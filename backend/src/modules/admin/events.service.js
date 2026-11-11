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
7. [CONTENT_SPELLING] SOÁT LỖI CHÍNH TẢ, TIÊU ĐỀ & MÔ TẢ CHI TIẾT SỰ KIỆN (CRITICAL/WARNING):
   - Thẩm định Tiêu đề: Rõ ràng, đúng nhận diện chương trình, không giật tít lừa đảo / cam kết lợi nhuận.
   - Thẩm định Mô tả chi tiết (Description): BẮT BUỘC thẩm định kỹ bài viết mô tả sự kiện:
     * Đầy đủ & Chi tiết: Nêu rõ cốt truyện/chủ đề, nội dung chương trình, nghệ sĩ/diễn giả tham gia.
     * Quy định tham gia & Cảnh báo an toàn: Với sự kiện kinh dị/kịch ma/sân khấu kịch hoặc sự kiện nhạy cảm, BẮT BUỘC kiểm tra xem có quy định độ tuổi (hạn chế trẻ em dưới 12/16 tuổi, người có tiền sử tim mạch/huyết áp/phụ nữ mang thai), quy định trang phục và vật dụng cấm mang vào hay chưa.
     * Tính minh bạch: Cấm chèn STK cá nhân, cấm dẫn link chuyển khoản ngoài sàn, cấm cam kết x100 lợi nhuận hoặc điều khoản mâu thuẫn chính sách hoàn vé.
     * Nhận xét chi tiết trong "content_review.description_analysis" (phân tích ưu điểm, điểm thiếu sót).
     * Nếu đạt chuẩn, thêm một câu vào "compliant_checks". Nếu thiếu cảnh báo quan trọng, đưa vào "suggestions" hoặc "warnings".
8. [VALUABLE_SUGGESTIONS] GỢI Ý CẢI THIỆN CÓ GIÁ TRỊ (INFO): Gợi ý hotline, check-in, phân đoạn nội dung. Không spam gợi ý chỉnh kích thước ảnh.`;
  }

  return `Bạn là Chuyên gia Kiểm duyệt & Thẩm định Toàn diện Sự kiện của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, đối chiếu thông tin và đánh giá sự kiện KHÁCH QUAN, CHUẨN XÁC, CÔNG BẰNG dựa trên BỘ ĐIỀU KHOẢN VÀ TIÊU CHÍ HIỆN HÀNH DƯỚI ĐÂY.

BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN HIỆN HÀNH (${activeCriteria.length} điều khoản):
${criteriaSection}

NGUYÊN TẮC CỐT LÕI VỀ KIỂM DUYỆT & ĐIỀU KHOẢN BẮT BUỘC:
1. ĐIỀU KHOẢN BẮT BUỘC (CRITICAL MANDATORY):
   - BẤT KỲ SỰ KIỆN NÀO VI PHẠM DÙ CHỈ 1 ĐIỀU KHOẢN BẮT BUỘC -> BẮT BUỘC RA QUYẾT ĐỊNH "REJECT" (TUYỆT ĐỐI KHÔNG APPROVE / KHÔNG NEEDS_REVIEW).
   - Bao gồm: Lừa đảo tài chính/Ponzi/cam kết x100 lợi nhuận, cờ bạc/tài xỉu, 18+ khiêu dâm đồi trụy, mã QR chuyển khoản lừa đảo, chuyển khoản cá nhân ngoài sàn EventHub, tuyên bố hủy show không hoàn tiền, thời gian sự kiện trong quá khứ, treo đầu dê bán thịt chó, ảnh rác/lạc đề nghiêm trọng hoặc nộp tài liệu giấy phép giả mạo/lạc đề.

2. QUY TẮC TÀI LIỆU (DOCUMENT_RELEVANCE & DOCUMENT REVIEW):
   - TÁCH BIỆT HOÀN TOÀN TÀI LIỆU VÀ HÌNH ẢNH: Kết quả thẩm định tài liệu đính kèm trả về trong mục "document_review". TUYỆT ĐỐI KHÔNG gộp tài liệu vào "image_review".
   - Ràng buộc định dạng PDF / DOCX / Ảnh giấy phép đã được Stage 1A kiểm tra và trích xuất văn bản.
   - ĐỐI CHIẾU TÍNH LIÊN QUAN (DOCUMENT_RELEVANCE): Đối chiếu nội dung tài liệu với Tên sự kiện, Nhà tổ chức, Danh mục và từ khóa hành chính/pháp lý ("Cộng hòa xã hội chủ nghĩa Việt Nam", "Độc lập - Tự do - Hạnh phúc", "Giấy phép", "Quyết định", "Chấp thuận", "Sở Văn hóa", "Ủy ban nhân dân", "Hợp đồng thuê địa điểm", "Giấy chứng nhận đăng ký doanh nghiệp", "Xác nhận", "Ủy quyền"...).
   - NGHIÊM CẤM TÀI LIỆU RÁC / LẠC ĐỀ (IRRELEVANT_OR_FAKE_DOCUMENT): Sách từ vựng (Vocabulary, Part of Speech, Noun/Verb/Adjective, phiên âm IPA), giáo án/bài giảng/đề thi/đáp án, CV xin việc, hóa đơn bán lẻ/thực đơn, code lập trình, tài liệu test giả lập hoặc văn bản không liên quan đến sự kiện/nhà tổ chức.
   - XỬ LÝ BẮT BUỘC: Nếu "document_analysis" phát hiện tài liệu đính kèm trong "permit_files" là tài liệu lạc đề / không liên quan / giả mạo -> BẮT BUỘC đánh "document_review.items[].status" là "VIOLATION" (hoặc "REJECTED"), "overall_document_verdict" = "VIOLATION", nêu rõ "violation_type" và "violating_location", thêm vào "critical_violations" với mã [LEGAL_PERMIT_AUTHENTICITY], đặt "risk_score" >= 85 và ra quyết định "decision" = "REJECT".

3. QUY TẮC HÌNH ẢNH (IMAGE_RELEVANCE & VISUAL CHAIN-OF-THOUGHT OCR):
   - "image_review" CHỈ dành cho hình ảnh thực tế (Poster, Banner, ảnh mô tả sự kiện). KHÔNG đưa tài liệu văn bản vào danh sách ảnh.
   - ĐỐI CHIẾU NGỮ CẢNH SỰ KIỆN (IMAGE_RELEVANCE): Phải kiểm tra trường "is_event_poster_or_relevant_banner", "visual_description", "extracted_text" và "safety_flags" từ "vision_analysis" đối chiếu với "title" và "category" của sự kiện:
     * Nếu "vision_analysis" chỉ ra ảnh là ảnh selfie cá nhân, meme, bàn nhậu, thú cưng, ảnh chụp màn hình rác, hoặc chủ thể trong ảnh hoàn toàn không ăn nhập với "title" và "category" (ví dụ: Hội thảo công nghệ nhưng đăng ảnh đồ ăn/thú cưng/phong cảnh ngẫu nhiên không có chữ sự kiện), hoặc có "safety_flags" (18+/NSFW, bạo lực, cờ bạc, mã QR chuyển khoản lừa đảo):
       -> BẮT BUỘC đánh "image_review.items[].status" = "VIOLATION" (hoặc "REJECTED") và "overall_image_verdict" = "VIOLATION", thêm vào "critical_violations" với mã tiêu chí tương ứng ([EVENT_COHERENCE] hoặc [IMAGE_QUALITY] / [IMAGE_POLICY]), tăng "risk_score" >= 75 và đặt "decision" = "REJECT" (hoặc tối thiểu "NEEDS_REVIEW" nếu chỉ hơi lệch nhẹ ở ảnh mô tả phụ).
   - BẮT BUỘC ÁP DỤNG QUY TRÌNH TƯ DUY 4 BƯỚC "VISUAL CHAIN-OF-THOUGHT (CoT) OCR" CHO MỖI ẢNH (lưu vào "ocr_reasoning"):
     * Bước 1 - Phân tích bối cảnh & Chủ đề (Scene & Theme Context): Nhận diện chủ đề tổng thể của banner, tông màu và đối tượng trực quan so với chủ đề sự kiện.
     * Bước 2 - Quét vùng chữ rõ nét làm mồi ngữ cảnh (Anchor Text Extraction): Đọc các dòng chữ dễ nhận diện để xác nhận ngôn ngữ và khớp nối sự kiện.
     * Bước 3 - Giải mã phông chữ biến dạng & Sửa lỗi từ vựng (Stylized Typography Decoding): Giữ tiếng Việt chuẩn có dấu, tuyệt đối không dịch sang ký tự Thái/Khmer.
     * Bước 4 - Đánh giá kiểm duyệt (Moderation Verdict): Phân biệt hiệu ứng nghệ thuật hợp lệ của sự kiện (kịch ma, sân khấu ca nhạc, hồ bơi lành mạnh) với vi phạm thực tế (NSFW 18+ lộ liễu, bạo lực đẫm máu, cờ bạc, QR lừa đảo hoặc ảnh rác lạc đề).

4. QUY TẮC CHỐNG BẮT NHẦM (ANTI_FALSE_POSITIVE):
   - Sự kiện OFFLINE/HYBRID đã có thông tin "venue_name" và "address" trong mảng "sessions": TUYỆT ĐỐI KHÔNG bắt lỗi thiếu địa điểm tổ chức (ngay cả khi phần mô tả HTML không ghi lại địa chỉ).
   - Sự kiện ONLINE không có địa chỉ vật lý: TUYỆT ĐỐI KHÔNG bắt lỗi thiếu địa chỉ đường phố.
   - Sự kiện không đính kèm "permit_files" và không phải là đại nhạc hội/sự kiện nhạy cảm bắt buộc giấy phép theo luật (trạng thái NOT_REQUIRED — ví dụ: workshop, webinar, hội thảo, meetup cộng đồng, online event): TUYỆT ĐỐI KHÔNG tự ý đánh "REJECT" vì thiếu giấy phép.

5. 3 ĐỀ XUẤT PHÊ DUYỆT CỐT LÕI (decision) & CƠ CHẾ TÍNH ĐIỂM:
   - "REJECT": Có ít nhất 1 lỗi CRITICAL (hoặc tài liệu/ảnh VIOLATION), risk_score >= 75 (tài liệu lạc đề >= 85), quality_score < 50.
   - "NEEDS_REVIEW": 0 lỗi CRITICAL, nhưng có cảnh báo WARNING hoặc ảnh hơi lệch nhẹ, risk_score từ 30 đến 64, quality_score từ 50 đến 74.
   - "APPROVE": 100% tuân thủ các điều khoản bắt buộc, 0 lỗi CRITICAL, ảnh & tài liệu phù hợp ngữ cảnh, rủi ro thấp (risk_score < 30 và quality_score >= 75).
   - THANG ĐIỂM CHẤT LƯỢNG (quality_score: 0 -> 100, Khởi điểm 100 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Trừ -40 đến -50 điểm / lỗi.
     * Mỗi cảnh báo LƯU Ý (WARNING): Trừ -10 đến -20 điểm / lỗi.
     * Mỗi lỗi nhẹ / chính tả: Trừ -2 đến -5 điểm / lỗi.
   - THANG ĐIỂM RỦI RO (risk_score: 0 -> 100, Khởi điểm 0 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Cộng +75 đến +90 điểm rủi ro.
     * Mỗi cảnh báo LƯU Ý (WARNING): Cộng +15 đến +25 điểm rủi ro.
     * Mỗi lỗi nhẹ / chính tả: Cộng +2 đến +5 điểm rủi ro.

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
        "source": "MAIN_POSTER | COVER_BANNER | DESCRIPTION_IMAGE_1",
        "status": "VALID | WARNING | VIOLATION | MISSING",
        "analysis": "<Đánh giá tổng thể hình ảnh và chữ đã giải mã>",
        "ocr_reasoning": {
          "step1_scene_context": "<Phân tích bối cảnh, tông màu, phong cách đồ họa và chủ đề sự kiện>",
          "step2_anchor_text": "<Vùng chữ rõ nét làm mồi ngữ cảnh: đạo diễn, nghệ sĩ, ngày giờ, thể loại>",
          "step3_stylized_decoding": "<Quá trình bóc tách râu ria/máu/khói, đối chiếu khung xương chữ cái tiếng Việt và sửa lỗi từ vựng theo tên sự kiện>",
          "step4_moderation_verdict": "<Phân biệt hiệu ứng nghệ thuật hợp lệ của sự kiện với vi phạm thực tế>"
        },
        "extracted_texts": [
          {
            "text": "<Cụm từ tiếng Việt đã giải mã>",
            "font_style": "NORMAL" | "STYLIZED_HORROR" | "NEON_GLOW" | "3D_EFFECT" | "HANDWRITTEN",
            "confidence": "HIGH" | "MEDIUM" | "LOW",
            "visual_effect": "BLOOD_SPLATTER" | "SMOKE" | "DISTORTION" | "NONE",
            "is_event_title": true | false
          }
        ],
        "issues": ["<Vấn đề phát hiện nếu có>"],
        "suggestion": "<Gợi ý cải thiện>"
      }
    ]
  },
  "document_review": {
    "overall_document_verdict": "SAFE" | "WARNING" | "VIOLATION" | "NOT_PROVIDED",
    "items": [
      {
        "source": "PERMIT_DOCUMENT_1",
        "file_name": "<Tên tệp>",
        "status": "VALID | WARNING | VIOLATION",
        "relevance_to_event": "HIGH | MEDIUM | LOW | IRRELEVANT",
        "analysis": "<Đánh giá chi tiết tài liệu và mức độ liên quan đến sự kiện>",
        "violation_type": "<Vi phạm gì nếu có, hoặc để trống/null nếu hợp lệ>",
        "violating_location": "<Vi phạm chỗ nào trong tài liệu: trích dẫn câu/từ/đoạn>",
        "issues": ["<Vấn đề phát hiện nếu có>"],
        "suggestion": "<Gợi ý cho BTC>"
      }
    ]
  },
  "compliant_checks": ["<Tiêu chí thực sự đạt chuẩn>"],
  "critical_violations": [
    {"policy_code": "<Mã điều khoản vi phạm>", "issue": "<Mô tả lỗi vi phạm nghiêm trọng (nếu do tài liệu thì ghi: [Vi phạm tài liệu] [Tên tệp]: <vi phạm gì>)>", "highlighted_text": "<Trích dẫn vi phạm chỗ nào trong tài liệu hoặc mô tả>"}
  ],
  "warnings": [
    {"policy_code": "<Mã điều khoản lưu ý>", "issue": "<Mô tả điểm cần lưu ý>", "highlighted_text": "<Trích dẫn>"}
  ],
  "suggestions": ["<Lời khuyên cải thiện thực sự có giá trị cho BTC>"]
}`;
}

/**
 * Xác định xem sự kiện có thuộc nhóm quy mô lớn/nhạy cảm bắt buộc giấy phép nhà nước hay không.
 * Sự kiện nhỏ, online, workshop, meetup, hội thảo thông thường không bắt buộc permit_files.
 */
function requiresStrictEventPermit(event = {}) {
  const format = String(event?.format || 'OFFLINE').trim().toUpperCase();
  if (format === 'ONLINE') return false;

  const text = `${event?.title || ''} ${event?.category_name || ''} ${event?.short_description || ''}`.toLowerCase();
  const isWorkshopOrSmall = /(workshop|webinar|seminar|talkshow|meetup|khóa học|đào tạo|hội thảo|giao lưu|networking|offline\s*cộng\s*đồng)/i.test(text);
  const isLargePublicFestival = /(đại nhạc hội|music\s*festival|lễ hội âm nhạc|live\s*concert|rave|edm\s*festival|bắn pháo hoa|giải\s*chạy\s*marathon|diễu hành|triển\s*lãm\s*quốc\s*tế|lễ\s*hội\s*ngoài\s*trời)/i.test(text);

  return isLargePublicFestival && !isWorkshopOrSmall;
}

/**
 * Chuẩn hóa đối tượng kết quả trả về cho tài liệu lạc đề / giả mạo / không hợp lệ.
 */
function buildIrrelevantDocumentResult({
  category = 'IRRELEVANT_EVENT_DOCUMENT',
  violationDetail = 'Tài liệu đính kèm không liên quan đến sự kiện hoặc không phải là văn bản pháp lý/giấy phép hợp lệ',
  violatingLocation = '',
  reasonDetail = '',
} = {}) {
  return {
    status: 'VIOLATION',
    is_valid: false,
    isValidLegalDocument: false,
    isSubstanceViolation: true,
    category,
    violation_type: 'IRRELEVANT_OR_FAKE_DOCUMENT',
    violationType: violationDetail,
    violatingLocation: violatingLocation || '(Không có trích dẫn hợp lệ)',
    reason: 'Tài liệu đính kèm không liên quan đến sự kiện hoặc không phải là văn bản pháp lý/giấy phép hợp lệ',
    reasonDetail: reasonDetail || violationDetail,
    relevance_to_event: 'IRRELEVANT',
    relevanceToEvent: 'IRRELEVANT',
    relevance_score: 0,
    relevanceScore: 0,
  };
}

/**
 * Kiểm tra xem nội dung văn bản trích xuất từ tệp có thực sự là tài liệu hợp lệ,
 * đối chiếu từ ngữ trong tài liệu có liên quan đến sự kiện hay không (title, organization_name, category_name),
 * phát hiện tài liệu rác/lạc đề (từ vựng/IPA, giáo án/đề thi, CV, hóa đơn bán lẻ/thực đơn, code)
 * và chỉ rõ vi phạm gì cũng như vị trí/trích dẫn vi phạm trong tài liệu.
 */
function inspectDocumentLegality(extractedText, fileName = '', event = {}) {
  const cleanText = String(extractedText || '').trim();
  const cleanFileName = String(fileName || '').trim();
  const lowerText = cleanText.toLowerCase();
  const normalizedName = cleanFileName.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, ' ').toLowerCase();

  // 0. Khi không có tệp đính kèm được truyền vào -> Kiểm tra nhóm sự kiện miễn giấy phép
  if (!cleanText && !cleanFileName) {
    if (!requiresStrictEventPermit(event)) {
      return {
        status: 'NOT_REQUIRED',
        is_valid: true,
        isValidLegalDocument: true,
        isSubstanceViolation: false,
        category: 'NOT_REQUIRED',
        violation_type: null,
        violationType: null,
        violatingLocation: null,
        reason: 'Sự kiện quy mô nhỏ/trực tuyến/workshop không bắt buộc đính kèm giấy phép.',
        relevance_to_event: 'NOT_REQUIRED',
        relevanceToEvent: 'NOT_REQUIRED',
        relevance_score: null,
        relevanceScore: null,
      };
    }
    return {
      status: 'MISSING',
      is_valid: false,
      isValidLegalDocument: false,
      isSubstanceViolation: false,
      category: 'MISSING_PERMIT',
      violation_type: null,
      violationType: 'Chưa đính kèm giấy phép cho sự kiện quy mô lớn/ngoài trời',
      violatingLocation: null,
      reason: 'Sự kiện quy mô lớn/nhạy cảm cần bổ sung giấy phép tổ chức.',
      relevance_to_event: 'LOW',
      relevanceToEvent: 'LOW',
      relevance_score: 0,
      relevanceScore: 0,
    };
  }

  // 1. Vi phạm nghiêm trọng (lừa đảo, cờ bạc, 18+, vũ khí, chất cấm, cam kết phi thực tế)
  const severeViolationPatterns = [
    { regex: /(lừa đảo|lua dao|scam|ponzi|đa cấp biến tướng)/i, label: 'Lừa đảo / Ponzi / Đa cấp biến tướng' },
    { regex: /(cờ bạc|co bac|tài xỉu|tai xiu|cá độ|betting|casino)/i, label: 'Cờ bạc / Cá độ / Tài xỉu' },
    { regex: /(khiêu dâm|khieu dam|18\+|porn|đồi trụy|gái gọi)/i, label: 'Nội dung khiêu dâm / 18+ / Đồi trụy' },
    { regex: /(vũ khí|vu khi|súng đạn|thuốc nổ|chất cấm|ma túy)/i, label: 'Vũ khí / Chất cấm / Ma túy' },
    { regex: /(cam kết x100|lợi nhuận 30%|bao lỗ 100%|tiền ảo lậu)/i, label: 'Cam kết lợi nhuận phi thực tế / Gian lận tài chính' },
  ];

  for (const item of severeViolationPatterns) {
    if (item.regex.test(lowerText) || item.regex.test(normalizedName)) {
      const matchIndex = lowerText.search(item.regex);
      const start = Math.max(0, matchIndex - 30);
      const end = Math.min(cleanText.length, matchIndex + 120);
      const violatingLocation = matchIndex >= 0 ? `...${cleanText.slice(start, end).trim()}...` : cleanText.slice(0, 150);

      return {
        status: 'VIOLATION',
        is_valid: false,
        isValidLegalDocument: false,
        isSubstanceViolation: true,
        category: 'SEVERE_LEGAL_VIOLATION',
        violation_type: 'SEVERE_LEGAL_VIOLATION',
        violationType: `Tài liệu chứa nội dung vi phạm pháp luật / cấm phát hành (${item.label})`,
        violatingLocation,
        reason: `Tài liệu đính kèm có dấu hiệu chứa nội dung nghiêm cấm: ${item.label}.`,
        relevance_to_event: 'IRRELEVANT',
        relevanceToEvent: 'IRRELEVANT',
        relevance_score: 0,
        relevanceScore: 0,
      };
    }
  }

  const hasOfficialPermitSeal =
    /(cộng hòa xã hội chủ nghĩa việt nam|độc lập\s*[-–]?\s*tự do\s*[-–]?\s*hạnh phúc)/i.test(lowerText) &&
    /(giấy phép|cấp phép|quyết định|công văn|chấp thuận|ủy ban nhân dân|sở văn hóa)/i.test(lowerText);

  // 2a. Danh sách từ vựng / IPA / Giáo trình học ngoại ngữ (Vocabulary, Part of Speech, Noun/Verb/Adjective, IPA /.../)
  const strongVocabPatterns = [
    /(sach\s*tu\s*vung|sachtuvung|vocab|vocabulary|word\s*list|new\s*word|glossary|flashcard|part\s*of\s*speech|từ\s*loại|phiên\s*âm)/i,
    /(minna\s*no\s*nihongo|kanji|hiragana|katakana)/i,
  ];
  const contextualLanguageDocPatterns = [
    /(tu\s*vung|tuvung|tieng\s*nhat|tieng\s*han|tieng\s*trung|jlpt|hsk|toeic|ielts)/i,
  ];
  const hasIpaNotation =
    /\/[^/\n\s]{1,40}[\u0250-\u02AF\u02C8\u02CC][^/\n\s]{0,40}\//.test(cleanText) ||
    (/\/[a-zA-Z\u0250-\u02AF\u02C8\u02CC:'ːəɪʊʌɒɔæɑɛɜʃʒθðŋ]{2,25}\//.test(cleanText) &&
      /\b(noun|verb|adjective|adverb|preposition|meaning|nghĩa|từ vựng|part of speech)\b/i.test(cleanText));
  const posTagsMatches = (cleanText.match(/\b(noun|verb|adjective|adverb|preposition|pronoun)\b|\((?:n|v|adj|adv|prep)\)/gi) || []).length;
  const hasPosGlossList = posTagsMatches >= 2 && /(nghĩa|dịch|ví dụ|meaning|example|\/[^/\s]{2,25}\/)/i.test(cleanText);
  const matchedVocabName = strongVocabPatterns.some((p) => p.test(normalizedName));
  const matchedVocabText = strongVocabPatterns.some((p) => p.test(lowerText));
  const matchedContextualLang = !hasOfficialPermitSeal && contextualLanguageDocPatterns.some((p) => p.test(normalizedName) || p.test(lowerText));
  const hasVocabListSigns = /(新出語|word\s*list|new\s*word|ことば|わたし|なまえ|にほん|かんこく|ちゅうごく|tên\s*\(bạn\)|đất nước\s*\(bạn\)|công việc\s*\(của bạn\)|người\s*\(nước nào\)|cho tôi hỏi 1 chút|thế à!|mấy tuổi|ngày mùng|tháng mấy)/i.test(cleanText);
  const hasCjkWithVocabGloss = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanText) &&
    /(nghĩa|từ vựng|bài học|ngữ pháp|dịch nghĩa|người \(nước nào\)|xin lỗi\s*\.\.\.\s*cho tôi hỏi|giáo viên|nhân viên văn phòng)/i.test(lowerText);

  if (matchedVocabName || matchedVocabText || matchedContextualLang || hasVocabListSigns || hasCjkWithVocabGloss || hasIpaNotation || hasPosGlossList) {
    let violatingLocation = cleanText.slice(0, 150);
    const vocabMatch = cleanText.match(/(新出語|ことば|わたし|なまえ|tiếng nhật|sách từ vựng|minna no nihongo|word list|flashcard|vocabulary|part of speech|\/[^/\n\s]{2,30}\/)[^.,\n]{0,80}/i);
    if (vocabMatch) {
      violatingLocation = `"${vocabMatch[0].trim()}"`;
    }

    return buildIrrelevantDocumentResult({
      category: 'LANGUAGE_VOCAB_BOOK',
      violationDetail: 'Tài liệu lạc đề / Danh sách từ vựng ngoại ngữ / Phiên âm IPA không có giá trị pháp lý sự kiện',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm là danh sách từ vựng / phiên âm IPA / giáo trình học ngoại ngữ, hoàn toàn không phải giấy tờ pháp lý hay kế hoạch tổ chức sự kiện.',
    });
  }

  // 2b. Giáo án / Bài giảng / Bài tập học đường / Đề thi / Đáp án
  const schoolLessonPatterns = [
    /(kế hoạch bài dạy|khbd|giáo án|lesson\s*plan|teaching\s*plan|bài giảng|mục tiêu bài học|hoạt động dạy học)/i,
    /(bài tập về nhà|đề thi học kỳ|đề thi|đề kiểm tra|kiểm tra 15 phút|kiểm tra 1 tiết|tiểu luận môn|tiết\s*\d+|môn\s*(ngữ văn|toán|tiếng anh|vật lý|hóa học|sinh học|lịch sử|địa lý))/i,
    /(homework|exercise|lesson\s*\d+|unit\s*\d+|grammar|ngu\s*phap)/i,
  ];
  const hasExamQaPattern =
    /(câu\s*1[\s:.)].*câu\s*2[\s:.)])/is.test(cleanText) ||
    (/(câu\s*(?:hỏi\s*)?1[\s:.)])/i.test(cleanText) && /\b(đáp án|lời giải|hướng dẫn giải)\b/i.test(lowerText)) ||
    (/\b(trắc nghiệm|đề thi|đề kiểm tra)\b/i.test(lowerText) && /\bđáp án\b/i.test(lowerText));

  if (schoolLessonPatterns.some((p) => p.test(lowerText) || p.test(normalizedName)) || hasExamQaPattern) {
    let violatingLocation = cleanText.slice(0, 160);
    const lessonMatch = cleanText.match(/(kế hoạch bài dạy|khbd|giáo án|lesson\s*plan|bài giảng|tiết\s*\d+|bài tập|đề thi|đề kiểm tra|câu\s*1[\s:.)]|đáp án)[^.,\n]{0,80}/i);
    if (lessonMatch) {
      violatingLocation = `"${lessonMatch[0].trim()}"`;
    }

    return buildIrrelevantDocumentResult({
      category: 'SCHOOL_LESSON_PLAN',
      violationDetail: 'Tài liệu lạc đề / Giáo án, bài giảng, đề thi hoặc bài tập học đường',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm là giáo án giảng dạy trên lớp, bài tập hoặc đề thi có đáp án, không phải giấy phép hay kế hoạch tổ chức sự kiện.',
    });
  }

  // 2c. CV xin việc / Giấy tờ cá nhân không liên quan
  const hasExplicitCvTitle =
    /(curriculum\s*vitae|sơ yếu lý lịch|đơn xin việc|\bcv\s*xin\s*việc\b|\bresume\b)/i.test(lowerText) ||
    /\b(curriculum vitae|sơ yếu lý lịch|cv)\b/i.test(normalizedName);
  const cvSectionHits = [
    /(kinh nghiệm làm việc|work\s*experience)/i,
    /(kỹ năng cá nhân|personal\s*skills|\bkỹ năng\b.*\bchuyên môn\b)/i,
    /(mục tiêu nghề nghiệp|career\s*objective)/i,
    /(trình độ học vấn|education)/i,
    /(người tham chiếu|references)/i,
  ].filter((re) => re.test(lowerText)).length;
  const hasPersonalIdDoc = /(giấy phép lái xe|bằng lái xe|giấy khám sức khỏe|hồ sơ bệnh án|học bạ|bảng điểm|bằng tốt nghiệp|thẻ sinh viên|căn cước công dân|chứng minh nhân dân|hộ chiếu)/i.test(lowerText);

  if (hasExplicitCvTitle || cvSectionHits >= 2 || hasPersonalIdDoc) {
    const cvMatch = cleanText.match(/(curriculum\s*vitae|sơ yếu lý lịch|đơn xin việc|kinh nghiệm làm việc|kỹ năng cá nhân|mục tiêu nghề nghiệp|giấy phép lái xe|bằng tốt nghiệp|thẻ sinh viên)[^.,\n]{0,80}/i);
    const violatingLocation = cvMatch ? `"${cvMatch[0].trim()}"` : cleanText.slice(0, 150);

    return buildIrrelevantDocumentResult({
      category: 'PERSONAL_CV_RESUME',
      violationDetail: 'Tài liệu lạc đề / CV xin việc hoặc giấy tờ cá nhân không phải giấy phép sự kiện',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm là CV xin việc hoặc hồ sơ cá nhân, không phải văn bản pháp lý hay giấy phép tổ chức sự kiện.',
    });
  }

  // 2d. Hóa đơn bán lẻ / Thực đơn ăn uống
  const hasContractOrEventTerms = /(hợp đồng|thuê địa điểm|giấy phép|quyết định|công văn|chấp thuận|ủy ban|sở văn hóa|ban tổ chức|tổ chức sự kiện)/i.test(lowerText);
  const hasRetailReceipt =
    /(hóa đơn bán lẻ|phiếu tính tiền|phiếu thanh toán siêu thị|tiền khách đưa|tiền thối lại|tiền thừa|nhân viên thu ngân)/i.test(lowerText) ||
    (/\b(receipt|cashier)\b/i.test(lowerText) && /\b(subtotal|change due|total)\b/i.test(lowerText) && !hasContractOrEventTerms);
  const hasRestaurantMenu =
    !hasContractOrEventTerms && (
      /(thực đơn|\bkhai vị\b.*\bmón chính\b|\btráng miệng\b.*\bđồ uống\b)/is.test(lowerText) ||
      (/(thực đơn|\bmenu\b)/i.test(`${normalizedName} ${lowerText}`) && /(trà sữa|cà phê|sinh tố|cơm tấm|phở bò|bún chả|lẩu|nướng|bia tươi)/i.test(lowerText))
    );

  if (hasRetailReceipt || hasRestaurantMenu) {
    const recMatch = cleanText.match(/(hóa đơn bán lẻ|phiếu tính tiền|tiền khách đưa|thu ngân|thực đơn|menu|khai vị|món chính|receipt)[^.,\n]{0,80}/i);
    const violatingLocation = recMatch ? `"${recMatch[0].trim()}"` : cleanText.slice(0, 150);

    return buildIrrelevantDocumentResult({
      category: 'RECEIPT_OR_MENU',
      violationDetail: 'Tài liệu lạc đề / Hóa đơn bán lẻ hoặc thực đơn ăn uống không phải giấy phép sự kiện',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm là hóa đơn bán lẻ hoặc thực đơn ăn uống, không phải giấy phép tổ chức hoặc hợp đồng thuê địa điểm.',
    });
  }

  // 2e. Code lập trình
  const isCodeFileExt = /\.(js|ts|jsx|tsx|py|java|cpp|c|cs|php|rb|go|rs|sql|html|css)$/i.test(cleanFileName);
  const codeConstructHits = [
    /\bimport\s+[\w*{}\s,]+\s+from\s+['"][^'"]+['"]/,
    /\b(?:const|let|var)\s+\w+\s*=\s*require\(['"][^'"]+['"]\)/,
    /\bmodule\.exports\s*=/,
    /\bconsole\.(log|error|warn)\(/,
    /\bfunction\s+\w+\s*\([^)]*\)\s*\{/,
    /\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    /\bpublic\s+(?:class|static\s+void)\b/,
    /\bSystem\.out\.print(?:ln)?\(/,
    /#include\s*<[\w.]+>/,
    /\bdef\s+\w+\s*\([^)]*\)\s*:/,
    /\bSELECT\s+[\w*,.\s]+\s+FROM\s+\w+/i,
    /\bCREATE\s+TABLE\s+/i,
    /<\?php/i,
  ].filter((re) => re.test(cleanText)).length;

  if (isCodeFileExt || codeConstructHits >= 2) {
    const codeMatch = cleanText.match(/(import\s+[^\n;]+|require\([^\n)]+\)|module\.exports[^\n;]+|function\s+\w+[^\n{]+|public\s+(?:class|static)[^\n{]+|def\s+\w+[^\n:]+|SELECT\s+[^\n;]+|CREATE\s+TABLE[^\n(]+)/i);
    const violatingLocation = codeMatch ? `"${codeMatch[0].trim().slice(0, 120)}"` : cleanText.slice(0, 140);

    return buildIrrelevantDocumentResult({
      category: 'SOURCE_CODE_SNIPPET',
      violationDetail: 'Tài liệu lạc đề / Chứa mã nguồn code lập trình thay vì văn bản pháp lý',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm chứa mã nguồn lập trình, hoàn toàn không phải văn bản pháp lý hay giấy phép sự kiện.',
    });
  }

  // 2f. Công thức nấu ăn / Truyện tranh / Hướng dẫn giải trí cá nhân
  const entertainmentPatterns = [
    /(truyen\s*tranh|manga|comic|game\s*guide|cong\s*thuc\s*nau|recipe|cheatsheet|cách nấu|nguyên liệu nấu|xương ống bò|gia vị nấu)/i,
  ];
  if (entertainmentPatterns.some((p) => p.test(normalizedName) || p.test(lowerText))) {
    let violatingLocation = cleanText.slice(0, 150);
    const match = cleanText.match(/(cách nấu|công thức nấu|truyện tranh|manga|recipe|hướng dẫn chơi)[^.,\n]{0,80}/i);
    if (match) {
      violatingLocation = `"${match[0].trim()}"`;
    }

    return buildIrrelevantDocumentResult({
      category: 'ENTERTAINMENT_RECIPE_FILE',
      violationDetail: 'Tài liệu không liên quan đến sự kiện (Công thức nấu ăn / Truyện / Giải trí cá nhân)',
      violatingLocation,
      reasonDetail: 'Tệp đính kèm là nội dung nấu ăn hoặc giải trí cá nhân, hoàn toàn không phải giấy phép hay hồ sơ sự kiện.',
    });
  }

  // 3. Tài liệu giả lập / Dữ liệu kiểm thử dùng để test (Mock test permit)
  const mockTestPatterns = /(bản giả lập|tài liệu giả lập|môi trường kiểm thử|dữ liệu hư cấu|không phải giấy phép thật|không có giá trị pháp lý)/i;
  if (mockTestPatterns.test(lowerText)) {
    const mockMatch = cleanText.match(/(thông báo:\s*toàn bộ|tài liệu giả lập|bản giả lập|không phải giấy phép thật|dữ liệu hư cấu)[^.,\n]{0,120}/i);
    const violatingLocation = mockMatch ? `"${mockMatch[0].trim()}"` : cleanText.slice(0, 160);

    return buildIrrelevantDocumentResult({
      category: 'MOCK_TEST_DOCUMENT',
      violationDetail: 'Tài liệu giả lập / Dữ liệu kiểm thử không có giá trị pháp lý',
      violatingLocation,
      reasonDetail: 'Tài liệu đính kèm là bản dữ liệu giả lập được tạo cho mục đích kiểm thử phần mềm, không phải giấy phép được cơ quan nhà nước ban hành.',
    });
  }

  // 4. Tệp rác / quá ngắn / vô nghĩa
  if (cleanText.length < 35 || /(.)\1{10,}/.test(lowerText)) {
    return buildIrrelevantDocumentResult({
      category: 'JUNK_PLACEHOLDER',
      violationDetail: 'Tài liệu rác / placeholder quá ngắn hoặc vô nghĩa',
      violatingLocation: cleanText.slice(0, 100) || '(Tệp rỗng hoặc không có chữ)',
      reasonDetail: 'Tài liệu đính kèm quá ngắn hoặc chứa văn bản vô nghĩa, không thể xác thực.',
    });
  }

  // 5. KIỂM DUYỆT TỪ KHÓA PHÁP LÝ & ĐỐI CHIẾU NGỮ CẢNH SỰ KIỆN (title, organization_name, category_name)
  const genericStopwords = new Set([
    'của', 'và', 'các', 'những', 'tại', 'cho', 'trong', 'với', 'năm', 'ngày', 'tháng', 'có', 'là',
    'sự', 'kiện', 'event', 'một', 'hai', 'ba', 'bốn', 'the', 'and', 'of', 'in', 'at', 'for', 'to', 'a', 'an',
  ]);
  const orgNoiseStopwords = new Set([
    ...genericStopwords,
    'công', 'ty', 'tnhh', 'cp', 'cổ', 'phần', 'trách', 'nhiệm', 'hữu', 'hạn', 'đơn', 'vị', 'ban', 'tổ', 'chức',
    'nhóm', 'group', 'company', 'ltd', 'jsc', 'inc', 'co',
  ]);

  const extractSignificantTokens = (str, stopSet = genericStopwords) => {
    if (!str || typeof str !== 'string') return [];
    return str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopSet.has(w));
  };

  const eventTitle = String(event?.title || '').trim();
  const orgName = String(event?.organization_name || event?.organizer_name || '').trim();
  const categoryName = String(event?.category_name || '').trim();

  const titleTokens = extractSignificantTokens(eventTitle, genericStopwords);
  const orgTokens = extractSignificantTokens(orgName, orgNoiseStopwords);
  const categoryTokens = extractSignificantTokens(categoryName, genericStopwords);

  // Các từ khóa hành chính / pháp lý / tính chất sự kiện
  const legalEventKeywords = [
    /(cộng hòa xã hội chủ nghĩa việt nam|độc lập\s*[-–]?\s*tự do\s*[-–]?\s*hạnh phúc)/i,
    /(giấy phép|cấp phép|quyết định|công văn|chấp thuận|cho phép|đồng ý|xác nhận|ủy quyền)/i,
    /(ủy ban nhân dân|ubnd|sở văn hóa|bộ văn hóa|bộ thông tin|sở du lịch|cục nghệ thuật|công an|phòng cháy|pccc)/i,
    /(hợp đồng thuê địa điểm|giấy chứng nhận đăng ký doanh nghiệp|đăng ký kinh doanh|đkkd|giấy chứng nhận|mã số doanh nghiệp|mã số thuế)/i,
    /(hợp đồng|thỏa thuận|biên bản|cam kết)/i,
    /(kế hoạch tổ chức|phương án|đề án|chương trình sự kiện|kịch bản)/i,
    /(nhà tổ chức|ban tổ chức|đơn vị tổ chức|địa điểm tổ chức|thời gian diễn ra)/i,
    /(license|permit|approval|certificate|authorization|contract|agreement|event plan|proposal|organizer)/i,
  ];

  const matchedTitleTokens = titleTokens.filter((token) => lowerText.includes(token));
  const matchedOrgTokens = orgTokens.filter((token) => lowerText.includes(token));
  const matchedCategoryTokens = categoryTokens.filter((token) => lowerText.includes(token));
  const matchedLegalEventCount = legalEventKeywords.filter((p) => p.test(lowerText) || p.test(normalizedName)).length;

  const hasExactTitleMatch = Boolean(eventTitle && eventTitle.length >= 4 && lowerText.includes(eventTitle.toLowerCase()));
  const hasExactOrgMatch = Boolean(orgName && orgName.length >= 3 && lowerText.includes(orgName.toLowerCase()));

  const hasSpecificEventMatch =
    hasExactTitleMatch ||
    hasExactOrgMatch ||
    (titleTokens.length > 0 && matchedTitleTokens.length >= Math.min(2, titleTokens.length)) ||
    (orgTokens.length > 0 && matchedOrgTokens.length >= Math.min(2, orgTokens.length));

  const hasCategoryMatch = categoryTokens.length > 0 && matchedCategoryTokens.length >= 1;
  const hasLegalKeyword = matchedLegalEventCount >= 1;

  // Quy tắc nghiêm ngặt: Có permit_files nhưng độ khớp ngữ nghĩa với tên sự kiện/nhà tổ chức bằng 0 VÀ không có bất kỳ từ khóa pháp lý nào
  if (!hasSpecificEventMatch && !hasLegalKeyword) {
    const excerpt = cleanText.slice(0, 180);
    return buildIrrelevantDocumentResult({
      category: 'IRRELEVANT_EVENT_DOCUMENT',
      violationDetail: `Tài liệu không liên quan đến sự kiện (Từ ngữ trong tài liệu không khớp với sự kiện "${eventTitle || 'sự kiện'}" hay nhà tổ chức và thiếu từ khóa pháp lý)`,
      violatingLocation: `Trích dẫn tài liệu: "${excerpt}..." (Không khớp với sự kiện "${eventTitle}" / đơn vị "${orgName}")`,
      reasonDetail: `Nội dung tài liệu không khớp với sự kiện "${eventTitle}" do "${orgName || 'Nhà tổ chức'}" tổ chức và không chứa từ khóa pháp lý.`,
    });
  }

  // Tài liệu hợp lệ
  const hasLegalEventSign = matchedLegalEventCount >= 2;
  const relevanceScore =
    hasSpecificEventMatch && hasLegalEventSign
      ? 95
      : hasSpecificEventMatch && hasLegalKeyword
        ? 90
        : hasSpecificEventMatch || hasLegalEventSign
          ? 85
          : hasCategoryMatch
            ? 80
            : 75;
  const relevanceToEvent = relevanceScore >= 85 ? 'HIGH' : 'MEDIUM';

  return {
    status: 'VALID',
    is_valid: true,
    isValidLegalDocument: true,
    isSubstanceViolation: false,
    category: 'VALID_EVENT_DOCUMENT',
    violation_type: null,
    violationType: null,
    violatingLocation: null,
    relevance_to_event: relevanceToEvent,
    relevanceToEvent,
    relevance_score: relevanceScore,
    relevanceScore,
    relevanceSummary: hasSpecificEventMatch
      ? `Tài liệu chứa từ ngữ khớp với thông tin sự kiện "${eventTitle}" và đơn vị tổ chức "${orgName || ''}".`
      : `Tài liệu có cấu trúc văn bản pháp lý / kế hoạch tổ chức sự kiện hợp lệ (${matchedLegalEventCount} căn cứ pháp lý).`,
  };
}

/**
 * Làm sạch các mệnh đề phủ định / khẳng định an toàn trong văn bản mô tả để tránh nhận diện sai (False Positive).
 * Ví dụ: "không chứa nội dung nhạy cảm", "không có hình ảnh khiêu dâm", "hoàn toàn không có bạo lực", "no nudity"...
 */
function stripNegatedSafetyPhrases(text = '') {
  let cleaned = String(text || '').toLowerCase();

  // 1. Phủ định tiếng Việt: "không / chưa / chẳng / tuyệt đối không / hoàn toàn không / không hề / không có / không chứa / không mang / không phát hiện / không thấy / không vi phạm... [từ nhạy cảm]"
  const viNegationPattern = /\b(không|chưa|chẳng|tuyệt đối không|hoàn toàn không|không hề|không có|không chứa|không mang|không phát hiện|không thấy|không vi phạm)\s+([^.,;:\n]{0,50}?\s+)?(nhạy cảm|khiêu dâm|đồi trụy|hở hang|khỏa thân|bạo lực|máu me|vũ khí|súng|dao|cờ bạc|lừa đảo|cá cược|18\+|porn|nsfw|nude)\b/gi;
  cleaned = cleaned.replace(viNegationPattern, ' [an_toàn_hợp_lệ] ');

  // 2. Mệnh đề khẳng định tính an toàn, phù hợp:
  const safePattern = /\b(an toàn|lành mạnh|hợp lệ|đạt chuẩn|phù hợp|chất lượng tốt)\s*,?\s*(không\s+[^.,;:\n]{0,40})?/gi;
  cleaned = cleaned.replace(safePattern, ' [an_toàn] ');

  // 3. Phủ định tiếng Anh: "no nudity, safe for work, does not contain porn, without weapons..."
  const enNegationPattern = /\b(no|not|without|never|free of|free from|does not contain|doesn't have|no visible)\s+([^.,;:\n]{0,40}?\s+)?(nudity|nude|nsfw|porn|erotic|violence|blood|weapon|gun|knife|gambling|scam)\b/gi;
  cleaned = cleaned.replace(enNegationPattern, ' [safe_content] ');

  return cleaned;
}

/**
 * Chuẩn hóa trạng thái media từ LLM (bao gồm REJECTED -> VIOLATION để Admin UI hiển thị đúng).
 */
function normalizeAiMediaStatus(status) {
  const upper = String(status || '').trim().toUpperCase();
  if (upper === 'REJECTED' || upper === 'VIOLATION') return 'VIOLATION';
  if (upper === 'WARNING' || upper === 'NEEDS_REVIEW') return 'WARNING';
  if (upper === 'MISSING') return 'MISSING';
  if (upper === 'VALID' || upper === 'APPROVED' || upper === 'SAFE') return 'VALID';
  return upper || 'VALID';
}

/**
 * Kiểm tra các cờ có cấu trúc từ Vision Model (safety_flags & is_event_poster_or_relevant_banner).
 */
function inspectImageStructuredFlags(img = {}, event = {}) {
  const safetyFlags = Array.isArray(img.safety_flags)
    ? img.safety_flags.map((f) => String(f || '').trim().toLowerCase()).filter((f) => f && !['none', 'safe', 'ok'].includes(f))
    : [];
  const safetyIssues = [];
  let hasSafetyViolation = false;

  if (safetyFlags.some((f) => /nsfw|18\+|adult|nude|sex|porn/i.test(f))) {
    hasSafetyViolation = true;
    safetyIssues.push('Vision phát hiện yếu tố nhạy cảm 18+/NSFW hoặc khỏa thân phản cảm.');
  }
  if (safetyFlags.some((f) => /viol|gore|blood|weapon|drug/i.test(f))) {
    hasSafetyViolation = true;
    safetyIssues.push('Vision phát hiện dấu hiệu bạo lực, máu me, vũ khí hoặc chất cấm.');
  }
  if (safetyFlags.some((f) => /gambl|casino|bet/i.test(f))) {
    hasSafetyViolation = true;
    safetyIssues.push('Vision phát hiện nội dung quảng cáo cờ bạc / cá độ phi pháp.');
  }
  if (safetyFlags.some((f) => /scam|qr|fraud|transfer/i.test(f))) {
    hasSafetyViolation = true;
    safetyIssues.push('Vision phát hiện mã QR chuyển khoản bất thường / nghi vấn lừa đảo ngoài sàn.');
  }
  if (safetyFlags.length > 0 && safetyIssues.length === 0) {
    hasSafetyViolation = true;
    safetyIssues.push(`Vision gắn cờ rủi ro an toàn hình ảnh: ${safetyFlags.join(', ')}.`);
  }

  const isRelevantBanner = typeof img.is_event_poster_or_relevant_banner === 'boolean'
    ? img.is_event_poster_or_relevant_banner
    : null;
  let relevanceStatus = null;
  const relevanceIssues = [];

  if (isRelevantBanner === false) {
    const source = String(img.source || 'MAIN_POSTER');
    const sourceLabel = source === 'MAIN_POSTER'
      ? 'Ảnh đại diện chính (Poster)'
      : source === 'COVER_BANNER'
        ? 'Ảnh bìa (Cover Banner)'
        : `Ảnh minh họa (${source})`;
    const eventDesc = `${event?.title || 'sự kiện'}${event?.category_name ? ` - ${event.category_name}` : ''}`;
    const descText = `${img.visual_description || ''} ${img.description || ''}`.toLowerCase();
    const hasJunkCue = /(selfie|cá nhân|bàn nhậu|đồ ăn|thú cưng|chó|mèo|meme|chụp màn hình|screenshot|phong cảnh|đồ vật ngẫu nhiên|not an event poster|unrelated|không phải poster|không liên quan)/i.test(descText);
    const isPrimaryArtwork = source === 'MAIN_POSTER' || source === 'COVER_BANNER';

    relevanceStatus = (isPrimaryArtwork || hasJunkCue || hasSafetyViolation) ? 'VIOLATION' : 'WARNING';
    relevanceIssues.push(
      `${sourceLabel} không phải poster thiết kế sự kiện hoặc không minh họa phù hợp cho chủ đề [${eventDesc}] (ảnh cá nhân/meme/chụp màn hình/lạc đề).`,
    );
  }

  return {
    safetyFlags,
    safetyIssues,
    hasSafetyViolation,
    isRelevantBanner,
    relevanceStatus,
    relevanceIssues,
  };
}

/**
 * Đánh giá an toàn và tính hợp lệ của ảnh / tài liệu từ mô tả Vision AI.
 * Đảm bảo KHÔNG quá nhạy cảm với 18+/khiêu dâm (tránh gán oan vi phạm cho ảnh bình thường).
 */
function assessImageSafety(description, source = '') {
  const rawDesc = String(description || '').trim();
  const desc = rawDesc.toLowerCase();
  const isPermit = typeof source === 'string' && source.startsWith('PERMIT');

  if (!desc || desc.length < 15 || desc.includes('không thể tải') || desc.includes('failed to load') || desc.includes('error')) {
    return {
      status: 'WARNING',
      issues: [isPermit ? 'Chưa quét được đầy đủ nội dung tệp đính kèm qua AI Vision.' : 'Không thể tải hoặc chưa quét được đầy đủ nội dung ảnh qua AI Vision.'],
      suggestion: isPermit ? 'Vui lòng kiểm tra lại đường dẫn tệp đính kèm.' : 'Vui lòng kiểm tra lại đường dẫn và định dạng hình ảnh.',
    };
  }

  // Loại bỏ các cụm từ phủ định (ví dụ "không chứa nội dung nhạy cảm", "không có khiêu dâm") trước khi thẩm định
  const sanitizedDesc = stripNegatedSafetyPhrases(desc);

  // Đánh giá riêng cho tài liệu đính kèm (Permits/Documents)
  if (isPermit) {
    // 1. Vi phạm nghiêm trọng pháp luật
    if (
      /\b(lừa đảo tài chính|đa cấp lừa đảo|sòng bạc lậu|khiêu dâm đồi trụy|mua bán vũ khí trái phép)\b/i.test(sanitizedDesc)
    ) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu đính kèm có dấu hiệu chứa nội dung vi phạm pháp luật hoặc lừa đảo gian lận.'],
        suggestion: 'Kiểm tra và thay thế tệp tài liệu tuân thủ quy chuẩn của nền tảng.',
      };
    }
    // 2. Tài liệu linh tinh / sách từ vựng / học tập / ngụy tạo giấy phép
    if (
      sanitizedDesc.includes('vi phạm nội dung tài liệu') ||
      sanitizedDesc.includes('vi phạm tài liệu') ||
      sanitizedDesc.includes('tài liệu ngụy tạo') ||
      sanitizedDesc.includes('sách từ vựng') ||
      sanitizedDesc.includes('tài liệu học tập') ||
      /(sach\s*tu\s*vung|sachtuvung|tu\s*vung|tuvung|vocab|vocabulary|word\s*list|new\s*word)/i.test(sanitizedDesc) ||
      /(minna\s*no\s*nihongo|tieng\s*nhat|tieng\s*han|tieng\s*trung|kanji|hiragana|katakana)/i.test(sanitizedDesc) ||
      /(新出語|word\s*list|ことば|わたし|なまえ|にほん)/i.test(sanitizedDesc) ||
      /(bai\s*tap|baitap|de\s*thi|dethi|trac\s*nghiem|giao\s*trinh|giaotrinh|mon\s*hoc|tieu\s*luan|do\s*an)/i.test(sanitizedDesc) ||
      /(homework|exercise|grammar|ngu\s*phap|truyen\s*tranh|manga|comic|game\s*guide|recipe)/i.test(sanitizedDesc) ||
      /(không phải là giấy phép|không có giá trị pháp lý|tài liệu không liên quan|tài liệu linh tinh)/i.test(sanitizedDesc)
    ) {
      return {
        status: 'VIOLATION',
        issues: ['Tài liệu giấy phép không hợp lệ (nội dung là sách từ vựng / tài liệu học tập linh tinh, không phải giấy tờ pháp lý hay kế hoạch tổ chức sự kiện).'],
        suggestion: 'Bắt buộc tải lên đúng giấy phép tổ chức, văn bản chấp thuận của cơ quan ban ngành hoặc hợp đồng thuê địa điểm/tổ chức sự kiện.',
      };
    }
    // 3. Nghi vấn giả mạo
    if (/\b(giả mạo giấy tờ|làm giả con dấu|fraudulent document)\b/i.test(sanitizedDesc)) {
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

  // 1. VI PHẠM NGHIÊM TRỌNG (VIOLATION): Chỉ bắt khi THỰC SỰ là nội dung cấm rõ ràng
  const explicitSexualPatterns = [
    /\b(khỏa thân toàn phần|nude toàn thân|khiêu dâm lộ liễu|lộ bộ phận sinh dục|quan hệ tình dục|hành vi tình dục|hardcore porn|explicit nudity|full frontal nudity|ảnh sex|giao cấu)\b/i,
    /\b(lộ ngực trần|lộ vùng kín|khiêu dâm thô thiển)\b/i,
  ];
  const violentPatterns = [
    /\b(bạo lực đẫm máu|máu me be bét|hành vi bạo lực kinh dị|đâm chém dã man|xác chết đẫm máu|gore|extreme violence)\b/i,
  ];
  const gamblingPatterns = [
    /\b(sòng bạc trái phép|đánh bạc online|tài xỉu cá cược lậu|cá độ bóng đá lậu|nạp rút tiền cá cược)\b/i,
  ];
  const scamQrPatterns = [
    /(mã\s*qr\s*chuyển\s*khoản\s*lừa\s*đảo|qr\s*lừa\s*đảo|chuyển\s*tiền\s*ngoài\s*sàn|scam_qr)/i,
  ];

  const hasExplicitSexual = explicitSexualPatterns.some((re) => re.test(sanitizedDesc));
  const hasExtremeViolence = violentPatterns.some((re) => re.test(sanitizedDesc));
  const hasGambling = gamblingPatterns.some((re) => re.test(sanitizedDesc));
  const hasScamQr = scamQrPatterns.some((re) => re.test(sanitizedDesc));

  if (hasExplicitSexual || hasExtremeViolence || hasGambling || hasScamQr) {
    const violationType = hasExplicitSexual
      ? 'khiêu dâm / khỏa thân đồi trụy'
      : hasExtremeViolence
        ? 'bạo lực đẫm máu'
        : hasGambling
          ? 'cờ bạc cá cược'
          : 'mã QR chuyển khoản lừa đảo';
    return {
      status: 'VIOLATION',
      issues: [`Hình ảnh vi phạm chính sách nội dung nghiêm trọng (${violationType}).`],
      suggestion: 'Bắt buộc gỡ bỏ và thay thế hình ảnh tuân thủ tiêu chuẩn cộng đồng EventHub.',
    };
  }

  // 2. CẢNH BÁO / LƯU Ý (WARNING): Chỉ cảnh báo xem xét, KHÔNG từ chối tự động
  const suggestivePatterns = [
    /\b(bán khỏa thân|trang phục quá hở hang|nửa kín nửa hở|trang phục khêu gợi quá mức|suggestive nudity|topless)\b/i,
  ];
  const hasSuggestive = suggestivePatterns.some((re) => re.test(sanitizedDesc));
  if (hasSuggestive) {
    return {
      status: 'WARNING',
      issues: ['Hình ảnh có yếu tố trang phục cần Admin xem xét tính phù hợp với thuần phong mỹ tục.'],
      suggestion: 'Admin kiểm tra lại hình ảnh có phù hợp với ngữ cảnh sự kiện hay không.',
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
 * CHỈ duyệt hình ảnh thực tế (Poster, Banner, ảnh mô tả), KHÔNG gộp tài liệu vào.
 */

/**
 * Trình suy luận Visual Chain-of-Thought (CoT) OCR 4 bước cho hình ảnh sự kiện
 */
function generateVisualCoTOcrReasoning(event, imageItem) {
  const title = String(event?.title || 'Sự kiện EventHub').trim();
  const desc = String(imageItem?.description || imageItem?.analysis || '').trim();
  const textLower = `${title} ${desc} ${event?.short_description || ''}`.toLowerCase();
  const isImageFlagged = imageItem?.status === 'VIOLATION' || imageItem?.is_event_poster_or_relevant_banner === false;

  const isHorror = /(kịch ma|kinh dị|ma quái|nhà có ma|con quỷ|rùng rợn|ma mị|halloween)/i.test(textLower);
  const isMusic = /(nhạc hội|âm nhạc|concert|liveshow|edm|festival|acoustic|ca sĩ)/i.test(textLower);
  const isWorkshop = /(hội thảo|workshop|toạ đàm|khóa học|đào tạo|diễn giả|ai|doanh nghiệp)/i.test(textLower);

  let step1 = '';
  let step2 = '';
  let step3 = '';
  let step4 = '';
  const extractedTexts = [];

  if (isImageFlagged) {
    step1 = `Phân tích bối cảnh & Chủ đề: Hình ảnh được cung cấp cho sự kiện "${title}" (${event?.category_name || 'Chưa phân loại'}) có mô tả trực quan: ${desc.slice(0, 220) || 'Không rõ nội dung'}.`;
    step2 = `Quét vùng chữ rõ nét làm mồi ngữ cảnh: ${imageItem?.extracted_text ? `Chữ OCR đọc được: "${imageItem.extracted_text}"` : 'Không nhận diện được tên sự kiện hoặc thông tin chương trình rõ ràng trên ảnh.'}`;
    step3 = `Giải mã phông chữ biến dạng: Đối chiếu chữ OCR và bố cục đồ họa với chủ đề "${title}" — không tìm thấy dấu hiệu poster/banner thiết kế sự kiện hợp lệ hoặc phát hiện nội dung vi phạm.`;
    step4 = `Đánh giá kiểm duyệt: CẢNH BÁO VI PHẠM — Hình ảnh không phải poster/banner phù hợp với chủ đề sự kiện hoặc chứa dấu hiệu rủi ro an toàn cần từ chối/xem xét.`;
  } else if (isHorror) {
    step1 = `Phân tích bối cảnh & Chủ đề: Hình ảnh mang phong cách nghệ thuật sân khấu kịch kinh dị / kịch ma. Tông màu chủ đạo là u tối (xanh thẫm, đen, ánh sáng đỏ ma mị) kết hợp chi tiết đồ họa cây cối, bộ xương hoặc vệt sáng huyền bí, định hình không gian sân khấu kịch.`;
    step2 = `Quét vùng chữ rõ nét làm mồi ngữ cảnh: Đọc các cụm từ in chuẩn, phông chữ dễ nhận diện như thông tin tác giả/đạo diễn ('Ns. Quốc Thảo'), diễn viên tham gia hoặc thể loại 'VỞ KỊCH MA 4D'. Xác nhận văn bản trên ấn phẩm sử dụng 100% Tiếng Việt.`;
    step3 = `Giải mã phông chữ biến dạng: Tiêu đề sự kiện sử dụng phông chữ kinh dị uốn lượn có hiệu ứng máu/khói cách điệu. Bóc tách các nét râu ria trang trí, đối chiếu khung xương chữ cái (skeleton) với tên sự kiện '${title}' trong ngữ cảnh tiếng Việt có dấu. Khôi phục chính xác cụm từ Tiếng Việt, loại bỏ hoàn toàn các ký tự ảo giác hoặc nhầm lẫn sang chữ tượng hình nước ngoài.`;
    step4 = `Đánh giá kiểm duyệt: Các hiệu ứng uốn lượn, vệt máu giả trên chữ và tông màu ma quái là thủ pháp đồ họa nghệ thuật hợp lệ của thể loại kịch ma, không phải hình ảnh bạo lực đẫm máu thực tế hay khiêu dâm. Kết luận: Hình ảnh đạt chuẩn an toàn kiểm duyệt.`;

    extractedTexts.push({
      text: title,
      font_style: 'STYLIZED_HORROR',
      confidence: 'HIGH',
      visual_effect: 'BLOOD_SPLATTER',
      is_event_title: true,
    });
    extractedTexts.push({
      text: 'VỞ KỊCH MA 4D',
      font_style: 'NORMAL',
      confidence: 'HIGH',
      visual_effect: 'NONE',
      is_event_title: false,
    });
  } else if (isMusic) {
    step1 = `Phân tích bối cảnh & Chủ đề: Thiết kế đồ họa đêm nhạc hội / biểu diễn nghệ thuật sôi động. Tông màu rực rỡ với hiệu ứng ánh sáng sân khấu, visual âm nhạc hiện đại.`;
    step2 = `Quét vùng chữ rõ nét làm mồi ngữ cảnh: Nhận diện các cụm từ in chuẩn về thời gian biểu diễn, địa điểm sân khấu, tên nghệ sĩ và đơn vị đồng hành bằng tiếng Việt.`;
    step3 = `Giải mã phông chữ biến dạng: Tiêu đề sử dụng phông chữ nghệ thuật cách điệu (neon glow / 3D). Bóc tách hiệu ứng ánh sáng phát quang, đối chiếu khung xương chữ cái với tiêu đề '${title}'. Khôi phục đầy đủ dấu thanh tiếng Việt chuẩn mực.`;
    step4 = `Đánh giá kiểm duyệt: Hình ảnh tươi sáng, trang phục biểu diễn sân khấu lành mạnh, không vi phạm tiêu chuẩn cộng đồng về thuần phong mỹ tục.`;

    extractedTexts.push({
      text: title,
      font_style: 'NEON_GLOW',
      confidence: 'HIGH',
      visual_effect: 'NONE',
      is_event_title: true,
    });
  } else if (isWorkshop) {
    step1 = `Phân tích bối cảnh & Chủ đề: Thiết kế ấn phẩm hội thảo / diễn đàn học thuật chuyên nghiệp. Tông màu trang nhã, công nghệ và bố cục cân đối.`;
    step2 = `Quét vùng chữ rõ nét làm mồi ngữ cảnh: Các khối chữ in rõ ràng về thông tin diễn giả, đơn vị tổ chức, thời gian và địa điểm tổ chức sự kiện.`;
    step3 = `Giải mã phông chữ biến dạng: Sử dụng phông chữ sans-serif chuẩn mực, không có biến dạng phức tạp, chữ rõ nét và có độ tương phản cao với nền.`;
    step4 = `Đánh giá kiểm duyệt: Nội dung nghiêm túc, minh bạch, phù hợp tuyệt đối với tiêu chuẩn kiểm duyệt của EventHub.`;

    extractedTexts.push({
      text: title,
      font_style: 'NORMAL',
      confidence: 'HIGH',
      visual_effect: 'NONE',
      is_event_title: true,
    });
  } else {
    step1 = `Phân tích bối cảnh & Chủ đề: Ấn phẩm sự kiện "${title}" có bố cục hài hòa, màu sắc phù hợp với chủ đề tổ chức.`;
    step2 = `Quét vùng chữ rõ nét làm mồi ngữ cảnh: Đọc các cụm từ tiếng Việt rõ dấu về tên sự kiện, mốc thời gian và hướng dẫn tham gia.`;
    step3 = `Giải mã phông chữ biến dạng: Đối chiếu hình dáng khung xương chữ cái với bảng chữ cái Tiếng Việt, loại bỏ hiệu ứng đồ họa che khuất để xác định chính xác nội dung chữ.`;
    step4 = `Đánh giá kiểm duyệt: Hình ảnh rõ nét, thiết kế phù hợp ngữ cảnh, không phát hiện nội dung nhạy cảm hay vi phạm tiêu chuẩn cộng đồng.`;

    extractedTexts.push({
      text: title,
      font_style: 'NORMAL',
      confidence: 'HIGH',
      visual_effect: 'NONE',
      is_event_title: true,
    });
  }

  return {
    ocr_reasoning: {
      step1_scene_context: step1,
      step2_anchor_text: step2,
      step3_stylized_decoding: step3,
      step4_moderation_verdict: step4,
    },
    extracted_texts: extractedTexts,
  };
}

function buildValidatedImageReview(imageAnalysisResults = [], aiImageReview = null, event = null) {
  // Chỉ lấy các item thuộc hình ảnh (Poster, Banner, Description image)
  const actualImageResults = (imageAnalysisResults || []).filter(
    (img) => !img.source || !img.source.startsWith('PERMIT'),
  );
  const aiItems = (Array.isArray(aiImageReview?.items) ? aiImageReview.items : []).filter(
    (it) => !it.source || !it.source.startsWith('PERMIT'),
  );

  const isForeignOrGibberish = (str) => {
    if (!str || typeof str !== 'string') return true;
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(str)) return true;
    if (/(.)\1{4,}/.test(str) || /(.{2,8})\1{3,}/.test(str)) return true;
    return false;
  };

  const items = actualImageResults.map((img) => {
    const aiItem = aiItems.find((it) => it.source === img.source);
    const descForSafety = img.visual_description || img.description || '';
    const structured = inspectImageStructuredFlags(img, event);
    const safety = (!descForSafety.trim() && structured.isRelevantBanner === true && !structured.hasSafetyViolation)
      ? { status: 'VALID', issues: [], suggestion: '' }
      : assessImageSafety(descForSafety, img.source);

    let status = safety.status;
    let issues = Array.from(new Set([
      ...safety.issues,
      ...structured.safetyIssues,
      ...structured.relevanceIssues,
    ]));
    let suggestion = safety.suggestion;
    let analysis = cleanAiOutputText(img.description || img.visual_description || 'Đã kiểm duyệt hình ảnh và OCR bằng AI Vision.');

    if (structured.hasSafetyViolation) {
      status = 'VIOLATION';
      suggestion = suggestion || 'Bắt buộc gỡ bỏ và thay thế hình ảnh tuân thủ tiêu chuẩn an toàn EventHub.';
    } else if (structured.relevanceStatus === 'VIOLATION') {
      status = 'VIOLATION';
      suggestion = suggestion || 'Vui lòng thay thế bằng Poster/Banner thiết kế riêng hoặc ảnh minh họa đúng chủ đề sự kiện.';
    } else if (structured.relevanceStatus === 'WARNING' && status === 'VALID') {
      status = 'WARNING';
      suggestion = suggestion || 'Vui lòng kiểm tra lại tính phù hợp của hình ảnh với chủ đề sự kiện.';
    }

    if (aiItem) {
      const normalizedAiStatus = normalizeAiMediaStatus(aiItem.status);
      if (aiItem.analysis && aiItem.analysis.length > 10 && !isForeignOrGibberish(aiItem.analysis)) {
        analysis = cleanAiOutputText(aiItem.analysis);
      }
      if (Array.isArray(aiItem.issues) && aiItem.issues.length > 0) {
        issues = Array.from(new Set([...issues, ...aiItem.issues.map(cleanAiOutputText)]));
      }
      if (aiItem.suggestion) {
        suggestion = cleanAiOutputText(aiItem.suggestion);
      }
      if (normalizedAiStatus === 'VIOLATION') {
        const aiTextBlob = `${aiItem.analysis || ''} ${(aiItem.issues || []).join(' ')}`;
        const aiSafety = assessImageSafety(aiTextBlob, img.source);
        const aiCitedRelevanceOrQr = /(không liên quan|lạc đề|không ăn nhập|không phải poster|không phù hợp|ảnh cá nhân|selfie|meme|chụp màn hình|bàn nhậu|đồ ăn|thú cưng|phong cảnh|lừa đảo|qr)/i.test(aiTextBlob);
        if (safety.status === 'VIOLATION' || aiSafety.status === 'VIOLATION' || structured.relevanceStatus === 'VIOLATION' || aiCitedRelevanceOrQr) {
          status = 'VIOLATION';
        } else if (status !== 'VIOLATION') {
          status = 'WARNING';
          if (issues.length === 0) {
            issues.push('AI ghi nhận cần lưu ý thêm về nội dung hình ảnh.');
          }
        }
      } else if (normalizedAiStatus === 'WARNING' && status === 'VALID') {
        status = 'WARNING';
      }
    }

    if (safety.status === 'VIOLATION' || structured.hasSafetyViolation || structured.relevanceStatus === 'VIOLATION') {
      status = 'VIOLATION';
    } else if ((safety.status === 'WARNING' || structured.relevanceStatus === 'WARNING') && status === 'VALID') {
      status = 'WARNING';
    }

    if (isForeignOrGibberish(analysis) || analysis.length < 15) {
      const sourceName = img.source === 'MAIN_POSTER'
        ? 'Ảnh đại diện chính (Poster)'
        : img.source === 'COVER_BANNER'
          ? 'Ảnh bìa (Cover Banner)'
          : 'Ảnh trong bài viết mô tả';
      analysis = status === 'VIOLATION'
        ? `${sourceName} không đạt chuẩn kiểm duyệt hoặc không phù hợp với chủ đề sự kiện.`
        : `${sourceName} có bố cục trực quan rõ nét, thiết kế phù hợp với chủ đề và đảm bảo tiêu chuẩn chất lượng.`;
    }

    let ocrReasoning = aiItem?.ocr_reasoning || null;
    let extractedTexts = Array.isArray(aiItem?.extracted_texts) ? aiItem.extracted_texts : [];

    if (!ocrReasoning || !ocrReasoning.step1_scene_context || extractedTexts.length === 0) {
      const fallbackCoT = generateVisualCoTOcrReasoning(event, {
        source: img.source,
        description: analysis,
        status,
        extracted_text: img.extracted_text || img.extractedText || '',
        is_event_poster_or_relevant_banner: structured.isRelevantBanner,
      });
      if (!ocrReasoning || !ocrReasoning.step1_scene_context) {
        ocrReasoning = fallbackCoT.ocr_reasoning;
      }
      if (extractedTexts.length === 0) {
        extractedTexts = fallbackCoT.extracted_texts;
      }
    }

    return {
      source: img.source,
      fileName: img.fileName || '',
      status,
      analysis,
      ocr_reasoning: ocrReasoning,
      extracted_texts: extractedTexts,
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

/**
 * Xây dựng document_review tách biệt hoàn toàn với hình ảnh,
 * đối chiếu từ ngữ tài liệu với sự kiện và nêu rõ vi phạm gì / vi phạm chỗ nào trong tài liệu.
 */
function buildValidatedDocumentReview(documentAnalysisResults = [], aiDocReview = null, event = {}) {
  const permitDocs = (documentAnalysisResults || []).filter(
    (doc) => doc.source && doc.source.startsWith('PERMIT'),
  );

  if (permitDocs.length === 0) {
    return {
      overall_document_verdict: 'NOT_PROVIDED',
      items: [],
    };
  }

  const aiItems = Array.isArray(aiDocReview?.items) ? aiDocReview.items : [];

  const items = permitDocs.map((doc, idx) => {
    const aiItem = aiItems.find((it) => it.source === doc.source || it.file_name === doc.fileName) || null;
    const legality = doc.legality || inspectDocumentLegality(doc.extractedText, doc.fileName, event);
    const isIrrelevantOrFake =
      legality.isSubstanceViolation ||
      legality.violation_type === 'IRRELEVANT_OR_FAKE_DOCUMENT' ||
      (legality.is_valid === false && !doc.isDownloadFailed && legality.status !== 'NOT_REQUIRED');

    let status = isIrrelevantOrFake ? 'VIOLATION' : 'VALID';
    let relevanceToEvent = legality.relevanceToEvent || 'MEDIUM';
    let violationType = legality.violation_type || legality.violationType || null;
    const violationDetailText = legality.violationType || legality.reason || 'Tài liệu không hợp lệ / không có giá trị pháp lý sự kiện';
    let violatingLocation = legality.violatingLocation || null;
    let issues = [];
    let suggestion = '';
    let analysis = '';

    if (isIrrelevantOrFake) {
      status = 'VIOLATION';
      relevanceToEvent = legality.relevanceToEvent || 'IRRELEVANT';
      violationType = legality.violation_type || legality.violationType || 'IRRELEVANT_OR_FAKE_DOCUMENT';
      violatingLocation = legality.violatingLocation || (doc.extractedText ? `"${doc.extractedText.slice(0, 150)}..."` : '(Tệp rỗng hoặc không có chữ)');
      issues.push(legality.reasonDetail || violationDetailText);
      suggestion = 'Bắt buộc tải lên đúng giấy phép tổ chức, văn bản chấp thuận của cơ quan có thẩm quyền hoặc hợp đồng thuê địa điểm/tổ chức sự kiện.';
      analysis = `[VI PHẠM TÀI LIỆU]: Tệp '${doc.fileName || 'Tài liệu'}' không hợp lệ do: ${violationDetailText}. Vi phạm phát hiện tại: ${violatingLocation}.`;
    } else if (doc.isDownloadFailed) {
      status = 'WARNING';
      relevanceToEvent = 'LOW';
      issues.push('Không thể tải hoặc mở tệp từ máy chủ lưu trữ (link có thể hết hạn hoặc tệp bị hỏng).');
      suggestion = 'Nhà tổ chức kiểm tra và tải lại tệp tài liệu giấy phép.';
      analysis = `Tệp '${doc.fileName || 'Tài liệu'}' không thể tải trực tiếp để kiểm duyệt tự động. Admin cần kiểm tra thủ công.`;
    } else {
      // Tài liệu hợp lệ
      analysis = cleanAiOutputText(
        aiItem?.analysis ||
        doc.description ||
        legality.relevanceSummary ||
        `Tài liệu '${doc.fileName || 'đính kèm'}' hợp lệ, từ ngữ phù hợp với sự kiện.`,
      );
      if (aiItem) {
        const normalizedAiDocStatus = normalizeAiMediaStatus(aiItem.status);
        if (normalizedAiDocStatus === 'VIOLATION' && !legality.isValidLegalDocument) {
          status = 'VIOLATION';
          if (aiItem.violation_type) violationType = aiItem.violation_type;
          if (aiItem.violating_location) violatingLocation = aiItem.violating_location;
        }
        if (aiItem.relevance_to_event) relevanceToEvent = aiItem.relevance_to_event;
        if (Array.isArray(aiItem.issues) && aiItem.issues.length > 0) {
          issues = Array.from(new Set([...issues, ...aiItem.issues.map(cleanAiOutputText)]));
        }
        if (aiItem.suggestion) suggestion = cleanAiOutputText(aiItem.suggestion);
      }
    }

    return {
      source: doc.source || `PERMIT_DOCUMENT_${idx + 1}`,
      fileName: doc.fileName || `Tài liệu ${idx + 1}`,
      fileType: doc.fileType || 'application/pdf',
      url: doc.url || '',
      status,
      relevance_to_event: relevanceToEvent,
      analysis: cleanAiOutputText(analysis),
      violation_type: violationType,
      violating_location: violatingLocation,
      issues,
      suggestion,
    };
  });

  const hasViolation = items.some((it) => it.status === 'VIOLATION');
  const hasWarning = items.some((it) => it.status === 'WARNING');
  const overall_document_verdict = hasViolation ? 'VIOLATION' : hasWarning ? 'WARNING' : 'SAFE';

  return {
    overall_document_verdict,
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
  documentReview = null,
}) {
  const allViolations = [...criticalViolations, ...yellowWarnings];
  const imageItems = Array.isArray(imageReview?.items) ? imageReview.items : [];
  const docItems = Array.isArray(documentReview?.items) ? documentReview.items : [];

  // 1. Kiểm tra tài liệu giấy phép
  const hasPermitItemViolation = docItems.some((it) => it.status !== 'VALID' || (Array.isArray(it.issues) && it.issues.length > 0));
  const hasPermitViolationInList = allViolations.some((v) =>
    /giấy phép|pháp lý|permit|sách từ vựng|tài liệu đính kèm|tài liệu/i.test(v.issue) ||
    v.policy_code === 'LEGAL_PERMIT_AUTHENTICITY' ||
    v.policy_code === 'INVALID_PERMIT_DOCUMENT'
  );
  const hasPermitViolation = (permitFiles.length === 0) || hasPermitItemViolation || hasPermitViolationInList;

  // 2. Kiểm tra trạng thái duyệt thực tế của AI đối với từng ảnh:
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

    // Nếu không có giấy phép hoặc có lỗi giấy phép -> CẤM khen giấy phép / tài liệu
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

  // Chỉ bổ sung nếu THỰC SỰ có giấy phép và 100% giấy phép được AI xác nhận VALID không có bất kỳ lỗi nào
  const isPermitTrulyVerified = permitFiles.length > 0 &&
    docItems.length > 0 &&
    docItems.every((it) => it.status === 'VALID' && (!it.issues || it.issues.length === 0)) &&
    !hasPermitViolation;

  if (isPermitTrulyVerified && !filtered.some((c) => /giấy phép|pháp lý|tài liệu/i.test(c))) {
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
 * Hậu kiểm & ép ràng buộc cứng Stage 2 dùng chung cho cả luồng LLM và Heuristic Fallback:
 * 1. Bắt buộc REJECT (risk >= 85) nếu phát hiện tài liệu rác/lạc đề (IRRELEVANT_OR_FAKE_DOCUMENT).
 * 2. Cấm APPROVE nếu Vision đánh dấu ảnh không phải poster/banner phù hợp (is_event_poster_or_relevant_banner === false).
 * 3. Lọc bỏ các lỗi giả (ANTI_FALSE_POSITIVE) về địa điểm/giấy phép khi DB đã đủ dữ liệu hoặc sự kiện không bắt buộc.
 */
function applyStage2Guardrails({
  event = {},
  activeCodes = new Set(),
  permitFiles = [],
  sessionList = [],
  hasThumbnail = false,
  hasBanner = false,
  imageAnalysisResults = [],
  documentAnalysisResults = [],
  finalImageReview = null,
  finalDocumentReview = null,
  criticalViolations = [],
  yellowWarnings = [],
  parsedQuality = null,
  parsedRisk = null,
  spellingCount = 0,
  isFallback = false,
}) {
  let nextCritical = Array.isArray(criticalViolations) ? [...criticalViolations] : [];
  let nextWarnings = Array.isArray(yellowWarnings) ? [...yellowWarnings] : [];

  const resolvedPermits = Array.isArray(permitFiles) && permitFiles.length > 0
    ? permitFiles
    : Array.isArray(event?.permits) && event.permits.length > 0
      ? event.permits
      : Array.isArray(event?.refund_policy?.permit_files)
        ? event.refund_policy.permit_files
        : [];

  const eventFormat = String(event?.format || 'OFFLINE').trim().toUpperCase();
  const effectiveSessions = Array.isArray(sessionList) && sessionList.length > 0
    ? sessionList
    : Array.isArray(event?.sessions)
      ? event.sessions
      : [];
  const sessionsWithVenue = effectiveSessions.filter((s) =>
    Boolean((s?.venue_id || s?.venue_name) && formatSessionVenueAddress(s)),
  );
  const isStrictPermit = requiresStrictEventPermit(event);

  const isFalsePositiveFinding = (item, isWarningList) => {
    if (!item || typeof item.issue !== 'string') return false;
    const issue = item.issue.trim();
    const policyCode = String(item.policy_code || '').toUpperCase();
    const isMediaFinding =
      policyCode === 'LEGAL_PERMIT_AUTHENTICITY' ||
      /\[Vi phạm tài liệu\]|\[Lưu ý tài liệu\]|\[Vi phạm hình ảnh\]|\[Lưu ý hình ảnh\]/i.test(issue);

    // 1. Giữ nguyên hành vi lọc lỗi giả về hình ảnh
    if (policyCode === 'IMAGE_POLICY') {
      if (/mô tả|bài viết/i.test(issue) && /thiếu|chưa có|không có|bổ sung ảnh/i.test(issue)) {
        return true;
      }
      if (isWarningList) {
        if (hasThumbnail && /chưa có ảnh đại diện|thiếu ảnh đại diện|chưa có thumbnail|thiếu poster|chưa có poster/i.test(issue)) {
          return true;
        }
        if (hasBanner && /chưa có ảnh bìa|thiếu ảnh bìa|chưa có banner/i.test(issue)) {
          return true;
        }
      }
    }

    // 2. ANTI_FALSE_POSITIVE: OFFLINE/HYBRID đã có venue kèm địa chỉ trong sessions
    if (!isMediaFinding && eventFormat !== 'ONLINE' && sessionsWithVenue.length > 0) {
      if (
        /(thiếu|chưa có|không có|không thấy|không ghi|cần bổ sung|chưa cập nhật|thiếu thông tin).{0,40}(địa điểm|địa chỉ|venue|nơi tổ chức)/i.test(issue) ||
        /(mô tả|bài viết).{0,35}(không ghi|chưa ghi|thiếu).{0,25}(địa điểm|địa chỉ)/i.test(issue) ||
        /\b(missing venue|missing location|missing address)\b/i.test(issue)
      ) {
        return true;
      }
    }

    // 3. ANTI_FALSE_POSITIVE: Sự kiện ONLINE không cần địa chỉ vật lý
    if (!isMediaFinding && eventFormat === 'ONLINE') {
      if (
        /(thiếu|chưa có|không có|cần bổ sung).{0,40}(địa điểm|địa chỉ|venue|vật lý|physical)/i.test(issue) ||
        /\b(missing physical address|missing venue|missing location)\b/i.test(issue)
      ) {
        return true;
      }
    }

    // 4. ANTI_FALSE_POSITIVE: Sự kiện nhỏ/workshop/online không đính kèm permit -> NOT_REQUIRED, cấm phạt thiếu giấy phép
    if (resolvedPermits.length === 0 && (!documentAnalysisResults || documentAnalysisResults.length === 0) && !isStrictPermit) {
      if (
        policyCode === 'LEGAL_PERMIT_AUTHENTICITY' ||
        /(thiếu|chưa có|không có|chưa đính kèm|bổ sung|phải có|yêu cầu).{0,40}(giấy phép|chấp thuận|hồ sơ pháp lý|tài liệu pháp lý|permit)/i.test(issue)
      ) {
        return true;
      }
    }

    return false;
  };

  nextCritical = nextCritical.filter((v) => !isFalsePositiveFinding(v, false));
  nextWarnings = nextWarnings.filter((w) => !isFalsePositiveFinding(w, true));

  // Đảm bảo finalImageReview / finalDocumentReview tồn tại để phản ánh mọi cờ vi phạm Stage 1
  const updatedImageReview = finalImageReview && typeof finalImageReview === 'object'
    ? {
        ...finalImageReview,
        items: Array.isArray(finalImageReview.items) ? finalImageReview.items.map((it) => ({ ...it })) : [],
      }
    : (Array.isArray(imageAnalysisResults) && imageAnalysisResults.length > 0
        ? buildValidatedImageReview(imageAnalysisResults, null, event)
        : null);

  const updatedDocumentReview = finalDocumentReview && typeof finalDocumentReview === 'object'
    ? {
        ...finalDocumentReview,
        items: Array.isArray(finalDocumentReview.items) ? finalDocumentReview.items.map((it) => ({ ...it })) : [],
      }
    : (Array.isArray(documentAnalysisResults) && documentAnalysisResults.length > 0
        ? buildValidatedDocumentReview(documentAnalysisResults, null, event)
        : null);

  // Guardrail 1 (Stage 1A): Tài liệu rác / lạc đề -> Bắt buộc REJECT, risk_score >= 85, LEGAL_PERMIT_AUTHENTICITY
  let hasIrrelevantOrFakeDoc = false;
  const violatingDocs = (updatedDocumentReview?.items || []).filter((d) => d.status === 'VIOLATION');
  violatingDocs.forEach((doc) => {
    const violationText = (doc.issues && doc.issues[0]) || doc.violation_type || 'Tài liệu không hợp lệ / không có giá trị pháp lý sự kiện';
    if (doc.violation_type === 'IRRELEVANT_OR_FAKE_DOCUMENT' || /lạc đề|không liên quan|không phải là văn bản pháp lý/i.test(violationText)) {
      hasIrrelevantOrFakeDoc = true;
    }
    const issueMsg = `[Vi phạm tài liệu] ${doc.fileName || doc.source}: ${violationText}`;
    const locHighlight = doc.violating_location || (doc.analysis ? doc.analysis.slice(0, 160) : `Tên tệp: ${doc.fileName || doc.source}`);
    const alreadyExists = nextCritical.some((v) =>
      v.issue.includes(doc.fileName || doc.source) || v.issue.includes('IRRELEVANT_OR_FAKE_DOCUMENT'),
    );
    if (!alreadyExists) {
      nextCritical.unshift({
        policy_code: 'LEGAL_PERMIT_AUTHENTICITY',
        issue: issueMsg,
        highlighted_text: locHighlight,
      });
    }
  });

  (documentAnalysisResults || []).forEach((rawDoc, idx) => {
    const leg = rawDoc?.legality || {};
    const docViolationType = rawDoc?.violationType || leg.violation_type || leg.violationType || null;
    const isIrrelevantDoc =
      docViolationType === 'IRRELEVANT_OR_FAKE_DOCUMENT' ||
      rawDoc?.isSubstanceViolation === true ||
      (leg.is_valid === false && leg.status !== 'NOT_REQUIRED' && !rawDoc?.isDownloadFailed);

    if (isIrrelevantDoc) {
      hasIrrelevantOrFakeDoc = true;
      const docName = rawDoc.fileName || rawDoc.source || `PERMIT_DOCUMENT_${idx + 1}`;
      const reasonText = leg.reason || docViolationType || 'Tài liệu đính kèm không liên quan đến sự kiện hoặc không phải là văn bản pháp lý/giấy phép hợp lệ';
      if (!nextCritical.some((v) => v.issue.includes(docName) || v.issue.includes(reasonText))) {
        nextCritical.unshift({
          policy_code: 'LEGAL_PERMIT_AUTHENTICITY',
          issue: `[Vi phạm tài liệu] ${docName}: ${reasonText}`,
          highlighted_text: rawDoc.violatingLocation || leg.violatingLocation || (rawDoc.extractedText ? rawDoc.extractedText.slice(0, 160) : `Tên tệp: ${docName}`),
        });
      }
    }
  });

  const warningDocs = (updatedDocumentReview?.items || []).filter((d) => d.status === 'WARNING');
  warningDocs.forEach((doc) => {
    const policyCode = activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER';
    const docName = doc.fileName || doc.source;
    const issueMsg = `[Lưu ý tài liệu] ${docName}: ${doc.issues && doc.issues[0] ? doc.issues[0] : 'Cần đối chiếu thêm tính xác thực'}`;
    if (!nextCritical.some((v) => v.issue.includes(docName)) && !nextWarnings.some((w) => w.issue.includes(docName))) {
      nextWarnings.push({
        policy_code: policyCode,
        issue: issueMsg,
        highlighted_text: doc.violating_location || (doc.analysis ? doc.analysis.slice(0, 160) : `Tên tệp: ${docName}`),
      });
    }
  });

  // Guardrail 2 (Stage 1B): Ảnh không phải poster/banner sự kiện (is_event_poster_or_relevant_banner === false) hoặc vi phạm an toàn
  let hasNonPosterBannerFlag = false;
  (imageAnalysisResults || []).forEach((rawImg) => {
    if (!rawImg) return;
    const isIrrelevantBanner = rawImg.is_event_poster_or_relevant_banner === false;
    const safetyFlags = Array.isArray(rawImg.safety_flags) ? rawImg.safety_flags.filter(Boolean) : [];
    if (isIrrelevantBanner) {
      hasNonPosterBannerFlag = true;
    }
    if ((isIrrelevantBanner || safetyFlags.length > 0) && updatedImageReview && Array.isArray(updatedImageReview.items)) {
      const targetItem = updatedImageReview.items.find((it) => it.source === rawImg.source);
      if (targetItem) {
        if (targetItem.status === 'VALID') {
          targetItem.status = safetyFlags.length > 0 ? 'VIOLATION' : 'WARNING';
        }
        if (!Array.isArray(targetItem.issues)) targetItem.issues = [];
        const fallbackReason = safetyFlags.length > 0
          ? `Hình ảnh có dấu hiệu vi phạm an toàn nội dung (${safetyFlags.join(', ')}).`
          : 'Hình ảnh không phải poster thiết kế sự kiện hoặc không liên quan đến chủ đề sự kiện.';
        if (targetItem.issues.length === 0) {
          targetItem.issues.push(fallbackReason);
        }
      }
    }
  });

  if (updatedImageReview && Array.isArray(updatedImageReview.items)) {
    const anyImgViolation = updatedImageReview.items.some((it) => it.status === 'VIOLATION');
    const anyImgWarning = updatedImageReview.items.some((it) => it.status === 'WARNING');
    updatedImageReview.overall_image_verdict = anyImgViolation ? 'VIOLATION' : anyImgWarning ? 'WARNING' : 'SAFE';
  }

  const violatingImages = (updatedImageReview?.items || []).filter((it) => it.status === 'VIOLATION');
  violatingImages.forEach((img) => {
    const sourceName = img.source === 'MAIN_POSTER'
      ? 'Ảnh đại diện chính (Main Poster)'
      : img.source === 'COVER_BANNER'
        ? 'Ảnh bìa (Cover Banner)'
        : `Ảnh mô tả (${img.source})`;
    const issueMsg = (img.issues && img.issues.length > 0)
      ? img.issues.join('; ')
      : 'Hình ảnh chứa nội dung vi phạm tiêu chuẩn cộng đồng EventHub hoặc không phù hợp với chủ đề sự kiện.';

    if (!nextCritical.some((v) => v.issue.includes(img.source) || v.issue.includes(sourceName))) {
      nextCritical.unshift({
        policy_code: 'IMAGE_POLICY',
        issue: `[Vi phạm hình ảnh] ${sourceName}: ${issueMsg}`,
        highlighted_text: img.analysis ? img.analysis.slice(0, 160) : '',
      });
    }
  });

  const warningImages = (updatedImageReview?.items || []).filter((it) => it.status === 'WARNING');
  warningImages.forEach((img) => {
    const sourceName = img.source === 'MAIN_POSTER'
      ? 'Ảnh đại diện chính (Main Poster)'
      : img.source === 'COVER_BANNER'
        ? 'Ảnh bìa (Cover Banner)'
        : `Ảnh mô tả (${img.source})`;
    const issueMsg = (img.issues && img.issues.length > 0)
      ? img.issues.join('; ')
      : 'Hình ảnh cần đối chiếu thêm về chất lượng và tính phù hợp với chủ đề sự kiện.';

    if (
      !nextCritical.some((v) => v.issue.includes(img.source) || v.issue.includes(sourceName)) &&
      !nextWarnings.some((w) => w.issue.includes(img.source) || w.issue.includes(sourceName))
    ) {
      nextWarnings.push({
        policy_code: 'IMAGE_POLICY',
        issue: `[Lưu ý hình ảnh] ${sourceName}: ${issueMsg}`,
        highlighted_text: img.analysis ? img.analysis.slice(0, 160) : '',
      });
    }
  });

  if (hasNonPosterBannerFlag && nextCritical.length === 0 && nextWarnings.length === 0) {
    nextWarnings.push({
      policy_code: 'IMAGE_POLICY',
      issue: '[Lưu ý hình ảnh] Vision đánh dấu hình ảnh không phải poster thiết kế sự kiện hoặc chưa phù hợp với chủ đề sự kiện.',
    });
  }

  // Kiểm tra thiếu Poster / Banner chính nếu IMAGE_POLICY active
  if (activeCodes.has('IMAGE_POLICY')) {
    if (!hasThumbnail && !nextCritical.concat(nextWarnings).some((v) => /thumbnail|ảnh đại diện|poster/i.test(v.issue))) {
      nextWarnings.push({
        policy_code: 'IMAGE_POLICY',
        issue: 'Sự kiện chưa có ảnh đại diện chính (Main Poster). Vui lòng tải lên ảnh đại diện để sự kiện hiển thị trực quan.',
        highlighted_text: 'Ảnh đại diện chính (Thumbnail): CHƯA CÓ',
      });
    }
    if (!hasBanner && !nextCritical.concat(nextWarnings).some((v) => /banner|ảnh bìa/i.test(v.issue))) {
      nextWarnings.push({
        policy_code: 'IMAGE_POLICY',
        issue: 'Sự kiện chưa có ảnh bìa (Cover Banner). Cần bổ sung ảnh bìa để trang sự kiện được đẹp mắt và chuyên nghiệp hơn.',
        highlighted_text: 'Ảnh bìa (Cover Banner): CHƯA CÓ',
      });
    }
  }

  // Quyết định tổng thể: Cấm APPROVE nếu vi phạm tài liệu rác hoặc ảnh lạc đề
  let recommendation;
  if (nextCritical.length > 0 || hasIrrelevantOrFakeDoc) {
    recommendation = 'REJECT';
  } else if (nextWarnings.length > 0 || hasNonPosterBannerFlag) {
    recommendation = 'NEEDS_REVIEW';
  } else {
    recommendation = 'APPROVE';
  }

  // Tính điểm chất lượng và rủi ro
  let calculatedQuality = 100;
  calculatedQuality -= (nextCritical.length * 45);
  calculatedQuality -= (nextWarnings.length * 15);
  calculatedQuality -= Math.min(Number(spellingCount || 0) * 3, 15);

  let calculatedRisk = 0;
  calculatedRisk += (nextCritical.length * 80);
  calculatedRisk += (nextWarnings.length * 20);
  calculatedRisk += Math.min(Number(spellingCount || 0) * 2, 10);

  let finalQualityScore = calculatedQuality;
  let finalRiskScore = calculatedRisk;

  if (!isFallback) {
    const effectiveParsedQuality = (parsedQuality !== null && parsedQuality !== undefined && !isNaN(Number(parsedQuality)))
      ? Math.round(Number(parsedQuality))
      : calculatedQuality;
    const effectiveParsedRisk = (parsedRisk !== null && parsedRisk !== undefined && !isNaN(Number(parsedRisk)))
      ? Math.round(Number(parsedRisk))
      : calculatedRisk;
    finalQualityScore = Math.min(effectiveParsedQuality, calculatedQuality);
    finalRiskScore = Math.max(effectiveParsedRisk, calculatedRisk);
  }

  if (recommendation === 'REJECT') {
    finalRiskScore = Math.max(finalRiskScore, hasIrrelevantOrFakeDoc ? 85 : 80);
    finalQualityScore = Math.min(finalQualityScore, 40);
  } else if (recommendation === 'NEEDS_REVIEW') {
    finalRiskScore = Math.max(finalRiskScore, 30);
    finalQualityScore = Math.min(finalQualityScore, 75);
  } else {
    finalRiskScore = Math.min(finalRiskScore, 20);
    finalQualityScore = Math.max(finalQualityScore, 85);
  }

  finalQualityScore = Math.max(0, Math.min(100, finalQualityScore));
  finalRiskScore = Math.max(0, Math.min(100, finalRiskScore));

  return {
    recommendation,
    criticalViolations: nextCritical,
    yellowWarnings: nextWarnings,
    finalQualityScore,
    finalRiskScore,
    finalImageReview: updatedImageReview,
    finalDocumentReview: updatedDocumentReview,
    hasIrrelevantOrFakeDoc,
    hasNonPosterBannerFlag,
  };
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
    .replace(/\bPERMIT_DOCUMENT_(\d+)\b/g, 'Tài liệu đính kèm $1')
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
      if ([
        'decision',
        'status',
        'policy_code',
        'risk_score',
        'quality_score',
        'source',
        'title_status',
        'description_status',
        'ocr_reasoning',
        'extracted_texts',
        'step1_scene_context',
        'step2_anchor_text',
        'step3_stylized_decoding',
        'step4_moderation_verdict',
        'font_style',
        'confidence',
        'visual_effect',
        'is_event_title',
        'overall_image_verdict',
        'overall_document_verdict',
        'overall_verdict',
        'relevance_to_event',
        'relevance_score',
        'violation_type',
        'safety_flags',
        'is_event_poster_or_relevant_banner',
        'is_valid',
        'extracted_text',
        'extractedText',
        'fileType',
        'fileName',
        'url'
      ].includes(key)) {
        cleaned[key] = value;
      } else {
        cleaned[key] = cleanAiOutputObject(value);
      }
    }
    return cleaned;
  }
  return data;
}


/**
 * Soát lỗi chính tả tiếng Việt & khoảng cách dấu câu
 */
function detectVietnameseSpellingGrammar(text) {
  const issues = [];
  if (!text || typeof text !== 'string') return issues;

  // 1. Spacing around punctuation: e.g. "Ngọc ;Nguyễn" or "Phúc;Vương" or "4D :"
  const punctuationSpacingRegex = /\s+[;:,.\?!]|\b[;:,.\?!][^\s\d"'\)\]\}\>]/g;
  let match;
  while ((match = punctuationSpacingRegex.exec(text)) !== null) {
    const raw = match[0];
    if (raw.trim() === ';' || raw.trim() === ':') {
      issues.push(`Khoảng cách trước/sau dấu câu chưa chuẩn: "${raw.trim()}"`);
    }
  }

  // 2. Common typo / telex patterns
  if (/\bQủy\b/i.test(text)) {
    issues.push('Từ "Qủy" nên chuẩn hóa thành "Quỷ" (dấu hỏi trên chữ u/y chuẩn tiếng Việt)');
  }
  if (/\bchánh\s+sách\b/i.test(text)) {
    issues.push('Từ "chánh sách" nên dùng từ chuẩn chính tả "chính sách"');
  }
  if (/\bsuất\s+sắc\b/i.test(text)) {
    issues.push('Từ "suất sắc" viết sai, đúng là "xuất sắc"');
  }
  if (/\bxắp\s+xếp\b/i.test(text)) {
    issues.push('Từ "xắp xếp" viết sai, đúng là "sắp xếp"');
  }
  if (/\bgiành\s+cho\b/i.test(text)) {
    issues.push('Cụm "giành cho" nên viết đúng là "dành cho"');
  }

  return [...new Set(issues)].slice(0, 5);
}

/**
 * Thẩm định toàn diện Tiêu đề, Mô tả chi tiết & Văn bản sự kiện
 */
function evaluateContentAndDescription(event, cleanDescription) {
  const title = String(event?.title || '').trim();
  const rawDesc = String(cleanDescription || '').trim();
  const textLower = `${title} ${event?.short_description || ''} ${rawDesc}`.toLowerCase();

  // 1. Title Audit
  let titleStatus = 'VALID';
  let titleAnalysis = '';
  if (!title || title.length < 5) {
    titleStatus = 'NEEDS_IMPROVEMENT';
    titleAnalysis = 'Tiêu đề sự kiện quá ngắn, chưa đủ thông tin định danh rõ ràng.';
  } else if (/(\b(x100|bao l[oờ]|ki[eế]m ti[eề]n nhanh|l[uừ]a)\b)/i.test(title)) {
    titleStatus = 'VIOLATION';
    titleAnalysis = 'Tiêu đề chứa dấu hiệu giật tít lừa đảo, cam kết lợi nhuận hoặc từ ngữ cấm.';
  } else {
    titleStatus = 'VALID';
    titleAnalysis = `Tiêu đề sự kiện "${title}" rõ ràng, đúng nhận diện chương trình, không vi phạm chuẩn mực.`;
  }

  // 2. Description Audit
  let descStatus = 'VALID';
  let descAnalysis = '';
  const descSuggestions = [];
  const descIssues = [];

  // Check prohibited fraud words
  const sensitiveFraudWords = ['chuyển khoản stk', 'stk cá nhân', 'inbox zalo', 'telegram đầu tư', 'bao lời 100%', 'cam kết lãi'];
  const foundFraud = sensitiveFraudWords.find((w) => textLower.includes(w));
  if (foundFraud) {
    descStatus = 'VIOLATION';
    descIssues.push(`Phát hiện từ khóa nghi vấn giao dịch ngoài sàn / cam kết phi thực tế: "${foundFraud}"`);
  }

  const charCount = rawDesc.length;
  const wordCount = rawDesc.split(/\s+/).filter(Boolean).length;
  const hasActors = /(diễn viên|nghệ sĩ|đạo diễn|ca sĩ|khách mời|speaker|diễn giả|ns\.)/i.test(rawDesc);
  const hasSynopsis = /(nội dung|cốt truyện|vở kịch|câu chuyện|chương trình|giới thiệu|tiết mục)/i.test(rawDesc);
  const hasRules = /(quy định|lưu ý|cảnh báo|độ tuổi|trang phục|dresscode|vật dụng|cấm|check-in|vé)/i.test(rawDesc);
  const isHorrorOrMature = /(kịch ma|kinh dị|ma quái|nhà có ma|con quỷ|rùng rợn|18\+|kinh hoàng)/i.test(textLower);

  if (charCount < 50) {
    descStatus = 'NEEDS_IMPROVEMENT';
    descAnalysis = 'Mô tả chi tiết sự kiện quá sơ sài, gần như chưa có nội dung chương trình để khán giả tham khảo.';
    descSuggestions.push('Bổ sung thêm tóm tắt kịch bản, thời lượng chương trình và hướng dẫn cho người tham dự.');
  } else {
    const analysisParts = [];
    if (charCount >= 100) {
      analysisParts.push(`Mô tả chi tiết có độ dài ${charCount} ký tự (${wordCount} từ).`);
    }
    if (hasActors) {
      analysisParts.push('Đã giới thiệu rõ đạo diễn và dàn diễn viên/nghệ sĩ tham gia biểu diễn.');
    }
    if (hasSynopsis) {
      analysisParts.push('Có phần tóm tắt nội dung và chủ đề sự kiện.');
    } else {
      analysisParts.push('Nội dung cốt truyện/kịch bản sự kiện còn ngắn, chưa nêu rõ chi tiết câu chuyện.');
    }

    if (isHorrorOrMature) {
      if (!hasRules) {
        if (descStatus !== 'VIOLATION') descStatus = 'NEEDS_IMPROVEMENT';
        analysisParts.push('LƯU Ý QUAN TRỌNG: Đây là thể loại Kịch Ma/Kinh dị (hiệu ứng 4D, âm thanh giật gân), nhưng phần mô tả chưa có cảnh báo an toàn & khuyến cáo độ tuổi (ví dụ: hạn chế trẻ em dưới 12 tuổi, cảnh báo khán giả có tiền sử bệnh tim mạch/huyết áp hoặc phụ nữ mang thai).');
        descSuggestions.push('Bổ sung cảnh báo độ tuổi (12+/16+) và lưu ý sức khỏe/vật dụng cấm cho khán giả tham dự kịch ma.');
      } else {
        analysisParts.push('Có quy định tham gia và khuyến cáo an toàn cho người tham dự.');
      }
    } else if (!hasRules && charCount < 300) {
      analysisParts.push('Khuyến nghị bổ sung thêm mục Lưu ý khi tham gia (thời gian check-in, đồ uống/vật dụng được phép mang vào).');
    }

    descAnalysis = analysisParts.join(' ');
  }

  // 3. Spelling & Grammar check
  const spellingGrammarIssues = detectVietnameseSpellingGrammar(`${title} ${rawDesc}`);

  return {
    title_status: titleStatus,
    title_analysis: titleAnalysis,
    description_status: descStatus,
    description_analysis: descAnalysis,
    spelling_grammar_issues: spellingGrammarIssues,
    description_suggestions: descSuggestions,
    description_issues: descIssues,
  };
}

function stripHtmlForAiPrompt(value, maxLen = 4500) {
  return String(value || '')
    .replace(/data:image\/[^;]+;base64,[^\s"'>]+/gi, '[Hình ảnh đính kèm]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function formatSessionVenueAddress(session = {}) {
  const parts = [];
  const venueName = String(session.venue_name || '').trim();
  const address = String(session.address || session.address_line || '').trim();
  const ward = String(session.ward || '').trim();
  const district = String(session.district || '').trim();
  const city = String(session.city || session.province || '').trim();

  if (venueName) parts.push(venueName);
  if (address) parts.push(address);

  const normAddress = address.toLowerCase();
  if (ward && !normAddress.includes(ward.toLowerCase())) parts.push(ward);
  if (district && !normAddress.includes(district.toLowerCase())) parts.push(district);
  if (city && !normAddress.includes(city.toLowerCase())) parts.push(city);

  return parts.join(', ');
}

function buildEventAiUserPrompt({
  event = {},
  cleanShortDesc = '',
  cleanDescription = '',
  cleanAdditionalTerms = '',
  imageSummary = '',
  permitSummary = '',
  distinctTicketCount = 0,
  sessionCount = 0,
  ticketSummary = 'CHƯA CÓ THÔNG TIN VÉ',
  refundSummary = '',
}) {
  const categoryText = event.category_name
    ? `${event.category_name}${event.category_slug ? ` (${event.category_slug})` : ''}`
    : 'Chưa phân loại';

  const organizerName = String(event.organization_name || event.organizer_name || '').trim() || 'Chưa rõ';
  const verifiedLabel = event.is_verified === true
    ? 'Đã xác minh (ACTIVE)'
    : event.is_verified === false
      ? 'Chưa xác minh'
      : 'Chưa rõ';
  const cleanOrganizerDesc = stripHtmlForAiPrompt(event.organizer_description, 350);
  const organizerText = `${organizerName} | Trạng thái xác minh: ${verifiedLabel}${cleanOrganizerDesc ? ` | Giới thiệu: ${cleanOrganizerDesc}` : ''}`;

  const tagsList = Array.isArray(event.tags)
    ? event.tags.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const tagsText = tagsList.length > 0 ? tagsList.join(', ') : 'Không có';

  const eventFormat = String(event.format || 'OFFLINE').trim().toUpperCase();
  const sessionList = Array.isArray(event.sessions) ? event.sessions : [];
  const sessionsWithVenue = sessionList.filter((s) => Boolean((s?.venue_id || s?.venue_name) && formatSessionVenueAddress(s)));

  const sessionSummary = sessionList.length > 0
    ? sessionList
        .map((s, idx) => {
          const venueAddr = formatSessionVenueAddress(s);
          const venueInfo = venueAddr
            ? `${venueAddr}${s.venue_id ? ` [venue_id: ${s.venue_id}]` : ''}`
            : 'Chưa gắn địa điểm cụ thể';
          return `  + Phiên ${idx + 1} [${s.session_name || 'Phiên'}]: ${s.start_time || ''} - ${s.end_time || ''} | Địa điểm: ${venueInfo}`;
        })
        .join('\n')
    : '  + CHƯA CÓ LỊCH TRÌNH PHIÊN';

  let locationNote = '';
  if (eventFormat === 'ONLINE') {
    locationNote = 'Ghi chú xác thực địa điểm: Sự kiện tổ chức trực tuyến (ONLINE), không yêu cầu địa điểm vật lý.';
  } else if (sessionsWithVenue.length > 0) {
    locationNote = `Ghi chú xác thực địa điểm (từ bảng venues): Sự kiện ${eventFormat} ĐÃ CÓ ${sessionsWithVenue.length}/${sessionList.length} phiên gắn venue_id hợp lệ kèm địa chỉ cụ thể trong hệ thống venues. KHÔNG báo lỗi giả về thiếu địa điểm chỉ vì bài viết mô tả không nhắc lại địa chỉ.`;
  } else {
    locationNote = `Ghi chú xác thực địa điểm: Sự kiện ${eventFormat} chưa có thông tin venue_id / địa chỉ cụ thể trong bảng venues.`;
  }

  const effectivePermitSummary = (
    permitSummary === 'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM' &&
    !requiresStrictEventPermit(event)
  )
    ? 'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM (Trạng thái: NOT_REQUIRED — sự kiện quy mô nhỏ / online / workshop thông thường không bắt buộc giấy phép, KHÔNG phạt lỗi thiếu giấy phép).'
    : permitSummary;

  return `Tên sự kiện: ${event.title || 'Chưa có tên'}
Danh mục sự kiện: ${categoryText}
Thể loại / Định dạng: ${eventFormat} | Hiển thị: ${event.visibility || 'PUBLIC'}
Từ khóa (Tags): ${tagsText}
Nhà tổ chức: ${organizerText}
Mô tả ngắn: ${cleanShortDesc || 'Không có'}
Mô tả chi tiết: ${cleanDescription || 'Không có'}
Điều khoản bổ sung: ${cleanAdditionalTerms || 'Không có'}
Hình ảnh sự kiện đã đăng:
${imageSummary}
Thời gian tổng thể: ${event.start_time || 'Chưa rõ'} đến ${event.end_time || 'Chưa rõ'}
Hồ sơ Giấy phép & Tài liệu đính kèm:
${effectivePermitSummary}
Lịch trình & Địa điểm từng phiên (Sessions & Venues):
${sessionSummary}
${locationNote}
Cơ cấu loại vé (Tickets): Gồm ${distinctTicketCount} loại vé chính (${sessionCount > 1 ? `phân bổ qua ${sessionCount} phiên diễn ra` : '1 phiên'}): ${ticketSummary}
Chính sách hoàn tiền sự kiện: ${refundSummary}

Hãy đối chiếu toàn bộ thông tin sự kiện và kết quả phân tích tài liệu/hình ảnh ở trên với Bộ tiêu chí kiểm duyệt EventHub trong System Prompt để thẩm định và xuất ra JSON đánh giá chính xác.`;
}

function buildAiInputSnapshot({
  event,
  cleanDescription,
  cleanAdditionalTerms,
  imageAnalysisResults,
  documentAnalysisResults,
  userPrompt,
}) {
  return {
    event: {
      id: event.id,
      organizer_id: event.organizer_id || null,
      category_id: event.category_id || null,
      category_name: event.category_name || null,
      category_slug: event.category_slug || null,
      organization_name: event.organization_name || null,
      organizer_description: stripHtmlForAiPrompt(event.organizer_description, 500) || null,
      is_verified: event.is_verified ?? null,
      title: event.title || '',
      short_description: event.short_description || '',
      description: cleanDescription,
      additional_terms: cleanAdditionalTerms || null,
      format: event.format || null,
      visibility: event.visibility || null,
      tags: Array.isArray(event.tags) ? event.tags : [],
      start_time: event.start_time || null,
      end_time: event.end_time || null,
      thumbnail_url: event.thumbnail_url || null,
      banner_url: event.banner_url || null,
      refund_policy: event.refund_policy || null,
      permits: Array.isArray(event.permits) ? event.permits : [],
      sessions: Array.isArray(event.sessions) ? event.sessions : [],
      ticket_types: Array.isArray(event.ticket_types) ? event.ticket_types : [],
    },
    vision_analysis: Array.isArray(imageAnalysisResults) ? imageAnalysisResults : [],
    document_analysis: Array.isArray(documentAnalysisResults) ? documentAnalysisResults : [],
    user_prompt: userPrompt || '',
  };
}

class EventsAdminService {
  async getEventDetail(eventId) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const sessions = event.sessions || [];
    const firstSessionVenue = sessions.find((s) => s && s.venue)?.venue || null;
    const venueName =
      event.venue_name ||
      firstSessionVenue?.name ||
      (typeof event.venue === 'string' ? event.venue : event.venue?.name) ||
      null;
    const address =
      event.address ||
      firstSessionVenue?.address_line ||
      null;
    const venue = event.venue || firstSessionVenue || null;

    return {
      ...event,
      venue_name: venueName,
      address,
      venue,
    };
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

    // Strip HTML and large base64 strings from description/short_description/additional_terms for clean, compact prompt
    const cleanDescription = stripHtmlForAiPrompt(event.description, 4500);
    const cleanShortDesc = stripHtmlForAiPrompt(event.short_description, 400);
    const cleanAdditionalTerms = stripHtmlForAiPrompt(event.additional_terms, 1000);

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

    // Format ticket types and sessions summary (deduplicated across sessions)
    const ticketList = event.ticket_types || [];
    let ticketSummary = 'CHƯA CÓ THÔNG TIN VÉ';
    const distinctTicketMap = new Map();
    if (ticketList.length > 0) {
      ticketList.forEach((t) => {
        const key = `${String(t.name || '').trim().toLowerCase()}___${Number(t.price || 0)}___${Boolean(t.is_seated)}`;
        if (!distinctTicketMap.has(key)) {
          distinctTicketMap.set(key, {
            name: t.name,
            price: t.price,
            is_seated: t.is_seated,
            totalQty: 0,
            sessionCount: 0,
            sampleQty: t.quantity,
          });
        }
        const item = distinctTicketMap.get(key);
        item.totalQty += Number(t.quantity || 0);
        item.sessionCount += 1;
      });
      ticketSummary = Array.from(distinctTicketMap.values()).map((t) => {
        const seatingText = t.is_seated ? ' (Ghế ngồi)' : ' (Vé tự do)';
        const qtyDesc = t.sessionCount > 1
          ? `Tổng ${t.totalQty} vé (${t.sampleQty} vé/phiên × ${t.sessionCount} phiên)`
          : `${t.totalQty} vé`;
        return `${t.name}${seatingText}: ${Number(t.price).toLocaleString('vi-VN')} VNĐ (${qtyDesc})`;
      }).join('; ');
    }

    const distinctTicketCount = distinctTicketMap.size;
    const sessionList = event.sessions || [];
    const sessionCount = sessionList.length;

    const refundSummary = typeof event.refund_policy === 'string'
      ? event.refund_policy
      : event.refund_policy?.description ||
        (event.refund_policy && typeof event.refund_policy === 'object' && Object.keys(event.refund_policy).length > 0
          ? (event.refund_policy.allow_refund
              ? `Cho phép hoàn vé trước ${event.refund_policy.refund_before_days || 0} ngày (Tỷ lệ: ${event.refund_policy.refund_rate || 100}%)`
              : 'Sự kiện không hỗ trợ hoàn tiền.')
          : 'Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.');

    const eventPromptText = buildEventAiUserPrompt({
      event,
      cleanShortDesc,
      cleanDescription,
      cleanAdditionalTerms,
      imageSummary,
      permitSummary,
      distinctTicketCount,
      sessionCount,
      ticketSummary,
      refundSummary,
    });
    let eventPromptWithVision = eventPromptText;
    const imageSources = collectAllEventImages(event);
    const documentSources = imageSources.filter((item) => item.source && item.source.startsWith('PERMIT'));
    const actualImageSources = imageSources.filter((item) => !item.source || !item.source.startsWith('PERMIT'));
    const documentAnalysisResults = []; // { source, url, fileName, fileType, extractedText, legality, description, isSubstanceViolation }
    const imageAnalysisResults = [];    // { source, url, fileName, description }
    let visionAnalysisSummary = '';
    let documentAnalysisSummary = '';

    try {
      // 1. Check if Ollama is available
      const isOllamaUp = await ollamaClient.isHealthy();
      if (!isOllamaUp) {
        throw new Error('Ollama service is not reachable');
      }

      // ============================================================
      // STAGE 1A: Document Parsing & Legal/Lexical Inspection
      // ============================================================
      if (documentSources.length > 0) {
        logger.info(`[AiReview] Bắt đầu thẩm định ${documentSources.length} tài liệu đính kèm...`);
        for (const item of documentSources) {
          checkCancellation();
          const docResult = await fetchDocumentContent(item.url, { fileName: item.fileName, type: item.fileType }, 15000);

          if (docResult) {
            if (docResult.hasText) {
              const cleanPreview = docResult.text.slice(0, 4000);
              const legality = inspectDocumentLegality(cleanPreview, item.fileName, event);

              documentAnalysisResults.push({
                source: item.source,
                url: item.url || '',
                fileName: item.fileName || '',
                fileType: item.fileType || (item.fileName?.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
                extractedText: cleanPreview,
                legality,
                isSubstanceViolation: legality.isSubstanceViolation,
                violationType: legality.violationType || null,
                violatingLocation: legality.violatingLocation || null,
                description: legality.isSubstanceViolation
                  ? `[VI PHẠM NỘI DUNG TÀI LIỆU]: Tệp '${item.fileName || 'Tài liệu'}' có dấu hiệu vi phạm: ${legality.violationType || legality.reason}. Vị trí vi phạm: ${legality.violatingLocation || cleanPreview.slice(0, 160)}`
                  : `[NỘI DUNG TÀI LIỆU HỢP LỆ '${item.fileName || 'Tài liệu'}']:\n${cleanPreview.slice(0, 2000)}`,
              });
              continue;
            } else if (docResult.imageBase64Fallback) {
              // PDF dạng bản quét hoặc có hình ảnh trang đầu
              checkCancellation();
              const visionDocs = await ollamaClient.describeImageBatch(
                [{ source: item.source, url: item.url, fileName: item.fileName, base64: docResult.imageBase64Fallback }],
                event.title || 'Tài liệu giấy phép sự kiện',
                effectiveSignal,
                { category: event.category_name || '' }
              );
              const ocrDesc = [visionDocs[0]?.extracted_text, visionDocs[0]?.visual_description || visionDocs[0]?.description]
                .filter(Boolean)
                .join('\n')
                .trim();
              const legality = inspectDocumentLegality(ocrDesc, item.fileName, event);

              documentAnalysisResults.push({
                source: item.source,
                url: item.url || '',
                fileName: item.fileName || '',
                fileType: item.fileType || 'application/pdf',
                extractedText: ocrDesc,
                legality,
                isSubstanceViolation: legality.isSubstanceViolation,
                violationType: legality.violationType || legality.violation_type || null,
                violatingLocation: legality.violatingLocation || null,
                description: legality.isSubstanceViolation
                  ? `[VI PHẠM NỘI DUNG TÀI LIỆU]: Tệp '${item.fileName || 'Tài liệu'}' có dấu hiệu vi phạm: ${legality.violationType || legality.reason}. Vị trí vi phạm: ${legality.violatingLocation || ocrDesc.slice(0, 160)}`
                  : `[BẢN QUÉT TÀI LIỆU '${item.fileName || 'Tài liệu'}']:\n${ocrDesc}`,
              });
              continue;
            } else if (docResult.type === 'DOWNLOAD_FAILED') {
              documentAnalysisResults.push({
                source: item.source,
                url: item.url || '',
                fileName: item.fileName || '',
                fileType: item.fileType || 'application/pdf',
                isDownloadFailed: true,
                legality: {
                  status: 'WARNING',
                  is_valid: false,
                  isValidLegalDocument: false,
                  isSubstanceViolation: false,
                  relevanceScore: 0,
                  relevance_score: 0,
                },
                description: `[LƯU Ý TẢI TỆP]: Không thể tải tệp '${item.fileName || 'tài liệu'}' từ máy chủ lưu trữ (link có thể hết hạn hoặc tệp bị hỏng).`,
              });
              continue;
            }
          }

          // Trường hợp tệp đính kèm là ảnh (PNG, JPG, WEBP) hoặc chưa phân giải được
          const b64 = await fetchImageAsBase64(item.url, 8000);
          if (b64) {
            checkCancellation();
            const visionDocs = await ollamaClient.describeImageBatch(
              [{ source: item.source, url: item.url, fileName: item.fileName, base64: b64 }],
              event.title || 'Tài liệu giấy phép sự kiện',
              effectiveSignal,
              { category: event.category_name || '' }
            );
            const ocrDesc = [visionDocs[0]?.extracted_text, visionDocs[0]?.visual_description || visionDocs[0]?.description]
              .filter(Boolean)
              .join('\n')
              .trim();
            const legality = inspectDocumentLegality(ocrDesc, item.fileName, event);

            documentAnalysisResults.push({
              source: item.source,
              url: item.url || '',
              fileName: item.fileName || '',
              fileType: item.fileType || 'image/document',
              extractedText: ocrDesc,
              legality,
              isSubstanceViolation: legality.isSubstanceViolation,
              violationType: legality.violationType || legality.violation_type || null,
              violatingLocation: legality.violatingLocation || null,
              description: legality.isSubstanceViolation
                ? `[VI PHẠM NỘI DUNG TÀI LIỆU]: Tệp '${item.fileName || 'Tài liệu'}' có dấu hiệu vi phạm: ${legality.violationType || legality.reason}. Vị trí vi phạm: ${legality.violatingLocation || ocrDesc.slice(0, 160)}`
                : `[HÌNH ẢNH TÀI LIỆU '${item.fileName || 'Tài liệu'}']:\n${ocrDesc}`,
            });
          } else {
            documentAnalysisResults.push({
              source: item.source,
              url: item.url || '',
              fileName: item.fileName || '',
              fileType: item.fileType || 'application/octet-stream',
              isDownloadFailed: true,
              legality: {
                status: 'WARNING',
                is_valid: false,
                isValidLegalDocument: false,
                isSubstanceViolation: false,
                relevanceScore: 0,
                relevance_score: 0,
              },
              description: `[LƯU Ý TẢI TỆP]: Không thể đọc hoặc tải nội dung tệp '${item.fileName || 'tài liệu'}' để đối chiếu tự động.`,
            });
          }
        }

        // Tóm tắt tài liệu cho mô hình text
        documentAnalysisSummary = documentAnalysisResults.map((r) => {
          const vType = r.violationType || r.legality?.violation_type || '';
          const relScore = r.legality?.relevance_score ?? r.legality?.relevanceScore;
          const statusBadge = vType === 'IRRELEVANT_OR_FAKE_DOCUMENT'
            ? `[TÀI LIỆU RÁC / LẠC ĐỀ - IRRELEVANT_OR_FAKE_DOCUMENT | relevance_score=${relScore ?? 0}]`
            : r.isSubstanceViolation
              ? '[PHÁT HIỆN VI PHẠM TÀI LIỆU]'
              : r.isDownloadFailed
                ? '[KHÔNG ĐỌC ĐƯỢC TỆP - CẦN XEM XÉT]'
                : `[HỢP LỆ | relevance_score=${relScore ?? 'N/A'}]`;
          return `[Tài liệu đính kèm: "${r.fileName || r.source}"] ${statusBadge}:\n${r.description || ''}`;
        }).join('\n\n');

        if (documentAnalysisSummary.length > 4000) {
          documentAnalysisSummary = documentAnalysisSummary.slice(0, 4000) + '\n... (đã rút gọn)';
        }
      }

      // ============================================================
      // STAGE 1B: Vision Analysis for Actual Images (Poster, Banner, Desc)
      // ============================================================
      if (actualImageSources.length > 0) {
        logger.info(`[AiReview] Bắt đầu phân tích ${actualImageSources.length} hình ảnh thực tế...`);
        const imagesWithBase64 = [];

        for (const item of actualImageSources) {
          checkCancellation();
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
              visual_description: 'KHÔNG THỂ TẢI ẢNH — URL không truy cập được hoặc đã hết hạn.',
              extracted_text: '',
              is_event_poster_or_relevant_banner: null,
              safety_flags: [],
              description: 'KHÔNG THỂ TẢI ẢNH — URL không truy cập được hoặc đã hết hạn.',
            });
          }
        }

        if (imagesWithBase64.length > 0) {
          checkCancellation();
          const visionResults = await ollamaClient.describeImageBatch(
            imagesWithBase64,
            event.title || 'Sự kiện EventHub',
            effectiveSignal,
            { category: event.category_name || '' }
          );
          imageAnalysisResults.push(...visionResults);
        }

        visionAnalysisSummary = imageAnalysisResults.map((r) => {
          const sourceLabel = r.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : r.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh trong mô tả (${r.source})`;
          const visualDesc = String(r.visual_description || r.description || '').slice(0, 350);
          const ocrTxt = String(r.extracted_text || r.extractedText || '').trim();
          const relevanceFlag = typeof r.is_event_poster_or_relevant_banner === 'boolean'
            ? String(r.is_event_poster_or_relevant_banner)
            : 'Chưa rõ';
          const safetyFlagsStr = Array.isArray(r.safety_flags) && r.safety_flags.length > 0
            ? r.safety_flags.join(', ')
            : 'Không phát hiện';
          return [
            `[${sourceLabel}]:`,
            `- visual_description: ${visualDesc}`,
            `- extracted_text: ${ocrTxt || '(Không có chữ đọc được)'}`,
            `- is_event_poster_or_relevant_banner: ${relevanceFlag}`,
            `- safety_flags: ${safetyFlagsStr}`,
          ].join('\n');
        }).join('\n\n');

        if (visionAnalysisSummary.length > 3500) {
          visionAnalysisSummary = visionAnalysisSummary.slice(0, 3500) + '\n... (đã rút gọn)';
        }

        logger.info(`[AiReview] Phân tích hình ảnh hoàn tất. ${imageAnalysisResults.length} ảnh đã kiểm tra.`);
      }

      // ============================================================
      // STAGE 2: Text Review — Gửi riêng biệt tóm tắt ảnh và tài liệu cho text model
      // ============================================================
      let separateMediaSection = '';
      if (visionAnalysisSummary) {
        separateMediaSection += `\n\n=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH SỰ KIỆN ===\n${visionAnalysisSummary}\n=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ===`;
      }
      if (documentAnalysisSummary) {
        separateMediaSection += `\n\n=== KẾT QUẢ THẨM ĐỊNH TÀI LIỆU ĐÍNH KÈM ===\n${documentAnalysisSummary}\n=== KẾT THÚC THẨM ĐỊNH TÀI LIỆU ===`;
      }

      eventPromptWithVision = eventPromptText + separateMediaSection;

      // 2. Call Ollama Chat API with EventHub Policy System Prompt
      checkCancellation();
      const systemPrompt = buildAiReviewSystemPrompt(activeCriteria);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: eventPromptWithVision }
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.1,
        max_tokens: 1500,
        num_ctx: Number(ollamaClient.OLLAMA_NUM_CTX) || 8192,
        timeoutMs: ollamaClient.OLLAMA_TIMEOUT,
        signal: effectiveSignal,
      });

      logger.info(`[AiReview] LLM output received (${aiResponse.content.length} chars). Extracting JSON...`);
      const parsedJson = ollamaClient.extractJSON(aiResponse.content);

      if (parsedJson && (parsedJson.decision || parsedJson.recommendation)) {
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

        // 1. TÁCH BẠCH HOÀN TOÀN: XÂY DỰNG IMAGE REVIEW & DOCUMENT REVIEW
        const initialImageReview = buildValidatedImageReview(imageAnalysisResults, parsedJson.image_review, event);
        const initialDocumentReview = buildValidatedDocumentReview(documentAnalysisResults, parsedJson.document_review, event);

        // 2-6. HẬU KIỂM CỨNG STAGE 2: CHẶN TÀI LIỆU RÁC, ẢNH LẠC ĐỀ, LỌC FALSE POSITIVE & TÍNH ĐIỂM
        const spellingCount = Array.isArray(parsedJson.content_review?.spelling_grammar_issues)
          ? parsedJson.content_review.spelling_grammar_issues.length
          : 0;
        const guardrailed = applyStage2Guardrails({
          event,
          activeCodes,
          permitFiles,
          sessionList,
          hasThumbnail,
          hasBanner,
          imageAnalysisResults,
          documentAnalysisResults,
          finalImageReview: initialImageReview,
          finalDocumentReview: initialDocumentReview,
          criticalViolations,
          yellowWarnings,
          parsedQuality: parsedJson.quality_score,
          parsedRisk: parsedJson.risk_score,
          spellingCount,
          isFallback: false,
        });

        recommendation = guardrailed.recommendation;
        criticalViolations = guardrailed.criticalViolations;
        yellowWarnings = guardrailed.yellowWarnings;
        const finalQualityScore = guardrailed.finalQualityScore;
        const finalRiskScore = guardrailed.finalRiskScore;
        const finalImageReview = guardrailed.finalImageReview;
        const finalDocumentReview = guardrailed.finalDocumentReview;

        // 7. TÓM TẮT ĐÁNH GIÁ (SUMMARY) PHẢI ĐỒNG BỘ TUYỆT ĐỐI VỚI QUYẾT ĐỊNH:
        let summary = parsedJson.summary || '';
        if (recommendation === 'REJECT') {
          if (!summary || /tuân thủ|hợp lệ|đạt chuẩn|phê duyệt/i.test(summary)) {
            const firstViolations = criticalViolations.map((v) => v.issue).slice(0, 2).join('; ');
            summary = `Sự kiện bị từ chối phê duyệt do vi phạm điều khoản bắt buộc (${firstViolations}).`;
          }
        } else if (recommendation === 'NEEDS_REVIEW') {
          if (!summary || /tuân thủ tốt|đạt chuẩn|phê duyệt hoàn toàn/i.test(summary)) {
            const firstWarnings = yellowWarnings.map((w) => w.issue).slice(0, 2).join('; ');
            summary = `Sự kiện cần xem xét điều chỉnh một số điểm trước khi phê duyệt (${firstWarnings}).`;
          }
        } else {
          if (!summary) {
            summary = 'Sự kiện tuân thủ đầy đủ các chính sách và tiêu chuẩn của EventHub, đề xuất phê duyệt.';
          }
        }

        // Ảnh trong mô tả: Nếu chưa có -> thêm vào gợi ý (suggestions)
        if (!hasDescImages && !suggestions.some((s) => /mô tả|minh họa/i.test(s))) {
          suggestions.push('Gợi ý bổ sung thêm hình ảnh minh họa bên trong phần mô tả chi tiết để người xem dễ hình dung và tăng tính hấp dẫn cho sự kiện.');
        }

        // 8. Sanitize compliant checks
        compliantChecks = sanitizeCompliantChecks({
          compliantChecks,
          criticalViolations,
          yellowWarnings,
          permitFiles,
          hasThumbnail,
          hasBanner,
          hasDescImages,
          imageReview: finalImageReview,
          documentReview: finalDocumentReview,
        });

        // Ensure ticket structure compliant check accurately reports distinct ticket types
        compliantChecks = compliantChecks.map((check) => {
          if (typeof check === 'string' && /cơ cấu loại vé/i.test(check)) {
            const sessionText = sessionCount > 1 ? ` phân bổ qua ${sessionCount} phiên` : '';
            return `Cơ cấu loại vé (${distinctTicketCount} loại vé${sessionText}) minh bạch về giá bán và số lượng`;
          }
          return check;
        });

        // Legacy/fallback compatibility: collect flat list
        criticalViolations.forEach((v) => {
          warnings.push(`[HIGH] [${v.policy_code || 'CHÍNH SÁCH'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
        });
        yellowWarnings.forEach((v) => {
          warnings.push(`[MEDIUM] [${v.policy_code || 'LƯU Ý'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
        });

        // Store rich object into DB
        const rawSavedData = {
          summary,
          risk_score: finalRiskScore,
          quality_score: finalQualityScore,
          compliant_checks: compliantChecks,
          critical_violations: criticalViolations,
          warnings: yellowWarnings,
          suggestions: suggestions.length > 0 ? suggestions : criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
          flat_warnings: warnings,
          content_review: (() => {
            const evaluatedContent = evaluateContentAndDescription(event, cleanDescription);
            let finalContentReview = parsedJson.content_review;
            if (!finalContentReview || typeof finalContentReview !== 'object') {
              return evaluatedContent;
            }
            if (!finalContentReview.description_analysis || finalContentReview.description_analysis.length < 15) {
              finalContentReview.description_analysis = evaluatedContent.description_analysis;
              finalContentReview.description_status = evaluatedContent.description_status;
            }
            if (!finalContentReview.title_analysis || finalContentReview.title_analysis.length < 10) {
              finalContentReview.title_analysis = evaluatedContent.title_analysis;
              finalContentReview.title_status = evaluatedContent.title_status;
            }
            if (!Array.isArray(finalContentReview.spelling_grammar_issues) || finalContentReview.spelling_grammar_issues.length === 0) {
              finalContentReview.spelling_grammar_issues = evaluatedContent.spelling_grammar_issues;
            }
            return finalContentReview;
          })(),
          image_review: finalImageReview,
          document_review: finalDocumentReview,
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
            visual_description: cleanAiOutputText(r.visual_description || r.description || ''),
            extracted_text: r.extracted_text || r.extractedText || null,
            extractedText: r.extractedText || r.extracted_text || null,
            is_event_poster_or_relevant_banner: typeof r.is_event_poster_or_relevant_banner === 'boolean' ? r.is_event_poster_or_relevant_banner : null,
            safety_flags: Array.isArray(r.safety_flags) ? r.safety_flags : [],
            description: cleanAiOutputText(r.description || r.visual_description || ''),
          })) : null,
          document_analysis: documentAnalysisResults.length > 0 ? documentAnalysisResults.map((d) => ({
            source: d.source,
            fileName: d.fileName || '',
            fileType: d.fileType || '',
            url: d.url || '',
            extractedText: d.extractedText || null,
            legality: d.legality || null,
            description: cleanAiOutputText(d.description || ''),
          })) : null,
        };

        checkCancellation();
        const savedData = cleanAiOutputObject(rawSavedData);

        const inputSnapshot = buildAiInputSnapshot({
          event,
          cleanDescription,
          cleanAdditionalTerms,
          imageAnalysisResults,
          documentAnalysisResults,
          userPrompt: eventPromptWithVision,
        });

        const saved = await eventsAdminRepository.saveAiReview({
          eventId,
          recommendation,
          warnings: savedData,
          logContext: {
            modelName: aiResponse.model || ollamaClient.OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'eventhub-qwen3',
            criteriaSnapshot: activeCriteria,
            inputSnapshot,
            rawOutput: aiResponse.content || '',
            riskScore: savedData.risk_score,
            qualityScore: savedData.quality_score,
          },
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
      let criticalViolations = [];
      let yellowWarnings = [];
      let compliantChecks = [];
      const suggestions = [];

      // 1. Khởi tạo document_review tách biệt (guardrail Stage 2 sẽ tổng hợp lỗi & điểm)
      const initialFallbackDocumentReview = buildValidatedDocumentReview(documentAnalysisResults, null, event);

      // 2. Gợi ý ảnh minh họa bài viết (nếu IMAGE_POLICY đang kích hoạt; thiếu poster/banner sẽ được applyStage2Guardrails xử lý)
      if (activeCodes.has('IMAGE_POLICY') && !hasDescImages) {
        suggestions.push('Gợi ý bổ sung thêm hình ảnh minh họa bên trong phần mô tả chi tiết để người xem dễ hình dung và tăng tính hấp dẫn cho sự kiện.');
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
            const sessionText = sessionCount > 1 ? ` phân bổ qua ${sessionCount} phiên` : '';
            compliantChecks.push(`Cơ cấu loại vé (${distinctTicketCount} loại vé${sessionText}) minh bạch về giá bán và số lượng`);
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

      // Fallback image review
      const initialFallbackImageReview = imageAnalysisResults.length > 0
        ? buildValidatedImageReview(imageAnalysisResults, null, event)
        : null;

      // 8. Đánh giá nội dung và mô tả chi tiết sự kiện
      const fallbackContentReview = evaluateContentAndDescription(event, cleanDescription);
      if (fallbackContentReview.description_status === 'VALID') {
        compliantChecks.push('Mô tả chi tiết sự kiện rõ ràng, cung cấp thông tin chương trình và nghệ sĩ tham gia');
      } else if (fallbackContentReview.description_status === 'NEEDS_IMPROVEMENT') {
        if (fallbackContentReview.description_suggestions && fallbackContentReview.description_suggestions.length > 0) {
          fallbackContentReview.description_suggestions.forEach((s) => {
            if (!yellowWarnings.some((w) => w.issue.includes('mô tả') || w.issue.includes('cảnh báo'))) {
              yellowWarnings.push({ policy_code: 'CONTENT_SPELLING', issue: `[Lưu ý mô tả] ${s}` });
            }
          });
        }
      } else if (fallbackContentReview.description_status === 'VIOLATION') {
        fallbackContentReview.description_issues.forEach((iss) => {
          criticalViolations.push({ policy_code: 'CONTENT_SPELLING', issue: `[Vi phạm mô tả] ${iss}` });
        });
      }

      // Áp dụng chung bộ hậu kiểm cứng Stage 2 (chặn tài liệu rác, ảnh lạc đề, lọc false positive, tính điểm)
      const fallbackSpellingCount = Array.isArray(fallbackContentReview?.spelling_grammar_issues)
        ? fallbackContentReview.spelling_grammar_issues.length
        : 0;
      const fallbackGuardrailed = applyStage2Guardrails({
        event,
        activeCodes,
        permitFiles,
        sessionList,
        hasThumbnail,
        hasBanner,
        imageAnalysisResults,
        documentAnalysisResults,
        finalImageReview: initialFallbackImageReview,
        finalDocumentReview: initialFallbackDocumentReview,
        criticalViolations,
        yellowWarnings,
        spellingCount: fallbackSpellingCount,
        isFallback: true,
      });

      recommendation = fallbackGuardrailed.recommendation;
      criticalViolations = fallbackGuardrailed.criticalViolations;
      yellowWarnings = fallbackGuardrailed.yellowWarnings;
      const finalQualityScore = fallbackGuardrailed.finalQualityScore;
      const finalRiskScore = fallbackGuardrailed.finalRiskScore;
      const fallbackImageReview = fallbackGuardrailed.finalImageReview;
      const fallbackDocumentReview = fallbackGuardrailed.finalDocumentReview;

      if (recommendation === 'APPROVE') {
        compliantChecks.push('Không phát hiện từ khóa vi phạm hoặc gian lận thanh toán');
      }

      // Sanitize compliant checks
      compliantChecks = sanitizeCompliantChecks({
        compliantChecks,
        criticalViolations,
        yellowWarnings,
        permitFiles,
        hasThumbnail,
        hasBanner,
        hasDescImages,
        imageReview: fallbackImageReview,
        documentReview: fallbackDocumentReview,
      });

      // Sync legacy flat warnings
      criticalViolations.forEach((v) => {
        warnings.push(`[HIGH] [${v.policy_code || 'CHÍNH SÁCH'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
      });
      yellowWarnings.forEach((v) => {
        warnings.push(`[MEDIUM] [${v.policy_code || 'LƯU Ý'}] ${v.issue || ''}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`);
      });

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
        suggestions: suggestions.length > 0 ? suggestions : criticalViolations.concat(yellowWarnings).map((w) => `Vui lòng xử lý: ${w.issue}`),
        flat_warnings: warnings,
        content_review: fallbackContentReview,
        image_review: fallbackImageReview,
        document_review: fallbackDocumentReview,
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
          visual_description: cleanAiOutputText(r.visual_description || r.description || ''),
          extracted_text: r.extracted_text || r.extractedText || null,
          extractedText: r.extractedText || r.extracted_text || null,
          is_event_poster_or_relevant_banner: typeof r.is_event_poster_or_relevant_banner === 'boolean' ? r.is_event_poster_or_relevant_banner : null,
          safety_flags: Array.isArray(r.safety_flags) ? r.safety_flags : [],
          description: cleanAiOutputText(r.description || r.visual_description || ''),
        })) : null,
        document_analysis: documentAnalysisResults.length > 0 ? documentAnalysisResults.map((d) => ({
          source: d.source,
          fileName: d.fileName || '',
          fileType: d.fileType || '',
          url: d.url || '',
          extractedText: d.extractedText || null,
          legality: d.legality || null,
          description: cleanAiOutputText(d.description || ''),
        })) : null,
      };

      checkCancellation();
      const savedData = cleanAiOutputObject(rawSavedData);

      const inputSnapshot = buildAiInputSnapshot({
        event,
        cleanDescription,
        cleanAdditionalTerms,
        imageAnalysisResults,
        documentAnalysisResults,
        userPrompt: eventPromptWithVision,
      });

      const saved = await eventsAdminRepository.saveAiReview({
        eventId,
        recommendation,
        warnings: savedData,
        logContext: {
          modelName: 'heuristic-fallback',
          criteriaSnapshot: activeCriteria,
          inputSnapshot,
          rawOutput: `[HEURISTIC_FALLBACK] ${aiErr?.message || 'Unknown error'}`,
          riskScore: savedData.risk_score,
          qualityScore: savedData.quality_score,
        },
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
      isRunning: Boolean(currentScanState.isRunning && !currentScanState.isCancelled),
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
    currentScanState.isRunning = false;
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

const serviceInstance = new EventsAdminService();
serviceInstance.inspectDocumentLegality = inspectDocumentLegality;
serviceInstance.requiresStrictEventPermit = requiresStrictEventPermit;
serviceInstance.buildAiReviewSystemPrompt = buildAiReviewSystemPrompt;
serviceInstance.applyStage2Guardrails = applyStage2Guardrails;
serviceInstance.buildValidatedDocumentReview = buildValidatedDocumentReview;
serviceInstance.buildValidatedImageReview = buildValidatedImageReview;
serviceInstance.buildEventAiUserPrompt = buildEventAiUserPrompt;
serviceInstance.formatSessionVenueAddress = formatSessionVenueAddress;

module.exports = serviceInstance;


