import random

FINANCE_PROMPT = "Hãy viết báo cáo tài chính (financial summary) cho sự kiện sau."

def generate_finance_samples():
    samples = []
    for _ in range(5):
        revenue = random.randint(10, 500) * 1000000
        tickets = random.randint(50, 2000)
        fee = int(revenue * 0.1)
        net = revenue - fee
        
        samples.append({
            "messages": [
                {"role": "system", "content": FINANCE_PROMPT},
                {"role": "user", "content": f"Sự kiện ABC có doanh thu vé {revenue:,} VNĐ, phí nền tảng {fee:,} VNĐ, số vé bán ra {tickets} vé."},
                {"role": "assistant", "content": f"Báo cáo tài chính Sự kiện ABC:\n- Tổng doanh thu bán vé: {revenue:,} VNĐ\n- Tổng số vé bán ra: {tickets} vé\n- Phí nền tảng (10%): {fee:,} VNĐ\n- Doanh thu thực nhận: {net:,} VNĐ\nĐánh giá: Sự kiện đã diễn ra thành công với tỷ lệ lấp đầy tốt."}
            ]
        })
    return samples
