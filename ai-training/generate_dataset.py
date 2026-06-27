import json
import random
from pathlib import Path


SYSTEM_PROMPT = (
    "Bạn là AI Financial Analyst của EventHub. "
    "Nhiệm vụ của bạn là viết báo cáo tài chính tiếng Việt ngắn gọn, chính xác, "
    "dựa hoàn toàn trên số liệu được cung cấp. "
    "Không viết quá trình suy luận, không dùng thẻ <think>, chỉ trả về báo cáo cuối cùng."
)

EVENT_NAMES = [
    "FPT Music Night",
    "Tech Career Fair",
    "Startup Demo Day",
    "Workshop AI for Business",
    "Student Music Festival",
    "Data Science Bootcamp",
    "Digital Marketing Masterclass",
    "Blockchain Innovation Summit",
    "UI UX Design Camp",
    "Green Future Conference",
]

TICKET_TYPES = [
    "General",
    "Standard",
    "VIP",
    "Early Bird",
    "Student",
    "Professional",
    "Business",
    "Premium",
]


def money(value):
    return f"{value:,.0f}".replace(",", ".") + " VND"


def performance_sentence(rate):
    if rate >= 85:
        return (
            f"Tỷ lệ lấp đầy {rate}% là kết quả rất tích cực, cho thấy nhu cầu tham gia cao "
            "và sự kiện gần như đã khai thác tốt sức chứa."
        )
    if rate >= 60:
        return (
            f"Tỷ lệ lấp đầy {rate}% cho thấy hiệu suất bán vé ở mức ổn, "
            "nhưng vẫn còn dư địa để tăng thêm doanh thu."
        )
    if rate >= 35:
        return (
            f"Tỷ lệ lấp đầy {rate}% cho thấy sự kiện đã có tín hiệu bán vé ban đầu, "
            "nhưng cần tiếp tục đẩy truyền thông để cải thiện kết quả."
        )
    return (
        f"Tỷ lệ lấp đầy {rate}% còn thấp, cho thấy nhà tổ chức cần sớm điều chỉnh "
        "chiến dịch quảng bá hoặc ưu đãi bán vé."
    )


def recommendation_sentence(rate, ticket_type):
    if rate >= 85:
        return (
            f"Hạng vé {ticket_type} đang là nhóm nổi bật, nhà tổ chức nên tập trung chuẩn bị vận hành, "
            "check-in và trải nghiệm khách tham dự để giữ chất lượng sự kiện."
        )
    if rate >= 60:
        return (
            f"Hạng vé {ticket_type} đang đóng góp tốt, nhà tổ chức nên tiếp tục nhấn mạnh giá trị của nhóm vé này "
            "và cân nhắc ưu đãi nhẹ cho các hạng vé còn tồn."
        )
    if rate >= 35:
        return (
            f"Hạng vé {ticket_type} đang bán tốt nhất, tuy nhiên nhà tổ chức nên tăng truyền thông theo nhóm khách mục tiêu "
            "và dùng mã khuyến mãi ngắn hạn để thúc đẩy số vé còn lại."
        )
    return (
        f"Dù hạng vé {ticket_type} đang là nhóm bán tốt nhất, tổng hiệu suất vẫn còn thấp. "
        "Nhà tổ chức nên mở ưu đãi sớm, hợp tác cộng đồng liên quan và tăng tần suất quảng bá."
    )


def build_summary(sample):
    return (
        f"Sự kiện \"{sample['event_title']}\" ghi nhận doanh thu gộp {money(sample['gross_revenue'])} "
        f"từ {sample['tickets_sold']} vé đã bán qua {sample['total_orders']} đơn hàng. "
        f"Sau khi trừ phí nền tảng {money(sample['platform_fee'])}, "
        f"doanh thu ròng ước tính đạt {money(sample['net_revenue'])}. "
        f"{performance_sentence(sample['occupancy_rate'])} "
        f"Hạng vé {sample['best_ticket_type']} là nhóm bán nổi bật nhất, "
        f"ngày bán tốt nhất là {sample['best_sales_day']}. "
        f"{recommendation_sentence(sample['occupancy_rate'], sample['best_ticket_type'])}"
    )


def build_sample(index):
    tickets_sold = random.randint(20, 600)
    total_orders = random.randint(max(10, tickets_sold // 3), max(11, tickets_sold))
    avg_price = random.choice([50000, 75000, 100000, 150000, 200000, 300000, 500000])
    gross_revenue = tickets_sold * avg_price
    platform_fee = int(gross_revenue * random.choice([0.05, 0.08, 0.10, 0.12]))
    net_revenue = gross_revenue - platform_fee
    occupancy_rate = random.randint(10, 98)
    event_title = f"{random.choice(EVENT_NAMES)} {2026 + (index % 2)}"
    ticket_type = random.choice(TICKET_TYPES)
    best_day = f"2026-06-{random.randint(10, 28):02d}"

    return {
        "event_title": event_title,
        "gross_revenue": gross_revenue,
        "net_revenue": net_revenue,
        "platform_fee": platform_fee,
        "tickets_sold": tickets_sold,
        "total_orders": total_orders,
        "occupancy_rate": occupancy_rate,
        "best_ticket_type": ticket_type,
        "best_sales_day": best_day,
    }


def main():
    random.seed(42)
    output_path = Path("data/financial_summary_train.jsonl")
    output_path.parent.mkdir(exist_ok=True)

    rows = []
    for i in range(200):
        sample = build_sample(i)
        user_prompt = "Hãy tạo financial summary cho sự kiện sau:\n" + json.dumps(
            sample,
            ensure_ascii=False,
        )
        assistant = build_summary(sample)

        rows.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": assistant},
            ]
        })

    output_path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )

    print(f"Generated {len(rows)} samples to {output_path}")


if __name__ == "__main__":
    main()