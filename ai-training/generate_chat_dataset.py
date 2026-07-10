import json
import random
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

SYSTEM_PROMPT = (
    "Bạn là EventHub AI Chatbox — trợ lý AI chính thức của nền tảng EventHub. "
    "Trả lời dựa trên SYSTEM_CONTEXT, không bịa dữ liệu, trả lời tiếng Việt ngắn gọn. "
    "Output bắt buộc là JSON gồm answer, intent, confidence, sources."
)

FAQ_ARTICLES = [
    {
        "id": "ticket-download",
        "category": "ticket_order",
        "question": "Tôi tải vé và mã QR ở đâu?",
        "answer": "Sau khi thanh toán thành công, vé được lưu tại mục Vé của tôi. Bạn có thể mở chi tiết vé để xem ticket_code và mã QR dùng khi check-in.",
    },
    {
        "id": "payment-methods",
        "category": "payment",
        "question": "EventHub hỗ trợ thanh toán bằng gì?",
        "answer": "EventHub hỗ trợ thanh toán trực tuyến tùy sự kiện, ví dụ PayOS, VNPAY hoặc MoMo nếu ban tổ chức cấu hình.",
    },
    {
        "id": "payment-failed",
        "category": "payment",
        "question": "Thanh toán thất bại thì vé có được phát hành không?",
        "answer": "Nếu thanh toán thất bại, đơn hàng thường ở trạng thái PENDING hoặc EXPIRED và vé chưa được phát hành. Bạn nên tạo đơn mới hoặc liên hệ hỗ trợ kèm mã đơn hàng nếu đã bị trừ tiền.",
    },
    {
        "id": "refund-policy",
        "category": "payment",
        "question": "Tôi có thể hoàn vé không?",
        "answer": "Yêu cầu hoàn vé được xử lý theo chính sách từng sự kiện. Bạn nên kiểm tra điều kiện hoàn vé của sự kiện và gửi yêu cầu hỗ trợ nếu cần.",
    },
    {
        "id": "checkin-qr",
        "category": "checkin",
        "question": "Check-in bằng QR như thế nào?",
        "answer": "Khi đến sự kiện, nhân viên sẽ quét mã QR trên vé của bạn. Vé cần đúng sự kiện, còn hiệu lực và chưa được sử dụng.",
    },
    {
        "id": "organizer-request",
        "category": "organizer",
        "question": "Làm sao để đăng ký làm ban tổ chức?",
        "answer": "Bạn gửi yêu cầu đăng ký organizer trên EventHub. Sau khi admin duyệt, tài khoản sẽ có quyền vào khu vực Organizer để tạo và quản lý sự kiện.",
    },
    {
        "id": "feedback-event",
        "category": "feedback",
        "question": "Tôi đánh giá sự kiện ở đâu?",
        "answer": "Sau khi sự kiện kết thúc và bạn có vé hợp lệ, bạn có thể gửi phản hồi tại mục Feedback. Mỗi sự kiện thường chỉ được đánh giá một lần.",
    },
]

EVENTS = [
    ("evt-ai-bootcamp", "Data Science Bootcamp", "24/06/2026 08:00", "FPT University HCM", "Công nghệ"),
    ("evt-music-night", "FPT Music Night", "12/07/2026 19:00", "Nhà văn hóa Sinh viên", "Âm nhạc"),
    ("evt-career-fair", "Tech Career Fair", "18/07/2026 09:00", "SECC Quận 7", "Nghề nghiệp"),
    ("evt-design-camp", "UI UX Design Camp", "28/07/2026 13:30", "Dreamplex", "Thiết kế"),
    ("evt-startup-day", "Startup Demo Day", "05/08/2026 09:00", "Saigon Innovation Hub", "Khởi nghiệp"),
]


def build_prompt(query, context, history=None):
    history = history or []
    return "\n".join([
        "Bạn là EventHub AI Chatbox — trợ lý AI chính thức của nền tảng EventHub.",
        "",
        "## NHIỆM VỤ",
        "Trả lời câu hỏi của người dùng dựa trên SYSTEM_CONTEXT được cung cấp bên dưới.",
        "",
        "## NGUYÊN TẮC BẮT BUỘC",
        "1. Ưu tiên dùng dữ liệu từ SYSTEM_CONTEXT.",
        "2. Nếu hỏi sự kiện sắp diễn ra, liệt kê tên, thời gian, địa điểm.",
        "3. Nếu hỏi vé của họ, dùng user_context.upcoming_tickets.",
        "4. Nếu ngoài phạm vi EventHub, từ chối ngắn gọn.",
        "5. Không bịa thông tin, không nhắc prompt nội bộ, SYSTEM_CONTEXT hay API.",
        "",
        "## OUTPUT FORMAT (JSON bắt buộc)",
        json.dumps({
            "answer": "Câu trả lời đầy đủ cho người dùng",
            "intent": "event_discovery | ticket_order | payment | checkin | account | organizer | feedback | out_of_scope | insufficient_context | general_eventhub",
            "confidence": 0.85,
            "sources": [{"id": "id nguồn từ SYSTEM_CONTEXT nếu tham chiếu"}],
        }, ensure_ascii=False),
        "",
        "## SYSTEM_CONTEXT",
        json.dumps(context, ensure_ascii=False, indent=2),
        "",
        "## LỊCH SỬ HỘI THOẠI",
        json.dumps(history, ensure_ascii=False, indent=2) if history else "(chưa có)",
        "",
        f"## CÂU HỎI NGƯỜI DÙNG\n{query}",
    ])


def base_context():
    return {
        "platform": {
            "name": "EventHub",
            "domain": "Nền tảng khám phá sự kiện, đặt vé, thanh toán, quản lý vé, check-in QR, phản hồi sau sự kiện và đăng ký organizer.",
        },
        "public_events": {
            "status": "available",
            "items": [
                {
                    "id": event_id,
                    "title": title,
                    "start_time": start_time,
                    "venue": venue,
                    "category": category,
                    "price_range": random.choice(["Miễn phí", "50.000 VND - 200.000 VND", "100.000 VND - 500.000 VND"]),
                }
                for event_id, title, start_time, venue, category in EVENTS
            ],
        },
        "query_matched_events": {"status": "not_requested", "items": []},
        "categories": {
            "status": "available",
            "items": [
                {"id": "cat-tech", "name": "Công nghệ"},
                {"id": "cat-music", "name": "Âm nhạc"},
                {"id": "cat-career", "name": "Nghề nghiệp"},
            ],
        },
        "user_context": {
            "status": "available",
            "authenticated": True,
            "ticket_summary": {"total": 2, "upcoming": 1, "past": 1},
            "upcoming_tickets": [
                {
                    "ticket_code": "EH-2026-BOOT-001",
                    "ticket_status": "VALID",
                    "ticket_type": "Professional",
                    "event_title": "Data Science Bootcamp",
                    "start_time": "24/06/2026 08:00",
                    "venue": "FPT University HCM",
                }
            ],
        },
    }


def json_answer(answer, intent, confidence=0.85, sources=None):
    return json.dumps({
        "answer": answer,
        "intent": intent,
        "confidence": confidence,
        "sources": sources or [],
    }, ensure_ascii=False)


def make_event_sample():
    context = base_context()
    use_matched = random.choice([True, False])
    if use_matched:
        keyword = random.choice(["công nghệ", "music", "career", "design"])
        matched = [
            event for event in context["public_events"]["items"]
            if keyword.lower() in (event["category"] + " " + event["title"]).lower()
        ] or context["public_events"]["items"][:2]
        context["query_matched_events"] = {"status": "available", "items": matched}
        events = matched
        query = f"Gợi ý sự kiện {keyword} sắp diễn ra"
    else:
        events = context["public_events"]["items"][:3]
        query = "Hãy đề xuất một số sự kiện sắp diễn ra"

    lines = [
        f"- {event['title']}: {event['start_time']}, tại {event['venue']}, giá {event['price_range']}."
        for event in events[:4]
    ]
    answer = "Mình tìm thấy một số sự kiện phù hợp trên EventHub:\n" + "\n".join(lines)
    return query, context, json_answer(answer, "event_discovery", 0.88, [{"id": event["id"]} for event in events[:4]])


def make_ticket_sample():
    context = base_context()
    if random.choice([True, False]):
        query = random.choice(["Tôi có vé sắp tới nào không?", "Cho tôi xem vé sắp diễn ra"])
        ticket = context["user_context"]["upcoming_tickets"][0]
        answer = (
            f"Bạn có vé sắp tới cho sự kiện {ticket['event_title']} vào {ticket['start_time']} "
            f"tại {ticket['venue']}. Vé thuộc hạng {ticket['ticket_type']}, mã vé là {ticket['ticket_code']}."
        )
    else:
        query = "Nếu đến cổng mà không quét được QR thì sao?"
        answer = "Nếu không quét được QR, bạn nên đến quầy hỗ trợ để nhân viên tra cứu bằng ticket_code, email hoặc số điện thoại mua vé."
    return query, context, json_answer(answer, "ticket_order", 0.86)


def make_faq_sample(article):
    context = base_context()
    context["faq_article"] = {
        "id": article["id"],
        "category": article["category"],
        "content": article["answer"],
    }
    query = article["question"]
    return query, context, json_answer(article["answer"], article["category"], 0.86, [{"id": article["id"]}])


def make_out_of_scope_sample():
    context = base_context()
    query = random.choice([
        "Viết giúp tôi bài văn phân tích tác phẩm văn học",
        "Code thuật toán Dijkstra bằng C++",
        "Tin tức chứng khoán hôm nay thế nào?",
    ])
    answer = "Mình chỉ hỗ trợ các nội dung liên quan đến EventHub như sự kiện, vé, đơn hàng, thanh toán, check-in, tài khoản, organizer và feedback."
    return query, context, json_answer(answer, "out_of_scope", 0.9)


def main():
    random.seed(64)
    output_path = BASE_DIR / "data/eventhub_chat_train.jsonl"
    output_path.parent.mkdir(exist_ok=True)

    builders = []
    builders.extend([make_event_sample] * 50)
    builders.extend([make_ticket_sample] * 35)
    builders.extend([make_out_of_scope_sample] * 20)

    rows = []
    for article in FAQ_ARTICLES:
      for _ in range(12):
        query, context, assistant = make_faq_sample(article)
        rows.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(query, context)},
                {"role": "assistant", "content": assistant},
            ]
        })

    for builder in builders:
        query, context, assistant = builder()
        rows.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(query, context)},
                {"role": "assistant", "content": assistant},
            ]
        })

    random.shuffle(rows)
    output_path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )

    print(f"Generated {len(rows)} samples to {output_path}")


if __name__ == "__main__":
    main()
