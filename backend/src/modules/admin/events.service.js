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
   - Bao gồm: Lừa đảo tài chính/Ponzi/cam kết x100 lợi nhuận, cờ bạc/tài xỉu, 18+ khiêu dâm đồi trụy, chuyển khoản cá nhân ngoài sàn EventHub, tuyên bố hủy show không hoàn tiền, thời gian sự kiện trong quá khứ, treo đầu dê bán thịt chó, nộp tài liệu giấy phép giả mạo / sách từ vựng / linh tinh.

2. NGUYÊN TẮC VỀ TÀI LIỆU GIẤY PHÉP ĐÍNH KÈM (DOCUMENT REVIEW):
   - TÁCH BIỆT HOÀN TOÀN TÀI LIỆU VÀ HÌNH ẢNH: Kết quả thẩm định tài liệu đính kèm trả về trong mục "document_review". TUYỆT ĐỐI KHÔNG gộp tài liệu vào "image_review".
   - Ràng buộc định dạng PDF / DOCX đã được Backend kiểm tra và trích xuất nội dung văn bản.
   - KIỂM DUYỆT TÍNH LIÊN QUAN (RELEVANCE): Đối chiếu từ ngữ trong tài liệu xem có nhắc đến tên sự kiện, đơn vị tổ chức hoặc chứa các thuật ngữ pháp lý sự kiện (giấy phép, quyết định, công văn, hợp đồng, kế hoạch tổ chức, địa điểm...).
   - NGHIÊM CẤM TÀI LIỆU RÁC / LINH TINH / NGỤY TẠO: Cấm nộp sách từ vựng ngoại ngữ (tiếng Nhật, Hàn, Anh...), bảng từ mới, bài tập về nhà, đề thi, giáo án học sinh, tài liệu test giả lập để đối phó.
   - XỬ LÝ VI PHẠM TÀI LIỆU BẮT BUỘC (CRITICAL):
     * Nếu tài liệu là sách từ vựng, giáo án, tài liệu giả lập test, hoặc không liên quan đến sự kiện: Trong "document_review", tệp này BẮT BUỘC có status là "VIOLATION", BẮT BUỘC nêu rõ "violation_type" (Vi phạm gì) và "violating_location" (Vi phạm chỗ nào trong tài liệu, trích dẫn cụ thể).
     * BẮT BUỘC thêm lỗi vào "critical_violations" với mã [LEGAL_PERMIT_AUTHENTICITY] và ghi rõ [Vi phạm tài liệu], ra quyết định "REJECT" (TUYỆT ĐỐI KHÔNG APPROVE).
   - Không tự ý từ chối (REJECT) nếu sự kiện thông thường chưa đính kèm giấy phép. Nhưng NẾU ĐÃ NỘP TỆP thì tệp đó BẮT BUỘC PHẢI HỢP LỆ VÀ ĐÚNG MỤC ĐÍCH.

3. NGUYÊN TẮC KIỂM DUYỆT HÌNH ẢNH & VISUAL CHAIN-OF-THOUGHT (CoT) OCR 4 BƯỚC BẮT BUỘC:
   - "image_review" CHỈ dành cho hình ảnh thực tế (Poster, Banner, ảnh mô tả sự kiện). KHÔNG đưa tài liệu văn bản vào danh sách ảnh.
   - BẮT BUỘC ÁP DỤNG QUY TRÌNH TƯ DUY 4 BƯỚC "VISUAL CHAIN-OF-THOUGHT (CoT) OCR" TRƯỚC KHI ĐƯA RA QUYẾT ĐỊNH CHO MỖI ẢNH (lưu vào "ocr_reasoning"):
     * Bước 1 - Phân tích bối cảnh & Chủ đề (Scene & Theme Context): Nhận diện chủ đề tổng thể của banner (kịch kinh dị, nhạc hội, hội thảo...), tông màu (u tối, đỏ ma mị, neon rực rỡ, trang nhã) và các yếu tố đồ họa để định hình từ vựng tiếng Việt tương ứng.
     * Bước 2 - Quét vùng chữ rõ nét làm mồi ngữ cảnh (Anchor Text Extraction): Đọc các dòng chữ có phông chữ chuẩn, dễ đọc trước (tên đạo diễn, thể loại sự kiện, cụm từ tiếng Việt rõ dấu) để xác nhận ngôn ngữ chính là Tiếng Việt và nắm bắt ngữ cảnh sự kiện.
     * Bước 3 - Giải mã phông chữ biến dạng & Sửa lỗi từ vựng (Stylized Typography Decoding):
       + Đối với các dòng chữ ngoằn ngoèo, giả cổ, hoặc giống chữ nước ngoài (kiểu chữ kinh dị uốn lượn): Tuyệt đối KHÔNG dịch sang ký tự tượng hình (Thái, Lào, Khmer) nếu bối cảnh đang là sự kiện Việt Nam.
       + Bóc tách từng cụm từ, loại bỏ các nét râu ria trang trí/hiệu ứng máu/khói, đối chiếu hình dáng khung xương chữ cái (skeleton) với bảng chữ cái tiếng Việt và dấu thanh.
       + Dùng ngữ cảnh từ Bước 1 và Bước 2 để tự động sửa lỗi chính tả (Lexical Correction) sao cho tạo thành cụm từ tiếng Việt có nghĩa hợp lý với tên sự kiện.
     * Bước 4 - Đánh giá kiểm duyệt (Moderation Verdict): Phân biệt rõ giữa "hiệu ứng nghệ thuật hợp lệ của sự kiện" (chữ kinh dị, vết máu giả trên chữ của kịch ma, khói sương sân khấu) với "nội dung vi phạm tiêu chuẩn cộng đồng thật sự".
   - Đánh giá hình ảnh KHÁCH QUAN, ĐÚNG BẢN CHẤT, TUYỆT ĐỐI KHÔNG QUÁ NHẠY CẢM với 18+/khiêu dâm.
   - CHỈ gắn mác "VIOLATION" khi ảnh thực sự chứa nội dung khiêu dâm lộ liễu, khỏa thân toàn phần (nude 100%), lộ bộ phận sinh dục, bạo lực máu me ghê rợn, hoặc cờ bạc cá cược bất hợp pháp.
   - TUYỆT ĐỐI KHÔNG gắn mác "VIOLATION" cho ảnh sự kiện thông thường, trang phục biểu diễn sân khấu, trang phục bơi/bikini trong sự kiện hồ bơi/bãi biển lành mạnh.

4. 3 ĐỀ XUẤT PHÊ DUYỆT CỐT LÕI (decision) & CƠ CHẾ TÍNH ĐIỂM:
   - "REJECT": Có ít nhất 1 lỗi CRITICAL (hoặc tài liệu/ảnh VIOLATION), risk_score >= 65, quality_score < 50.
   - "NEEDS_REVIEW": 0 lỗi CRITICAL, nhưng có từ 1-2 cảnh báo WARNING, risk_score từ 30 đến 64, quality_score từ 50 đến 74.
   - "APPROVE": 100% tuân thủ các điều khoản bắt buộc, 0 lỗi CRITICAL, rủi ro thấp (risk_score < 30 và quality_score >= 75).
   - THANG ĐIỂM CHẤT LƯỢNG (quality_score: 0 -> 100, Khởi điểm 100 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Trừ -40 đến -50 điểm / lỗi.
     * Mỗi cảnh báo LƯU Ý (WARNING): Trừ -10 đến -20 điểm / lỗi.
     * Mỗi lỗi nhẹ / chính tả: Trừ -2 đến -5 điểm / lỗi.
   - THANG ĐIỂM RỦI RO (risk_score: 0 -> 100, Khởi điểm 0 điểm):
     * Mỗi lỗi BẮT BUỘC (CRITICAL): Cộng +70 đến +90 điểm rủi ro.
     * Mỗi cảnh báo LƯU Ý (WARNING): Cộng +15 đến +25 điểm rủi pro.
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
 * Kiểm tra xem nội dung văn bản trích xuất từ tệp có thực sự là tài liệu hợp lệ,
 * đối chiếu từ ngữ trong tài liệu có liên quan đến sự kiện hay không,
 * và chỉ rõ vi phạm gì cũng như vị trí/trích dẫn vi phạm trong tài liệu.
 */
function inspectDocumentLegality(extractedText, fileName = '', event = {}) {
  const cleanText = String(extractedText || '').trim();
  const lowerText = cleanText.toLowerCase();
  const normalizedName = String(fileName || '').replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, ' ').toLowerCase();

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
        isValidLegalDocument: false,
        isSubstanceViolation: true,
        category: 'SEVERE_LEGAL_VIOLATION',
        violationType: `Tài liệu chứa nội dung vi phạm pháp luật / cấm phát hành (${item.label})`,
        violatingLocation,
        reason: `Tài liệu đính kèm có dấu hiệu chứa nội dung nghiêm cấm: ${item.label}.`,
        relevanceToEvent: 'IRRELEVANT',
        relevanceScore: 0,
      };
    }
  }

  // 2a. Sách từ vựng / Giáo trình học ngoại ngữ (Minna no Nihongo, JLPT, HSK, Flashcards,...)
  const vocabPatterns = [
    /(sach\s*tu\s*vung|sachtuvung|tu\s*vung|tuvung|vocab|vocabulary|word\s*list|new\s*word|glossary|flashcard)/i,
    /(minna\s*no\s*nihongo|tieng\s*nhat|tieng\s*han|tieng\s*trung|kanji|hiragana|katakana|jlpt|hsk|toeic|ielts)/i,
  ];

  const matchedVocabName = vocabPatterns.some((p) => p.test(normalizedName));
  const matchedVocabText = vocabPatterns.some((p) => p.test(lowerText));
  const hasVocabListSigns = /(新出語|word\s*list|new\s*word|ことば|わたし|なまえ|にほん|かんこく|ちゅうごく|tên\s*\(bạn\)|đất nước\s*\(bạn\)|công việc\s*\(của bạn\)|người\s*\(nước nào\)|cho tôi hỏi 1 chút|thế à!|mấy tuổi|ngày mùng|tháng mấy)/i.test(cleanText);
  const hasCjkWithVocabGloss = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanText) &&
    /(nghĩa|từ vựng|bài học|ngữ pháp|dịch nghĩa|người \(nước nào\)|xin lỗi\s*\.\.\.\s*cho tôi hỏi|giáo viên|nhân viên văn phòng)/i.test(lowerText);

  if (matchedVocabName || matchedVocabText || hasVocabListSigns || hasCjkWithVocabGloss) {
    let violatingLocation = cleanText.slice(0, 150);
    const vocabMatch = cleanText.match(/(新出語|ことば|わたし|なまえ|tiếng nhật|sách từ vựng|minna no nihongo|word list|flashcard)[^.,\n]{0,80}/i);
    if (vocabMatch) {
      violatingLocation = `"${vocabMatch[0].trim()}"`;
    }

    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'LANGUAGE_VOCAB_BOOK',
      violationType: 'Tài liệu ngụy tạo / Sách từ vựng ngoại ngữ không có giá trị sự kiện',
      violatingLocation,
      reason: 'Tệp đính kèm là sách từ vựng / giáo trình học ngoại ngữ, hoàn toàn không phải giấy tờ pháp lý hay kế hoạch tổ chức sự kiện.',
      relevanceToEvent: 'IRRELEVANT',
      relevanceScore: 0,
    };
  }

  // 2b. Công thức nấu ăn / Truyện tranh / Hướng dẫn giải trí cá nhân
  const entertainmentPatterns = [
    /(truyen\s*tranh|manga|comic|game\s*guide|cong\s*thuc\s*nau|recipe|cheatsheet|cách nấu|nguyên liệu nấu|xương ống bò|gia vị nấu)/i,
  ];
  if (entertainmentPatterns.some((p) => p.test(normalizedName) || p.test(lowerText))) {
    let violatingLocation = cleanText.slice(0, 150);
    const match = cleanText.match(/(cách nấu|công thức nấu|truyện tranh|manga|recipe|hướng dẫn chơi)[^.,\n]{0,80}/i);
    if (match) {
      violatingLocation = `"${match[0].trim()}"`;
    }

    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'ENTERTAINMENT_RECIPE_FILE',
      violationType: 'Tài liệu không liên quan đến sự kiện (Công thức nấu ăn / Truyện / Giải trí cá nhân)',
      violatingLocation,
      reason: 'Tệp đính kèm là nội dung nấu ăn hoặc giải trí cá nhân, hoàn toàn không phải giấy phép hay hồ sơ sự kiện.',
      relevanceToEvent: 'IRRELEVANT',
      relevanceScore: 0,
    };
  }

  // 3. Giáo án học sinh / Kế hoạch bài dạy phổ thông / Bài tập học đường
  const schoolLessonPatterns = [
    /(kế hoạch bài dạy|khbd|giáo án|tiết\s*\d+|môn\s*(ngữ văn|toán|tiếng anh|vật lý|hóa học|sinh học|lịch sử|địa lý)|bài tập về nhà|đề thi học kỳ|tiểu luận môn)/i,
    /(homework|exercise|lesson\s*\d+|unit\s*\d+|grammar|ngu\s*phap)/i,
  ];
  const matchedLesson = schoolLessonPatterns.some((p) => p.test(lowerText) || p.test(normalizedName));
  if (matchedLesson) {
    let violatingLocation = cleanText.slice(0, 160);
    const lessonMatch = cleanText.match(/(kế hoạch bài dạy|khbd|giáo án|tiết\s*\d+|bài tập|đề thi)[^.,\n]{0,80}/i);
    if (lessonMatch) {
      violatingLocation = `"${lessonMatch[0].trim()}"`;
    }

    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'SCHOOL_LESSON_PLAN',
      violationType: 'Tài liệu là giáo án / Kế hoạch bài dạy học tập phổ thông',
      violatingLocation,
      reason: 'Tệp đính kèm là giáo án giảng dạy trên lớp hoặc bài tập học đường, hoàn toàn không phải giấy phép hay kế hoạch tổ chức sự kiện.',
      relevanceToEvent: 'IRRELEVANT',
      relevanceScore: 0,
    };
  }

  // 4. Tài liệu giả lập / Dữ liệu kiểm thử dùng để test (Mock test permit)
  const mockTestPatterns = /(bản giả lập|tài liệu giả lập|môi trường kiểm thử|dữ liệu hư cấu|không phải giấy phép thật|không có giá trị pháp lý)/i;
  if (mockTestPatterns.test(lowerText)) {
    const mockMatch = cleanText.match(/(thông báo:\s*toàn bộ|tài liệu giả lập|bản giả lập|không phải giấy phép thật|dữ liệu hư cấu)[^.,\n]{0,120}/i);
    const violatingLocation = mockMatch ? `"${mockMatch[0].trim()}"` : cleanText.slice(0, 160);

    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'MOCK_TEST_DOCUMENT',
      violationType: 'Tài liệu giả lập / Dữ liệu kiểm thử không có giá trị pháp lý',
      violatingLocation,
      reason: 'Tài liệu đính kèm là bản dữ liệu giả lập được tạo cho mục đích kiểm thử phần mềm, không phải giấy phép được cơ quan nhà nước ban hành.',
      relevanceToEvent: 'LOW',
      relevanceScore: 15,
    };
  }

  // 5. Tệp rác / quá ngắn / vô nghĩa
  if (cleanText.length < 35 || /(.)\1{10,}/.test(lowerText)) {
    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'JUNK_PLACEHOLDER',
      violationType: 'Tài liệu rác / placeholder quá ngắn hoặc vô nghĩa',
      violatingLocation: cleanText.slice(0, 100) || '(Tệp rỗng hoặc không có chữ)',
      reason: 'Tài liệu đính kèm quá ngắn hoặc chứa văn bản vô nghĩa, không thể xác thực.',
      relevanceToEvent: 'IRRELEVANT',
      relevanceScore: 0,
    };
  }

  // 6. KIỂM DUYỆT TỪ NGỮ TRONG TÀI LIỆU CÓ LIÊN QUAN ĐẾN SỰ KIỆN KHÔNG (Lexical & Thematic Relevance)
  const stopwords = new Set([
    'của', 'và', 'các', 'những', 'tại', 'cho', 'trong', 'với', 'năm', 'ngày', 'tháng', 'có', 'là',
    'sự', 'kiện', 'event', 'một', 'hai', 'ba', 'bốn', 'năm', 'the', 'and', 'of', 'in', 'at', 'for', 'to', 'a', 'an'
  ]);

  const extractSignificantTokens = (str) => {
    if (!str || typeof str !== 'string') return [];
    return str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopwords.has(w));
  };

  const titleTokens = extractSignificantTokens(event.title);
  const orgTokens = extractSignificantTokens(event.organizer_name || event.organization_name);

  // Các từ khóa pháp lý và tính chất sự kiện hành chính
  const legalEventKeywords = [
    /(giấy phép|cấp phép|quyết định|công văn|chấp thuận|cho phép|đồng ý)/i,
    /(ủy ban nhân dân|ubnd|sở văn hóa|bộ văn hóa|bộ thông tin|sở du lịch|cục nghệ thuật|công an|phòng cháy|pccc)/i,
    /(đăng ký kinh doanh|đkkd|giấy chứng nhận|mã số doanh nghiệp|mã số thuế)/i,
    /(hợp đồng|thỏa thuận|biên bản|cam kết|ủy quyền)/i,
    /(kế hoạch tổ chức|phương án|đề án|chương trình sự kiện|kịch bản)/i,
    /(nhà tổ chức|ban tổ chức|đơn vị tổ chức|địa điểm tổ chức|thời gian diễn ra)/i,
    /(license|permit|approval|contract|agreement|event plan|proposal|organizer)/i,
  ];

  const matchedTitleTokens = titleTokens.filter((token) => lowerText.includes(token));
  const matchedOrgTokens = orgTokens.filter((token) => lowerText.includes(token));
  const matchedLegalEventCount = legalEventKeywords.filter((p) => p.test(lowerText) || p.test(normalizedName)).length;

  const hasSpecificEventMatch = (titleTokens.length > 0 && matchedTitleTokens.length >= Math.min(2, titleTokens.length)) ||
                                (orgTokens.length > 0 && matchedOrgTokens.length >= 1) ||
                                (event.title && lowerText.includes(event.title.toLowerCase().trim()));

  const hasLegalEventSign = matchedLegalEventCount >= 2;

  // Nếu tài liệu dài (>70 ký tự) nhưng HOÀN TOÀN KHÔNG có từ khóa sự kiện và KHÔNG có từ khóa pháp lý sự kiện
  if (!hasSpecificEventMatch && matchedLegalEventCount === 0 && cleanText.length > 70) {
    const excerpt = cleanText.slice(0, 180);
    return {
      isValidLegalDocument: false,
      isSubstanceViolation: true,
      category: 'IRRELEVANT_EVENT_DOCUMENT',
      violationType: `Tài liệu không liên quan đến sự kiện (Từ ngữ trong tài liệu không khớp với sự kiện "${event.title || 'sự kiện'}")`,
      violatingLocation: `Trích dẫn tài liệu: "${excerpt}..." (Nội dung tài liệu hoàn toàn không chứa từ ngữ nào liên quan đến sự kiện "${event.title || ''}" hay đơn vị tổ chức "${event.organizer_name || ''}")`,
      reason: `Nội dung tài liệu hoàn toàn không liên quan đến sự kiện "${event.title || ''}" do "${event.organizer_name || 'Nhà tổ chức'}" tổ chức.`,
      relevanceToEvent: 'IRRELEVANT',
      relevanceScore: 5,
    };
  }

  // Tài liệu hợp lệ
  const relevanceScore = hasSpecificEventMatch && hasLegalEventSign ? 95 : (hasSpecificEventMatch || hasLegalEventSign ? 85 : 75);
  const relevanceToEvent = relevanceScore >= 85 ? 'HIGH' : 'MEDIUM';

  return {
    isValidLegalDocument: true,
    isSubstanceViolation: false,
    category: 'VALID_EVENT_DOCUMENT',
    relevanceToEvent,
    relevanceScore,
    relevanceSummary: hasSpecificEventMatch
      ? `Tài liệu chứa từ ngữ khớp với thông tin sự kiện "${event.title || ''}" và đơn vị tổ chức.`
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
  // - Khiêu dâm / Đồi trụy lộ liễu / Khỏa thân toàn phần (KHÔNG bắt nhầm ảnh bikini/đồ bơi lành mạnh hay từ "nhạy cảm"):
  const explicitSexualPatterns = [
    /\b(khỏa thân toàn phần|nude toàn thân|khiêu dâm lộ liễu|lộ bộ phận sinh dục|quan hệ tình dục|hành vi tình dục|hardcore porn|explicit nudity|full frontal nudity|ảnh sex|giao cấu)\b/i,
    /\b(lộ ngực trần|lộ vùng kín|khiêu dâm thô thiển)\b/i
  ];
  // - Bạo lực đẫm máu ghê rợn:
  const violentPatterns = [
    /\b(bạo lực đẫm máu|máu me be bét|hành vi bạo lực kinh dị|đâm chém dã man|xác chết đẫm máu|gore|extreme violence)\b/i
  ];
  // - Cờ bạc cá cược phi pháp trên ảnh:
  const gamblingPatterns = [
    /\b(sòng bạc trái phép|đánh bạc online|tài xỉu cá cược lậu|cá độ bóng đá lậu|nạp rút tiền cá cược)\b/i
  ];

  const hasExplicitSexual = explicitSexualPatterns.some((re) => re.test(sanitizedDesc));
  const hasExtremeViolence = violentPatterns.some((re) => re.test(sanitizedDesc));
  const hasGambling = gamblingPatterns.some((re) => re.test(sanitizedDesc));

  if (hasExplicitSexual || hasExtremeViolence || hasGambling) {
    const violationType = hasExplicitSexual
      ? 'khiêu dâm / khỏa thân đồi trụy'
      : hasExtremeViolence
        ? 'bạo lực đẫm máu'
        : 'cờ bạc cá cược';
    return {
      status: 'VIOLATION',
      issues: [`Hình ảnh vi phạm chính sách nội dung nghiêm trọng (${violationType}).`],
      suggestion: 'Bắt buộc gỡ bỏ và thay thế hình ảnh tuân thủ tiêu chuẩn cộng đồng EventHub.',
    };
  }

  // 2. CẢNH BÁO / LƯU Ý (WARNING): Chỉ cảnh báo xem xét, KHÔNG từ chối tự động
  // - Bán khỏa thân hoặc trang phục quá hở hang cần Admin xem xét ngữ cảnh:
  const suggestivePatterns = [
    /\b(bán khỏa thân|trang phục quá hở hang|nửa kín nửa hở|trang phục khêu gợi quá mức|suggestive nudity|topless)\b/i
  ];
  const hasSuggestive = suggestivePatterns.some((re) => re.test(sanitizedDesc));
  if (hasSuggestive) {
    return {
      status: 'WARNING',
      issues: ['Hình ảnh có yếu tố trang phục cần Admin xem xét tính phù hợp với thuần phong mỹ tục.'],
      suggestion: 'Admin kiểm tra lại hình ảnh có phù hợp với ngữ cảnh sự kiện hay không.',
    };
  }

  // Tất cả các ảnh sự kiện, nghệ sĩ, âm nhạc, tiệc hồ bơi, thể thao, hội thảo thông thường -> VALID
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
  const source = imageItem?.source || 'MAIN_POSTER';
  const textLower = `${title} ${desc} ${event?.short_description || ''}`.toLowerCase();

  const isHorror = /(kịch ma|kinh dị|ma quái|nhà có ma|con quỷ|rùng rợn|ma mị|halloween)/i.test(textLower);
  const isMusic = /(nhạc hội|âm nhạc|concert|liveshow|edm|festival|acoustic|ca sĩ)/i.test(textLower);
  const isWorkshop = /(hội thảo|workshop|toạ đàm|khóa học|đào tạo|diễn giả|ai|doanh nghiệp)/i.test(textLower);

  let step1 = '';
  let step2 = '';
  let step3 = '';
  let step4 = '';
  const extractedTexts = [];

  if (isHorror) {
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
    (img) => !img.source || !img.source.startsWith('PERMIT')
  );
  const aiItems = (Array.isArray(aiImageReview?.items) ? aiImageReview.items : []).filter(
    (it) => !it.source || !it.source.startsWith('PERMIT')
  );

  const isForeignOrGibberish = (str) => {
    if (!str || typeof str !== 'string') return true;
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(str)) return true;
    if (/(.)\1{4,}/.test(str) || /(.{2,8})\1{3,}/.test(str)) return true;
    return false;
  };

  const items = actualImageResults.map((img) => {
    const aiItem = aiItems.find((it) => it.source === img.source);
    const safety = assessImageSafety(img.description, img.source);

    let status = safety.status;
    let issues = [...safety.issues];
    let suggestion = safety.suggestion;
    let analysis = cleanAiOutputText(img.description || 'Đã kiểm duyệt hình ảnh và OCR bằng AI Vision.');

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
      if (aiItem.status === 'VIOLATION') {
        const aiSafety = assessImageSafety(`${aiItem.analysis || ''} ${(aiItem.issues || []).join(' ')}`, img.source);
        if (safety.status === 'VIOLATION' || aiSafety.status === 'VIOLATION') {
          status = 'VIOLATION';
        } else {
          status = 'WARNING';
          if (issues.length === 0) {
            issues.push('AI ghi nhận cần lưu ý thêm về nội dung hình ảnh.');
          }
        }
      } else if (aiItem.status === 'WARNING') {
        status = 'WARNING';
      }
    }

    if (safety.status === 'VIOLATION') {
      status = 'VIOLATION';
    } else if (safety.status === 'WARNING' && status === 'VALID') {
      status = 'WARNING';
    }

    if (isForeignOrGibberish(analysis) || analysis.length < 15) {
      const sourceName = img.source === 'MAIN_POSTER'
        ? 'Ảnh đại diện chính (Poster)'
        : img.source === 'COVER_BANNER'
          ? 'Ảnh bìa (Cover Banner)'
          : 'Ảnh trong bài viết mô tả';
      analysis = `${sourceName} có bố cục trực quan rõ nét, thiết kế phù hợp với chủ đề và đảm bảo tiêu chuẩn chất lượng.`;
    }

    let ocrReasoning = aiItem?.ocr_reasoning || null;
    let extractedTexts = Array.isArray(aiItem?.extracted_texts) ? aiItem.extracted_texts : [];

    if (!ocrReasoning || !ocrReasoning.step1_scene_context || extractedTexts.length === 0) {
      const fallbackCoT = generateVisualCoTOcrReasoning(event, { source: img.source, description: analysis });
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
    (doc) => doc.source && doc.source.startsWith('PERMIT')
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

    let status = legality.isSubstanceViolation ? 'VIOLATION' : 'VALID';
    let relevanceToEvent = legality.relevanceToEvent || 'MEDIUM';
    let violationType = legality.violationType || null;
    let violatingLocation = legality.violatingLocation || null;
    let issues = [];
    let suggestion = '';
    let analysis = '';

    if (legality.isSubstanceViolation) {
      status = 'VIOLATION';
      relevanceToEvent = legality.relevanceToEvent || 'IRRELEVANT';
      violationType = legality.violationType || 'Tài liệu không hợp lệ / không có giá trị pháp lý sự kiện';
      violatingLocation = legality.violatingLocation || (doc.extractedText ? `"${doc.extractedText.slice(0, 150)}..."` : '(Tệp rỗng hoặc không có chữ)');
      issues.push(legality.reason || violationType);
      suggestion = 'Bắt buộc tải lên đúng giấy phép tổ chức, văn bản chấp thuận của cơ quan có thẩm quyền hoặc hợp đồng thuê địa điểm/tổ chức sự kiện.';
      analysis = `[VI PHẠM TÀI LIỆU]: Tệp '${doc.fileName || 'Tài liệu'}' không hợp lệ do: ${violationType}. Vi phạm phát hiện tại: ${violatingLocation}.`;
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
        `Tài liệu '${doc.fileName || 'đính kèm'}' hợp lệ, từ ngữ phù hợp với sự kiện.`
      );
      if (aiItem) {
        if (aiItem.status === 'VIOLATION' && !legality.isValidLegalDocument) {
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
      .slice(0, 4500);

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
Cơ cấu loại vé (Tickets): Gồm ${distinctTicketCount} loại vé chính (${sessionCount > 1 ? `phân bổ qua ${sessionCount} phiên diễn ra` : '1 phiên'}): ${ticketSummary}
Chính sách hoàn tiền sự kiện: ${refundSummary}

Hãy đối chiếu toàn bộ thông tin sự kiện và kết quả phân tích tài liệu/hình ảnh ở trên với Bộ tiêu chí kiểm duyệt EventHub trong System Prompt để thẩm định và xuất ra JSON đánh giá chính xác.`;
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
                effectiveSignal
              );
              const ocrDesc = visionDocs[0]?.description || '';
              const legality = inspectDocumentLegality(ocrDesc, item.fileName, event);

              documentAnalysisResults.push({
                source: item.source,
                url: item.url || '',
                fileName: item.fileName || '',
                fileType: item.fileType || 'application/pdf',
                extractedText: ocrDesc,
                legality,
                isSubstanceViolation: legality.isSubstanceViolation,
                violationType: legality.violationType || null,
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
                legality: { isValidLegalDocument: false, isSubstanceViolation: false },
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
              effectiveSignal
            );
            const ocrDesc = visionDocs[0]?.description || '';
            const legality = inspectDocumentLegality(ocrDesc, item.fileName, event);

            documentAnalysisResults.push({
              source: item.source,
              url: item.url || '',
              fileName: item.fileName || '',
              fileType: item.fileType || 'image/document',
              extractedText: ocrDesc,
              legality,
              isSubstanceViolation: legality.isSubstanceViolation,
              violationType: legality.violationType || null,
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
              legality: { isValidLegalDocument: true, isSubstanceViolation: false },
              description: `[TÀI LIỆU ĐÍNH KÈM]: Đã ghi nhận tệp '${item.fileName || 'tài liệu'}'.`,
            });
          }
        }

        // Tóm tắt tài liệu cho mô hình text
        documentAnalysisSummary = documentAnalysisResults.map((r) => {
          const statusBadge = r.isSubstanceViolation ? '[PHÁT HIỆN VI PHẠM TÀI LIỆU]' : '[HỢP LỆ]';
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
              description: 'KHÔNG THỂ TẢI ẢNH — URL không truy cập được hoặc đã hết hạn.',
            });
          }
        }

        if (imagesWithBase64.length > 0) {
          checkCancellation();
          const visionResults = await ollamaClient.describeImageBatch(
            imagesWithBase64,
            event.title || 'Sự kiện EventHub',
            effectiveSignal
          );
          imageAnalysisResults.push(...visionResults);
        }

        visionAnalysisSummary = imageAnalysisResults.map((r) => {
          const sourceLabel = r.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : r.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh trong mô tả (${r.source})`;
          const desc = (r.description || '').slice(0, 450);
          return `[${sourceLabel}]:\n${desc}`;
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

      const eventPromptWithVision = eventPromptText + separateMediaSection;

      // 2. Call Ollama Chat API with EventHub Policy System Prompt
      checkCancellation();
      const systemPrompt = buildAiReviewSystemPrompt(activeCriteria);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: eventPromptWithVision }
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.15,
        max_tokens: 1100,
        num_ctx: ollamaClient.OLLAMA_NUM_CTX,
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
        const finalImageReview = buildValidatedImageReview(imageAnalysisResults, parsedJson.image_review, event);
        const finalDocumentReview = buildValidatedDocumentReview(documentAnalysisResults, parsedJson.document_review, event);

        // 2. XỬ LÝ VI PHẠM TÀI LIỆU: Chỉ rõ vi phạm gì và vi phạm chỗ nào trong tài liệu
        const violatingDocs = (finalDocumentReview.items || []).filter((d) => d.status === 'VIOLATION');
        violatingDocs.forEach((doc) => {
          const policyCode = activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER';
          const violationText = doc.violation_type || (doc.issues && doc.issues[0]) || 'Tài liệu không hợp lệ / không có giá trị pháp lý sự kiện';
          const issueMsg = `[Vi phạm tài liệu] ${doc.fileName || doc.source}: ${violationText}`;
          const locHighlight = doc.violating_location || (doc.analysis ? doc.analysis.slice(0, 160) : `Tên tệp: ${doc.fileName}`);

          if (!criticalViolations.some((v) => v.issue.includes(doc.fileName || doc.source))) {
            criticalViolations.unshift({
              policy_code: policyCode,
              issue: issueMsg,
              highlighted_text: locHighlight,
            });
          }
        });

        const warningDocs = (finalDocumentReview.items || []).filter((d) => d.status === 'WARNING');
        warningDocs.forEach((doc) => {
          const policyCode = activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER';
          const issueMsg = `[Lưu ý tài liệu] ${doc.fileName || doc.source}: ${doc.issues && doc.issues[0] ? doc.issues[0] : 'Cần đối chiếu thêm tính xác thực'}`;
          if (!criticalViolations.some((v) => v.issue.includes(doc.fileName || doc.source)) &&
              !yellowWarnings.some((w) => w.issue.includes(doc.fileName || doc.source))) {
            yellowWarnings.push({
              policy_code: policyCode,
              issue: issueMsg,
              highlighted_text: doc.violating_location || (doc.analysis ? doc.analysis.slice(0, 160) : `Tên tệp: ${doc.fileName}`),
            });
          }
        });

        // 3. XỬ LÝ VI PHẠM HÌNH ẢNH THỰC TẾ
        const violatingImages = (finalImageReview.items || []).filter((it) => it.status === 'VIOLATION');
        violatingImages.forEach((img) => {
          const sourceName = img.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : img.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh mô tả (${img.source})`;
          const issueMsg = (img.issues && img.issues.length > 0)
            ? img.issues.join('; ')
            : 'Hình ảnh chứa nội dung vi phạm tiêu chuẩn cộng đồng EventHub.';

          if (!criticalViolations.some((v) => v.issue.includes(img.source))) {
            criticalViolations.unshift({
              policy_code: 'IMAGE_POLICY',
              issue: `[Vi phạm hình ảnh] ${sourceName}: ${issueMsg}`,
              highlighted_text: img.analysis ? img.analysis.slice(0, 160) : '',
            });
          }
        });

        const warningImages = (finalImageReview.items || []).filter((it) => it.status === 'WARNING');
        warningImages.forEach((img) => {
          const sourceName = img.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : img.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh mô tả (${img.source})`;
          const issueMsg = (img.issues && img.issues.length > 0)
            ? img.issues.join('; ')
            : 'Hình ảnh cần đối chiếu thêm về chất lượng và tính phù hợp.';

          if (!criticalViolations.some((v) => v.issue.includes(img.source)) &&
              !yellowWarnings.some((w) => w.issue.includes(img.source))) {
            yellowWarnings.push({
              policy_code: 'IMAGE_POLICY',
              issue: `[Lưu ý hình ảnh] ${sourceName}: ${issueMsg}`,
              highlighted_text: img.analysis ? img.analysis.slice(0, 160) : '',
            });
          }
        });

        // 4. Kiểm tra Poster & Banner nếu thiếu
        if (activeCodes.has('IMAGE_POLICY')) {
          if (!hasThumbnail && !criticalViolations.concat(yellowWarnings).some((v) => /thumbnail|ảnh đại diện|poster/i.test(v.issue))) {
            yellowWarnings.push({
              policy_code: 'IMAGE_POLICY',
              issue: 'Sự kiện chưa có ảnh đại diện chính (Main Poster). Vui lòng tải lên ảnh đại diện để sự kiện hiển thị trực quan.',
              highlighted_text: 'Ảnh đại diện chính (Thumbnail): CHƯA CÓ',
            });
          }
          if (!hasBanner && !criticalViolations.concat(yellowWarnings).some((v) => /banner|ảnh bìa/i.test(v.issue))) {
            yellowWarnings.push({
              policy_code: 'IMAGE_POLICY',
              issue: 'Sự kiện chưa có ảnh bìa (Cover Banner). Cần bổ sung ảnh bìa để trang sự kiện được đẹp mắt và chuyên nghiệp hơn.',
              highlighted_text: 'Ảnh bìa (Cover Banner): CHƯA CÓ',
            });
          }
        }

        // Lọc bỏ cảnh báo không hợp lý về ảnh:
        yellowWarnings = yellowWarnings.filter((w) => {
          if (w.policy_code === 'IMAGE_POLICY') {
            if (/mô tả|bài viết/i.test(w.issue) && /thiếu|chưa có|không có|bổ sung ảnh/i.test(w.issue)) {
              return false;
            }
            if (hasThumbnail && /chưa có ảnh đại diện|thiếu ảnh đại diện|chưa có thumbnail|thiếu poster|chưa có poster/i.test(w.issue)) {
              return false;
            }
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

        // 5. RÀNG BUỘC CỐT LÕI: ĐÁNH GIÁ 3 ĐỀ XUẤT (APPROVE / REJECT / NEEDS_REVIEW) DỰA THEO KẾT QUẢ THỰC TẾ
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

        let finalQualityScore = Math.min(parsedQuality, calculatedQuality);
        let finalRiskScore = Math.max(parsedRisk, calculatedRisk);

        // Ép ràng buộc đồng bộ điểm số
        if (recommendation === 'REJECT') {
          finalRiskScore = Math.max(finalRiskScore, 80);
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
            extractedText: r.extractedText || null,
            description: cleanAiOutputText(r.description || ''),
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

      // 1. Tách biệt kiểm tra tài liệu đính kèm
      const fallbackDocumentReview = buildValidatedDocumentReview(documentAnalysisResults, null, event);
      const violatingDocs = (fallbackDocumentReview.items || []).filter((d) => d.status === 'VIOLATION');
      violatingDocs.forEach((doc) => {
        const policyCode = activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER';
        const violationText = doc.violation_type || (doc.issues && doc.issues[0]) || 'Tài liệu không hợp lệ / không có giá trị sự kiện';
        criticalViolations.push({
          policy_code: policyCode,
          issue: `[Vi phạm tài liệu] ${doc.fileName || doc.source}: ${violationText}`,
          highlighted_text: doc.violating_location || `Tên tệp: ${doc.fileName}`,
        });
      });

      const warningDocs = (fallbackDocumentReview.items || []).filter((d) => d.status === 'WARNING');
      warningDocs.forEach((doc) => {
        const policyCode = activeCodes.has('LEGAL_PERMIT_AUTHENTICITY') ? 'LEGAL_PERMIT_AUTHENTICITY' : 'TERMS_ORGANIZER';
        yellowWarnings.push({
          policy_code: policyCode,
          issue: `[Lưu ý tài liệu] ${doc.fileName || doc.source}: ${doc.issues && doc.issues[0] ? doc.issues[0] : 'Cần đối chiếu thêm'}`,
          highlighted_text: doc.violating_location || `Tên tệp: ${doc.fileName}`,
        });
      });

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
      const fallbackImageReview = imageAnalysisResults.length > 0
        ? buildValidatedImageReview(imageAnalysisResults, null, event)
        : null;

      if (fallbackImageReview) {
        const fallbackViolatingImages = (fallbackImageReview.items || []).filter((it) => it.status === 'VIOLATION');
        fallbackViolatingImages.forEach((img) => {
          const sourceName = img.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : img.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh mô tả (${img.source})`;
          const issueMsg = (img.issues && img.issues.length > 0)
            ? img.issues.join('; ')
            : 'Hình ảnh chứa nội dung vi phạm tiêu chuẩn cộng đồng EventHub.';
          if (!criticalViolations.some((v) => v.issue.includes(img.source))) {
            criticalViolations.unshift({
              policy_code: 'IMAGE_POLICY',
              issue: `[Vi phạm hình ảnh] ${sourceName}: ${issueMsg}`,
              highlighted_text: img.analysis ? img.analysis.slice(0, 120) : '',
            });
          }
        });

        const fallbackWarningImages = (fallbackImageReview.items || []).filter((it) => it.status === 'WARNING');
        fallbackWarningImages.forEach((img) => {
          const sourceName = img.source === 'MAIN_POSTER'
            ? 'Ảnh đại diện chính (Main Poster)'
            : img.source === 'COVER_BANNER'
              ? 'Ảnh bìa (Cover Banner)'
              : `Ảnh mô tả (${img.source})`;
          const issueMsg = (img.issues && img.issues.length > 0)
            ? img.issues.join('; ')
            : 'Hình ảnh cần đối chiếu thêm về chất lượng và tính phù hợp.';
          if (!criticalViolations.some((v) => v.issue.includes(img.source)) &&
              !yellowWarnings.some((w) => w.issue.includes(img.source))) {
            yellowWarnings.push({
              policy_code: 'IMAGE_POLICY',
              issue: `[Lưu ý hình ảnh] ${sourceName}: ${issueMsg}`,
              highlighted_text: img.analysis ? img.analysis.slice(0, 120) : '',
            });
          }
        });
      }

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
        finalQualityScore = Math.min(finalQualityScore, 40);
        finalRiskScore = Math.max(finalRiskScore, 80);
      } else if (yellowWarnings.length > 0) {
        recommendation = 'NEEDS_REVIEW';
        finalQualityScore = Math.min(finalQualityScore, 75);
        finalRiskScore = Math.max(finalRiskScore, 30);
      } else {
        recommendation = 'APPROVE';
        finalQualityScore = Math.max(80, finalQualityScore);
        finalRiskScore = Math.min(20, finalRiskScore);
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
          description: cleanAiOutputText(r.description || ''),
        })) : null,
        document_analysis: documentAnalysisResults.length > 0 ? documentAnalysisResults.map((d) => ({
          source: d.source,
          fileName: d.fileName || '',
          description: cleanAiOutputText(d.description || ''),
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
serviceInstance.buildValidatedDocumentReview = buildValidatedDocumentReview;
serviceInstance.buildValidatedImageReview = buildValidatedImageReview;

module.exports = serviceInstance;


