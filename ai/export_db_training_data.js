#!/usr/bin/env node
/**
 * export_db_training_data.js
 * ===========================
 * Kết nối PostgreSQL thực tế của EventHub để trích xuất dữ liệu huấn luyện SFT & DPO:
 * 1. ai/datasets/sft_events_dataset.jsonl  : Kết hợp Golden Samples (review_data.py) + sự kiện đã duyệt sạch trong DB
 * 2. ai/datasets/dpo_override_dataset.jsonl: Thu thập các cặp DPO {prompt, chosen, rejected} từ:
 *      - Lịch sử bảng `events` nơi Admin duyệt đè (approval_status='APPROVED' nhưng ai_recommendation IN ('NEEDS_REVIEW','REJECT'), hoặc ngược lại)
 *      - Bảng `event_ai_review_logs` nơi `human_override = true`
 *
 * Usage:
 *   node ai/export_db_training_data.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const DATASETS_DIR = path.join(__dirname, 'datasets');

const dotenv = require(path.join(BACKEND_DIR, 'node_modules', 'dotenv'));
const { Pool } = require(path.join(BACKEND_DIR, 'node_modules', 'pg'));

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

// ============================================================================
// COMPACT CRITERIA TEXT (đồng bộ 16 code từ DEFAULT_REVIEW_CRITERIA - <=4096 tokens)
// ============================================================================
const COMPACT_CRITERIA_MAP = {
  TERMS_ORGANIZER:
    "Cấm hứa hẹn lợi nhuận ảo ('x100 vốn', 'lãi 30%/tháng', 'bao lỗ 100%'), Ponzi, cờ bạc, đa cấp, vi phạm bản quyền -> REJECT. Không ép workshop/webinar/meetup nhỏ nộp giấy phép.",
  EVENT_COHERENCE:
    "Tiêu đề, Mô tả, Hình ảnh, Vé, Lịch trình, Tài liệu PHẢI đồng bộ chủ đề cốt lõi. Cấm treo đầu dê bán thịt chó, ảnh rác lạc đề (meme, bàn nhậu, selfie, screenshot rác, phong cảnh) hoặc tài liệu lạc đề -> REJECT.",
  LEGAL_PERMIT_AUTHENTICITY:
    "Tệp trong permit_files phải là văn bản hành chính/pháp lý khớp sự kiện (Giấy phép Sở/UBND, ĐKKD, Hợp đồng địa điểm). Cấm sách từ vựng/IPA, giáo án, bài tập/đề thi, CV, hóa đơn/menu, code, giấy phép sự kiện khác -> IRRELEVANT_OR_FAKE_DOCUMENT, risk>=85, REJECT.",
  EVENT_REALISM_FEASIBILITY:
    "Sự kiện phải có thật, thông tin BTC rõ ràng. Cấm tạo sự kiện test/spam ('test', 'asdasd', 'aaa', 'qweqwe', ký tự ngẫu nhiên) hoặc mô tả vô nghĩa -> REJECT.",
  PAYMENT_POLICY:
    "Mọi giao dịch vé phải qua cổng EventHub. Cấm chuyển khoản STK cá nhân, ví riêng, QR ngoài web hoặc nhắn Zalo/Telegram/Facebook né phí sàn -> REJECT.",
  REFUND_POLICY:
    "Phải hoàn tiền thỏa đáng khi hoãn/hủy. Cấm tuyên bố 'Hủy sự kiện vẫn không hoàn tiền dưới mọi lý do' hoặc mâu thuẫn chính sách -> critical_violations/warnings.",
  TICKET_POLICY:
    "Tối thiểu 1 hạng vé hợp lệ (giá >= 0 VNĐ, số lượng > 0). OFFLINE/HYBRID có venue_id + địa chỉ trong sessions[].venue là HỢP LỆ (KHÔNG phạt thiếu địa chỉ). Cấm giấu địa chỉ ('Inbox Zalo nhận địa chỉ').",
  SESSION_SCHEDULE:
    "end_time phải sau start_time; thời gian không nằm trong quá khứ vô lý và phải khớp ngày giờ in trên Poster/Banner -> vi phạm: REJECT.",
  IMAGE_POLICY:
    "Cần Main Poster hợp lệ. Kiểm duyệt đúng ngữ cảnh: KHÔNG gắn nhầm 18+ cho đồ bơi thể thao/bãi biển, nghệ thuật, kịch ma hóa trang. CHỈ REJECT khi: 18+ đồi trụy, bạo lực thực tế, cờ bạc, QR lừa đảo, ảnh rác (meme, bàn nhậu, selfie, screenshot rác).",
  CONTENT_SPELLING:
    "Soát Tiêu đề (>=5 ký tự) và Mô tả (>=30 ký tự) bắt lỗi gõ telex/chính tả ('Hôi Thảo', 'Doang Nghiệp', 'chia sẽ', 'nấm bắt', 'tồ chức'), ghi vào spelling_grammar_issues + warnings. Kịch ma cần lưu ý tim mạch/độ tuổi.",
  ORGANIZER_LEGAL_COMPLIANCE:
    "Đại nhạc hội ngoài trời, festival, giải thể thao đông người phải có giấy phép, PCCC, y tế cứu hộ và bảo đảm bản quyền/thuần phong mỹ tục.",
  VALUABLE_SUGGESTIONS:
    "CDN EventHub tự tối ưu ảnh: TUYỆT ĐỐI KHÔNG gợi ý 'chỉnh kích thước/tăng độ phân giải ảnh'. Chỉ khuyên bổ sung Hotline, check-in QR, mốc giờ, sơ đồ chỗ ngồi hoặc lưu ý an toàn.",
  AGE_RESTRICTION_RATING:
    "Sự kiện bar/pub, có cồn, EDM sau 22:00 hoặc triển lãm 18+ BẮT BUỘC ghi giới hạn tuổi (18+, CCCD). Bar/đêm muộn ghi 'mọi lứa tuổi' -> warnings & NEEDS_REVIEW.",
  ANTI_FINANCIAL_FRAUD_MLM:
    "Cấm hội thảo 'x2/x10 tài khoản', 'lãi 30%/tháng', 'thu nhập thụ động không vốn', quảng bá BO/Forex trái phép, coin/token không phép hoặc tuyển đa cấp biến tướng -> REJECT.",
  CHECKIN_SECURITY_RULES:
    "Nêu rõ check-in (QR EventHub, CCCD/VNeID). Show đông người (>=500 khách) cần danh mục đồ cấm (pháo sáng, vật sắc nhọn, chất cháy nổ, cồn ngoài, flycam).",
  SPONSOR_BRAND_AUTHENTICITY:
    "Cấm gắn logo hoặc mạo danh Cơ quan Nhà nước, Bộ Văn hóa, UNESCO, VTV, HTV khi không có văn bản xác nhận -> mạo danh rõ: REJECT; nghi vấn: warnings.",
};

// ============================================================================
// HELPERS: HTML CLEANUP, FILTERING & PROMPT BUILDER
// ============================================================================
function stripHtml(html, maxLen = 850) {
  if (!html) return '';
  let text = String(html)
    .replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, '[ảnh nhúng]')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\r?\n\s*\r?\n+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (text.length > maxLen) {
    text = text.slice(0, maxLen).replace(/\s+\S*$/, '').trim() + '...';
  }
  return text;
}

function countEmbeddedImages(html) {
  if (!html) return 0;
  const matches = String(html).match(/<img\b[^>]*src\s*=/gi);
  return matches ? matches.length : 0;
}

function isDummyTestEvent(event) {
  const title = String(event?.title || '').trim();
  if (title.length < 4) return true;
  if (/^(aaa+|bbb+|ccc+|asdf+|qwe+|dasdas+|test[a-z0-9_ -]*|dat_test)$/i.test(title)) {
    return true;
  }
  const cleanDesc = stripHtml(event?.description || '', 300);
  if (/^(aaa+|dasdas+|test+|asdasd+|123+)$/i.test(cleanDesc)) {
    return true;
  }
  return false;
}

function requiresStrictEventPermit(event = {}) {
  const fmt = String(event?.format || 'OFFLINE').trim().toUpperCase();
  if (fmt === 'ONLINE') return false;
  const text = `${event?.title || ''} ${event?.category_name || ''} ${event?.short_description || ''}`.toLowerCase();
  const isWorkshopOrSmall = /(workshop|webinar|seminar|talkshow|meetup|khóa học|đào tạo|hội thảo|giao lưu|networking|offline\s*cộng\s*đồng)/i.test(text);
  const isLargePublic = /(đại nhạc hội|music\s*festival|lễ hội âm nhạc|live\s*concert|rave|edm\s*festival|bắn pháo hoa|giải\s*chạy\s*marathon|diễu hành|triển\s*lãm\s*quốc\s*tế|lễ\s*hội\s*ngoài\s*trời)/i.test(text);
  return isLargePublic && !isWorkshopOrSmall;
}

function formatSessionVenueAddress(session = {}) {
  const parts = [];
  if (session.venue_name) parts.push(String(session.venue_name).trim());
  const addrParts = [session.address, session.ward, session.district, session.city || session.province]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (addrParts.length > 0) parts.push(addrParts.join(', '));
  return parts.filter(Boolean).join(' - ');
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function selectDynamicCriteriaForEvent(allCriteria, event, totalCount = 6) {
  const list = Array.isArray(allCriteria) && allCriteria.length > 0 ? allCriteria : [];
  if (list.length === 0) return [];
  const coreCodes = ['TERMS_ORGANIZER', 'EVENT_COHERENCE', 'TICKET_POLICY', 'IMAGE_POLICY', 'LEGAL_PERMIT_AUTHENTICITY'];
  const core = [];
  const rest = [];
  for (const c of list) {
    if (coreCodes.includes(c.code)) core.push(c);
    else rest.push(c);
  }
  const seed = hashString(String(event.id || event.title || '0'));
  const offset = rest.length > 0 ? seed % rest.length : 0;
  const rotatedRest = [...rest.slice(offset), ...rest.slice(0, offset)];
  const chosen = [...core];
  for (const c of rotatedRest) {
    if (chosen.length >= totalCount) break;
    chosen.push(c);
  }
  // Deterministic Fisher-Yates shuffle
  let state = seed || 12345;
  for (let i = chosen.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

function buildCompactSystemPrompt(activeCriteria = []) {
  const criteriaSection = activeCriteria
    .map((c, idx) => {
      const sev = String(c.severity || 'CRITICAL').toUpperCase();
      const sevText = sev === 'CRITICAL' ? 'CRITICAL - BẮT BUỘC' : sev === 'WARNING' ? 'WARNING - CẢNH BÁO' : 'INFO - KHUYẾN NGHỊ';
      const ruleText = COMPACT_CRITERIA_MAP[c.code] || stripHtml(c.rule_content, 240).replace(/\n/g, ' ');
      return `${idx + 1}. [${c.code}] ${c.title} (${sevText}): ${ruleText}`;
    })
    .join('\n');

  return `Bạn là Chuyên gia Kiểm duyệt Sự kiện EventHub. Đánh giá khách quan, chuẩn xác theo BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN HIỆN HÀNH (${activeCriteria.length} điều khoản):
${criteriaSection}

NGUYÊN TẮC CỐT LÕI:
1. CRITICAL: Vi phạm >=1 lỗi CRITICAL -> BẮT BUỘC "REJECT" (Critical->"critical_violations"; Warning->"warnings"; Info->"suggestions").
2. DOCUMENT_REVIEW (tách biệt hoàn toàn khỏi "image_review"): Đối chiếu tên sự kiện, BTC, từ khóa pháp lý ("Cộng hòa xã hội chủ nghĩa Việt Nam", "Giấy phép", "Quyết định", "Chấp thuận", "Sở Văn hóa", "UBND", "Hợp đồng thuê địa điểm", "ĐKKD"). Cấm từ vựng/IPA, giáo án/đề thi/bài tập, CV, hóa đơn/menu, code, văn bản sự kiện khác -> items[].status="VIOLATION", overall_document_verdict="VIOLATION", violation_type="IRRELEVANT_OR_FAKE_DOCUMENT", ghi violating_location, thêm [LEGAL_PERMIT_AUTHENTICITY] vào critical_violations, risk_score>=85, decision="REJECT".
3. IMAGE_REVIEW (chỉ MAIN_POSTER/COVER_BANNER/DESCRIPTION_IMAGE_*): Đối chiếu is_event_poster_or_relevant_banner, visual_description, extracted_text, safety_flags. Meme, bàn nhậu, selfie, screenshot rác, đồ ăn/phong cảnh lạc đề, 18+/QR lừa đảo -> status="VIOLATION", overall_image_verdict="VIOLATION", critical_violations, risk_score>=75, decision="REJECT". Thực hiện CoT OCR 4 bước (step1_scene_context -> step2_anchor_text -> step3_stylized_decoding tiếng Việt có dấu -> step4_moderation_verdict phân biệt nghệ thuật/đồ bơi thể thao/kịch ma với vi phạm thật).
4. ANTI_FALSE_POSITIVE: OFFLINE/HYBRID có venue_name+address trong sessions -> KHÔNG phạt thiếu địa điểm; ONLINE -> KHÔNG phạt thiếu địa chỉ; sự kiện nhỏ/workshop/webinar NOT_REQUIRED -> overall_document_verdict="NOT_PROVIDED", không phạt thiếu giấy phép.
5. QUYẾT ĐỊNH: REJECT (risk>=75, quality<50, >=1 CRITICAL); NEEDS_REVIEW (0 CRITICAL, có WARNING, risk 30-64, quality 50-74); APPROVE (0 CRITICAL, ảnh/tài liệu khớp, risk<30, quality>=75). Không đưa mục lỗi vào compliant_checks.

TRẢ VỀ DUY NHẤT JSON THUẦN TÚY (không <think>, không text ngoài):
{"decision":"APPROVE|REJECT|NEEDS_REVIEW","risk_score":0,"quality_score":100,"summary":"...","content_review":{"title_status":"VALID|NEEDS_IMPROVEMENT|VIOLATION","title_analysis":"...","description_status":"VALID|NEEDS_IMPROVEMENT|VIOLATION","description_analysis":"...","spelling_grammar_issues":[]},"image_review":{"overall_image_verdict":"SAFE|WARNING|VIOLATION","items":[{"source":"MAIN_POSTER|COVER_BANNER|DESCRIPTION_IMAGE_1","status":"VALID|WARNING|VIOLATION|MISSING","analysis":"...","ocr_reasoning":{"step1_scene_context":"...","step2_anchor_text":"...","step3_stylized_decoding":"...","step4_moderation_verdict":"..."},"extracted_texts":[{"text":"...","font_style":"NORMAL|STYLIZED_HORROR|NEON_GLOW|3D_EFFECT|HANDWRITTEN","confidence":"HIGH|MEDIUM|LOW","visual_effect":"BLOOD_SPLATTER|SMOKE|DISTORTION|NONE","is_event_title":true}],"issues":[],"suggestion":""}]},"document_review":{"overall_document_verdict":"SAFE|WARNING|VIOLATION|NOT_PROVIDED","items":[{"source":"PERMIT_DOCUMENT_1","file_name":"...","status":"VALID|WARNING|VIOLATION","relevance_to_event":"HIGH|MEDIUM|LOW|IRRELEVANT","analysis":"...","violation_type":null,"violating_location":null,"issues":[],"suggestion":""}]},"compliant_checks":[],"critical_violations":[{"policy_code":"...","issue":"...","highlighted_text":"..."}],"warnings":[{"policy_code":"...","issue":"...","highlighted_text":"..."}],"suggestions":[]}`;
}

function buildUserPromptFromEvent(event) {
  const cleanShortDesc = stripHtml(event.short_description, 260);
  const cleanDescription = stripHtml(event.description, 850);
  const cleanAdditionalTerms = stripHtml(event.additional_terms, 350);
  const cleanOrganizerDesc = stripHtml(event.organizer_description, 200);

  const categoryText = event.category_name
    ? `${event.category_name}${event.category_slug ? ` (${event.category_slug})` : ''}`
    : 'Chưa phân loại';

  const organizerName = String(event.organization_name || '').trim() || 'Chưa rõ';
  const verifiedLabel = event.is_verified ? 'Đã xác minh (ACTIVE)' : 'Chưa xác minh';
  const orgLine = `${organizerName} | Trạng thái xác minh: ${verifiedLabel}${cleanOrganizerDesc ? ` | Giới thiệu: ${cleanOrganizerDesc}` : ''}`;

  const tagsList = Array.isArray(event.tags) ? event.tags.map((t) => String(t || '').trim()).filter(Boolean) : [];
  const tagsText = tagsList.length > 0 ? tagsList.join(', ') : 'Không có';
  const eventFormat = String(event.format || 'OFFLINE').trim().toUpperCase();

  const hasThumb = Boolean(event.thumbnail_url && String(event.thumbnail_url).trim());
  const hasBanner = Boolean(event.banner_url && String(event.banner_url).trim());
  const descImgCount = countEmbeddedImages(event.description);

  const imageSummary = [
    `- Ảnh đại diện chính (Main Poster): ${hasThumb ? 'ĐÃ CÓ (Đã tải lên)' : 'CHƯA CÓ (BẮT BUỘC BỔ SUNG)'}`,
    `- Ảnh bìa (Cover Banner): ${hasBanner ? 'ĐÃ CÓ (Đã tải lên)' : 'CHƯA CÓ (CẦN BỔ SUNG)'}`,
    `- Ảnh trong bài viết mô tả: ${descImgCount > 0 ? `ĐÃ CÓ (${descImgCount} ảnh dạng text/nhúng trong bài viết)` : 'CHƯA CÓ (Tùy chọn - không bắt buộc)'}`,
  ].join('\n');

  const permitFiles = Array.isArray(event.permits)
    ? event.permits
    : Array.isArray(event.refund_policy?.permit_files)
      ? event.refund_policy.permit_files
      : [];

  let permitSummary = 'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM';
  if (permitFiles.length > 0) {
    permitSummary =
      `${permitFiles.length} tài liệu đính kèm:\n` +
      permitFiles
        .map((f, idx) => {
          const name = f?.file_name || f?.name || `Tài liệu ${idx + 1}`;
          const type = f?.type || (String(name).toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/document');
          return `  + [Tài liệu #${idx + 1}] "${name}" (${type})`;
        })
        .join('\n');
  } else if (!requiresStrictEventPermit(event)) {
    permitSummary =
      'KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM (Trạng thái: NOT_REQUIRED — sự kiện quy mô nhỏ / online / workshop thông thường không bắt buộc giấy phép, KHÔNG phạt lỗi thiếu giấy phép).';
  }

  const sessionList = Array.isArray(event.sessions) ? event.sessions : [];
  const sessionsWithVenue = sessionList.filter((s) => Boolean((s?.venue_id || s?.venue_name) && formatSessionVenueAddress(s)));
  const sessionSummary =
    sessionList.length > 0
      ? sessionList
          .slice(0, 6)
          .map((s, idx) => {
            const addr = formatSessionVenueAddress(s);
            const venueInfo = addr ? `${addr}${s.venue_id ? ` [venue_id: ${s.venue_id}]` : ''}` : 'Chưa gắn địa điểm cụ thể';
            const st = s.start_time ? new Date(s.start_time).toISOString().slice(0, 16).replace('T', ' ') : '';
            const et = s.end_time ? new Date(s.end_time).toISOString().slice(0, 16).replace('T', ' ') : '';
            return `  + Phiên ${idx + 1} [${s.session_name || 'Phiên'}]: ${st} - ${et} | Địa điểm: ${venueInfo}`;
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

  const ticketList = Array.isArray(event.ticket_types) ? event.ticket_types : [];
  const distinctMap = new Map();
  for (const t of ticketList) {
    const key = `${String(t.name || '').trim().toLowerCase()}___${Number(t.price || 0)}___${Boolean(t.is_seated)}`;
    if (!distinctMap.has(key)) {
      distinctMap.set(key, {
        name: t.name,
        price: Number(t.price || 0),
        is_seated: Boolean(t.is_seated),
        totalQty: 0,
      });
    }
    distinctMap.get(key).totalQty += Number(t.quantity || 0);
  }
  const ticketSummary =
    distinctMap.size > 0
      ? Array.from(distinctMap.values())
          .slice(0, 8)
          .map((t) => `${t.name} (${t.is_seated ? 'Ghế ngồi' : 'Vé tự do'}): ${t.price.toLocaleString('vi-VN')} VNĐ (${t.totalQty} vé)`)
          .join('; ')
      : 'CHƯA CÓ THÔNG TIN VÉ';

  const refundSummary =
    typeof event.refund_policy === 'string'
      ? stripHtml(event.refund_policy, 250)
      : event.refund_policy?.description
        ? stripHtml(event.refund_policy.description, 250)
        : event.refund_policy && typeof event.refund_policy === 'object' && Object.keys(event.refund_policy).length > 0
          ? event.refund_policy.allow_refund
            ? `Cho phép hoàn vé trước ${event.refund_policy.refund_before_days || 0} ngày (Tỷ lệ: ${event.refund_policy.refund_rate || 100}%)`
            : 'Sự kiện không hỗ trợ hoàn tiền.'
          : 'Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.';

  const startIso = event.start_time ? new Date(event.start_time).toISOString().slice(0, 16).replace('T', ' ') : 'Chưa rõ';
  const endIso = event.end_time ? new Date(event.end_time).toISOString().slice(0, 16).replace('T', ' ') : 'Chưa rõ';

  let prompt = `Tên sự kiện: ${event.title || 'Chưa có tên'}
Danh mục sự kiện: ${categoryText}
Thể loại / Định dạng: ${eventFormat} | Hiển thị: ${event.visibility || 'PUBLIC'}
Từ khóa (Tags): ${tagsText}
Nhà tổ chức: ${orgLine}
Mô tả ngắn: ${cleanShortDesc || 'Không có'}
Mô tả chi tiết: ${cleanDescription || 'Không có'}
Điều khoản bổ sung: ${cleanAdditionalTerms || 'Không có'}
Hình ảnh sự kiện đã đăng:
${imageSummary}
Thời gian tổng thể: ${startIso} đến ${endIso}
Hồ sơ Giấy phép & Tài liệu đính kèm:
${permitSummary}
Lịch trình & Địa điểm từng phiên (Sessions & Venues):
${sessionSummary}
${locationNote}
Cơ cấu loại vé (Tickets): Gồm ${distinctMap.size} loại vé chính (${sessionList.length > 1 ? `phân bổ qua ${sessionList.length} phiên diễn ra` : '1 phiên'}): ${ticketSummary}
Chính sách hoàn tiền sự kiện: ${refundSummary}

Hãy đối chiếu toàn bộ thông tin sự kiện và kết quả phân tích tài liệu/hình ảnh ở trên với Bộ tiêu chí kiểm duyệt EventHub trong System Prompt để thẩm định và xuất ra JSON đánh giá chính xác.`;

  // Nếu có sẵn kết quả vision pre-scan trong DB -> gắn gọn vào phần phân tích hình ảnh
  const imgResults = Array.isArray(event.ai_image_review_results) ? event.ai_image_review_results : [];
  if (imgResults.length > 0) {
    const vText = imgResults
      .slice(0, 2)
      .map((r) => {
        const src = r.source || 'MAIN_POSTER';
        const lbl = src === 'COVER_BANNER' ? 'Ảnh bìa (Cover Banner)' : 'Ảnh đại diện chính (Main Poster)';
        const vDesc = stripHtml(r.visual_description || r.description || `Poster sự kiện ${event.title}`, 220);
        const ocr = stripHtml(r.extracted_text || '', 120) || '(Không có chữ đọc được)';
        const rel = typeof r.is_event_poster_or_relevant_banner === 'boolean' ? String(r.is_event_poster_or_relevant_banner) : 'true';
        const flags = Array.isArray(r.safety_flags) && r.safety_flags.length > 0 ? r.safety_flags.join(', ') : 'Không phát hiện';
        return `[${lbl}]:\n- visual_description: ${vDesc}\n- extracted_text: ${ocr}\n- is_event_poster_or_relevant_banner: ${rel}\n- safety_flags: ${flags}`;
      })
      .join('\n\n');
    prompt += `\n\n=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH SỰ KIỆN ===\n${vText}\n=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ===`;
  }

  return prompt;
}

function buildCompliantImageReview(event, isRejected = false) {
  const hasThumb = Boolean(event.thumbnail_url && String(event.thumbnail_url).trim());
  if (!hasThumb) {
    return {
      overall_image_verdict: isRejected ? 'VIOLATION' : 'SAFE',
      items: [
        {
          source: 'MAIN_POSTER',
          status: isRejected ? 'MISSING' : 'VALID',
          analysis: isRejected ? 'Chưa có ảnh đại diện chính.' : 'Hình ảnh sự kiện đáp ứng tiêu chuẩn hiển thị.',
          ocr_reasoning: {
            step1_scene_context: `Kiểm tra ảnh đại diện cho sự kiện '${event.title || ''}'.`,
            step2_anchor_text: 'Đối chiếu thông tin hiển thị.',
            step3_stylized_decoding: 'Giữ chuẩn tiếng Việt có dấu.',
            step4_moderation_verdict: isRejected ? 'Thiếu ảnh đại diện hợp lệ.' : 'Không phát hiện vi phạm hình ảnh.',
          },
          extracted_texts: [],
          issues: isRejected ? ['Thiếu ảnh đại diện chính'] : [],
          suggestion: isRejected ? 'Tải lên Main Poster phù hợp chủ đề sự kiện.' : '',
        },
      ],
    };
  }

  const titleClean = String(event.title || '').slice(0, 80);
  return {
    overall_image_verdict: 'SAFE',
    items: [
      {
        source: 'MAIN_POSTER',
        status: 'VALID',
        analysis: `Poster sự kiện '${titleClean}' rõ nét, phù hợp ngữ cảnh và an toàn cộng đồng.`,
        ocr_reasoning: {
          step1_scene_context: `Bối cảnh đồ họa sự kiện thuộc danh mục ${event.category_name || 'chung'}.`,
          step2_anchor_text: `Nhận diện chủ đề khớp tên '${titleClean}'.`,
          step3_stylized_decoding: 'Đọc văn bản tiếng Việt chuẩn xác, không bị ký tự lạ.',
          step4_moderation_verdict: 'Hình ảnh lành mạnh, an toàn, không chứa 18+/bạo lực/QR lừa đảo.',
        },
        extracted_texts: titleClean
          ? [
              {
                text: titleClean,
                font_style: 'NORMAL',
                confidence: 'HIGH',
                visual_effect: 'NONE',
                is_event_title: true,
              },
            ]
          : [],
        issues: [],
        suggestion: '',
      },
    ],
  };
}

function buildDocumentReviewFromEvent(event, forceInvalid = false, reasonText = '') {
  const permitFiles = Array.isArray(event.permits)
    ? event.permits
    : Array.isArray(event.refund_policy?.permit_files)
      ? event.refund_policy.permit_files
      : [];

  if (permitFiles.length === 0) {
    return { overall_document_verdict: 'NOT_PROVIDED', items: [] };
  }

  return {
    overall_document_verdict: forceInvalid ? 'VIOLATION' : 'SAFE',
    items: permitFiles.slice(0, 2).map((f, idx) => ({
      source: `PERMIT_DOCUMENT_${idx + 1}`,
      file_name: f?.file_name || f?.name || `permit_${idx + 1}.pdf`,
      status: forceInvalid ? 'VIOLATION' : 'VALID',
      relevance_to_event: forceInvalid ? 'IRRELEVANT' : 'HIGH',
      analysis: forceInvalid
        ? reasonText || 'Tài liệu đính kèm không hợp lệ hoặc không liên quan đến sự kiện.'
        : 'Tài liệu đính kèm hợp lệ, phù hợp với sự kiện.',
      violation_type: forceInvalid ? 'IRRELEVANT_OR_FAKE_DOCUMENT' : null,
      violating_location: forceInvalid ? reasonText || f?.file_name || null : null,
      issues: forceInvalid ? [reasonText || 'Tài liệu không hợp lệ'] : [],
      suggestion: forceInvalid ? 'Cung cấp giấy phép/văn bản hợp lệ liên quan đến sự kiện.' : '',
    })),
  };
}

function buildAdminAlignedResponse(event) {
  const isApproved = String(event.approval_status || '').toUpperCase() === 'APPROVED';
  const sessionList = Array.isArray(event.sessions) ? event.sessions : [];
  const sessionsWithVenue = sessionList.filter((s) => Boolean((s?.venue_id || s?.venue_name) && formatSessionVenueAddress(s)));
  const fmt = String(event.format || 'OFFLINE').trim().toUpperCase();
  const noteClean = stripHtml(event.review_note || '', 200);

  if (isApproved) {
    const compliant = ['Nội dung sự kiện rõ ràng, tuân thủ điều khoản nền tảng EventHub'];
    if (fmt === 'ONLINE') {
      compliant.push('Sự kiện tổ chức trực tuyến (ONLINE), không yêu cầu địa chỉ đường phố vật lý');
    } else if (sessionsWithVenue.length > 0) {
      compliant.push(`Địa điểm tổ chức đã xác thực qua venue_id trong sessions (${sessionsWithVenue.length}/${sessionList.length} phiên)`);
    }
    if (!requiresStrictEventPermit(event) && (!event.permits || event.permits.length === 0)) {
      compliant.push('Sự kiện thuộc nhóm không bắt buộc nộp giấy phép nhà nước (NOT_REQUIRED)');
    }

    return {
      decision: 'APPROVE',
      risk_score: 10,
      quality_score: 88,
      summary: noteClean
        ? `Sự kiện đạt chuẩn phê duyệt theo đánh giá quản trị viên (${noteClean}).`
        : `Sự kiện '${String(event.title || '').slice(0, 80)}' tuân thủ đầy đủ chính sách EventHub, địa điểm/lịch trình và nội dung hợp lệ để phê duyệt.`,
      content_review: {
        title_status: 'VALID',
        title_analysis: 'Tiêu đề sự kiện rõ ràng, phản ánh đúng nội dung chương trình.',
        description_status: 'VALID',
        description_analysis: 'Mô tả cung cấp thông tin hợp lệ, không chứa nội dung lừa đảo hay giao dịch ngoài sàn.',
        spelling_grammar_issues: [],
      },
      image_review: buildCompliantImageReview(event, false),
      document_review: buildDocumentReviewFromEvent(event, false),
      compliant_checks: compliant,
      critical_violations: [],
      warnings: [],
      suggestions: [],
    };
  }

  // Rejected by Admin
  const issueReason = noteClean || 'Nội dung hoặc hồ sơ sự kiện không đáp ứng tiêu chuẩn phê duyệt của Admin EventHub.';
  return {
    decision: 'REJECT',
    risk_score: 82,
    quality_score: 30,
    summary: `Từ chối sự kiện theo quyết định kiểm duyệt thực tế: ${issueReason}`,
    content_review: {
      title_status: 'NEEDS_IMPROVEMENT',
      title_analysis: 'Cần rà soát lại tính hợp lệ và độ rõ ràng của thông tin sự kiện.',
      description_status: 'VIOLATION',
      description_analysis: issueReason,
      spelling_grammar_issues: [],
    },
    image_review: buildCompliantImageReview(event, false),
    document_review: buildDocumentReviewFromEvent(event, false),
    compliant_checks: [],
    critical_violations: [
      {
        policy_code: 'TERMS_ORGANIZER',
        issue: issueReason,
        highlighted_text: String(event.title || '').slice(0, 100),
      },
    ],
    warnings: [],
    suggestions: ['Chỉnh sửa lại đầy đủ nội dung và hồ sơ theo ghi chú của Quản trị viên trước khi gửi duyệt lại.'],
  };
}

function normalizeLegacyAiOutputToSchema(rawAiWarnings, aiRec, event) {
  const decision = ['APPROVE', 'REJECT', 'NEEDS_REVIEW'].includes(String(aiRec || '').toUpperCase())
    ? String(aiRec).toUpperCase()
    : 'NEEDS_REVIEW';

  // Case 1: rawAiWarnings đã là object schema mới hoặc gần mới
  if (rawAiWarnings && typeof rawAiWarnings === 'object' && !Array.isArray(rawAiWarnings)) {
    const obj = { ...rawAiWarnings };
    const cleanImgItems = Array.isArray(obj.image_review?.items)
      ? obj.image_review.items
          .filter((it) => !String(it?.source || '').startsWith('PERMIT'))
          .slice(0, 2)
          .map((it) => ({
            source: it?.source || 'MAIN_POSTER',
            status: it?.status || 'VALID',
            analysis: stripHtml(it?.analysis || '', 180),
            ocr_reasoning: {
              step1_scene_context: stripHtml(it?.ocr_reasoning?.step1_scene_context || '', 120),
              step2_anchor_text: stripHtml(it?.ocr_reasoning?.step2_anchor_text || '', 120),
              step3_stylized_decoding: stripHtml(it?.ocr_reasoning?.step3_stylized_decoding || '', 120),
              step4_moderation_verdict: stripHtml(it?.ocr_reasoning?.step4_moderation_verdict || '', 120),
            },
            extracted_texts: Array.isArray(it?.extracted_texts) ? it.extracted_texts.slice(0, 3) : [],
            issues: Array.isArray(it?.issues) ? it.issues.slice(0, 3).map((x) => stripHtml(String(x || ''), 120)) : [],
            suggestion: stripHtml(it?.suggestion || '', 120),
          }))
      : buildCompliantImageReview(event, false).items;

    const normDocReview = obj.document_review && typeof obj.document_review === 'object'
      ? {
          overall_document_verdict: obj.document_review.overall_document_verdict || 'NOT_PROVIDED',
          items: Array.isArray(obj.document_review.items)
            ? obj.document_review.items.slice(0, 2).map((d) => ({
                source: d?.source || 'PERMIT_DOCUMENT_1',
                file_name: d?.file_name || '',
                status: d?.status || 'VALID',
                relevance_to_event: d?.relevance_to_event || 'HIGH',
                analysis: stripHtml(d?.analysis || '', 160),
                violation_type: d?.violation_type || null,
                violating_location: d?.violating_location ? stripHtml(d.violating_location, 120) : null,
                issues: Array.isArray(d?.issues) ? d.issues.slice(0, 3) : [],
                suggestion: stripHtml(d?.suggestion || '', 120),
              }))
            : [],
        }
      : buildDocumentReviewFromEvent(event, false);

    return {
      decision: obj.decision || decision,
      risk_score: Number.isFinite(Number(obj.risk_score)) ? Math.round(Number(obj.risk_score)) : decision === 'REJECT' ? 78 : 48,
      quality_score: Number.isFinite(Number(obj.quality_score)) ? Math.round(Number(obj.quality_score)) : decision === 'REJECT' ? 38 : 62,
      summary: stripHtml(obj.summary || `AI đánh giá ${decision} dựa trên kiểm tra tự động trước đây.`, 200),
      content_review: {
        title_status: obj.content_review?.title_status || 'VALID',
        title_analysis: stripHtml(obj.content_review?.title_analysis || 'Tiêu đề cần rà soát thêm.', 140),
        description_status: obj.content_review?.description_status || (decision === 'REJECT' ? 'VIOLATION' : 'NEEDS_IMPROVEMENT'),
        description_analysis: stripHtml(obj.content_review?.description_analysis || 'AI cảnh báo thiếu thông tin hoặc chưa đủ rõ ràng.', 180),
        spelling_grammar_issues: Array.isArray(obj.content_review?.spelling_grammar_issues)
          ? obj.content_review.spelling_grammar_issues.slice(0, 4)
          : [],
      },
      image_review: {
        overall_image_verdict: obj.image_review?.overall_image_verdict || 'SAFE',
        items: cleanImgItems.length > 0 ? cleanImgItems : buildCompliantImageReview(event, false).items,
      },
      document_review: normDocReview,
      compliant_checks: Array.isArray(obj.compliant_checks) ? obj.compliant_checks.slice(0, 4) : [],
      critical_violations: Array.isArray(obj.critical_violations)
        ? obj.critical_violations.slice(0, 4).map((v) =>
            typeof v === 'string'
              ? { policy_code: 'TERMS_ORGANIZER', issue: v.slice(0, 180), highlighted_text: '' }
              : { policy_code: v.policy_code || 'TERMS_ORGANIZER', issue: stripHtml(v.issue || '', 180), highlighted_text: stripHtml(v.highlighted_text || '', 120) },
          )
        : [],
      warnings: Array.isArray(obj.warnings)
        ? obj.warnings.slice(0, 4).map((w) =>
            typeof w === 'string'
              ? { policy_code: 'CONTENT_SPELLING', issue: w.slice(0, 180), highlighted_text: '' }
              : { policy_code: w.policy_code || 'CONTENT_SPELLING', issue: stripHtml(w.issue || '', 180), highlighted_text: stripHtml(w.highlighted_text || '', 120) },
          )
        : [],
      suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.slice(0, 3).map((s) => stripHtml(s, 140)) : [],
    };
  }

  // Case 2: rawAiWarnings là mảng string cũ [] hoặc ["cảnh báo..."]
  const list = Array.isArray(rawAiWarnings) ? rawAiWarnings.map((x) => stripHtml(String(x || ''), 180)).filter(Boolean) : [];
  const defaultMsg = list[0] || (decision === 'REJECT'
    ? 'Hệ thống cũ đánh giá sự kiện thiếu giấy phép hoặc thiếu địa chỉ trong phần mô tả văn bản.'
    : 'Hệ thống cũ gắn cờ NEEDS_REVIEW do chưa nhận diện đủ địa chỉ từ sessions hoặc yêu cầu bổ sung giấy phép.');

  return {
    decision,
    risk_score: decision === 'REJECT' ? 78 : 48,
    quality_score: decision === 'REJECT' ? 38 : 62,
    summary: defaultMsg,
    content_review: {
      title_status: 'VALID',
      title_analysis: 'Tiêu đề sự kiện cơ bản rõ ràng.',
      description_status: decision === 'REJECT' ? 'VIOLATION' : 'NEEDS_IMPROVEMENT',
      description_analysis: defaultMsg,
      spelling_grammar_issues: [],
    },
    image_review: buildCompliantImageReview(event, false),
    document_review: buildDocumentReviewFromEvent(event, false),
    compliant_checks: [],
    critical_violations: decision === 'REJECT' ? [{ policy_code: 'TERMS_ORGANIZER', issue: defaultMsg, highlighted_text: '' }] : [],
    warnings: decision === 'NEEDS_REVIEW'
      ? (list.length > 0 ? list : [defaultMsg]).slice(0, 3).map((msg) => ({
          policy_code: 'TICKET_POLICY',
          issue: msg,
          highlighted_text: '',
        }))
      : [],
    suggestions: ['Bổ sung thông tin chi tiết để Admin kiểm tra thủ công.'],
  };
}

// ============================================================================
// MAIN DB QUERY & EXPORT
// ============================================================================
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL trong backend/.env');
    process.exit(1);
  }

  fs.mkdirSync(DATASETS_DIR, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });

  try {
    // 1. Query active review criteria
    const { rows: activeCriteria } = await pool.query(`
      SELECT code, title, category, severity, rule_content, order_index
      FROM event_review_criteria
      WHERE is_active = true
      ORDER BY order_index ASC, created_at ASC
    `);
    console.log(`[DB] Đã tải ${activeCriteria.length} tiêu chí kiểm duyệt đang bật từ event_review_criteria.`);

    // 2. Query reviewed / AI-evaluated events
    const { rows: eventRows } = await pool.query(`
      SELECT
        e.id, e.organizer_id, e.category_id, e.title, e.short_description, e.description,
        e.thumbnail_url, e.banner_url, e.format, e.visibility, e.tags, e.additional_terms,
        e.start_time, e.end_time, e.status, e.approval_status, e.refund_policy,
        COALESCE(e.refund_policy->'permit_files', '[]'::jsonb) AS permits,
        e.ai_recommendation, e.ai_warnings, e.ai_reviewed_at, e.ai_image_review_results,
        e.reviewed_at, e.review_note,
        c.name AS category_name, c.slug AS category_slug,
        o.organization_name, o.description AS organizer_description, (o.status = 'ACTIVE') AS is_verified,
        COALESCE(session_summary.items, '[]'::json) AS sessions,
        COALESCE(ticket_summary.items, '[]'::json) AS ticket_types
      FROM events e
      LEFT JOIN event_categories c ON c.id = e.category_id
      LEFT JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time,
            'venue_id', sess.venue_id,
            'venue_name', v.name,
            'address', v.address_line,
            'ward', v.ward,
            'district', v.district,
            'city', v.city,
            'province', v.city
          )
          ORDER BY sess.start_time ASC
        ) AS items
        FROM event_sessions sess
        LEFT JOIN venues v ON v.id = sess.venue_id AND v.deleted_at IS NULL
        WHERE sess.event_id = e.id
      ) session_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', tt.id,
            'name', tt.name,
            'price', tt.price,
            'quantity', tt.quantity,
            'is_seated', tt.is_seated
          )
          ORDER BY tt.price ASC, tt.name ASC
        ) AS items
        FROM (
          SELECT DISTINCT ON (tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated)
            tt_inner.id, tt_inner.name, tt_inner.price, tt_inner.quantity, tt_inner.is_seated
          FROM event_sessions sess_inner
          JOIN ticket_types tt_inner ON tt_inner.event_session_id = sess_inner.id
          WHERE sess_inner.event_id = e.id
          ORDER BY tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated, tt_inner.created_at DESC
        ) tt
      ) ticket_summary ON true
      WHERE e.deleted_at IS NULL
        AND (e.reviewed_at IS NOT NULL OR e.ai_reviewed_at IS NOT NULL)
      ORDER BY COALESCE(e.reviewed_at, e.ai_reviewed_at, e.created_at) DESC
    `);

    // 3. Query logged overrides in event_ai_review_logs
    let logOverrideRows = [];
    try {
      const { rows } = await pool.query(`
        SELECT l.id AS log_id, l.event_id, l.ai_recommendation, l.human_decision, l.human_review_note,
               l.parsed_output, l.criteria_snapshot, l.created_at
        FROM event_ai_review_logs l
        WHERE l.human_override = true
        ORDER BY l.created_at DESC
      `);
      logOverrideRows = rows;
    } catch (e) {
      console.warn(`[DB] Bỏ qua event_ai_review_logs (${e.message}).`);
    }

    const eventById = new Map(eventRows.map((r) => [String(r.id), r]));

    // 4. Load 3A Golden Samples từ ai/src/data/review_data.py
    let goldenSamples = [];
    const pythonCandidates = ['E:\\Python\\python.exe', 'python', 'python3'];
    for (const pyBin of pythonCandidates) {
      try {
        const out = execFileSync(
          pyBin,
          [
            '-c',
            'import sys, json; sys.path.insert(0, "ai"); from src.data.review_data import generate_review_samples; print(json.dumps(generate_review_samples(), ensure_ascii=False))',
          ],
          { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        goldenSamples = JSON.parse(out.trim());
        break;
      } catch (_) {
        // try next interpreter
      }
    }
    console.log(`[3A] Đã tải ${goldenSamples.length} Golden SFT samples từ review_data.py.`);

    // 5. Build sft_events_dataset.jsonl
    const sftRecords = [];
    for (const g of goldenSamples) {
      sftRecords.push({
        source: 'golden_sft_review',
        messages: g.messages,
      });
    }

    let skippedDummySft = 0;
    let dbSftCount = 0;
    for (const ev of eventRows) {
      if (!ev.reviewed_at || !['APPROVED', 'REJECTED'].includes(String(ev.approval_status || '').toUpperCase())) {
        continue;
      }
      if (isDummyTestEvent(ev)) {
        skippedDummySft += 1;
        continue;
      }
      const criteriaSubset = selectDynamicCriteriaForEvent(activeCriteria, ev, 6);
      const sysPrompt = buildCompactSystemPrompt(criteriaSubset);
      const userPrompt = buildUserPromptFromEvent(ev);
      const targetJson = buildAdminAlignedResponse(ev);

      sftRecords.push({
        source: 'db_reviewed_event',
        event_id: ev.id,
        event_title: ev.title,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: JSON.stringify(targetJson) },
        ],
      });
      dbSftCount += 1;
    }

    const sftOutPath = path.join(DATASETS_DIR, 'sft_events_dataset.jsonl');
    fs.writeFileSync(sftOutPath, sftRecords.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 6. Build dpo_override_dataset.jsonl
    const dpoRecords = [];
    const seenDpoEventIds = new Set();
    let skippedDummyDpo = 0;

    // 6a. Từ event_ai_review_logs WHERE human_override = true
    for (const logRow of logOverrideRows) {
      const ev = eventById.get(String(logRow.event_id));
      if (!ev) continue;
      if (isDummyTestEvent(ev)) {
        skippedDummyDpo += 1;
        continue;
      }
      seenDpoEventIds.add(String(ev.id));

      const evWithHuman = {
        ...ev,
        approval_status: logRow.human_decision || ev.approval_status,
        review_note: logRow.human_review_note || ev.review_note,
      };
      const criteriaSubset = selectDynamicCriteriaForEvent(activeCriteria, evWithHuman, 6);
      const sysPrompt = buildCompactSystemPrompt(criteriaSubset);
      const userPrompt = buildUserPromptFromEvent(evWithHuman);
      const chosenObj = buildAdminAlignedResponse(evWithHuman);
      const rejectedObj = normalizeLegacyAiOutputToSchema(logRow.parsed_output || ev.ai_warnings, logRow.ai_recommendation, evWithHuman);

      dpoRecords.push({
        event_id: ev.id,
        event_title: ev.title,
        source: 'event_ai_review_logs',
        override_direction: `${logRow.ai_recommendation}_TO_${evWithHuman.approval_status}`,
        prompt: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        chosen: [{ role: 'assistant', content: JSON.stringify(chosenObj) }],
        rejected: [{ role: 'assistant', content: JSON.stringify(rejectedObj) }],
      });
    }

    // 6b. Từ lịch sử bảng `events` nơi AI và Admin lệch pha (đặc biệt AI REJECT/NEEDS_REVIEW nhưng Admin APPROVED)
    for (const ev of eventRows) {
      if (seenDpoEventIds.has(String(ev.id))) continue;
      const adminDecision = String(ev.approval_status || '').toUpperCase();
      const aiRec = String(ev.ai_recommendation || '').toUpperCase();
      const isOverride =
        (adminDecision === 'APPROVED' && ['NEEDS_REVIEW', 'REJECT'].includes(aiRec)) ||
        (adminDecision === 'REJECTED' && aiRec === 'APPROVE');

      if (!isOverride) continue;
      if (isDummyTestEvent(ev)) {
        skippedDummyDpo += 1;
        continue;
      }
      seenDpoEventIds.add(String(ev.id));

      const criteriaSubset = selectDynamicCriteriaForEvent(activeCriteria, ev, 6);
      const sysPrompt = buildCompactSystemPrompt(criteriaSubset);
      const userPrompt = buildUserPromptFromEvent(ev);
      const chosenObj = buildAdminAlignedResponse(ev);
      const rejectedObj = normalizeLegacyAiOutputToSchema(ev.ai_warnings, aiRec, ev);

      dpoRecords.push({
        event_id: ev.id,
        event_title: ev.title,
        source: 'events_historical_override',
        override_direction: `${aiRec}_TO_${adminDecision}`,
        prompt: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        chosen: [{ role: 'assistant', content: JSON.stringify(chosenObj) }],
        rejected: [{ role: 'assistant', content: JSON.stringify(rejectedObj) }],
      });
    }

    const dpoOutPath = path.join(DATASETS_DIR, 'dpo_override_dataset.jsonl');
    fs.writeFileSync(
      dpoOutPath,
      dpoRecords.length > 0 ? dpoRecords.map((r) => JSON.stringify(r)).join('\n') + '\n' : '',
      'utf8',
    );

    console.log('\n=== TỔNG KẾT EXPORT DỮ LIỆU TRAINING TỪ POSTGRESQL ===');
    console.log(`- Tổng sự kiện DB truy vấn được       : ${eventRows.length}`);
    console.log(`- Số mẫu Golden SFT (review_data.py)    : ${goldenSamples.length}`);
    console.log(`- Số sự kiện DB thực tế sạch -> SFT     : ${dbSftCount} (đã lọc ${skippedDummySft} stub test rác)`);
    console.log(`- Tổng mẫu file SFT                     : ${sftRecords.length} -> ${sftOutPath}`);
    console.log(`- Số mẫu DPO override sạch (events+logs): ${dpoRecords.length} (đã lọc ${skippedDummyDpo} stub test rác) -> ${dpoOutPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Lỗi export_db_training_data.js:', err);
  process.exit(1);
});
