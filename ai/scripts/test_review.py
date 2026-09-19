import json
import urllib.request
import sys

# Ensure UTF-8 output on Windows console
sys.stdout.reconfigure(encoding='utf-8')

REVIEW_SYSTEM_PROMPT = """Bạn là Chuyên gia Kiểm duyệt & Đánh giá Sự kiện tự động của nền tảng EventHub.
Nhiệm vụ của bạn là phân tích chi tiết thông tin sự kiện do Ban tổ chức gửi lên để:
1. Phát hiện các hành vi gian lận, lừa đảo tài chính (Ponzi, crypto x100, đa cấp biến tướng), cờ bạc, nội dung độc hại (18+, bạo lực, vi phạm thuần phong mỹ tục).
2. Kiểm tra tính đầy đủ, logic của thông tin (thời gian, địa điểm cụ thể, giá vé, chính sách hoàn tiền).
3. Đánh giá chất lượng bài viết và đưa ra gợi ý hoàn thiện.

Bạn PHẢI LUÔN LUÔN trả về định dạng JSON thuần túy theo schema sau:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <số nguyên từ 0 đến 100>,
  "quality_score": <số nguyên từ 0 đến 100>,
  "summary": "<Tóm tắt nhận định tổng quan bằng tiếng Việt>",
  "flags": [
    {
      "category": "FRAUD_RISK" | "INAPPROPRIATE_CONTENT" | "MISSING_INFO" | "POLICY_VIOLATION" | "TIMING_LOGIC",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "issue": "<Mô tả lỗi vi phạm cụ thể>",
      "highlighted_text": "<Trích dẫn đoạn văn vi phạm từ bài viết>"
    }
  ],
  "suggestions": [
    "<Lời khuyên giúp Ban tổ chức chỉnh sửa/cải thiện sự kiện>"
  ]
}"""

def review_event(event_text: str):
    url = "http://localhost:11434/api/chat"
    
    payload = {
        "model": "eventhub-qwen3",
        "messages": [
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": event_text}
        ],
        "stream": False,
        "format": "json"
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            raw_content = result.get("message", {}).get("content", "{}")
            parsed_json = json.loads(raw_content)
            return parsed_json
    except urllib.error.URLError:
        print("\n[LỖI]: Không thể kết nối tới Ollama. Hãy đảm bảo bạn đã bật Ollama ('ollama serve')!")
        return None
    except Exception as e:
        print(f"\n[LỖI]: {e}")
        return None

def print_review_result(result):
    if not result:
        return
    
    decision = result.get("decision", "UNKNOWN")
    risk_score = result.get("risk_score", 0)
    quality_score = result.get("quality_score", 0)
    summary = result.get("summary", "")
    flags = result.get("flags", [])
    suggestions = result.get("suggestions", [])
    
    print("\n" + "="*60)
    if decision == "APPROVE":
        print(f"🟢 KẾT LUẬN: ĐƯỢC PHÉP DUYỆT (APPROVE)")
    elif decision == "REJECT":
        print(f"🔴 KẾT LUẬN: TỪ CHỐI DUYỆT (REJECT)")
    else:
        print(f"🟡 KẾT LUẬN: CẦN XEM XÉT THÊM (NEEDS_REVIEW)")
    print(f"📊 Điểm Rủi Ro (Risk Score): {risk_score}/100 | Điểm Chất Lượng (Quality): {quality_score}/100")
    print(f"📝 Tóm tắt: {summary}")
    
    if flags:
        print("\n⚠️ CÁC CẢNH BÁO / VI PHẠM:")
        for idx, f in enumerate(flags, 1):
            print(f"  {idx}. [{f.get('severity', 'INFO')}] {f.get('category')}: {f.get('issue')}")
            if f.get('highlighted_text'):
                print(f"     ➜ Đoạn vi phạm: \"{f.get('highlighted_text')}\"")
                
    if suggestions:
        print("\n💡 GỢI Ý HOÀN THIỆN:")
        for idx, s in enumerate(suggestions, 1):
            print(f"  {idx}. {s}")
    print("="*60 + "\n")

def main():
    print("=== CÔNG CỤ TEST KIỂM DUYỆT SỰ KIỆN AI (EVENTHUB AI REVIEW) ===")
    print("1. Test Sự kiện Lừa đảo Tài chính (Crypto x100)")
    print("2. Test Sự kiện Hợp lệ (Workshop Công nghệ)")
    print("3. Test Sự kiện Thiếu địa chỉ & Giấu thông tin")
    print("4. Nhập sự kiện tùy ý để test")
    
    choice = input("\nChọn chế độ test (1/2/3/4): ").strip()
    
    if choice == "1":
        event = """Tên sự kiện: ĐẦU TƯ TIỀN ẢO TƯƠNG LAI - X100 TÀI SẢN 2026
Mô tả: Tham gia hội thảo kín để nhận bot tự động giao dịch. Cam kết lợi nhuận 30%/tháng, bao lỗ 100%. Nạp 10 triệu nhận ngay 100 triệu sau 3 tháng.
Địa điểm: Khách sạn bí mật
Giá vé: 500.000 VNĐ"""
    elif choice == "2":
        event = """Tên sự kiện: Hội Thảo Trí Tuệ Nhân Tạo & Cloud Vietnam 2026
Mô tả: Sự kiện quy tụ 500 kỹ sư công nghệ chia sẻ về GenAI và tối ưu hệ thống Microservices. Vé bao gồm tea-break, tài liệu hội thảo và quà tặng lưu niệm.
Địa điểm: Trung tâm Hội nghị Quốc gia, 57 Phạm Hùng, Hà Nội
Thời gian: 2026-11-20 từ 08:30 đến 17:00
Giá vé: 300.000 VNĐ"""
    elif choice == "3":
        event = """Tên sự kiện: Workshop Làm Gốm Thủ Công Cuối Tuần
Mô tả: Học làm đồ gốm trang trí mang về. Giá vé 250k/người.
Địa điểm: Khu vực Quận 1 (sẽ gửi định vị sau khi mua vé)
Giá vé: 250.000 VNĐ"""
    else:
        print("\nNhập thông tin sự kiện của bạn:")
        title = input("Tên sự kiện: ")
        desc = input("Mô tả sự kiện: ")
        location = input("Địa điểm: ")
        price = input("Giá vé: ")
        event = f"Tên sự kiện: {title}\nMô tả: {desc}\nĐịa điểm: {location}\nGiá vé: {price}"
        
    print("\n🔄 Đang gửi tới AI phân tích...")
    res = review_event(event)
    print_review_result(res)

if __name__ == "__main__":
    main()
