import json
import os
import random

# ==============================================================================
# 16 TIÊU CHÍ KIỂM DUYỆT SỰ KIỆN ĐỒNG BỘ VỚI event_review_criteria (PostgreSQL)
# Rút gọn cô đọng giữ 100% quy tắc cốt lõi để vừa khít ngữ cảnh max_seq_length=4096
# ==============================================================================
DEFAULT_REVIEW_CRITERIA = [
    {
        "code": "TERMS_ORGANIZER",
        "title": "Tuân thủ pháp luật & Trách nhiệm Nhà tổ chức",
        "category": "LEGAL",
        "severity": "CRITICAL",
        "order_index": 1,
        "rule_content": "Cấm hứa hẹn lợi nhuận ảo ('x100 vốn', 'lãi 30%/tháng', 'bao lỗ 100%'), Ponzi, cờ bạc, đa cấp, vi phạm bản quyền -> REJECT. Không ép workshop/webinar/meetup nhỏ nộp giấy phép.",
    },
    {
        "code": "EVENT_COHERENCE",
        "title": "Tính nhất quán & Xác thực chủ đề sự kiện",
        "category": "CONTENT",
        "severity": "CRITICAL",
        "order_index": 2,
        "rule_content": "Tiêu đề, Mô tả, Hình ảnh, Vé, Lịch trình, Tài liệu PHẢI đồng bộ chủ đề cốt lõi. Cấm treo đầu dê bán thịt chó, ảnh rác lạc đề (meme, bàn nhậu, selfie, screenshot rác, phong cảnh) hoặc tài liệu lạc đề -> REJECT.",
    },
    {
        "code": "LEGAL_PERMIT_AUTHENTICITY",
        "title": "Thẩm định pháp lý tài liệu giấy phép đính kèm",
        "category": "LEGAL",
        "severity": "CRITICAL",
        "order_index": 3,
        "rule_content": "Tệp trong permit_files phải là văn bản hành chính/pháp lý khớp sự kiện (Giấy phép Sở/UBND, ĐKKD, Hợp đồng địa điểm). Cấm sách từ vựng/IPA, giáo án, bài tập/đề thi, CV, hóa đơn/menu, code, giấy phép sự kiện khác -> IRRELEVANT_OR_FAKE_DOCUMENT, risk>=85, REJECT.",
    },
    {
        "code": "EVENT_REALISM_FEASIBILITY",
        "title": "Tính khả thi & Chống nội dung rác/thử nghiệm",
        "category": "GENERAL",
        "severity": "CRITICAL",
        "order_index": 4,
        "rule_content": "Sự kiện phải có thật, thông tin BTC rõ ràng. Cấm tạo sự kiện test/spam ('test', 'asdasd', 'aaa', 'qweqwe', ký tự ngẫu nhiên) hoặc mô tả vô nghĩa -> REJECT.",
    },
    {
        "code": "PAYMENT_POLICY",
        "title": "Kênh thanh toán chính thức & Chống né sàn",
        "category": "LEGAL",
        "severity": "CRITICAL",
        "order_index": 5,
        "rule_content": "Mọi giao dịch vé phải qua cổng EventHub. Cấm chuyển khoản STK cá nhân, ví riêng, QR ngoài web hoặc nhắn Zalo/Telegram/Facebook né phí sàn -> REJECT.",
    },
    {
        "code": "REFUND_POLICY",
        "title": "Chính sách hoàn vé & Trách nhiệm khi hoãn/hủy",
        "category": "REFUND",
        "severity": "WARNING",
        "order_index": 6,
        "rule_content": "Phải hoàn tiền thỏa đáng khi hoãn/hủy. Cấm tuyên bố 'Hủy sự kiện vẫn không hoàn tiền dưới mọi lý do' hoặc mâu thuẫn chính sách -> critical_violations/warnings.",
    },
    {
        "code": "TICKET_POLICY",
        "title": "Minh bạch cơ cấu vé & Địa chỉ tổ chức",
        "category": "TICKETS",
        "severity": "CRITICAL",
        "order_index": 7,
        "rule_content": "Tối thiểu 1 hạng vé hợp lệ (giá >= 0 VNĐ, số lượng > 0). OFFLINE/HYBRID có venue_id + địa chỉ trong sessions[].venue là HỢP LỆ (KHÔNG phạt thiếu địa chỉ). Cấm giấu địa chỉ ('Inbox Zalo nhận địa chỉ').",
    },
    {
        "code": "SESSION_SCHEDULE",
        "title": "Lịch trình các phiên & Logic thời gian",
        "category": "SCHEDULE",
        "severity": "CRITICAL",
        "order_index": 8,
        "rule_content": "end_time phải sau start_time; thời gian không nằm trong quá khứ vô lý và phải khớp ngày giờ in trên Poster/Banner -> vi phạm: REJECT.",
    },
    {
        "code": "IMAGE_POLICY",
        "title": "Kiểm duyệt hình ảnh, OCR & An toàn đúng ngữ cảnh",
        "category": "MEDIA",
        "severity": "CRITICAL",
        "order_index": 9,
        "rule_content": "Cần Main Poster hợp lệ. Kiểm duyệt đúng ngữ cảnh: KHÔNG gắn nhầm 18+ cho đồ bơi thể thao/bãi biển, nghệ thuật, kịch ma hóa trang. CHỈ REJECT khi: 18+ đồi trụy, bạo lực thực tế, cờ bạc, QR lừa đảo, ảnh rác (meme, bàn nhậu, selfie, screenshot rác).",
    },
    {
        "code": "CONTENT_SPELLING",
        "title": "Soát lỗi chính tả tiếng Việt & Chuẩn mực mô tả",
        "category": "CONTENT",
        "severity": "WARNING",
        "order_index": 10,
        "rule_content": "Soát Tiêu đề (>=5 ký tự) và Mô tả (>=30 ký tự) bắt lỗi gõ telex/chính tả ('Hôi Thảo', 'Doang Nghiệp', 'chia sẽ', 'nấm bắt', 'tồ chức'), ghi vào spelling_grammar_issues + warnings. Kịch ma cần lưu ý tim mạch/độ tuổi.",
    },
    {
        "code": "ORGANIZER_LEGAL_COMPLIANCE",
        "title": "Tuân thủ PCCC, An toàn & Pháp luật chuyên ngành",
        "category": "LEGAL",
        "severity": "CRITICAL",
        "order_index": 11,
        "rule_content": "Đại nhạc hội ngoài trời, festival, giải thể thao đông người phải có giấy phép, PCCC, y tế cứu hộ và bảo đảm bản quyền/thuần phong mỹ tục.",
    },
    {
        "code": "VALUABLE_SUGGESTIONS",
        "title": "Đề xuất cải thiện có giá trị thực tế",
        "category": "GENERAL",
        "severity": "INFO",
        "order_index": 12,
        "rule_content": "CDN EventHub tự tối ưu ảnh: TUYỆT ĐỐI KHÔNG gợi ý 'chỉnh kích thước/độ phân giải ảnh'. Chỉ khuyên bổ sung Hotline, check-in QR, mốc giờ, sơ đồ chỗ ngồi hoặc lưu ý an toàn.",
    },
    {
        "code": "AGE_RESTRICTION_RATING",
        "title": "Quy định giới hạn độ tuổi & Phân loại khán giả",
        "category": "CONTENT",
        "severity": "WARNING",
        "order_index": 13,
        "rule_content": "Sự kiện bar/pub, có cồn, EDM sau 22:00 hoặc triển lãm 18+ BẮT BUỘC ghi giới hạn tuổi (18+, CCCD). Bar/đêm muộn ghi 'mọi lứa tuổi' -> warnings & NEEDS_REVIEW.",
    },
    {
        "code": "ANTI_FINANCIAL_FRAUD_MLM",
        "title": "Chống lừa đảo tài chính, Crypto lậu & Đa cấp",
        "category": "LEGAL",
        "severity": "CRITICAL",
        "order_index": 14,
        "rule_content": "Cấm hội thảo 'x2/x10 tài khoản', 'lãi 30%/tháng', 'thu nhập thụ động không vốn', quảng bá BO/Forex trái phép, coin/token không phép hoặc tuyển đa cấp biến tướng -> REJECT.",
    },
    {
        "code": "CHECKIN_SECURITY_RULES",
        "title": "Kiểm soát vé, Check-in & Vật dụng bị cấm",
        "category": "TICKETS",
        "severity": "WARNING",
        "order_index": 15,
        "rule_content": "Nêu rõ check-in (QR EventHub, CCCD/VNeID). Show đông người (>=500 khách) cần danh mục đồ cấm (pháo sáng, vật sắc nhọn, chất cháy nổ, cồn ngoài, flycam).",
    },
    {
        "code": "SPONSOR_BRAND_AUTHENTICITY",
        "title": "Minh bạch Nhà tài trợ & Chống mạo danh bảo trợ",
        "category": "LEGAL",
        "severity": "WARNING",
        "order_index": 16,
        "rule_content": "Cấm gắn logo hoặc mạo danh Cơ quan Nhà nước, Bộ Văn hóa, UNESCO, VTV, HTV khi không có văn bản xác nhận -> mạo danh rõ: REJECT; nghi vấn: warnings.",
    },
]

_CRITERIA_BY_CODE = {c["code"]: c for c in DEFAULT_REVIEW_CRITERIA}


def _severity_label(severity: str) -> str:
    if severity == "CRITICAL":
        return "CRITICAL"
    if severity == "WARNING":
        return "WARNING"
    return "INFO"


def format_criteria_section(active_criteria=None) -> str:
    criteria = active_criteria if active_criteria else DEFAULT_REVIEW_CRITERIA
    lines = []
    for idx, c in enumerate(criteria):
        sev_text = _severity_label(str(c.get("severity", "CRITICAL")).upper())
        content = str(c.get("rule_content", "")).strip().replace("\n", " ")
        lines.append(f"{idx + 1}. [{c['code']}] {c['title']} ({sev_text}): {content}")
    return "\n".join(lines)


def build_review_system_prompt(active_criteria=None) -> str:
    """
    Khớp 100% cấu trúc System Prompt và Output JSON Schema của
    buildAiReviewSystemPrompt trong backend/src/modules/admin/events.service.js.
    """
    criteria = active_criteria if (isinstance(active_criteria, list) and len(active_criteria) > 0) else DEFAULT_REVIEW_CRITERIA
    criteria_section = format_criteria_section(criteria)

    return f"""Bạn là Chuyên gia Kiểm duyệt Sự kiện EventHub. Đánh giá khách quan, chuẩn xác theo BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN HIỆN HÀNH ({len(criteria)} điều khoản):
{criteria_section}

NGUYÊN TẮC CỐT LÕI:
1. CRITICAL: Vi phạm >=1 lỗi CRITICAL -> BẮT BUỘC "REJECT" (Critical->"critical_violations"; Warning->"warnings"; Info->"suggestions").
2. DOCUMENT_REVIEW (tách biệt hoàn toàn khỏi "image_review"): Đối chiếu tên sự kiện, BTC, từ khóa pháp lý ("Cộng hòa xã hội chủ nghĩa Việt Nam", "Giấy phép", "Quyết định", "Chấp thuận", "Sở Văn hóa", "UBND", "Hợp đồng thuê địa điểm", "ĐKKD"). Cấm từ vựng/IPA, giáo án/đề thi/bài tập, CV, hóa đơn/menu, code, văn bản sự kiện khác -> items[].status="VIOLATION", overall_document_verdict="VIOLATION", violation_type="IRRELEVANT_OR_FAKE_DOCUMENT", ghi violating_location, thêm [LEGAL_PERMIT_AUTHENTICITY] vào critical_violations, risk_score>=85, decision="REJECT".
3. IMAGE_REVIEW (chỉ MAIN_POSTER/COVER_BANNER/DESCRIPTION_IMAGE_*): Đối chiếu is_event_poster_or_relevant_banner, visual_description, extracted_text, safety_flags. Meme, bàn nhậu, selfie, screenshot rác, đồ ăn/phong cảnh lạc đề, 18+/QR lừa đảo -> status="VIOLATION", overall_image_verdict="VIOLATION", critical_violations, risk_score>=75, decision="REJECT". Thực hiện CoT OCR 4 bước (step1_scene_context -> step2_anchor_text -> step3_stylized_decoding tiếng Việt có dấu -> step4_moderation_verdict phân biệt nghệ thuật/đồ bơi thể thao/kịch ma với vi phạm thật).
4. ANTI_FALSE_POSITIVE: OFFLINE/HYBRID có venue_name+address trong sessions -> KHÔNG phạt thiếu địa điểm; ONLINE -> KHÔNG phạt thiếu địa chỉ; sự kiện nhỏ/workshop/webinar NOT_REQUIRED -> overall_document_verdict="NOT_PROVIDED", không phạt thiếu giấy phép.
5. QUYẾT ĐỊNH: REJECT (risk>=75, quality<50, >=1 CRITICAL); NEEDS_REVIEW (0 CRITICAL, có WARNING, risk 30-64, quality 50-74); APPROVE (0 CRITICAL, ảnh/tài liệu khớp, risk<30, quality>=75). Không đưa mục lỗi vào compliant_checks.

TRẢ VỀ DUY NHẤT JSON THUẦN TÚY (không <think>, không text ngoài):
{{"decision":"APPROVE|REJECT|NEEDS_REVIEW","risk_score":0,"quality_score":100,"summary":"...","content_review":{{"title_status":"VALID|NEEDS_IMPROVEMENT|VIOLATION","title_analysis":"...","description_status":"VALID|NEEDS_IMPROVEMENT|VIOLATION","description_analysis":"...","spelling_grammar_issues":[]}},"image_review":{{"overall_image_verdict":"SAFE|WARNING|VIOLATION","items":[{{"source":"MAIN_POSTER|COVER_BANNER|DESCRIPTION_IMAGE_1","status":"VALID|WARNING|VIOLATION|MISSING","analysis":"...","ocr_reasoning":{{"step1_scene_context":"...","step2_anchor_text":"...","step3_stylized_decoding":"...","step4_moderation_verdict":"..."}},"extracted_texts":[{{"text":"...","font_style":"NORMAL|STYLIZED_HORROR|NEON_GLOW|3D_EFFECT|HANDWRITTEN","confidence":"HIGH|MEDIUM|LOW","visual_effect":"BLOOD_SPLATTER|SMOKE|DISTORTION|NONE","is_event_title":true}}],"issues":[],"suggestion":""}}]}},"document_review":{{"overall_document_verdict":"SAFE|WARNING|VIOLATION|NOT_PROVIDED","items":[{{"source":"PERMIT_DOCUMENT_1","file_name":"...","status":"VALID|WARNING|VIOLATION","relevance_to_event":"HIGH|MEDIUM|LOW|IRRELEVANT","analysis":"...","violation_type":null,"violating_location":null,"issues":[],"suggestion":""}}]}},"compliant_checks":[],"critical_violations":[{{"policy_code":"...","issue":"...","highlighted_text":"..."}}],"warnings":[{{"policy_code":"...","issue":"...","highlighted_text":"..."}}],"suggestions":[]}}"""


REVIEW_SYSTEM_PROMPT = build_review_system_prompt(DEFAULT_REVIEW_CRITERIA[:5])


def select_dynamic_criteria(required_codes, seed_idx: int, total_count: int = 7):
    """
    Chọn danh sách tiêu chí động kết hợp các tiêu chí trọng tâm của mẫu + tiêu chí xoay vòng đồng đều 16 mã
    (có hoán đổi thứ tự), giúp model đọc bộ điều khoản động mà không bỏ sót tiêu chí nào.
    """
    rng = random.Random(202611 + seed_idx * 131)
    target_n = min(max(len(required_codes), 6), total_count, 7)
    chosen = []
    seen = set()

    for code in required_codes:
        c = _CRITERIA_BY_CODE.get(code)
        if c and code not in seen:
            chosen.append(c)
            seen.add(code)

    remaining = [c for c in DEFAULT_REVIEW_CRITERIA if c["code"] not in seen]
    if remaining:
        offset = (seed_idx * 5) % len(remaining)
        rotated = remaining[offset:] + remaining[:offset]
        for c in rotated:
            if len(chosen) >= target_n:
                break
            chosen.append(c)
            seen.add(c["code"])

    rng.shuffle(chosen)
    return chosen


def build_event_user_prompt(
    *,
    title: str,
    category: str,
    organizer_name: str,
    organizer_verified: bool = True,
    organizer_desc: str = "",
    event_format: str = "OFFLINE",
    visibility: str = "PUBLIC",
    tags=None,
    short_desc: str = "",
    description: str = "",
    additional_terms: str = "Không có",
    has_thumbnail: bool = True,
    has_banner: bool = True,
    desc_image_count: int = 0,
    start_time: str = "2026-06-15 19:00",
    end_time: str = "2026-06-15 22:00",
    permits=None,
    requires_strict_permit: bool = False,
    sessions=None,
    tickets=None,
    refund_summary: str = "Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.",
    vision_items=None,
    document_items=None,
) -> str:
    """Dựng User Prompt khớp 100% buildEventAiUserPrompt + separateMediaSection từ events.service.js."""
    tags_text = ", ".join(tags) if tags else "Không có"
    verified_label = "Đã xác minh (ACTIVE)" if organizer_verified else "Chưa xác minh"
    org_line = f"{organizer_name} | Trạng thái xác minh: {verified_label}"
    if organizer_desc:
        org_line += f" | Giới thiệu: {organizer_desc}"

    image_lines = [
        f"- Ảnh đại diện chính (Main Poster): {'ĐÃ CÓ (Đã tải lên)' if has_thumbnail else 'CHƯA CÓ (BẮT BUỘC BỔ SUNG)'}",
        f"- Ảnh bìa (Cover Banner): {'ĐÃ CÓ (Đã tải lên)' if has_banner else 'CHƯA CÓ (CẦN BỔ SUNG)'}",
        f"- Ảnh trong bài viết mô tả: {f'ĐÃ CÓ ({desc_image_count} ảnh dạng text/nhúng trong bài viết)' if desc_image_count > 0 else 'CHƯA CÓ (Tùy chọn - không bắt buộc)'}",
    ]

    permit_list = permits or []
    if permit_list:
        permit_summary = f"{len(permit_list)} tài liệu đính kèm:\n" + "\n".join(
            f'  + [Tài liệu #{i + 1}] "{p["file_name"]}" ({p.get("type", "application/pdf")})'
            for i, p in enumerate(permit_list)
        )
    elif not requires_strict_permit:
        permit_summary = "KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM (Trạng thái: NOT_REQUIRED — sự kiện quy mô nhỏ / online / workshop thông thường không bắt buộc giấy phép, KHÔNG phạt lỗi thiếu giấy phép)."
    else:
        permit_summary = "KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM"

    session_list = sessions or []
    if session_list:
        session_lines = []
        sessions_with_venue = 0
        for idx, s in enumerate(session_list):
            venue_str = s.get("venue_address")
            if venue_str:
                sessions_with_venue += 1
                vid = s.get("venue_id", f"venue-0{idx + 1}")
                venue_info = f"{venue_str} [venue_id: {vid}]"
            else:
                venue_info = "Chưa gắn địa điểm cụ thể"
            session_lines.append(
                f"  + Phiên {idx + 1} [{s.get('name', 'Phiên')}]: {s['start']} - {s['end']} | Địa điểm: {venue_info}"
            )
        session_summary = "\n".join(session_lines)
    else:
        sessions_with_venue = 0
        session_summary = "  + CHƯA CÓ LỊCH TRÌNH PHIÊN"

    fmt_upper = event_format.strip().upper()
    if fmt_upper == "ONLINE":
        location_note = "Ghi chú xác thực địa điểm: Sự kiện tổ chức trực tuyến (ONLINE), không yêu cầu địa điểm vật lý."
    elif sessions_with_venue > 0:
        location_note = (
            f"Ghi chú xác thực địa điểm (từ bảng venues): Sự kiện {fmt_upper} ĐÃ CÓ {sessions_with_venue}/{len(session_list)} "
            f"phiên gắn venue_id hợp lệ kèm địa chỉ cụ thể trong hệ thống venues. KHÔNG báo lỗi giả về thiếu địa điểm chỉ vì bài viết mô tả không nhắc lại địa chỉ."
        )
    else:
        location_note = f"Ghi chú xác thực địa điểm: Sự kiện {fmt_upper} chưa có thông tin venue_id / địa chỉ cụ thể trong bảng venues."

    ticket_list = tickets or []
    ticket_count = len(ticket_list)
    if ticket_list:
        ticket_summary = "; ".join(
            f"{t['name']} ({'Ghế ngồi' if t.get('seated') else 'Vé tự do'}): {t['price']:,} VNĐ ({t['qty']} vé)".replace(",", ".")
            for t in ticket_list
        )
    else:
        ticket_summary = "CHƯA CÓ THÔNG TIN VÉ"

    sess_count = len(session_list) or 1
    parts = [
        f"""Tên sự kiện: {title}
Danh mục sự kiện: {category}
Thể loại / Định dạng: {fmt_upper} | Hiển thị: {visibility}
Từ khóa (Tags): {tags_text}
Nhà tổ chức: {org_line}
Mô tả ngắn: {short_desc or 'Không có'}
Mô tả chi tiết: {description or 'Không có'}
Điều khoản bổ sung: {additional_terms or 'Không có'}
Hình ảnh sự kiện đã đăng:
{chr(10).join(image_lines)}
Thời gian tổng thể: {start_time} đến {end_time}
Hồ sơ Giấy phép & Tài liệu đính kèm:
{permit_summary}
Lịch trình & Địa điểm từng phiên (Sessions & Venues):
{session_summary}
{location_note}
Cơ cấu loại vé (Tickets): Gồm {ticket_count} loại vé chính ({f'phân bổ qua {sess_count} phiên diễn ra' if sess_count > 1 else '1 phiên'}): {ticket_summary}
Chính sách hoàn tiền sự kiện: {refund_summary}

Hãy đối chiếu toàn bộ thông tin sự kiện và kết quả phân tích tài liệu/hình ảnh ở trên với Bộ tiêu chí kiểm duyệt EventHub trong System Prompt để thẩm định và xuất ra JSON đánh giá chính xác."""
    ]

    if vision_items:
        v_blocks = []
        for v in vision_items:
            src = v["source"]
            src_label = (
                "Ảnh đại diện chính (Main Poster)" if src == "MAIN_POSTER"
                else "Ảnh bìa (Cover Banner)" if src == "COVER_BANNER"
                else f"Ảnh trong mô tả ({src})"
            )
            safety_str = ", ".join(v.get("safety_flags", [])) if v.get("safety_flags") else "Không phát hiện"
            rel_flag = "true" if v.get("is_relevant", True) else "false"
            v_blocks.append(
                f"[{src_label}]:\n"
                f"- visual_description: {v['visual_description']}\n"
                f"- extracted_text: {v.get('extracted_text') or '(Không có chữ đọc được)'}\n"
                f"- is_event_poster_or_relevant_banner: {rel_flag}\n"
                f"- safety_flags: {safety_str}"
            )
        parts.append(
            "\n\n=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH SỰ KIỆN ===\n"
            + "\n\n".join(v_blocks)
            + "\n=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ==="
        )

    if document_items:
        d_blocks = []
        for d in document_items:
            vtype = d.get("violation_type") or ""
            score = d.get("relevance_score", 0)
            if vtype == "IRRELEVANT_OR_FAKE_DOCUMENT":
                badge = f"[TÀI LIỆU RÁC / LẠC ĐỀ - IRRELEVANT_OR_FAKE_DOCUMENT | relevance_score={score}]"
            elif d.get("is_violation"):
                badge = "[PHÁT HIỆN VI PHẠM TÀI LIỆU]"
            else:
                badge = f"[HỢP LỆ | relevance_score={score}]"
            d_blocks.append(f'[Tài liệu đính kèm: "{d["file_name"]}"] {badge}:\n{d["body"]}')
        parts.append(
            "\n\n=== KẾT QUẢ THẨM ĐỊNH TÀI LIỆU ĐÍNH KÈM ===\n"
            + "\n\n".join(d_blocks)
            + "\n=== KẾT THÚC THẨM ĐỊNH TÀI LIỆU ==="
        )

    return "".join(parts)


def _img_item(
    source: str,
    status: str,
    analysis: str,
    s1: str,
    s2: str,
    s3: str,
    s4: str,
    texts=None,
    issues=None,
    suggestion: str = "",
):
    return {
        "source": source,
        "status": status,
        "analysis": analysis,
        "ocr_reasoning": {
            "step1_scene_context": s1,
            "step2_anchor_text": s2,
            "step3_stylized_decoding": s3,
            "step4_moderation_verdict": s4,
        },
        "extracted_texts": texts or [],
        "issues": issues or [],
        "suggestion": suggestion,
    }


def _txt(text: str, font_style: str = "NORMAL", confidence: str = "HIGH", visual_effect: str = "NONE", is_title: bool = False):
    return {
        "text": text,
        "font_style": font_style,
        "confidence": confidence,
        "visual_effect": visual_effect,
        "is_event_title": bool(is_title),
    }


def _doc_item(
    file_name: str,
    status: str,
    relevance: str,
    analysis: str,
    violation_type=None,
    violating_location=None,
    issues=None,
    suggestion: str = "",
    source: str = "PERMIT_DOCUMENT_1",
):
    return {
        "source": source,
        "file_name": file_name,
        "status": status,
        "relevance_to_event": relevance,
        "analysis": analysis,
        "violation_type": violation_type,
        "violating_location": violating_location,
        "issues": issues or [],
        "suggestion": suggestion,
    }


def _make_sample(idx: int, required_codes, user_prompt: str, response_obj: dict, criteria_count: int = 8):
    criteria = select_dynamic_criteria(required_codes, seed_idx=idx, total_count=criteria_count)
    sys_prompt = build_review_system_prompt(criteria)
    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": json.dumps(response_obj, ensure_ascii=False)},
        ]
    }


def generate_review_samples():
    """
    Sinh bộ Golden Samples chuẩn hóa 100% theo Schema EventHub hiện hành:
    - 6 mẫu gốc đã sửa lỗi & nâng cấp schema (tách riêng document_review khỏi image_review)
    - Nhóm A: Chặn ảnh rác / lệch ngữ cảnh (meme, bàn nhậu, selfie, screenshot rác, phong cảnh/QR lừa đảo)
    - Nhóm B: Chặn tài liệu lạc đề / giả mạo (từ vựng IPA, giáo án, bài tập SV, hóa đơn/menu, giấy phép sự kiện khác)
    - Nhóm C: Hard Negatives chống bắt nhầm (workshop/webinar NOT_REQUIRED, OFFLINE có venues, đồ bơi bãi biển, triển lãm 18+, lỗi chính tả nhẹ NEEDS_REVIEW)
    - Nhóm D: Vi phạm 16 điều khoản event_review_criteria (Ponzi/MLM, test spam, giá vé âm/end<=start, hủy show không hoàn tiền & inbox Zalo, mạo danh VTV/PCCC, bar thiếu tuổi 18+)
    """
    samples = []

    # ==========================================================================
    # PHẦN 1: 6 MẪU GỐC NÂNG CẤP SCHEMA MỚI (ĐÃ SỬA TRUE/FALSE PYTHON)
    # ==========================================================================

    # 1. Original 1 (Upgraded): Lừa đảo tài chính x100 + STK cá nhân trên poster & mô tả
    samples.append(_make_sample(
        1,
        ["TERMS_ORGANIZER", "ANTI_FINANCIAL_FRAUD_MLM", "PAYMENT_POLICY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Lễ Hội Âm Nhạc Mùa Hè - Summer Music Wave 2026",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="Wave Media Group",
            organizer_verified=False,
            tags=["âm nhạc", "đầu tư", "summer wave"],
            short_desc="Đêm nhạc kết hợp cơ hội x100 tài sản cho nhà đầu tư.",
            description="Tham gia đêm nhạc đồng thời nhận cơ hội đầu tư gói VIP cam kết x100 vốn sau 30 ngày, bao lỗ 100%. Vui lòng chuyển khoản cọc trước vào STK cá nhân 1903888999 Techcombank hoặc nhắn Zalo BTC để giữ suất né phí.",
            sessions=[{"name": "Đêm nhạc chính", "start": "2026-07-10 19:00", "end": "2026-07-10 23:00", "venue_address": "Khu đô thị Sala, TP. Thủ Đức, TP. Hồ Chí Minh"}],
            tickets=[{"name": "Vé VIP Đầu Tư", "price": 2000000, "qty": 200}],
            refund_summary="Không hoàn tiền dưới mọi hình thức.",
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster nền xanh dương chèn mã QR chuyển khoản cá nhân lớn ở góc phải kèm dòng chữ cam kết lợi nhuận 30%/tháng.",
                    "extracted_text": "SUMMER MUSIC WAVE 2026 - CAM KẾT X100 VỐN - QUÉT QR CHUYỂN KHOẢN",
                    "is_relevant": False,
                    "safety_flags": ["FINANCIAL_SCAM_QR"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 96,
            "quality_score": 12,
            "summary": "Từ chối khẩn cấp vì sự kiện có dấu hiệu lừa đảo tài chính Ponzi cam kết x100 vốn, kêu gọi chuyển khoản STK cá nhân ngoài sàn và chèn QR chuyển tiền trên poster.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề gắn mác lễ hội âm nhạc nhưng nội dung mô tả thực chất dụ dỗ đầu tư tài chính bất hợp pháp.",
                "description_status": "VIOLATION",
                "description_analysis": "Mô tả cam kết x100 vốn, bao lỗ 100% và hướng dẫn chuyển tiền qua STK cá nhân/Zalo ngoài sàn EventHub.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Poster chứa nội dung cam kết x100 vốn, lợi nhuận 30%/tháng và mã QR chuyển khoản cá nhân lừa đảo.",
                        "Bố cục poster pha trộn chủ đề âm nhạc với thông điệp lôi kéo tài chính bất chính.",
                        "Các dòng chữ rõ nét 'CAM KẾT X100 VỐN', 'QUÉT QR CHUYỂN KHOẢN'.",
                        "Đọc chuẩn xác khẩu hiệu dụ dỗ đầu tư tiếng Việt có dấu trên ảnh.",
                        "Vi phạm nghiêm trọng chính sách chống lừa đảo tài chính và giao dịch ngoài luồng.",
                        [_txt("CAM KẾT X100 VỐN", "3D_EFFECT", "HIGH", "NONE", False), _txt("SUMMER MUSIC WAVE 2026", "NORMAL", "HIGH", "NONE", True)],
                        ["Chèn QR chuyển khoản cá nhân và quảng cáo đầu tư x100 vốn."],
                        "Gỡ bỏ ngay nội dung tài chính bất hợp pháp và mã QR chuyển khoản cá nhân.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [],
            "critical_violations": [
                {"policy_code": "ANTI_FINANCIAL_FRAUD_MLM", "issue": "Cam kết x100 vốn sau 30 ngày, lợi nhuận 30%/tháng, bao lỗ 100% trái pháp luật.", "highlighted_text": "cam kết x100 vốn sau 30 ngày, bao lỗ 100%"},
                {"policy_code": "PAYMENT_POLICY", "issue": "Kêu gọi chuyển khoản STK cá nhân và nhắn Zalo để né phí sàn.", "highlighted_text": "chuyển khoản cọc trước vào STK cá nhân 1903888999 Techcombank hoặc nhắn Zalo"},
            ],
            "warnings": [{"policy_code": "REFUND_POLICY", "issue": "Điều khoản từ chối hoàn tiền dưới mọi hình thức.", "highlighted_text": "Không hoàn tiền dưới mọi hình thức."}],
            "suggestions": [],
        },
        criteria_count=7,
    ))

    # 2. Original 2 (Upgraded): Đêm Trình Diễn Thời Trang Bikini & Summer Beachwear (Hard Negative - Sensible Safety Moderation)
    samples.append(_make_sample(
        2,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "LEGAL_PERMIT_AUTHENTICITY", "TICKET_POLICY"],
        build_event_user_prompt(
            title="Đêm Trình Diễn Thời Trang Bikini & Summer Beachwear 2026",
            category="Nghệ thuật & Thời trang (nghe-thuat)",
            organizer_name="Oceanic Fashion House",
            organizer_verified=True,
            organizer_desc="Đơn vị sản xuất tuần lễ thời trang biển chuyên nghiệp tại Đà Nẵng.",
            tags=["fashion show", "summer beachwear", "đà nẵng"],
            short_desc="Trình diễn bộ sưu tập thời trang áo tắm mùa hè của các nhà thiết kế trẻ.",
            description="Chương trình nghệ thuật giới thiệu bộ sưu tập thời trang đi biển và áo tắm mùa hè 2026 tại hồ bơi resort cao cấp. Có quy trình check-in bằng mã QR EventHub tại sảnh đón khách và đường dây nóng hỗ trợ 0905123456.",
            permits=[{"file_name": "Cong-van-chap-thuan-bieu-dien-thoi-trang-2026.pdf"}],
            requires_strict_permit=True,
            sessions=[{"name": "Runway Show Chính", "start": "2026-07-18 18:30", "end": "2026-07-18 21:30", "venue_address": "Ariyana Beach Resort, Võ Nguyên Giáp, Ngũ Hành Sơn, Đà Nẵng"}],
            tickets=[{"name": "Vé Standard", "price": 450000, "qty": 300, "seated": True}, {"name": "Vé Front Row VIP", "price": 1200000, "qty": 80, "seated": True}],
            refund_summary="Cho phép hoàn vé trước 7 ngày (Tỷ lệ: 80%).",
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Người mẫu sải bước trên sàn catwalk bên hồ bơi resort mặc trang phục áo tắm thời trang mùa hè thiết kế tinh tế, ánh sáng sân khấu rực rỡ.",
                    "extracted_text": "SUMMER BEACHWEAR SHOW 2026 - OCEANIC FASHION",
                    "is_relevant": True,
                    "safety_flags": [],
                },
                {
                    "source": "COVER_BANNER",
                    "visual_description": "Banner ngang tông xanh biển giới thiệu sàn diễn thời trang và tên các nhà thiết kế.",
                    "extracted_text": "SUMMER BEACHWEAR 2026 | ĐÀ NẴNG",
                    "is_relevant": True,
                    "safety_flags": [],
                },
            ],
            document_items=[
                {
                    "file_name": "Cong-van-chap-thuan-bieu-dien-thoi-trang-2026.pdf",
                    "relevance_score": 95,
                    "body": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM - Sở Văn hóa và Thể thao TP. Đà Nẵng chấp thuận cho Oceanic Fashion House tổ chức Đêm Trình Diễn Thời Trang Bikini & Summer Beachwear 2026 tại Ariyana Resort.",
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 6,
            "quality_score": 94,
            "summary": "Sự kiện trình diễn thời trang áo tắm chuyên nghiệp, có công văn chấp thuận hợp lệ và hình ảnh đúng ngữ cảnh nghệ thuật thời trang biển, không vi phạm tiêu chuẩn cộng đồng.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng chủ đề trình diễn thời trang mùa hè.",
                "description_status": "VALID",
                "description_analysis": "Mô tả đầy đủ thông tin chương trình, hình thức check-in QR EventHub và hotline hỗ trợ.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster sàn diễn thời trang áo tắm bên hồ bơi lịch sự, chuyên nghiệp và khớp chủ đề.",
                        "Bối cảnh sàn diễn thời trang mùa hè ngoài trời với tông ánh sáng sân khấu sang trọng.",
                        "Chữ in rõ nét: 'SUMMER BEACHWEAR SHOW 2026 - OCEANIC FASHION'.",
                        "Đọc chính xác văn bản poster, không bị biến dạng.",
                        "Áo tắm catwalk đúng ngữ cảnh sự kiện thời trang biển lành mạnh, tuyệt đối không phải nội dung khiêu dâm 18+.",
                        [_txt("SUMMER BEACHWEAR SHOW 2026", "NORMAL", "HIGH", "NONE", True)],
                    ),
                    _img_item(
                        "COVER_BANNER", "VALID",
                        "Banner đồng bộ nhận diện sự kiện và địa điểm Đà Nẵng.",
                        "Thiết kế ngang tông xanh biển phù hợp chủ đề mùa hè.",
                        "Chữ rõ ràng 'SUMMER BEACHWEAR 2026 | ĐÀ NẴNG'.",
                        "Giữ nguyên chữ tiếng Việt chuẩn có dấu.",
                        "Banner an toàn, phù hợp chuẩn hiển thị.",
                        [_txt("SUMMER BEACHWEAR 2026 | ĐÀ NẴNG", "NORMAL", "HIGH", "NONE", True)],
                    ),
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [
                    _doc_item(
                        "Cong-van-chap-thuan-bieu-dien-thoi-trang-2026.pdf",
                        "VALID", "HIGH",
                        "Công văn chấp thuận của Sở Văn hóa & Thể thao TP. Đà Nẵng ghi đúng tên đơn vị Oceanic Fashion House và tên chương trình.",
                    )
                ],
            },
            "compliant_checks": [
                "Tài liệu chấp thuận biểu diễn từ Sở Văn hóa & Thể thao hợp lệ, khớp tên BTC và sự kiện",
                "Hình ảnh sàn diễn thời trang áo tắm hợp lệ theo nguyên tắc kiểm duyệt đúng ngữ cảnh",
                "Địa điểm, lịch trình, giá vé và chính sách hoàn vé minh bạch",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # 3. Original 3 (Upgraded): Lỗi chính tả (NEEDS_REVIEW, không phạt thiếu giấy phép với hội thảo nhỏ)
    samples.append(_make_sample(
        3,
        ["CONTENT_SPELLING", "TICKET_POLICY", "VALUABLE_SUGGESTIONS", "LEGAL_PERMIT_AUTHENTICITY"],
        build_event_user_prompt(
            title="Hôi Thảo Trí Tuệ Nhân Tạo & Ứng Dụng Trong Doang Nghiệp 2026",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="TechViet Community",
            organizer_verified=True,
            tags=["AI", "doanh nghiệp", "hội thảo"],
            short_desc="Sự kiện chia sẽ kiến thức ứng dụng AI vận hành doang nghiệp.",
            description="Chương trình chia sẽ kinh nghiệm triển khai AI giúp doang nghiệp tối ưu quy trình và nấm bắt xu hướng tự động hóa năm 2026. Diễn giả gồm nhiều kỹ sư trưởng tại TP.HCM.",
            sessions=[{"name": "Phiên hội thảo sáng", "start": "2026-08-15 08:30", "end": "2026-08-15 11:30", "venue_address": "Tòa nhà Saigon Innovation Hub, 273 Điện Biên Phủ, Quận 3, TP.HCM"}],
            tickets=[{"name": "Vé Tham Dự Standard", "price": 150000, "qty": 120}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster công nghệ nền xanh đậm hiển thị diễn giả và sơ đồ mạng nơ-ron hiện đại.",
                    "extracted_text": "HỘI THẢO AI & DOANH NGHIỆP 2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "NEEDS_REVIEW",
            "risk_score": 32,
            "quality_score": 70,
            "summary": "Sự kiện hội thảo công nghệ hợp lệ về chủ đề và địa điểm nhưng tiêu đề cùng mô tả mắc nhiều lỗi chính tả tiếng Việt và thiếu thông tin liên hệ BTC.",
            "content_review": {
                "title_status": "NEEDS_IMPROVEMENT",
                "title_analysis": "Tiêu đề truyền đạt đúng nội dung hội thảo AI nhưng sai chính tả ở 2 từ quan trọng.",
                "description_status": "NEEDS_IMPROVEMENT",
                "description_analysis": "Bài viết đã nêu chủ đề nhưng còn ngắn, sai chính tả lặp lại và thiếu hotline/email hỗ trợ người mua vé.",
                "spelling_grammar_issues": [
                    "'Hôi Thảo' -> 'Hội Thảo'",
                    "'Doang Nghiệp' / 'doang nghiệp' -> 'Doanh Nghiệp' / 'doanh nghiệp'",
                    "'chia sẽ' -> 'chia sẻ'",
                    "'nấm bắt' -> 'nắm bắt'",
                ],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster thiết kế phù hợp chủ đề hội thảo công nghệ AI.",
                        "Bối cảnh đồ họa công nghệ hiện đại tông xanh đậm.",
                        "Chữ rõ ràng 'HỘI THẢO AI & DOANH NGHIỆP 2026'.",
                        "Chữ trên ảnh viết đúng chính tả tiếng Việt.",
                        "Hình ảnh an toàn, khớp chủ đề.",
                        [_txt("HỘI THẢO AI & DOANH NGHIỆP 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Địa điểm tổ chức tại Saigon Innovation Hub minh bạch qua bảng venues",
                "Hội thảo chia sẻ kiến thức không thuộc diện bắt buộc nộp giấy phép (NOT_REQUIRED)",
                "Cơ cấu giá vé minh bạch",
            ],
            "critical_violations": [],
            "warnings": [
                {
                    "policy_code": "CONTENT_SPELLING",
                    "issue": "Tiêu đề và mô tả sai chính tả nhiều từ ('Hôi Thảo', 'Doang Nghiệp', 'chia sẽ', 'nấm bắt').",
                    "highlighted_text": "Hôi Thảo ... Doang Nghiệp ... chia sẽ ... nấm bắt",
                }
            ],
            "suggestions": [
                "Sửa lại toàn bộ lỗi chính tả ở Tiêu đề và Mô tả để tăng độ tin cậy chuyên nghiệp.",
                "Bổ sung Hotline/Email hỗ trợ và quy định check-in vé QR tại quầy lễ tân.",
            ],
        },
        criteria_count=8,
    ))

    # 4. Original 4 (Upgraded): Đêm nhạc Indie nộp nhầm sách từ vựng tiếng Nhật N5 -> document_review tách độc lập
    samples.append(_make_sample(
        4,
        ["LEGAL_PERMIT_AUTHENTICITY", "EVENT_COHERENCE", "IMAGE_POLICY", "TERMS_ORGANIZER"],
        build_event_user_prompt(
            title="Đêm Nhạc Hội Indie Acoustic Chill Night",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="Acoustic Soul Studio",
            organizer_verified=True,
            tags=["indie", "acoustic", "âm nhạc"],
            short_desc="Đêm nhạc acoustic thư giãn cuối tuần với các ban nhạc trẻ.",
            description="Thưởng thức những bản tình ca Indie Acoustic sâu lắng cùng ban nhạc trẻ tại không gian ấm cúng giữa lòng Sài Gòn.",
            permits=[{"file_name": "tu_vung_N5_minna_no_nihongo.pdf"}],
            sessions=[{"name": "Đêm nhạc tối", "start": "2026-07-24 19:30", "end": "2026-07-24 22:00", "venue_address": "120 Nguyễn Đình Chiểu, Đa Kao, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Ngồi Tiêu Chuẩn", "price": 250000, "qty": 150}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster đêm nhạc acoustic với hình ảnh cây đàn guitar gỗ dưới ánh đèn vàng ấm áp.",
                    "extracted_text": "INDIE ACOUSTIC CHILL NIGHT - 24/07",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "tu_vung_N5_minna_no_nihongo.pdf",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: Sách từ vựng tiếng Nhật Minna no Nihongo N5 - Bài 1: 新出語 (Từ mới), わたし (Tôi), なまえ (Tên), せんせい (Giáo viên)...",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 92,
            "quality_score": 25,
            "summary": "Từ chối sự kiện vì tài liệu đính kèm trong hồ sơ giấy phép là sách từ vựng tiếng Nhật N5 hoàn toàn lạc đề, không có giá trị pháp lý.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng chủ đề đêm nhạc indie acoustic.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp với đêm nhạc acoustic.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster đàn guitar ánh đèn vàng phù hợp với đêm nhạc acoustic (tách biệt với lỗi ở mục tài liệu).",
                        "Không gian âm nhạc acoustic tông vàng ấm áp.",
                        "Chữ rõ ràng 'INDIE ACOUSTIC CHILL NIGHT - 24/07'.",
                        "Văn bản rõ nét đúng tên sự kiện.",
                        "Hình ảnh poster hợp lệ, an toàn.",
                        [_txt("INDIE ACOUSTIC CHILL NIGHT - 24/07", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "tu_vung_N5_minna_no_nihongo.pdf",
                        "VIOLATION", "IRRELEVANT",
                        "Tệp đính kèm chứa nội dung sách từ vựng tiếng Nhật Minna no Nihongo N5, hoàn toàn không liên quan đến đêm nhạc và không phải giấy phép tổ chức.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "Bài 1: 新出語 (Từ mới), わたし (Tôi), なまえ (Tên), せんせい (Giáo viên)",
                        ["Nộp sách từ vựng học ngoại ngữ thay thế hồ sơ giấy phép sự kiện."],
                        "Gỡ bỏ tệp từ vựng N5; nếu không bắt buộc giấy phép thì bỏ trống mục tệp đính kèm, hoặc nộp đúng văn bản chấp thuận hợp lệ.",
                    )
                ],
            },
            "compliant_checks": [
                "Poster chính phù hợp với chủ đề đêm nhạc acoustic",
                "Địa điểm tổ chức tại Quận 1 và lịch trình minh bạch",
            ],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [tu_vung_N5_minna_no_nihongo.pdf]: Tài liệu đính kèm là sách từ vựng tiếng Nhật N5 lạc đề/giả mạo, không phải văn bản pháp lý hợp lệ.",
                    "highlighted_text": "Bài 1: 新出語 (Từ mới), わたし (Tôi), なまえ (Tên)",
                }
            ],
            "warnings": [],
            "suggestions": ["Chỉ tải lên giấy phép/công văn chấp thuận hoặc hợp đồng địa điểm liên quan trực tiếp đến sự kiện."],
        },
        criteria_count=8,
    ))

    # 5. Original 5 (Upgraded): Fan Meeting quốc tế tại TP.HCM hợp lệ (APPROVE)
    samples.append(_make_sample(
        5,
        ["LEGAL_PERMIT_AUTHENTICITY", "IMAGE_POLICY", "TICKET_POLICY", "SESSION_SCHEDULE", "CHECKIN_SECURITY_RULES"],
        build_event_user_prompt(
            title="HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="GMMTV & Golden Bridge Vietnam",
            organizer_verified=True,
            organizer_desc="Đơn vị tổ chức các chương trình giao lưu nghệ sĩ quốc tế tại Việt Nam.",
            tags=["fan meeting", "hcm", "giao lưu"],
            short_desc="Buổi giao lưu chính thức cùng hai nghệ sĩ Force và Book tại TP.HCM.",
            description="Sự kiện giao lưu người hâm mộ chính thức với quyền lợi hi-touch, soundcheck và chụp ảnh nhóm theo hạng vé. Vui lòng mang CCCD hoặc VNeID để đối chiếu QR vé EventHub khi check-in, không mang máy ảnh ống kính rời và gậy selfie vào khán phòng.",
            permits=[{"file_name": "Giay-phep-to-chuc-fanmeeting-HCM.pdf"}],
            requires_strict_permit=True,
            sessions=[{"name": "Fan Meeting Chính", "start": "2026-08-08 18:00", "end": "2026-08-08 21:00", "venue_address": "Nhà hát Quân Đội, 140 Cộng Hòa, Tân Bình, TP.HCM"}],
            tickets=[{"name": "SVIP", "price": 4500000, "qty": 150, "seated": True}, {"name": "VIP", "price": 3200000, "qty": 300, "seated": True}, {"name": "Zone A", "price": 1800000, "qty": 500, "seated": True}],
            refund_summary="Cho phép hoàn vé trước 14 ngày (Tỷ lệ: 70%).",
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh hai nghệ sĩ Force và Book mặc vest lịch lãm trên nền ánh sáng pastel chuyên nghiệp kèm logo BTC.",
                    "extracted_text": "HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH - 08.08.2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "Giay-phep-to-chuc-fanmeeting-HCM.pdf",
                    "relevance_score": 96,
                    "body": "Sở Văn hóa và Thể thao TP.HCM cấp Giấy phép tổ chức chương trình HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH cho Golden Bridge Vietnam tại Nhà hát Quân Đội.",
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 5,
            "quality_score": 95,
            "summary": "Sự kiện fan meeting có giấy phép biểu diễn từ Sở VH&TT TP.HCM hợp lệ, quy định check-in an ninh chặt chẽ và poster chuẩn xác.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề nêu rõ tên chương trình, nghệ sĩ và thành phố tổ chức.",
                "description_status": "VALID",
                "description_analysis": "Mô tả đầy đủ quyền lợi hạng vé, quy trình check-in CCCD/QR và vật dụng hạn chế.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster nghệ sĩ chuyên nghiệp, ngày giờ khớp lịch trình 08/08/2026.",
                        "Bối cảnh ánh sáng pastel thanh lịch đúng tinh thần buổi giao lưu người hâm mộ.",
                        "Chữ rõ ràng 'HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH - 08.08.2026'.",
                        "Văn bản in sắc nét, không lỗi hiển thị.",
                        "Hình ảnh an toàn, khớp 100% thông tin sự kiện.",
                        [_txt("HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [
                    _doc_item(
                        "Giay-phep-to-chuc-fanmeeting-HCM.pdf",
                        "VALID", "HIGH",
                        "Giấy phép tổ chức do Sở VH&TT TP.HCM cấp trùng khớp tên chương trình, đơn vị Golden Bridge Vietnam và địa điểm Nhà hát Quân Đội.",
                    )
                ],
            },
            "compliant_checks": [
                "Giấy phép tổ chức chương trình hợp lệ từ Sở Văn hóa & Thể thao TP.HCM",
                "Poster rõ ràng, đồng bộ ngày giờ và nghệ sĩ",
                "Quy trình check-in CCCD/VNeID, sơ đồ hạng vé và danh mục đồ cấm minh bạch",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=7,
    ))

    # 6. Original 6 (Fixed Python True/False & Upgraded): Kịch Ma 4D : Con Quỷ Rối 2 (CoT OCR Horror Font + Document Review tách biệt)
    samples.append(_make_sample(
        6,
        ["IMAGE_POLICY", "LEGAL_PERMIT_AUTHENTICITY", "CONTENT_SPELLING", "AGE_RESTRICTION_RATING"],
        build_event_user_prompt(
            title='Kịch Ma 4D : Con Quỷ Rối 2 "Nhà Có Ma"',
            category="Sân khấu & Nghệ thuật (nghe-thuat)",
            organizer_name="Sân Khấu Kịch Quốc Thảo",
            organizer_verified=True,
            tags=["kịch ma 4d", "sân khấu kịch", "kinh dị"],
            short_desc="Vở kịch kinh dị 4D tương tác đặc sắc tại Sân khấu Quốc Thảo.",
            description="Tác phẩm sân khấu kịch kinh dị 4D của đạo diễn NSƯT Quốc Thảo kết hợp âm thanh vòm và hiệu ứng tương tác chân thực. Lưu ý: Khán giả từ 12 tuổi trở lên; người có tiền sử bệnh tim mạch, huyết áp hoặc phụ nữ mang thai vui lòng cân nhắc trước khi tham dự.",
            permits=[{"file_name": "Giay-Phep-Bieu-Dien-San-Khau-Kich-Quoc-Thao.pdf"}],
            sessions=[
                {"name": "Suất diễn 1", "start": "2026-08-06 19:30", "end": "2026-08-06 21:45", "venue_address": "81 Trần Quốc Thảo, Phường Võ Thị Sáu, Quận 3, TP.HCM"},
                {"name": "Suất diễn 2", "start": "2026-08-20 19:30", "end": "2026-08-20 21:45", "venue_address": "81 Trần Quốc Thảo, Phường Võ Thị Sáu, Quận 3, TP.HCM"},
            ],
            tickets=[{"name": "Vé HSSV", "price": 100000, "qty": 40, "seated": True}, {"name": "Vé Bạc", "price": 240000, "qty": 120, "seated": True}, {"name": "Vé Vàng", "price": 280000, "qty": 80, "seated": True}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Khung cảnh rừng tối ma mị ánh sáng đỏ, chữ tiêu đề vẽ uốn lượn kinh dị rỉ vệt đỏ dạng máu nghệ thuật, dòng chữ dưới ghi VỞ KỊCH MA 4D - Đạo diễn Ns. Quốc Thảo.",
                    "extracted_text": "CON QUỶ RỐI 2 - NHÀ CÓ MA | VỞ KỊCH MA 4D | Đạo diễn: Ns. Quốc Thảo",
                    "is_relevant": True,
                    "safety_flags": [],
                },
                {
                    "source": "COVER_BANNER",
                    "visual_description": "Không gian xanh tím huyền bí với hai bộ xương nghệ thuật đối xứng, chữ tiêu đề 3D phát sáng và logo Sân Khấu Kịch Quốc Thảo.",
                    "extracted_text": "CON QUỶ RỐI 2 | Sân Khấu Kịch Quốc Thảo",
                    "is_relevant": True,
                    "safety_flags": [],
                },
            ],
            document_items=[
                {
                    "file_name": "Giay-Phep-Bieu-Dien-San-Khau-Kich-Quoc-Thao.pdf",
                    "relevance_score": 94,
                    "body": "Văn bản chấp thuận biểu diễn kịch sân khấu nghệ thuật số 120/GP-SVHTT từ Sở Văn hóa và Thể thao TP.HCM cấp cho Sân Khấu Kịch Quốc Thảo.",
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 8,
            "quality_score": 93,
            "summary": "Vở kịch kinh dị có giấy phép biểu diễn từ Sở VH&TT TP.HCM và cảnh báo an toàn tim mạch/độ tuổi đầy đủ; CoT OCR giải mã chính xác phông chữ kinh dị tiếng Việt.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề vở kịch kinh dị rõ ràng, đúng nhận diện tác phẩm.",
                "description_status": "VALID",
                "description_analysis": "Mô tả có cảnh báo độ tuổi 12+ và lưu ý sức khỏe tim mạch, huyết áp phù hợp loại hình kịch ma 4D.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster kịch ma 4D có mỹ thuật chuyên nghiệp, giải mã đúng 'CON QUỶ RỐI 2 - NHÀ CÓ MA'.",
                        "Khung cảnh rừng tối ma mị ánh đỏ, định hình rõ thể loại kịch kinh dị sân khấu.",
                        "Chữ in chuẩn: 'VỞ KỊCH MA 4D' và 'Đạo diễn: Ns. Quốc Thảo' xác nhận ngữ cảnh 100% tiếng Việt.",
                        "Bóc tách nét rỉ máu nghệ thuật trên phông chữ kinh dị uốn lượn để khôi phục đúng cụm từ tiếng Việt 'CON QUỶ RỐI 2 - NHÀ CÓ MA', không lẫn ký tự nước ngoài.",
                        "Hiệu ứng máu giả trên chữ là mỹ thuật sân khấu hợp lệ của vở kịch ma, không phải bạo lực máu me thực tế.",
                        [_txt("CON QUỶ RỐI 2 - NHÀ CÓ MA", "STYLIZED_HORROR", "HIGH", "BLOOD_SPLATTER", True), _txt("VỞ KỊCH MA 4D", "NORMAL", "HIGH", "NONE", False)],
                    ),
                    _img_item(
                        "COVER_BANNER", "VALID",
                        "Banner đồng bộ hình tượng sân khấu kịch kinh dị và logo đơn vị.",
                        "Banner tông xanh tím huyền bí với tạo hình bộ xương trang trí sân khấu.",
                        "Logo Sân Khấu Kịch Quốc Thảo rõ nét ở góc banner.",
                        "Giải mã chuẩn cụm chữ 3D 'CON QUỶ RỐI 2'.",
                        "Hình tượng bộ xương mỹ thuật sân khấu an toàn, hợp lệ.",
                        [_txt("CON QUỶ RỐI 2", "3D_EFFECT", "HIGH", "SMOKE", True)],
                    ),
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [
                    _doc_item(
                        "Giay-Phep-Bieu-Dien-San-Khau-Kich-Quoc-Thao.pdf",
                        "VALID", "HIGH",
                        "Văn bản chấp thuận biểu diễn số 120/GP-SVHTT của Sở VH&TT TP.HCM hợp lệ và khớp đơn vị Sân Khấu Kịch Quốc Thảo.",
                    )
                ],
            },
            "compliant_checks": [
                "Giấy phép biểu diễn sân khấu số 120/GP-SVHTT từ Sở VH&TT TP.HCM hợp lệ",
                "Đã có khuyến cáo độ tuổi (12+) và lưu ý tim mạch/thai phụ trong mô tả kịch kinh dị",
                "Địa điểm 81 Trần Quốc Thảo xác thực qua venues cùng 2 suất diễn rõ ràng",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=7,
    ))

    # ==========================================================================
    # NHÓM A: CHẶN ẢNH RÁC / LỆCH NGỮ CẢNH (MEME, BÀN NHẬU, SELFIE, SCREENSHOT, PHONG CẢNH)
    # ==========================================================================

    # A1: Meme ảnh chế thay cho poster Hội thảo chuyển đổi số
    samples.append(_make_sample(
        7,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "TICKET_POLICY"],
        build_event_user_prompt(
            title="Hội Thảo Chuyển Đổi Số Doanh Nghiệp SME 2026",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="Hiệp Hội Doanh Nghiệp Trẻ",
            organizer_verified=True,
            tags=["chuyển đổi số", "sme", "hội thảo"],
            short_desc="Cập nhật chiến lược chuyển đổi số và ERP cho doanh nghiệp vừa và nhỏ.",
            description="Hội thảo chuyên sâu với sự tham gia của các chuyên gia tư vấn ERP, CRM và AI vận hành doanh nghiệp SME tại Hà Nội.",
            sessions=[{"name": "Phiên toàn thể", "start": "2026-07-05 08:30", "end": "2026-07-05 12:00", "venue_address": "Trung tâm Hội nghị Quốc gia, Phạm Hùng, Nam Từ Liêm, Hà Nội"}],
            tickets=[{"name": "Vé Doanh Nghiệp", "price": 300000, "qty": 200}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh meme con mèo đội nón dưa hấu với dòng chữ chế hài hước 'Tới công chuyện rồi anh em ơi', hoàn toàn không có thông tin hội thảo.",
                    "extracted_text": "Tới công chuyện rồi anh em ơi",
                    "is_relevant": False,
                    "safety_flags": ["IRRELEVANT_MEME_OR_JUNK"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 82,
            "quality_score": 30,
            "summary": "Từ chối sự kiện vì Main Poster sử dụng ảnh meme hài hước không liên quan, sai lệch hoàn toàn với chủ đề Hội thảo Chuyển đổi số Doanh nghiệp.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề hội thảo doanh nghiệp rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Nội dung mô tả phù hợp chủ đề chuyển đổi số.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Poster là ảnh meme con mèo không ăn nhập gì với hội thảo kinh doanh công nghệ (is_event_poster_or_relevant_banner=false).",
                        "Hình ảnh mang tính giải trí meme mạng xã hội, lạc đề hoàn toàn so với hội thảo doanh nghiệp SME.",
                        "Dòng chữ chế 'Tới công chuyện rồi anh em ơi', không có tên sự kiện hay lịch trình.",
                        "Đọc đúng chữ tiếng Việt trên ảnh meme.",
                        "Vi phạm quy chuẩn hình ảnh sự kiện do dùng ảnh meme rác lệch ngữ cảnh.",
                        [_txt("Tới công chuyện rồi anh em ơi", "NORMAL", "HIGH", "NONE", False)],
                        ["Sử dụng ảnh meme con mèo không liên quan làm Poster đại diện hội thảo."],
                        "Thay thế bằng poster chính thức có tên hội thảo, diễn giả và thời gian tổ chức.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Hội thảo quy mô vừa không bắt buộc giấy phép (NOT_REQUIRED)", "Địa điểm tại Hà Nội minh bạch qua venues"],
            "critical_violations": [
                {"policy_code": "IMAGE_POLICY", "issue": "Main Poster là ảnh meme mèo hài hước, hoàn toàn không liên quan đến hội thảo doanh nghiệp.", "highlighted_text": "MAIN_POSTER: ảnh meme con mèo... Tới công chuyện rồi anh em ơi"}
            ],
            "warnings": [],
            "suggestions": ["Cập nhật Poster thiết kế đúng bộ nhận diện Hội Thảo Chuyển Đổi Số SME 2026."],
        },
        criteria_count=6,
    ))

    # A2: Ảnh bàn nhậu / bia rượu thay cho poster Khóa học UI/UX
    samples.append(_make_sample(
        8,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "EVENT_REALISM_FEASIBILITY"],
        build_event_user_prompt(
            title="Workshop Thiết Kế UI/UX Product Thực Chiến",
            category="Hội thảo & Giáo dục (hoi-thao-giao-duc)",
            organizer_name="DesignLab Vietnam",
            organizer_verified=True,
            tags=["ui ux", "design", "workshop"],
            short_desc="Thực hành thiết kế giao diện sản phẩm cùng Lead Designer.",
            description="Hướng dẫn quy trình nghiên cứu người dùng, wireframe và xây dựng Design System trên Figma trong 3 giờ thực hành trực tiếp.",
            sessions=[{"name": "Thực hành Figma", "start": "2026-07-12 14:00", "end": "2026-07-12 17:30", "venue_address": "Toong Coworking, 126 Nguyễn Thị Minh Khai, Quận 3, TP.HCM"}],
            tickets=[{"name": "Vé Học Viên", "price": 199000, "qty": 50}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh chụp bàn nhậu ngoài trời buổi tối gồm nhiều vỏ chai bia, ly thủy tinh và đĩa đồ ăn lộn xộn.",
                    "extracted_text": "",
                    "is_relevant": False,
                    "safety_flags": ["OFF_TOPIC_PERSONAL_PHOTO"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 80,
            "quality_score": 32,
            "summary": "Từ chối sự kiện vì Main Poster là ảnh bàn nhậu cá nhân ngẫu nhiên, hoàn toàn lệch ngữ cảnh với Workshop Thiết Kế UI/UX.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng chuyên ngành thiết kế sản phẩm.",
                "description_status": "VALID",
                "description_analysis": "Mô tả ngắn gọn nội dung thực hành Figma.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Ảnh bàn nhậu chai bia hoàn toàn không phải poster sự kiện giáo dục/công nghệ (is_event_poster_or_relevant_banner=false).",
                        "Ảnh chụp đời thường bàn nhậu ngoài trời, không có yếu tố thiết kế UI/UX.",
                        "Không có văn bản nhận diện sự kiện.",
                        "Không phát hiện chữ trên ảnh.",
                        "Vi phạm chính sách chất lượng và liên quan hình ảnh (ảnh rác lạc đề).",
                        [],
                        ["Ảnh bàn nhậu không liên quan đến workshop UI/UX."],
                        "Tải lên ảnh poster/banner thể hiện chủ đề thiết kế UI/UX.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Workshop nhỏ không bắt buộc giấy phép (NOT_REQUIRED)"],
            "critical_violations": [
                {"policy_code": "EVENT_COHERENCE", "issue": "Hình ảnh đại diện (bàn nhậu bia rượu) mâu thuẫn hoàn toàn với chủ đề Workshop UI/UX.", "highlighted_text": "MAIN_POSTER: Ảnh chụp bàn nhậu... nhiều vỏ chai bia"}
            ],
            "warnings": [],
            "suggestions": ["Chuẩn bị Poster mang chủ đề thiết kế Figma/UI-UX cho sự kiện."],
        },
        criteria_count=6,
    ))

    # A3: Ảnh selfie cá nhân trong phòng ngủ cho Hòa nhạc Cổ điển Thính phòng
    samples.append(_make_sample(
        9,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "LEGAL_PERMIT_AUTHENTICITY"],
        build_event_user_prompt(
            title="Đêm Hòa Nhạc Cổ Điển Thính Phòng: Giao Hưởng Mùa Thu",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="Saigon Chamber Ensemble",
            organizer_verified=True,
            tags=["cổ điển", "giao hưởng", "thính phòng"],
            short_desc="Đêm nhạc trình diễn các tác phẩm bất hủ của Mozart và Chopin.",
            description="Trình diễn tứ tấu đàn dây và dương cầm cổ điển trong khán phòng tiêu chuẩn âm học tại TP.HCM.",
            permits=[{"file_name": "Chap-thuan-bieu-dien-hoa-nhac-co-dien.pdf"}],
            sessions=[{"name": "Đêm diễn chính", "start": "2026-08-22 19:30", "end": "2026-08-22 21:30", "venue_address": "Nhạc viện TP.HCM, 112 Nguyễn Du, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Khán Phòng", "price": 500000, "qty": 250, "seated": True}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh selfie cá nhân một người giơ điện thoại chụp trước gương trong phòng ngủ thiếu ánh sáng, không có nội dung âm nhạc hay sự kiện.",
                    "extracted_text": "",
                    "is_relevant": False,
                    "safety_flags": ["PERSONAL_SELFIE"],
                }
            ],
            document_items=[
                {
                    "file_name": "Chap-thuan-bieu-dien-hoa-nhac-co-dien.pdf",
                    "relevance_score": 92,
                    "body": "Giấy chấp thuận tổ chức biểu diễn nghệ thuật Đêm Hòa Nhạc Cổ Điển Thính Phòng tại Nhạc viện TP.HCM cấp cho Saigon Chamber Ensemble.",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 78,
            "quality_score": 36,
            "summary": "Từ chối vì Main Poster là ảnh selfie cá nhân trong phòng ngủ, không liên quan đến Đêm Hòa Nhạc Cổ Điển dù văn bản giấy phép hợp lệ.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề đêm nhạc cổ điển rõ ràng, trang nhã.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp chương trình hòa nhạc thính phòng.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Ảnh selfie cá nhân trước gương không phù hợp làm Poster hòa nhạc thính phòng.",
                        "Bối cảnh phòng ngủ cá nhân, hoàn toàn không có yếu tố nhạc cụ hay sân khấu cổ điển.",
                        "Không có chữ tiêu đề hay tên ban nhạc.",
                        "Không có văn bản cần giải mã.",
                        "Vi phạm quy chuẩn hình ảnh do dùng ảnh selfie cá nhân lạc đề.",
                        [],
                        ["Dùng ảnh selfie cá nhân làm Poster chính."],
                        "Thay thế bằng ảnh poster hòa nhạc có tên chương trình và nghệ sĩ.",
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [_doc_item("Chap-thuan-bieu-dien-hoa-nhac-co-dien.pdf", "VALID", "HIGH", "Giấy chấp thuận biểu diễn tại Nhạc viện TP.HCM hợp lệ.")],
            },
            "compliant_checks": ["Giấy chấp thuận biểu diễn tại Nhạc viện TP.HCM hợp lệ"],
            "critical_violations": [
                {"policy_code": "IMAGE_POLICY", "issue": "Poster chính sử dụng ảnh selfie cá nhân trong phòng ngủ lạc đề hoàn toàn với hòa nhạc thính phòng.", "highlighted_text": "MAIN_POSTER: Ảnh selfie cá nhân... trước gương trong phòng ngủ"}
            ],
            "warnings": [],
            "suggestions": ["Tải lên Poster hòa nhạc chính thức thay cho ảnh selfie cá nhân."],
        },
        criteria_count=7,
    ))

    # A4: Screenshot desktop / code lỗi rác làm Banner + Poster cho giải chạy cộng đồng
    samples.append(_make_sample(
        10,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "EVENT_REALISM_FEASIBILITY"],
        build_event_user_prompt(
            title="Ngày Hội Chạy Bộ Kết Nối Sức Khỏe Cộng Đồng 2026",
            category="Thể thao (the-thao)",
            organizer_name="GreenStep Club",
            organizer_verified=True,
            tags=["chạy bộ", "cộng đồng", "sức khỏe"],
            short_desc="Sự kiện chạy bộ 5km thư giãn cuối tuần tại công viên.",
            description="Hoạt động chạy bộ giao lưu cuối tuần 5km quanh công viên Gia Định dành cho cộng đồng yêu thể thao, không thu phí.",
            sessions=[{"name": "Chạy buổi sáng", "start": "2026-07-19 06:00", "end": "2026-07-19 08:30", "venue_address": "Công viên Gia Định, Hoàng Minh Giám, Phú Nhuận, TP.HCM"}],
            tickets=[{"name": "Vé Miễn Phí 5km", "price": 0, "qty": 150}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh chụp màn hình máy tính hiển thị cửa sổ trình duyệt báo lỗi 502 Bad Gateway và giao diện code terminal đen trắng.",
                    "extracted_text": "502 Bad Gateway nginx localhost:3000",
                    "is_relevant": False,
                    "safety_flags": ["IRRELEVANT_SCREENSHOT"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 80,
            "quality_score": 28,
            "summary": "Từ chối vì ảnh Poster là ảnh chụp màn hình máy tính báo lỗi 502 và terminal code, không liên quan đến sự kiện chạy bộ.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng sự kiện chạy bộ cộng đồng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp hoạt động chạy bộ công viên.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Ảnh chụp màn hình báo lỗi hệ thống là ảnh rác/tải nhầm (is_event_poster_or_relevant_banner=false).",
                        "Giao diện cửa sổ màn hình báo lỗi web không có bối cảnh thể thao hay chạy bộ.",
                        "Văn bản hiển thị '502 Bad Gateway nginx localhost:3000'.",
                        "Không có nội dung sự kiện bằng tiếng Việt.",
                        "Ảnh chụp màn hình kỹ thuật rác làm sai lệch hình ảnh sự kiện.",
                        [_txt("502 Bad Gateway nginx localhost:3000", "NORMAL", "HIGH", "NONE", False)],
                        ["Tải nhầm ảnh chụp màn hình lỗi kỹ thuật thay cho Poster chạy bộ."],
                        "Tải lên Poster hoạt động chạy bộ thể thao tại Công viên Gia Định.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Hoạt động giao lưu quy mô nhỏ miễn phí không bắt buộc giấy phép (NOT_REQUIRED)"],
            "critical_violations": [
                {"policy_code": "EVENT_COHERENCE", "issue": "Main Poster là ảnh chụp màn hình báo lỗi '502 Bad Gateway', hoàn toàn không liên quan sự kiện chạy bộ.", "highlighted_text": "MAIN_POSTER: 502 Bad Gateway nginx localhost:3000"}
            ],
            "warnings": [],
            "suggestions": ["Cập nhật Poster đúng chủ đề chạy bộ trước khi gửi duyệt lại."],
        },
        criteria_count=6,
    ))

    # A5: Phong cảnh/đồ ăn ngẫu nhiên không có chữ sự kiện + Diễn đàn AI (lạc đề)
    samples.append(_make_sample(
        11,
        ["IMAGE_POLICY", "EVENT_COHERENCE", "VALUABLE_SUGGESTIONS"],
        build_event_user_prompt(
            title="Diễn Đàn Nghiên Cứu Trí Tuệ Nhân Tạo Việt Nam 2026",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="Viện Công Nghệ Số",
            organizer_verified=True,
            tags=["AI", "nghiên cứu", "diễn đàn"],
            short_desc="Kết nối nhà nghiên cứu AI và doanh nghiệp công nghệ trong nước.",
            description="Trình bày 10 báo cáo khoa học về mô hình ngôn ngữ lớn tiếng Việt và thị giác máy tính trong công nghiệp.",
            sessions=[{"name": "Phiên khoa học", "start": "2026-09-10 08:30", "end": "2026-09-10 17:00", "venue_address": "Đại học Bách Khoa Hà Nội, Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội"}],
            tickets=[{"name": "Vé Nghiên Cứu Sinh", "price": 100000, "qty": 200}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh chụp cận cảnh một tô bún bò Huế với rau sống và đũa trên bàn quán ăn bình dân, không có chữ hay yếu tố công nghệ nào.",
                    "extracted_text": "",
                    "is_relevant": False,
                    "safety_flags": ["OFF_TOPIC_FOOD_PHOTO"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 78,
            "quality_score": 34,
            "summary": "Từ chối vì Main Poster là ảnh tô bún bò trên bàn ăn, không hề liên quan đến Diễn Đàn Trí Tuệ Nhân Tạo Việt Nam.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề diễn đàn khoa học rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả chi tiết nội dung học thuật AI tiếng Việt.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Ảnh món ăn quán bình dân hoàn toàn lạc đề với diễn đàn khoa học công nghệ AI.",
                        "Cận cảnh tô bún bò trên bàn ăn, không chứa thông tin hay phong cách hội nghị công nghệ.",
                        "Không có chữ in nào trên ảnh.",
                        "Không có văn bản cần giải mã.",
                        "Vi phạm chính sách đồng bộ chủ đề và chất lượng ảnh sự kiện.",
                        [],
                        ["Ảnh đồ ăn ngẫu nhiên không liên quan đến Diễn đàn Trí tuệ Nhân tạo."],
                        "Tải lên Poster diễn đàn khoa học AI có tên chương trình và đơn vị tổ chức.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Địa điểm tổ chức tại ĐH Bách Khoa Hà Nội cụ thể qua bảng venues"],
            "critical_violations": [
                {"policy_code": "EVENT_COHERENCE", "issue": "Poster chính sử dụng ảnh đồ ăn (tô bún bò) không ăn nhập với Diễn đàn Trí tuệ Nhân tạo.", "highlighted_text": "MAIN_POSTER: Ảnh chụp cận cảnh một tô bún bò Huế"}
            ],
            "warnings": [],
            "suggestions": ["Thay Poster đúng chủ đề công nghệ AI trước khi gửi duyệt lại."],
        },
        criteria_count=7,
    ))

    # ==========================================================================
    # NHÓM B: CHẶN TÀI LIỆU LẠC ĐỀ / GIẢ MẠO (DOCUMENT_REVIEW ĐỘC LẬP)
    # ==========================================================================

    # B1: Đại nhạc hội nộp PDF từ vựng IELTS + IPA
    samples.append(_make_sample(
        12,
        ["LEGAL_PERMIT_AUTHENTICITY", "EVENT_COHERENCE", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Đại Nhạc Hội Mùa Hè SoundFest 2026",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="SoundFest Live Entertainment",
            organizer_verified=True,
            tags=["đại nhạc hội", "soundfest", "edm"],
            short_desc="Lễ hội âm nhạc ngoài trời quy tụ 10 nghệ sĩ hàng đầu.",
            description="Đại nhạc hội quy mô 5.000 khán giả tại TP.HCM với sân khấu âm thanh ánh sáng ngoài trời và khu vực kiểm tra an ninh PCCC đầy đủ.",
            permits=[{"file_name": "vocabulary_ielts_band8.pdf"}],
            requires_strict_permit=True,
            sessions=[{"name": "Đêm hội chính", "start": "2026-08-29 17:00", "end": "2026-08-29 23:00", "venue_address": "Sân vận động Phú Thọ, Số 1 Lữ Gia, Quận 11, TP.HCM"}],
            tickets=[{"name": "Vé GA", "price": 690000, "qty": 3000}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster sân khấu âm nhạc ánh sáng rực rỡ với tên sự kiện SoundFest 2026 và ngày 29/08.",
                    "extracted_text": "SOUNDFEST 2026 - 29.08 - SÂN VẬN ĐỘNG PHÚ THỌ",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "vocabulary_ielts_band8.pdf",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: Part of Speech & Vocabulary Word List: 1. Education (noun) /ˌɛdʒʊˈkeɪʃən/ - giáo dục; 2. Environment (noun) /ɪnˈvaɪrənmənt/ - môi trường...",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 94,
            "quality_score": 20,
            "summary": "Từ chối do tệp giấy phép đính kèm là bảng từ vựng IELTS kèm phiên âm IPA, hoàn toàn không liên quan đến Đại nhạc hội SoundFest 2026.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề đại nhạc hội rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp quy mô đại nhạc hội.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster đại nhạc hội khớp tên chương trình, ngày tổ chức và địa điểm Sân vận động Phú Thọ.",
                        "Sân khấu âm nhạc ngoài trời ánh sáng chuyên nghiệp.",
                        "Chữ rõ ràng 'SOUNDFEST 2026 - 29.08 - SÂN VẬN ĐỘNG PHÚ THỌ'.",
                        "Đọc chính xác văn bản poster tiếng Việt có dấu.",
                        "Hình ảnh an toàn, khớp thông tin sự kiện.",
                        [_txt("SOUNDFEST 2026 - 29.08 - SÂN VẬN ĐỘNG PHÚ THỌ", "3D_EFFECT", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "vocabulary_ielts_band8.pdf",
                        "VIOLATION", "IRRELEVANT",
                        "Nội dung tệp là danh sách từ vựng tiếng Anh kèm từ loại và phiên âm IPA, không phải giấy phép tổ chức đại nhạc hội.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "Part of Speech & Vocabulary Word List: 1. Education (noun) /ˌɛdʒʊˈkeɪʃən/",
                        ["Tài liệu đính kèm chứa bảng từ vựng ngoại ngữ lạc đề."],
                        "Tải lên Giấy phép biểu diễn nghệ thuật do Sở VH&TT TP.HCM cấp cho đại nhạc hội SoundFest 2026.",
                    )
                ],
            },
            "compliant_checks": ["Poster chính thể hiện đúng sự kiện SoundFest 2026"],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [vocabulary_ielts_band8.pdf]: Tệp đính kèm là danh sách từ vựng IELTS kèm IPA lạc đề, không phải văn bản pháp lý hợp lệ.",
                    "highlighted_text": "Part of Speech & Vocabulary Word List: 1. Education (noun) /ˌɛdʒʊˈkeɪʃən/",
                }
            ],
            "warnings": [],
            "suggestions": ["Cung cấp đúng Giấy phép biểu diễn đại nhạc hội và phương án PCCC theo quy định."],
        },
        criteria_count=7,
    ))

    # B2: Triển lãm nghệ thuật nộp nhầm file DOCX giáo án Toán lớp 10
    samples.append(_make_sample(
        13,
        ["LEGAL_PERMIT_AUTHENTICITY", "EVENT_COHERENCE", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Triển Lãm Nghệ Thuật Đương Đại: Sắc Màu Đô Thị",
            category="Nghệ thuật & Văn hóa (nghe-thuat)",
            organizer_name="Urban Gallery Saigon",
            organizer_verified=True,
            tags=["triển lãm", "nghệ thuật", "sài gòn"],
            short_desc="Triển lãm 40 tác phẩm hội họa sắp đặt đương đại.",
            description="Trưng bày tác phẩm của 12 họa sĩ trẻ khắc họa nhịp sống đô thị đương đại.",
            permits=[{"file_name": "giao_an_toan_10.docx", "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}],
            sessions=[{"name": "Ngày khai mạc", "start": "2026-09-05 09:00", "end": "2026-09-05 18:00", "venue_address": "15 Nguyễn Ư Dĩ, Thảo Điền, TP. Thủ Đức, TP.HCM"}],
            tickets=[{"name": "Vé Tham Quan", "price": 90000, "qty": 300}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster triển lãm tranh nghệ thuật tối giản với tác phẩm sơn dầu hiện đại và chữ Sắc Màu Đô Thị.",
                    "extracted_text": "TRIỂN LÃM SẮC MÀU ĐÔ THỊ - URBAN GALLERY",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "giao_an_toan_10.docx",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: GIÁO ÁN ĐẠI SỐ 10 - Tiết 14: Phương trình bậc hai. I. Mục tiêu bài học... Câu 1: Giải phương trình... Đáp án: A.",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 90,
            "quality_score": 26,
            "summary": "Từ chối vì tài liệu đính kèm trong mục giấy phép là giáo án giảng dạy môn Toán lớp 10, không liên quan đến triển lãm nghệ thuật.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề triển lãm nghệ thuật rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp nội dung trưng bày mỹ thuật.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster triển lãm mỹ thuật bố cục tối giản, khớp chủ đề Sắc Màu Đô Thị.",
                        "Không gian trưng bày tranh sơn dầu đương đại.",
                        "Chữ rõ ràng 'TRIỂN LÃM SẮC MÀU ĐÔ THỊ - URBAN GALLERY'.",
                        "Đọc chuẩn tên triển lãm tiếng Việt.",
                        "Hình ảnh an toàn, phù hợp triển lãm.",
                        [_txt("TRIỂN LÃM SẮC MÀU ĐÔ THỊ", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "giao_an_toan_10.docx",
                        "VIOLATION", "IRRELEVANT",
                        "Tệp đính kèm là giáo án giảng dạy Đại số 10 kèm câu hỏi và đáp án, hoàn toàn không phải giấy phép triển lãm.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "GIÁO ÁN ĐẠI SỐ 10 - Tiết 14: Phương trình bậc hai. I. Mục tiêu bài học... Câu 1... Đáp án: A.",
                        ["Nộp giáo án bài giảng trường học vào hồ sơ pháp lý sự kiện."],
                        "Xóa tệp giáo án và thay bằng công văn chấp thuận triển lãm hoặc hợp đồng địa điểm hợp lệ.",
                    )
                ],
            },
            "compliant_checks": ["Poster chính khớp thông tin triển lãm"],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [giao_an_toan_10.docx]: Tài liệu đính kèm là giáo án Đại số 10 lạc đề, không phải văn bản pháp lý sự kiện.",
                    "highlighted_text": "GIÁO ÁN ĐẠI SỐ 10 - Tiết 14: Phương trình bậc hai... Câu 1... Đáp án: A",
                }
            ],
            "warnings": [],
            "suggestions": ["Kiểm tra lại đúng tệp pháp lý trước khi tải lên mục giấy phép."],
        },
        criteria_count=8,
    ))

    # B3: Hội thảo khởi nghiệp nộp bài tập sinh viên
    samples.append(_make_sample(
        14,
        ["LEGAL_PERMIT_AUTHENTICITY", "EVENT_COHERENCE", "TERMS_ORGANIZER"],
        build_event_user_prompt(
            title="Hội Thảo Khởi Nghiệp EdTech Việt Nam 2026",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="EdTech Hub VN",
            organizer_verified=True,
            tags=["edtech", "startup", "hội thảo"],
            short_desc="Chia sẻ bài học gọi vốn cho startup công nghệ giáo dục.",
            description="Kết nối nhà sáng lập startup EdTech với các quỹ đầu tư thiên thần trong nước.",
            permits=[{"file_name": "bai_tap_ve_nha_sinh_vien.pdf"}],
            sessions=[{"name": "Phiên gọi vốn", "start": "2026-07-30 14:00", "end": "2026-07-30 17:30", "venue_address": "123 Lê Lợi, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Tham Dự", "price": 120000, "qty": 100}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster hội thảo startup EdTech tông xanh cam chuyên nghiệp với logo EdTech Hub VN.",
                    "extracted_text": "EDTECH STARTUP VIETNAM 2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "bai_tap_ve_nha_sinh_vien.pdf",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: BÀI TẬP VỀ NHÀ MÔN KINH TẾ VI MÔ - Sinh viên thực hiện: Nguyễn Văn A (MSSV: 21520123). Câu 1: Phân tích đường cung cầu...",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 89,
            "quality_score": 28,
            "summary": "Từ chối vì tài liệu giấy phép đính kèm là bài tập về nhà môn Kinh tế vi mô của sinh viên, không có giá trị pháp lý cho sự kiện.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề hội thảo EdTech rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp hội thảo khởi nghiệp.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster hội thảo công nghệ giáo dục rõ nét, đồng bộ tên đơn vị.",
                        "Đồ họa khởi nghiệp hiện đại tông xanh cam.",
                        "Chữ 'EDTECH STARTUP VIETNAM 2026'.",
                        "Chữ tiếng Anh/tiếng Việt rõ nét.",
                        "Hình ảnh an toàn, đúng chủ đề.",
                        [_txt("EDTECH STARTUP VIETNAM 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "bai_tap_ve_nha_sinh_vien.pdf",
                        "VIOLATION", "IRRELEVANT",
                        "Nội dung tệp là bài tập môn học có tên sinh viên và MSSV, không phải giấy phép tổ chức hay hợp đồng địa điểm.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "BÀI TẬP VỀ NHÀ MÔN KINH TẾ VI MÔ - Sinh viên thực hiện: Nguyễn Văn A (MSSV: 21520123)",
                        ["Đính kèm bài tập sinh viên lạc đề vào hồ sơ giấy phép."],
                        "Gỡ tệp bài tập sinh viên; hội thảo quy mô nhỏ không bắt buộc nộp giấy phép nếu không có văn bản hành chính.",
                    )
                ],
            },
            "compliant_checks": ["Poster hội thảo phù hợp"],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [bai_tap_ve_nha_sinh_vien.pdf]: Tệp đính kèm là bài tập về nhà của sinh viên, hoàn toàn không phải văn bản pháp lý sự kiện.",
                    "highlighted_text": "BÀI TẬP VỀ NHÀ MÔN KINH TẾ VI MÔ - MSSV: 21520123",
                }
            ],
            "warnings": [],
            "suggestions": ["Chỉ đính kèm văn bản pháp lý thật của sự kiện hoặc để trống nếu hội thảo nhỏ thuộc diện miễn giấy phép."],
        },
        criteria_count=6,
    ))

    # B4: Lễ hội ẩm thực & âm nhạc nộp ảnh hóa đơn quán ăn thay cho giấy phép
    samples.append(_make_sample(
        15,
        ["LEGAL_PERMIT_AUTHENTICITY", "ORGANIZER_LEGAL_COMPLIANCE", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Lễ Hội Ẩm Thực & Âm Nhạc Phố Cổ 2026",
            category="Lễ hội & Văn hóa (le-hoi-van-hoa)",
            organizer_name="Phố Cổ Event JSC",
            organizer_verified=True,
            tags=["lễ hội", "ẩm thực", "âm nhạc"],
            short_desc="Trải nghiệm 50 gian hàng ẩm thực đường phố và sân khấu acoustic.",
            description="Sự kiện văn hóa ẩm thực ngoài trời tại phố đi bộ dành cho người dân và du khách tham quan thưởng thức âm nhạc.",
            permits=[{"file_name": "hoa_don_ban_le_quan_an.jpg", "type": "image/jpeg"}],
            requires_strict_permit=True,
            sessions=[{"name": "Ngày hội 1", "start": "2026-09-12 16:00", "end": "2026-09-12 22:00", "venue_address": "Quảng trường Đông Kinh Nghĩa Thục, Hoàn Kiếm, Hà Nội"}],
            tickets=[{"name": "Vé Combo Ẩm Thực", "price": 150000, "qty": 800}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster lễ hội ẩm thực đèn lồng rực rỡ cùng sân khấu ca nhạc đường phố tại Hà Nội.",
                    "extracted_text": "LỄ HỘI ẨM THỰC & ÂM NHẠC PHỐ CỔ 2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "hoa_don_ban_le_quan_an.jpg",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: HÓA ĐƠN THANH TOÁN QUÁN LẨU X - Bàn số 04: Lẩu thái hải sản (450.000đ), Bia chai (400.000đ). Tổng thanh toán: 850.000đ.",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 91,
            "quality_score": 24,
            "summary": "Từ chối vì tài liệu giấy phép đính kèm là hóa đơn bán lẻ quán ăn, không phải giấy phép tổ chức lễ hội ngoài trời của cơ quan chức năng.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề lễ hội rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp lễ hội ẩm thực văn hóa.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster lễ hội đèn lồng ẩm thực đẹp mắt và khớp thông tin.",
                        "Bối cảnh phố cổ rực rỡ đèn lồng phù hợp chủ đề văn hóa.",
                        "Chữ tiêu đề 'LỄ HỘI ẨM THỰC & ÂM NHẠC PHỐ CỔ 2026'.",
                        "Văn bản tiếng Việt chính xác.",
                        "Poster an toàn, hợp lệ.",
                        [_txt("LỄ HỘI ẨM THỰC & ÂM NHẠC PHỐ CỔ 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "hoa_don_ban_le_quan_an.jpg",
                        "VIOLATION", "IRRELEVANT",
                        "Hình ảnh đính kèm trong mục giấy phép là hóa đơn thanh toán bàn ăn quán lẩu, không có giá trị pháp lý tổ chức lễ hội ngoài trời.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "HÓA ĐƠN THANH TOÁN QUÁN LẨU X - Bàn số 04: Lẩu thái hải sản (450.000đ)... Tổng thanh toán: 850.000đ",
                        ["Nộp hóa đơn ăn uống cá nhân thay thế giấy phép tổ chức lễ hội."],
                        "Tải lên công văn chấp thuận tổ chức lễ hội của UBND/Sở VH&TT Hà Nội.",
                    )
                ],
            },
            "compliant_checks": ["Poster chính khớp chủ đề lễ hội"],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [hoa_don_ban_le_quan_an.jpg]: Tệp đính kèm là hóa đơn bán lẻ quán ăn lạc đề, không phải giấy phép tổ chức lễ hội.",
                    "highlighted_text": "HÓA ĐƠN THANH TOÁN QUÁN LẨU X - Bàn số 04... Tổng thanh toán: 850.000đ",
                }
            ],
            "warnings": [],
            "suggestions": ["Bổ sung giấy phép tổ chức lễ hội ngoài trời và chứng nhận an toàn thực phẩm/PCCC."],
        },
        criteria_count=8,
    ))

    # B5: Live Concert Đà Lạt nộp nhầm giấy phép của Giải chạy Marathon năm cũ của đơn vị khác
    samples.append(_make_sample(
        16,
        ["LEGAL_PERMIT_AUTHENTICITY", "EVENT_COHERENCE", "TERMS_ORGANIZER"],
        build_event_user_prompt(
            title="Live Concert Hoàng Hôn Đà Lạt 2026",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="Công ty TNHH Ánh Dương Events",
            organizer_verified=True,
            tags=["live concert", "đà lạt", "âm nhạc"],
            short_desc="Đêm nhạc giữa rừng thông hoàng hôn Đà Lạt.",
            description="Live concert quy mô 2.000 khán giả với dàn nhạc sống và ca sĩ khách mời trên đồi thông Đà Lạt.",
            permits=[{"file_name": "giay_phep_to_chuc_giai_chay_2024.pdf"}],
            requires_strict_permit=True,
            sessions=[{"name": "Đêm Concert", "start": "2026-08-15 17:00", "end": "2026-08-15 21:30", "venue_address": "Thung lũng Vàng, Lạc Dương, Lâm Đồng"}],
            tickets=[{"name": "Vé Đồi Thông", "price": 750000, "qty": 1000}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster hoàng hôn đồi thông Đà Lạt với sân khấu gỗ ngoài trời và dòng chữ Live Concert Hoàng Hôn Đà Lạt 2026.",
                    "extracted_text": "LIVE CONCERT HOÀNG HÔN ĐÀ LẠT 2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "giay_phep_to_chuc_giai_chay_2024.pdf",
                    "violation_type": "IRRELEVANT_OR_FAKE_DOCUMENT",
                    "relevance_score": 0,
                    "is_violation": True,
                    "body": "[VI PHẠM NỘI DUNG TÀI LIỆU]: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM - Công văn năm 2024 chấp thuận cho Công ty ABC Sports tổ chức Giải chạy Marathon Mùa Xuân 2024 tại Cần Thơ.",
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 90,
            "quality_score": 25,
            "summary": "Từ chối vì tài liệu đính kèm là công văn năm 2024 của một Giải chạy Marathon tại Cần Thơ do đơn vị khác tổ chức, hoàn toàn sai lệch với Live Concert Đà Lạt 2026.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề live concert rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp concert ngoài trời tại Đà Lạt.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster phù hợp chủ đề đêm nhạc đồi thông Đà Lạt.",
                        "Khung cảnh hoàng hôn đồi thông chuyên nghiệp.",
                        "Chữ rõ ràng 'LIVE CONCERT HOÀNG HÔN ĐÀ LẠT 2026'.",
                        "Văn bản rõ nét đúng tên sự kiện.",
                        "Hình ảnh an toàn, khớp thông tin.",
                        [_txt("LIVE CONCERT HOÀNG HÔN ĐÀ LẠT 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "VIOLATION",
                "items": [
                    _doc_item(
                        "giay_phep_to_chuc_giai_chay_2024.pdf",
                        "VIOLATION", "IRRELEVANT",
                        "Mặc dù có hình thức công văn hành chính nhưng nội dung cấp cho Công ty ABC Sports tổ chức Giải chạy Marathon 2024 tại Cần Thơ, không khớp Ánh Dương Events hay Live Concert Đà Lạt 2026.",
                        "IRRELEVANT_OR_FAKE_DOCUMENT",
                        "chấp thuận cho Công ty ABC Sports tổ chức Giải chạy Marathon Mùa Xuân 2024 tại Cần Thơ",
                        ["Nộp giấy phép của sự kiện khác và đơn vị khác từ năm 2024."],
                        "Tải lên đúng giấy phép biểu diễn năm 2026 đứng tên Công ty TNHH Ánh Dương Events tại tỉnh Lâm Đồng.",
                    )
                ],
            },
            "compliant_checks": ["Poster khớp chủ đề đêm nhạc Đà Lạt"],
            "critical_violations": [
                {
                    "policy_code": "LEGAL_PERMIT_AUTHENTICITY",
                    "issue": "[Vi phạm tài liệu] [giay_phep_to_chuc_giai_chay_2024.pdf]: Nộp công văn của sự kiện Giải chạy Marathon 2024 (Công ty ABC Sports), sai khác hoàn toàn với Live Concert Hoàng Hôn Đà Lạt 2026.",
                    "highlighted_text": "Công ty ABC Sports tổ chức Giải chạy Marathon Mùa Xuân 2024 tại Cần Thơ",
                }
            ],
            "warnings": [],
            "suggestions": ["Cung cấp đúng giấy phép biểu diễn do Sở VH&TT&DL Lâm Đồng cấp cho Ánh Dương Events."],
        },
        criteria_count=8,
    ))

    # ==========================================================================
    # NHÓM C: HARD NEGATIVES - CHỐNG BẮT NHẦM SỰ KIỆN HỢP LỆ
    # ==========================================================================

    # C1: Workshop nhỏ không giấy phép (NOT_REQUIRED) -> APPROVE
    samples.append(_make_sample(
        17,
        ["LEGAL_PERMIT_AUTHENTICITY", "TERMS_ORGANIZER", "TICKET_POLICY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Workshop Làm Gốm Thủ Công Cuối Tuần",
            category="Nghệ thuật & Thủ công (nghe-thuat)",
            organizer_name="Tiệm Gốm Bàn Xoay",
            organizer_verified=True,
            organizer_desc="Không gian trải nghiệm gốm thủ công tại TP.HCM.",
            tags=["workshop", "làm gốm", "cuối tuần"],
            short_desc="Tự tay nặn gốm bàn xoay và mang thành phẩm về nhà.",
            description="Workshop trải nghiệm thực tế dành cho tối đa 25 khách mỗi buổi, đã bao gồm đất sét, màu men và chi phí nung sản phẩm. Hỗ trợ check-in mã QR EventHub tại cửa.",
            permits=[],
            requires_strict_permit=False,
            sessions=[{"name": "Buổi chiều T7", "start": "2026-07-11 14:00", "end": "2026-07-11 16:30", "venue_address": "42 Xuân Thủy, Thảo Điền, TP. Thủ Đức, TP.HCM"}],
            tickets=[{"name": "Vé Trải Nghiệm Gốm", "price": 350000, "qty": 25}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh đôi bàn tay nghệ nhân nặn bình gốm trên bàn xoay trong studio ngập nắng với tiêu đề Workshop Làm Gốm Thủ Công.",
                    "extracted_text": "WORKSHOP LÀM GỐM THỦ CÔNG - TIỆM GỐM BÀN XOAY",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 4,
            "quality_score": 93,
            "summary": "Workshop thủ công quy mô nhỏ an toàn, thông tin minh bạch, poster khớp chủ đề và không thuộc nhóm sự kiện bắt buộc giấy phép.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề workshop rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả đầy đủ quyền lợi dụng cụ và hình thức check-in QR.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster chụp thực tế bàn xoay gốm rõ nét, đồng bộ với chủ đề workshop.",
                        "Không gian studio thủ công ấm cúng tự nhiên.",
                        "Chữ rõ ràng 'WORKSHOP LÀM GỐM THỦ CÔNG - TIỆM GỐM BÀN XOAY'.",
                        "Văn bản tiếng Việt rõ nét.",
                        "Hình ảnh an toàn, phù hợp chủ đề.",
                        [_txt("WORKSHOP LÀM GỐM THỦ CÔNG", "HANDWRITTEN", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Workshop thủ công quy mô 25 người không bắt buộc giấy phép nhà nước (NOT_REQUIRED)",
                "Địa điểm cụ thể tại Thảo Điền xác thực qua bảng venues",
                "Poster và thông tin vé minh bạch",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # C2: Webinar Online không địa chỉ vật lý & không giấy phép -> APPROVE
    samples.append(_make_sample(
        18,
        ["TICKET_POLICY", "LEGAL_PERMIT_AUTHENTICITY", "SESSION_SCHEDULE", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Webinar Lộ Trình Nghề Nghiệp AI Engineer 2026",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="DataScience Vietnam",
            organizer_verified=True,
            event_format="ONLINE",
            tags=["webinar", "online", "ai engineer"],
            short_desc="Chia sẻ kỹ năng toán, ML và MLOps cho sinh viên IT.",
            description="Buổi chia sẻ trực tuyến qua Zoom với kỹ sư AI cấp cao giải đáp trực tiếp Q&A và gửi link phòng họp qua email EventHub trước giờ diễn ra 1 tiếng.",
            permits=[],
            requires_strict_permit=False,
            sessions=[{"name": "Phiên Zoom Online", "start": "2026-07-16 20:00", "end": "2026-07-16 21:30", "venue_address": None}],
            tickets=[{"name": "Vé Online Miễn Phí", "price": 0, "qty": 500}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Banner trực tuyến hiện đại có ảnh diễn giả, chủ đề Webinar AI Engineer 2026 và biểu tượng nền tảng Zoom.",
                    "extracted_text": "WEBINAR LỘ TRÌNH AI ENGINEER 2026 - ONLINE ZOOM",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 5,
            "quality_score": 94,
            "summary": "Webinar trực tuyến hợp lệ hoàn toàn; hình thức ONLINE không yêu cầu địa chỉ đường phố vật lý và không bắt buộc giấy phép.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề webinar công nghệ rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả rõ quy trình gửi link Zoom và nội dung học thuật.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster giới thiệu webinar rõ nét, khớp định dạng ONLINE.",
                        "Thiết kế banner sự kiện trực tuyến hiện đại.",
                        "Chữ rõ ràng 'WEBINAR LỘ TRÌNH AI ENGINEER 2026 - ONLINE ZOOM'.",
                        "Chữ tiếng Việt chuẩn có dấu.",
                        "Hình ảnh an toàn, khớp thông tin webinar.",
                        [_txt("WEBINAR LỘ TRÌNH AI ENGINEER 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Định dạng ONLINE tổ chức qua Zoom nên không yêu cầu địa chỉ vật lý",
                "Webinar trực tuyến thuộc nhóm miễn giấy phép (NOT_REQUIRED)",
                "Lịch trình và vé miễn phí minh bạch",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # C3: OFFLINE có venue_id trong sessions, mô tả HTML KHÔNG nhắc lại địa chỉ -> KHÔNG báo lỗi giả thiếu địa điểm!
    samples.append(_make_sample(
        19,
        ["TICKET_POLICY", "SESSION_SCHEDULE", "IMAGE_POLICY", "VALUABLE_SUGGESTIONS"],
        build_event_user_prompt(
            title="Hội Thảo Kiến Trúc Cloud Microservices Thực Tế",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="CloudNative Saigon",
            organizer_verified=True,
            tags=["cloud", "microservices", "devops"],
            short_desc="Phân tích bài toán mở rộng hệ thống Kubernetes quy mô lớn.",
            description="Chương trình tập trung vào kiến trúc Event-Driven, tối ưu chi phí vận hành cụm Kubernetes và giám sát Observability trong sản xuất. Khách tham dự quét mã QR EventHub tại quầy lễ tân.",
            permits=[],
            requires_strict_permit=False,
            sessions=[{"name": "Tech Talk", "start": "2026-08-01 09:00", "end": "2026-08-01 12:00", "venue_id": "v-hub-09", "venue_address": "VNG Campus, Đường Z06, Tân Thuận Đông, Quận 7, TP.HCM"}],
            tickets=[{"name": "Vé Engineer", "price": 100000, "qty": 180}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster kỹ thuật công nghệ với sơ đồ kiến trúc cloud tối giản và tên sự kiện Cloud Microservices.",
                    "extracted_text": "HỘI THẢO KIẾN TRÚC CLOUD MICROSERVICES - 01/08/2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 5,
            "quality_score": 92,
            "summary": "Hội thảo kỹ thuật hợp lệ; địa điểm tổ chức đã được khai báo đầy đủ qua venue_id tại VNG Campus nên không phát sinh lỗi thiếu địa chỉ.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề hội thảo kỹ thuật chuẩn xác.",
                "description_status": "VALID",
                "description_analysis": "Mô tả chuyên môn sâu về Microservices và hướng dẫn check-in QR.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster phù hợp hội thảo công nghệ và khớp ngày 01/08/2026.",
                        "Bối cảnh đồ họa công nghệ đám mây chuyên nghiệp.",
                        "Chữ rõ 'HỘI THẢO KIẾN TRÚC CLOUD MICROSERVICES - 01/08/2026'.",
                        "Chữ tiếng Việt rõ nét.",
                        "Hình ảnh an toàn, khớp thông tin.",
                        [_txt("HỘI THẢO KIẾN TRÚC CLOUD MICROSERVICES", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Địa điểm tổ chức tại VNG Campus (Quận 7, TP.HCM) đã được gắn venue_id hợp lệ trong sessions",
                "Hội thảo chia sẻ kỹ thuật không bắt buộc nộp giấy phép (NOT_REQUIRED)",
                "Lịch trình và giá vé minh bạch",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": ["Có thể bổ sung thêm danh sách diễn giả chi tiết và số hotline liên hệ cổng check-in."],
        },
        criteria_count=7,
    ))

    # C4: Giải bơi & chạy biển đồ bơi thể thao (Sensible Safety Moderation + Permit hợp lệ)
    samples.append(_make_sample(
        20,
        ["IMAGE_POLICY", "ORGANIZER_LEGAL_COMPLIANCE", "LEGAL_PERMIT_AUTHENTICITY", "CHECKIN_SECURITY_RULES"],
        build_event_user_prompt(
            title="Giải Chạy & Bơi Biển Nha Trang AquaRun 2026",
            category="Thể thao (the-thao)",
            organizer_name="AquaSports Vietnam",
            organizer_verified=True,
            tags=["aquathlon", "bơi biển", "nha trang"],
            short_desc="Giải hai môn phối hợp bơi biển 1km và chạy bộ ven biển 5km.",
            description="Giải thể thao chính quy có đội ngũ cứu hộ biển, phao tiêu dẫn đường, trạm y tế cấp cứu và quy định bắt buộc đeo phao an toàn khi bơi. Check-in nhận BIB bằng QR EventHub và CCCD.",
            permits=[{"file_name": "Quyet-dinh-cho-phep-to-chuc-Nha-Trang-AquaRun.pdf"}],
            requires_strict_permit=True,
            sessions=[{"name": "Ngày thi đấu", "start": "2026-08-30 05:30", "end": "2026-08-30 10:00", "venue_address": "Quảng trường 2 tháng 4, Trần Phú, Nha Trang, Khánh Hòa"}],
            tickets=[{"name": "Cự ly Aqua 6km", "price": 550000, "qty": 600}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Ảnh vận động viên nam và nữ mặc đồ bơi thể thao chuyên dụng đang sải bước từ bãi biển Nha Trang, mang kính bơi và mũ bơi thi đấu.",
                    "extracted_text": "NHA TRANG AQUARUN 2026 - SWIM & RUN",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "Quyet-dinh-cho-phep-to-chuc-Nha-Trang-AquaRun.pdf",
                    "relevance_score": 95,
                    "body": "UBND Tỉnh Khánh Hòa & Sở VH-TT ban hành Quyết định chấp thuận cho AquaSports Vietnam tổ chức Giải Chạy & Bơi Biển Nha Trang AquaRun 2026 kèm phương án cứu hộ y tế.",
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 5,
            "quality_score": 96,
            "summary": "Giải thể thao bơi chạy biển chuyên nghiệp có quyết định chấp thuận của UBND/Sở VH-TT Khánh Hòa và phương án cứu hộ đầy đủ; hình ảnh đồ bơi thể thao hoàn toàn hợp lệ.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề giải đấu rõ ràng.",
                "description_status": "VALID",
                "description_analysis": "Mô tả đầy đủ phương án cứu hộ biển, y tế và thủ tục nhận BIB qua CCCD.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Hình ảnh vận động viên mặc đồ bơi thi đấu bãi biển lành mạnh, phù hợp 100% giải Aquathlon.",
                        "Bối cảnh bãi biển ban mai với vận động viên mặc đồ bơi thi đấu thể thao chuyên dụng.",
                        "Chữ rõ ràng 'NHA TRANG AQUARUN 2026 - SWIM & RUN'.",
                        "Chữ rõ nét khớp tên giải đấu.",
                        "Áp dụng kiểm duyệt đúng ngữ cảnh: đồ bơi thể thao thi đấu ngoài trời hoàn toàn lành mạnh, không gắn mác nhạy cảm/18+.",
                        [_txt("NHA TRANG AQUARUN 2026 - SWIM & RUN", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [
                    _doc_item(
                        "Quyet-dinh-cho-phep-to-chuc-Nha-Trang-AquaRun.pdf",
                        "VALID", "HIGH",
                        "Quyết định chấp thuận từ cơ quan chức năng tỉnh Khánh Hòa khớp đúng tên giải đấu và AquaSports Vietnam.",
                    )
                ],
            },
            "compliant_checks": [
                "Quyết định chấp thuận tổ chức giải thể thao hợp lệ cùng phương án cứu hộ biển",
                "Hình ảnh đồ bơi vận động viên đúng ngữ cảnh thể thao chuyên nghiệp",
                "Quy trình nhận BIB và địa điểm Quảng trường 2/4 rõ ràng",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # C5: Triển lãm nghệ thuật 18+ có cảnh báo độ tuổi + giấy phép -> APPROVE (Sensible Moderation)
    samples.append(_make_sample(
        21,
        ["IMAGE_POLICY", "AGE_RESTRICTION_RATING", "LEGAL_PERMIT_AUTHENTICITY", "TERMS_ORGANIZER"],
        build_event_user_prompt(
            title="Triển Lãm Nghệ Thuật Đương Đại: Thân Phận (18+)",
            category="Nghệ thuật & Văn hóa (nghe-thuat)",
            organizer_name="Studio Mỹ Thuật Đương Đại",
            organizer_verified=True,
            tags=["triển lãm", "18+", "nghệ thuật"],
            short_desc="Triển lãm điêu khắc trừu tượng về thân phận con người dành cho khán giả 18+.",
            description="Trưng bày 25 tác phẩm điêu khắc và hội họa đương đại mang tính chiêm nghiệm sâu sắc. Giới hạn độ tuổi: Chỉ dành cho khán giả từ 18 tuổi trở lên, bắt buộc xuất trình CCCD khi vào cửa.",
            permits=[{"file_name": "Giay-phep-trien-lam-my-thuat-18plus.pdf"}],
            sessions=[{"name": "Phiên trưng bày", "start": "2026-09-18 10:00", "end": "2026-09-18 20:00", "venue_address": "Bảo tàng Mỹ thuật, 97A Phó Đức Chính, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Khán Giả 18+", "price": 180000, "qty": 200}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster triển lãm chụp tượng điêu khắc bán thân nghệ thuật trừu tượng bằng thạch cao trắng dưới ánh sáng bảo tàng trang trọng, có nhãn 18+ ở góc phải.",
                    "extracted_text": "TRIỂN LÃM THÂN PHẬN (18+) - BẢO TÀNG MỸ THUẬT",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
            document_items=[
                {
                    "file_name": "Giay-phep-trien-lam-my-thuat-18plus.pdf",
                    "relevance_score": 94,
                    "body": "Sở Văn hóa và Thể thao TP.HCM cấp Giấy phép triển lãm mỹ thuật Thân Phận (18+) cho Studio Mỹ Thuật Đương Đại tại Bảo tàng Mỹ thuật.",
                }
            ],
        ),
        {
            "decision": "APPROVE",
            "risk_score": 12,
            "quality_score": 91,
            "summary": "Triển lãm nghệ thuật đương đại có giấy phép Sở VH&TT hợp lệ, phân loại độ tuổi 18+ rõ ràng kèm CCCD, tác phẩm điêu khắc không vi phạm khiêu dâm.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề ghi rõ nhãn phân loại (18+) ngay từ đầu.",
                "description_status": "VALID",
                "description_analysis": "Nêu đầy đủ yêu cầu xuất trình CCCD và giới hạn khán giả từ 18 tuổi trở lên.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster tượng điêu khắc mỹ thuật trang trọng tại bảo tàng, hợp chuẩn nghệ thuật.",
                        "Không gian trưng bày mỹ thuật đương đại ánh sáng tương phản trang nhã.",
                        "Chữ rõ ràng 'TRIỂN LÃM THÂN PHẬN (18+) - BẢO TÀNG MỸ THUẬT'.",
                        "Văn bản tiếng Việt rõ nét.",
                        "Điêu khắc thạch cao nghệ thuật không phải khiêu dâm đồi trụy hay kích dục.",
                        [_txt("TRIỂN LÃM THÂN PHẬN (18+)", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {
                "overall_document_verdict": "SAFE",
                "items": [
                    _doc_item(
                        "Giay-phep-trien-lam-my-thuat-18plus.pdf",
                        "VALID", "HIGH",
                        "Giấy phép triển lãm mỹ thuật từ Sở VH&TT TP.HCM hợp lệ và đúng tên Studio Mỹ Thuật Đương Đại.",
                    )
                ],
            },
            "compliant_checks": [
                "Giấy phép triển lãm mỹ thuật của Sở VH&TT TP.HCM hợp lệ",
                "Công khai quy định giới hạn độ tuổi 18+ và kiểm tra CCCD tại cửa",
                "Tác phẩm nghệ thuật điêu khắc hợp lệ theo nguyên tắc kiểm duyệt đúng ngữ cảnh",
            ],
            "critical_violations": [],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # C6: Talkshow sinh viên sạch nhưng mắc 3 lỗi chính tả & thiếu hotline -> NEEDS_REVIEW (không REJECT!)
    samples.append(_make_sample(
        22,
        ["CONTENT_SPELLING", "VALUABLE_SUGGESTIONS", "LEGAL_PERMIT_AUTHENTICITY", "TICKET_POLICY"],
        build_event_user_prompt(
            title="Talkshow Khởi Nghiệp Sáng Tạo Sinh Viên 2026",
            category="Hội thảo & Giáo dục (hoi-thao-giao-duc)",
            organizer_name="CLB Khởi Nghiệp Bách Khoa",
            organizer_verified=True,
            tags=["talkshow", "sinh viên", "khởi nghiệp"],
            short_desc="Giao lưu chia sẽ hành trình lập nghiệp cho sinh viên năm cuối.",
            description="Buổi talkshow tồ chức giúp sinh viên nắm vững tư duy sản phẩm và kết nối các cố vấn khởi nghiệp trẻ tại TP.HCM.",
            sessions=[{"name": "Giao lưu sáng", "start": "2026-07-26 08:30", "end": "2026-07-26 11:00", "venue_address": "Hội trường A5, 268 Lý Thường Kiệt, Quận 10, TP.HCM"}],
            tickets=[{"name": "Vé Sinh Viên", "price": 50000, "qty": 300}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster talkshow sinh viên thiết kế trẻ trung với hình diễn giả và thông tin Hội trường A5.",
                    "extracted_text": "TALKSHOW KHỞI NGHIỆP SINH VIÊN 2026",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "NEEDS_REVIEW",
            "risk_score": 30,
            "quality_score": 73,
            "summary": "Talkshow sinh viên hợp lệ về chủ đề, địa điểm và poster nhưng cần sửa 2 lỗi chính tả tiếng Việt và bổ sung thông tin hotline liên hệ BTC.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng, đúng chính tả.",
                "description_status": "NEEDS_IMPROVEMENT",
                "description_analysis": "Mô tả còn ngắn, sai chính tả 'chia sẽ', 'tồ chức' và chưa nêu kênh liên hệ hỗ trợ sinh viên.",
                "spelling_grammar_issues": [
                    "'chia sẽ' -> 'chia sẻ'",
                    "'tồ chức' -> 'tổ chức'",
                ],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster talkshow trẻ trung, phù hợp chủ đề sinh viên.",
                        "Bối cảnh học đường năng động.",
                        "Chữ rõ 'TALKSHOW KHỞI NGHIỆP SINH VIÊN 2026'.",
                        "Chữ tiếng Việt rõ nét.",
                        "Hình ảnh an toàn, khớp thông tin.",
                        [_txt("TALKSHOW KHỞI NGHIỆP SINH VIÊN 2026", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Talkshow sinh viên quy mô vừa không bắt buộc giấy phép (NOT_REQUIRED)",
                "Địa điểm Hội trường A5 rõ ràng qua bảng venues",
                "Giá vé sinh viên hợp lý",
            ],
            "critical_violations": [],
            "warnings": [
                {
                    "policy_code": "CONTENT_SPELLING",
                    "issue": "Mô tả mắc lỗi chính tả tiếng Việt ('chia sẽ', 'tồ chức').",
                    "highlighted_text": "chia sẽ ... tồ chức",
                }
            ],
            "suggestions": [
                "Chỉnh sửa lỗi chính tả và bổ sung Hotline/Fanpage hỗ trợ người tham dự.",
                "Nên thêm lịch trình mốc giờ chi tiết cho từng phần giao lưu Q&A.",
            ],
        },
        criteria_count=7,
    ))

    # ==========================================================================
    # NHÓM D: VI PHẠM 16 TIÊU CHÍ event_review_criteria
    # ==========================================================================

    # D1: ANTI_FINANCIAL_FRAUD_MLM + PAYMENT_POLICY (Crypto x100 + Forex + Zalo chuyển khoản)
    samples.append(_make_sample(
        23,
        ["ANTI_FINANCIAL_FRAUD_MLM", "PAYMENT_POLICY", "TERMS_ORGANIZER", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Bí Mật Đầu Tư Coin X100 Sau 7 Ngày - Thu Nhập Thụ Động Bao Lỗ",
            category="Kinh doanh & Công nghệ (kinh-doanh-cong-nghe)",
            organizer_name="Crypto Rich Group",
            organizer_verified=False,
            event_format="ONLINE",
            tags=["crypto", "x100", "forex"],
            short_desc="Tuyển dụng hệ thống đào coin và đánh lệnh BO lợi nhuận 30%/tháng.",
            description="Hướng dẫn giao dịch quyền chọn nhị phân BO và sàn Forex quốc tế thu nhập thụ động nghìn đô không cần vốn, cam kết x10 tài khoản và hoàn vốn 100%. Nhắn Telegram @cryptorich_vip hoặc chuyển cọc trực tiếp qua tài khoản MB Bank cá nhân để kích hoạt ví nội bộ.",
            sessions=[{"name": "Zoom Bí Mật", "start": "2026-07-09 20:00", "end": "2026-07-09 22:00", "venue_address": None}],
            tickets=[{"name": "Suất Kích Hoạt VIP", "price": 500000, "qty": 1000}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster nền đen vàng chói chèn biểu đồ nến xanh đỏ kèm chữ X100 TÀI SẢN và ID Telegram cá nhân.",
                    "extracted_text": "X100 TÀI SẢN SAU 7 NGÀY - LIÊN HỆ TELEGRAM",
                    "is_relevant": True,
                    "safety_flags": ["FINANCIAL_SCAM"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 98,
            "quality_score": 5,
            "summary": "Từ chối khẩn cấp do quảng bá sàn BO/Forex trái phép, cam kết x10-x100 lợi nhuận lừa đảo và điều hướng chuyển khoản cá nhân qua Telegram.",
            "content_review": {
                "title_status": "VIOLATION",
                "title_analysis": "Tiêu đề cam kết đầu tư coin x100 phi thực tế nhằm lừa đảo người tham gia.",
                "description_status": "VIOLATION",
                "description_analysis": "Chứa dấu hiệu Ponzi, sàn quyền chọn nhị phân BO trái phép và yêu cầu chuyển tiền ngoài hệ thống EventHub.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Poster cổ súy đầu tư lừa đảo x100 và gắn liên hệ giao dịch Telegram ngoài luồng.",
                        "Bối cảnh quảng cáo làm giàu tài chính nhanh bất hợp pháp.",
                        "Chữ rõ ràng 'X100 TÀI SẢN SAU 7 NGÀY - LIÊN HỆ TELEGRAM'.",
                        "Văn bản rõ nét mang thông điệp dụ dỗ tài chính.",
                        "Vi phạm nghiêm trọng chính sách chống lừa đảo tài chính.",
                        [_txt("X100 TÀI SẢN SAU 7 NGÀY", "3D_EFFECT", "HIGH", "NONE", True)],
                        ["Poster quảng cáo làm giàu phi thực tế và dẫn kênh Telegram."],
                        "Sự kiện vi phạm điều khoản nghiêm cấm tuyệt đối trên EventHub.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [],
            "critical_violations": [
                {"policy_code": "ANTI_FINANCIAL_FRAUD_MLM", "issue": "Quảng bá sàn BO/Forex trái phép, cam kết lợi nhuận 30%/tháng và x10-x100 tài khoản.", "highlighted_text": "giao dịch quyền chọn nhị phân BO... cam kết x10 tài khoản"},
                {"policy_code": "PAYMENT_POLICY", "issue": "Điều hướng chuyển cọc tài khoản MB Bank cá nhân và giao dịch qua Telegram ngoài sàn.", "highlighted_text": "Nhắn Telegram @cryptorich_vip hoặc chuyển cọc trực tiếp qua tài khoản MB Bank cá nhân"},
            ],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=8,
    ))

    # D2: EVENT_REALISM_FEASIBILITY + CONTENT_SPELLING (Spam test event "asdasd")
    samples.append(_make_sample(
        24,
        ["EVENT_REALISM_FEASIBILITY", "CONTENT_SPELLING", "TICKET_POLICY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Test event asdasdasd 12345",
            category="Chưa phân loại",
            organizer_name="Dev Tester",
            organizer_verified=False,
            tags=["test"],
            short_desc="asdasdasdasd",
            description="Day la su kien test he thong asdasd qweqwe 123123 khong co noi dung that.",
            has_thumbnail=False,
            has_banner=False,
            sessions=[{"name": "test", "start": "2026-07-01 10:00", "end": "2026-07-01 11:00", "venue_address": None}],
            tickets=[{"name": "test ticket", "price": 10000, "qty": 10}],
        ),
        {
            "decision": "REJECT",
            "risk_score": 88,
            "quality_score": 10,
            "summary": "Từ chối vì đây là sự kiện thử nghiệm/nội dung rác vô nghĩa ('Test event asdasdasd'), thiếu ảnh đại diện và địa chỉ thật.",
            "content_review": {
                "title_status": "VIOLATION",
                "title_analysis": "Tiêu đề thử nghiệm spam ('Test event asdasdasd 12345').",
                "description_status": "VIOLATION",
                "description_analysis": "Mô tả gõ ký tự ngẫu nhiên vô nghĩa, không phải sự kiện có thật.",
                "spelling_grammar_issues": ["Nội dung không dấu và chuỗi ký tự rác ('asdasd qweqwe')."],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "MISSING",
                        "Chưa tải lên ảnh đại diện chính (Main Poster) bắt buộc.",
                        "Không có ảnh.", "Không có.", "Không có.",
                        "Thiếu Poster bắt buộc khiến trang sự kiện không đủ điều kiện xuất bản.",
                        issues=["Thiếu ảnh Main Poster và Cover Banner."],
                        suggestion="Tải lên Poster và Cover Banner hợp lệ cho sự kiện thật.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [],
            "critical_violations": [
                {"policy_code": "EVENT_REALISM_FEASIBILITY", "issue": "Sự kiện thử nghiệm rác chứa ký tự ngẫu nhiên vô nghĩa, không khả thi thực tế.", "highlighted_text": "Test event asdasdasd 12345 ... asdasd qweqwe 123123"},
                {"policy_code": "IMAGE_POLICY", "issue": "Thiếu cả Main Poster lẫn Cover Banner.", "highlighted_text": "CHƯA CÓ (BẮT BUỘC BỔ SUNG)"},
            ],
            "warnings": [],
            "suggestions": [],
        },
        criteria_count=7,
    ))

    # D3: SESSION_SCHEDULE (end_time <= start_time & quá khứ) + TICKET_POLICY (giá vé âm)
    samples.append(_make_sample(
        25,
        ["SESSION_SCHEDULE", "TICKET_POLICY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Workshop Nhiếp Ảnh Đường Phố Sài Gòn",
            category="Nghệ thuật & Thủ công (nghe-thuat)",
            organizer_name="StreetFrame Club",
            organizer_verified=True,
            tags=["nhiếp ảnh", "workshop"],
            short_desc="Thực hành chụp ảnh đường phố buổi sáng cùng nhiếp ảnh gia.",
            description="Chia sẻ góc máy, ánh sáng tự nhiên và kỹ thuật bắt khoảnh khắc đường phố Sài Gòn.",
            start_time="2025-01-10 14:00",
            end_time="2025-01-10 10:00",
            sessions=[{"name": "Phiên 1", "start": "2025-01-10 14:00", "end": "2025-01-10 10:00", "venue_address": "Bưu điện Trung tâm, Số 2 Công xã Paris, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Ưu Đãi Lỗi", "price": -50000, "qty": 0}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster ảnh chụp góc phố Bưu điện Sài Gòn kèm chữ Workshop Nhiếp Ảnh Đường Phố.",
                    "extracted_text": "WORKSHOP NHIẾP ẢNH ĐƯỜNG PHỐ SÀI GÒN",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 85,
            "quality_score": 30,
            "summary": "Từ chối do lỗi nghiêm trọng về lịch trình (thời gian nằm trong quá khứ 2025 và giờ kết thúc 10:00 trước giờ bắt đầu 14:00) cùng giá vé âm không hợp lệ.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ ràng chủ đề nhiếp ảnh.",
                "description_status": "VALID",
                "description_analysis": "Mô tả phù hợp nội dung thực hành.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster phù hợp với chủ đề nhiếp ảnh đường phố.",
                        "Khung cảnh phố cổ điển Sài Gòn.",
                        "Chữ 'WORKSHOP NHIẾP ẢNH ĐƯỜNG PHỐ SÀI GÒN'.",
                        "Văn bản rõ ràng.",
                        "Hình ảnh an toàn, khớp chủ đề.",
                        [_txt("WORKSHOP NHIẾP ẢNH ĐƯỜNG PHỐ SÀI GÒN", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Poster và địa điểm Bưu điện Trung tâm rõ ràng"],
            "critical_violations": [
                {"policy_code": "SESSION_SCHEDULE", "issue": "Thời gian nằm trong quá khứ (2025) và giờ kết thúc (10:00) diễn ra trước giờ bắt đầu (14:00).", "highlighted_text": "2025-01-10 14:00 - 2025-01-10 10:00"},
                {"policy_code": "TICKET_POLICY", "issue": "Giá vé âm (-50.000 VNĐ) và số lượng vé bằng 0 không hợp lệ.", "highlighted_text": "Vé Ưu Đãi Lỗi: -50.000 VNĐ (0 vé)"},
            ],
            "warnings": [],
            "suggestions": ["Cập nhật lại lịch trình diễn ra trong tương lai với end_time > start_time và sửa giá vé >= 0 VNĐ, số lượng > 0."],
        },
        criteria_count=7,
    ))

    # D4: REFUND_POLICY (Hủy show vẫn không hoàn tiền dưới mọi lý do) + TICKET_POLICY (giấu địa chỉ inbox Zalo)
    samples.append(_make_sample(
        26,
        ["REFUND_POLICY", "TICKET_POLICY", "PAYMENT_POLICY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Đêm Hài Độc Thoại Tối Thứ Bảy: Cười Xuyên Đêm",
            category="Sân khấu & Giải trí (nghe-thuat)",
            organizer_name="Saigon Standup Club",
            organizer_verified=True,
            tags=["hài độc thoại", "standup", "giải trí"],
            short_desc="Show diễn hài độc thoại cuối tuần cùng các diễn viên trẻ.",
            description="Lưu ý quan trọng: Địa chỉ bí mật sẽ gửi sau qua tin nhắn inbox Zalo BTC khi đã mua vé. Trường hợp sự kiện bị hủy vì bất kỳ lý do gì, ban tổ chức vẫn KHÔNG hoàn tiền dưới mọi hình thức.",
            sessions=[{"name": "Đêm hài", "start": "2026-08-15 20:00", "end": "2026-08-15 22:00", "venue_address": None}],
            tickets=[{"name": "Vé Thường", "price": 220000, "qty": 100}],
            refund_summary="Nếu sự kiện bị hủy vẫn không hoàn tiền dưới mọi lý do.",
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster sân khấu micro ánh đèn vàng hài độc thoại cùng tiêu đề Cười Xuyên Đêm.",
                    "extracted_text": "CƯỜI XUYÊN ĐÊM - SAIGON STANDUP",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 82,
            "quality_score": 32,
            "summary": "Từ chối vì quy định trái luật 'hủy sự kiện vẫn không hoàn tiền dưới mọi lý do' và hành vi giấu địa chỉ yêu cầu inbox Zalo.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề show hài rõ ràng.",
                "description_status": "VIOLATION",
                "description_analysis": "Cố tình giấu địa chỉ sự kiện qua Zalo và áp đặt điều khoản không hoàn tiền kể cả khi BTC hủy show.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster phù hợp thể loại hài độc thoại.",
                        "Sân khấu tối ấm ánh đèn micro.",
                        "Chữ rõ ràng 'CƯỜI XUYÊN ĐÊM - SAIGON STANDUP'.",
                        "Văn bản rõ nét.",
                        "Poster an toàn.",
                        [_txt("CƯỜI XUYÊN ĐÊM", "NORMAL", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": ["Poster phù hợp chủ đề sân khấu"],
            "critical_violations": [
                {"policy_code": "REFUND_POLICY", "issue": "Tuyên bố trái quy chế EventHub: hủy sự kiện vẫn không hoàn tiền dưới mọi hình thức.", "highlighted_text": "Trường hợp sự kiện bị hủy vì bất kỳ lý do gì, ban tổ chức vẫn KHÔNG hoàn tiền dưới mọi hình thức"},
            ],
            "warnings": [
                {"policy_code": "TICKET_POLICY", "issue": "Cố tình giấu địa chỉ sự kiện OFFLINE ('Địa chỉ bí mật sẽ gửi sau qua Zalo').", "highlighted_text": "Địa chỉ bí mật sẽ gửi sau qua tin nhắn inbox Zalo BTC"},
            ],
            "suggestions": ["Công khai địa chỉ địa điểm cụ thể trong hệ thống venues và cam kết hoàn tiền 100% nếu show bị hủy."],
        },
        criteria_count=8,
    ))

    # D5: SPONSOR_BRAND_AUTHENTICITY (Mạo danh Bộ Văn hóa, UNESCO, VTV) + ORGANIZER_LEGAL_COMPLIANCE (Festival lớn không giấy phép/PCCC)
    samples.append(_make_sample(
        27,
        ["SPONSOR_BRAND_AUTHENTICITY", "ORGANIZER_LEGAL_COMPLIANCE", "LEGAL_PERMIT_AUTHENTICITY", "IMAGE_POLICY"],
        build_event_user_prompt(
            title="Đại Nhạc Hội Ánh Sáng Quốc Tế Việt Nam 2026",
            category="Âm nhạc & Biểu diễn (am-nhac-bieu-dien)",
            organizer_name="Apex Event Team",
            organizer_verified=False,
            tags=["đại nhạc hội", "festival", "vtv"],
            short_desc="Lễ hội âm nhạc điện tử quốc tế 10.000 khán giả.",
            description="Chương trình tự hào được bảo trợ chính thức bởi Bộ Văn hóa, UNESCO và Đài Truyền hình Việt Nam VTV. Quy mô 10.000 khán giả ngoài trời, vé VIP 3 triệu đồng.",
            permits=[],
            requires_strict_permit=True,
            sessions=[{"name": "Đêm Festival", "start": "2026-09-20 17:00", "end": "2026-09-20 23:30", "venue_address": "Sân vận động Mỹ Đình, Nam Từ Liêm, Hà Nội"}],
            tickets=[{"name": "Vé VIP", "price": 3000000, "qty": 2000}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster đại nhạc hội cắt ghép logo Bộ Văn hóa, UNESCO và logo VTV ở hàng đầu nhưng không có văn bản bảo trợ đính kèm.",
                    "extracted_text": "ĐẠI NHẠC HỘI ÁNH SÁNG 2026 - ĐỒNG TỔ CHỨC BỞI UNESCO & VTV",
                    "is_relevant": True,
                    "safety_flags": ["UNAUTHORIZED_GOVERNMENT_LOGO"],
                }
            ],
        ),
        {
            "decision": "REJECT",
            "risk_score": 93,
            "quality_score": 18,
            "summary": "Từ chối do có dấu hiệu mạo danh cơ quan Nhà nước (Bộ Văn hóa), UNESCO, VTV mà không có văn bản xác nhận và thiếu hoàn toàn giấy phép biểu diễn/PCCC cho đại nhạc hội 10.000 người.",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề lễ hội quy mô lớn nhưng thông tin pháp lý bảo trợ không có cơ sở.",
                "description_status": "VIOLATION",
                "description_analysis": "Tuyên bố bảo trợ từ Bộ Văn hóa, UNESCO, VTV mà không kèm văn bản xác nhận trong hồ sơ và thiếu thông tin an toàn PCCC cho 10.000 khán giả.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "VIOLATION",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VIOLATION",
                        "Poster chèn logo cơ quan Nhà nước và Đài truyền hình VTV chưa có văn bản xác thực bảo trợ.",
                        "Poster lễ hội âm nhạc ngoài trời gắn hàng loạt logo cơ quan cấp cao.",
                        "Chữ rõ 'ĐẠI NHẠC HỘI ÁNH SÁNG 2026 - ĐỒNG TỔ CHỨC BỞI UNESCO & VTV'.",
                        "Văn bản rõ nét nêu tên tổ chức bảo trợ.",
                        "Có dấu hiệu mạo danh bảo trợ cơ quan Nhà nước/VTV nhằm tạo lòng tin bán vé.",
                        [_txt("ĐỒNG TỔ CHỨC BỞI UNESCO & VTV", "NORMAL", "HIGH", "NONE", False)],
                        ["Cắt ghép logo Bộ Văn hóa, UNESCO, VTV khi chưa có văn bản chứng minh."],
                        "Gỡ bỏ logo các tổ chức không có văn bản đồng ý bảo trợ bằng văn bản chính thức.",
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [],
            "critical_violations": [
                {"policy_code": "SPONSOR_BRAND_AUTHENTICITY", "issue": "Mạo danh bảo trợ của Bộ Văn hóa, UNESCO và VTV khi không có bất kỳ văn bản xác nhận nào.", "highlighted_text": "bảo trợ chính thức bởi Bộ Văn hóa, UNESCO và Đài Truyền hình Việt Nam VTV"},
                {"policy_code": "ORGANIZER_LEGAL_COMPLIANCE", "issue": "Đại nhạc hội ngoài trời quy mô 10.000 khán giả tại Sân vận động Mỹ Đình nhưng chưa có giấy phép biểu diễn và phương án PCCC.", "highlighted_text": "Lễ hội âm nhạc điện tử quốc tế 10.000 khán giả"},
            ],
            "warnings": [],
            "suggestions": ["Chỉ đăng sự kiện quy mô lớn sau khi có giấy phép biểu diễn, phương án PCCC và thư xác nhận bảo trợ hợp lệ."],
        },
        criteria_count=8,
    ))

    # D6: AGE_RESTRICTION_RATING + CHECKIN_SECURITY_RULES (Bar/EDM đêm muộn đến 02:00 sáng nhưng ghi "mọi lứa tuổi", thiếu đồ cấm) -> NEEDS_REVIEW
    samples.append(_make_sample(
        28,
        ["AGE_RESTRICTION_RATING", "CHECKIN_SECURITY_RULES", "IMAGE_POLICY", "VALUABLE_SUGGESTIONS"],
        build_event_user_prompt(
            title="Midnight Rooftop EDM Lounge & Cocktail Night",
            category="Âm nhạc & Giải trí (am-nhac-bieu-dien)",
            organizer_name="Skyline Bar Lounge",
            organizer_verified=True,
            tags=["edm", "rooftop bar", "cocktail"],
            short_desc="Đêm nhạc DJ kết hợp thưởng thức cocktail từ 21:00 đến 02:00 sáng.",
            description="Không gian âm nhạc điện tử sôi động trên tầng thượng cùng menu cocktail đặc trưng và màn trình diễn DJ quốc tế. Sự kiện mở cửa chào đón phù hợp cho mọi lứa tuổi cùng tham gia thư giãn.",
            sessions=[{"name": "Night Party", "start": "2026-08-21 21:00", "end": "2026-08-22 02:00", "venue_address": "Tầng 25 Skyline Tower, 36 Lê Lợi, Quận 1, TP.HCM"}],
            tickets=[{"name": "Vé Đứng + 1 Cocktail", "price": 350000, "qty": 600}],
            vision_items=[
                {
                    "source": "MAIN_POSTER",
                    "visual_description": "Poster DJ chơi nhạc trên rooftop bar đèn neon tím xanh hiện đại với ly cocktail và dòng chữ Midnight EDM.",
                    "extracted_text": "MIDNIGHT ROOFTOP EDM LOUNGE - 21:00 - 02:00",
                    "is_relevant": True,
                    "safety_flags": [],
                }
            ],
        ),
        {
            "decision": "NEEDS_REVIEW",
            "risk_score": 45,
            "quality_score": 62,
            "summary": "Cần chỉnh sửa vì sự kiện tổ chức tại quán bar đến 02:00 sáng và có cocktail kèm vé nhưng mô tả lại ghi 'phù hợp mọi lứa tuổi' (thiếu giới hạn 18+ và quy trình an ninh 600 khách).",
            "content_review": {
                "title_status": "VALID",
                "title_analysis": "Tiêu đề rõ tính chất đêm nhạc bar lounge.",
                "description_status": "NEEDS_IMPROVEMENT",
                "description_analysis": "Mâu thuẫn nghiêm trọng về độ tuổi khi phục vụ đồ uống có cồn ban đêm nhưng lại ghi chào đón mọi lứa tuổi; đồng thời thiếu hướng dẫn check-in/vật dụng cấm cho 600 khách.",
                "spelling_grammar_issues": [],
            },
            "image_review": {
                "overall_image_verdict": "SAFE",
                "items": [
                    _img_item(
                        "MAIN_POSTER", "VALID",
                        "Poster đèn neon DJ bar hợp lệ và khớp khung giờ 21:00 - 02:00.",
                        "Không gian rooftop bar ánh sáng neon tím xanh.",
                        "Chữ rõ 'MIDNIGHT ROOFTOP EDM LOUNGE - 21:00 - 02:00'.",
                        "Chữ rõ ràng.",
                        "Poster an toàn, hợp lệ.",
                        [_txt("MIDNIGHT ROOFTOP EDM LOUNGE", "NEON_GLOW", "HIGH", "NONE", True)],
                    )
                ],
            },
            "document_review": {"overall_document_verdict": "NOT_PROVIDED", "items": []},
            "compliant_checks": [
                "Poster và địa điểm Skyline Tower tại Quận 1 rõ ràng",
                "Giờ kết thúc 02:00 ngày hôm sau hợp lệ logic thời gian",
            ],
            "critical_violations": [],
            "warnings": [
                {
                    "policy_code": "AGE_RESTRICTION_RATING",
                    "issue": "Sự kiện tại rooftop bar phục vụ cocktail đến 02:00 sáng nhưng ghi 'phù hợp cho mọi lứa tuổi' thay vì giới hạn 18+.",
                    "highlighted_text": "phù hợp cho mọi lứa tuổi",
                },
                {
                    "policy_code": "CHECKIN_SECURITY_RULES",
                    "issue": "Quy mô 600 khách ban đêm nhưng chưa nêu quy trình kiểm tra CCCD/QR và danh mục vật dụng cấm.",
                    "highlighted_text": "Vé Đứng + 1 Cocktail (600 vé)",
                },
            ],
            "suggestions": [
                "Bỏ cụm 'phù hợp mọi lứa tuổi', bổ sung quy định bắt buộc dành cho khán giả từ 18 tuổi trở lên và xuất trình CCCD tại cửa.",
                "Thêm mục quy trình check-in mã QR EventHub và danh sách vật dụng cấm mang vào rooftop bar.",
            ],
        },
        criteria_count=8,
    ))

    return samples


def save_to_jsonl(samples, output_path="datasets/dataset.jsonl"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    print(f"Done saving {len(samples)} samples to {output_path}")


if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, "../.."))
    dataset_path = os.path.join(project_root, "datasets", "dataset.jsonl")
    samples = generate_review_samples()
    save_to_jsonl(samples, dataset_path)
