import json
import urllib.request
import sys

# Ensure UTF-8 output on Windows console
sys.stdout.reconfigure(encoding='utf-8')

REVIEW_SYSTEM_PROMPT = """Bạn là Chuyên gia Kiểm duyệt & Đánh giá Sự kiện tự động của nền tảng EventHub.
Nhiệm vụ của bạn là đối chiếu thông tin sự kiện do Nhà tổ chức (Organizer) gửi lên với 4 bộ chính sách cốt lõi của EventHub:

1. ĐIỀU KHOẢN NHÀ TỔ CHỨC (TERMS_ORGANIZER):
   - Thông tin phải chính xác, minh bạch, không gây hiểu lầm.
   - Nghiêm cấm lừa đảo tài chính (Ponzi, crypto x100, cam kết lợi nhuận), cờ bạc, nội dung độc hại (18+, vi phạm pháp luật).
   - Nghiêm cấm thu thập thông tin cá nhân khách hàng ngoài mục đích sự kiện hoặc lôi kéo giao dịch lậu.

2. CHÍNH SÁCH THANH TOÁN (PAYMENT_POLICY):
   - Mọi giao dịch vé phải qua hệ thống EventHub (chuyển khoản, QR, cổng thanh toán hoặc vé tại chỗ chính thức).
   - Nghiêm cấm yêu cầu người mua chuyển khoản cọc cá nhân, giao dịch qua tài khoản ngoài luồng không qua EventHub.

3. CHÍNH SÁCH HOÀN TIỀN (REFUND_POLICY):
   - Sự kiện bị hoãn, hủy hoặc thay đổi nghiêm trọng địa điểm/thời gian/nội dung thì Nhà tổ chức phải chịu trách nhiệm hoàn tiền cho khách.
   - Nghiêm cấm tuyên bố: "Nếu sự kiện bị hủy vẫn không hoàn tiền" (Vi phạm nghiêm trọng chính sách nền tảng).
   - Nếu có chính sách hoàn tiền riêng, phải ghi rõ thời hạn và điều kiện.

4. CHÍNH SÁCH VÉ (TICKET_POLICY):
   - Phải nêu rõ tên loại vé, giá vé, số lượng, quyền lợi và điều kiện tham dự.
   - Địa điểm tổ chức phải cụ thể (số nhà, tên tòa nhà/hội trường, quận/thành phố). Không chấp nhận "địa điểm bí mật nhắn sau".
   - Thời gian diễn ra phải logic (có giờ bắt đầu, giờ kết thúc, không nằm trong quá khứ).

QUY TẮC ĐÁNH GIÁ VÀ XUẤT KẾT QUẢ:
Bạn PHẢI LUÔN LUÔN trả về định dạng JSON thuần túy theo schema sau:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <0 đến 100, điểm rủi ro>,
  "quality_score": <0 đến 100, điểm chất lượng & độ đầy đủ>,
  "summary": "<Tóm tắt đánh giá ngắn gọn bằng tiếng Việt>",
  "policy_violations": [
    {
      "policy_code": "TERMS_ORGANIZER" | "REFUND_POLICY" | "PAYMENT_POLICY" | "TICKET_POLICY" | "PRIVACY_POLICY",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "issue": "<Mô tả lỗi vi phạm điều khoản nào>",
      "highlighted_text": "<Đoạn văn trích dẫn từ sự kiện>"
    }
  ],
  "suggestions": [
    "<Lời khuyên cụ thể giúp Nhà tổ chức chỉnh sửa đúng chính sách EventHub>"
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
    violations = result.get("policy_violations", []) or result.get("flags", [])
    suggestions = result.get("suggestions", [])
    
    print("\n" + "="*65)
    if decision == "APPROVE":
        print("🟢 KẾT LUẬN: ĐƯỢC PHÉP DUYỆT (APPROVE)")
    elif decision == "REJECT":
        print("🔴 KẾT LUẬN: TỪ CHỐI DUYỆT (REJECT)")
    else:
        print("🟡 KẾT LUẬN: CẦN XEM XÉT THÊM (NEEDS_REVIEW)")
    print(f"📊 Điểm Rủi Ro: {risk_score}/100 | Điểm Chất Lượng Bài Viết: {quality_score}/100")
    print(f"📝 Tóm tắt: {summary}")
    
    if violations:
        print("\n⚠️ CÁC ĐIỀU KHOẢN CHÍNH SÁCH VI PHẠM / CẦN LƯU Ý:")
        for idx, v in enumerate(violations, 1):
            policy = v.get('policy_code', v.get('category', 'POLICY'))
            sev = v.get('severity', 'INFO')
            print(f"  {idx}. [{sev}] [{policy}]: {v.get('issue')}")
            if v.get('highlighted_text'):
                print(f"     ➜ Trích đoạn: \"{v.get('highlighted_text')}\"")
                
    if suggestions:
        print("\n💡 GỢI Ý ĐIỀU CHỈNH ĐỂ ĐÚNG CHÍNH SÁCH:")
        for idx, s in enumerate(suggestions, 1):
            print(f"  {idx}. {s}")
    print("="*65 + "\n")

def main():
    print("=== CÔNG CỤ TEST AI REVIEW DỰA TRÊN CHÍNH SÁCH EVENTHUB ===")
    print("1. Test Vi phạm PAYMENT_POLICY (Kêu gọi chuyển khoản cá nhân ngoài luồng)")
    print("2. Test Vi phạm REFUND_POLICY (Tuyên bố hủy sự kiện không hoàn tiền)")
    print("3. Test Vi phạm TICKET_POLICY (Giấu địa chỉ bí mật, thiếu thông tin)")
    print("4. Test Vi phạm TERMS_ORGANIZER (Lừa đảo tài chính x100, Ponzi)")
    print("5. Test Sự kiện Hợp Lệ 100% (Hội thảo Cloud & DevOps)")
    print("6. Tự nhập sự kiện bất kỳ để test")
    
    choice = input("\nChọn kịch bản test (1-6): ").strip()
    
    if choice == "1":
        event = """Tên sự kiện: Hội Thảo Đầu Tư Bất Động Sản Dòng Tiền 2026
Mô tả: Chia sẻ cơ hội đầu tư sinh lời. Để tránh phí sàn, quý khách không mua vé trên web mà vui lòng chuyển khoản trực tiếp vào STK cá nhân: 1903xxx Techcombank để nhận vé qua Zalo.
Địa điểm: Khách sạn Mường Thanh, Hà Nội
Thời gian: 2026-10-30 từ 09:00 - 16:00
Giá vé: 500.000 VNĐ"""
    elif choice == "2":
        event = """Tên sự kiện: Đêm Nhạc Underground EDM Festival
Mô tả: Đại tiệc âm nhạc điện tử ngoài trời. Lưu ý quan trọng: Vé đã mua không đổi trả. Trong trường hợp ban tổ chức hủy show vì mưa bão hoặc lý do kỹ thuật, chúng tôi sẽ không hoàn tiền dưới bất kỳ lý do nào.
Địa điểm: Công viên Bến Bạch Đằng, Quận 1, TP.HCM
Thời gian: 2026-11-15 từ 18:00 - 23:30
Giá vé: 450.000 VNĐ"""
    elif choice == "3":
        event = """Tên sự kiện: Talkshow Xây Dựng Thương Hiệu Cá Nhân
Mô tả: Tự tin giao tiếp và xây dựng hình ảnh cá nhân. Vé 200k.
Địa điểm: Khu vực Ba Đình (địa chỉ cụ thể sẽ gửi tin nhắn 2 tiếng trước giờ diễn)
Thời gian: 2026-10-10
Giá vé: 200.000 VNĐ"""
    elif choice == "4":
        event = """Tên sự kiện: ĐẦU TƯ TIỀN ẢO TƯƠNG LAI - X100 TÀI SẢN 2026
Mô tả: Tham gia hội thảo kín nhận bot tự động giao dịch. Cam kết lợi nhuận 30%/tháng, bao lỗ 100%. Nạp 10 triệu nhận ngay 100 triệu sau 3 tháng.
Địa điểm: Khách sạn 5 sao Hà Nội
Thời gian: 2026-10-15
Giá vé: 500.000 VNĐ"""
    elif choice == "5":
        event = """Tên sự kiện: Hội Thảo Công Nghệ Cloud & DevOps Summit Vietnam 2026
Mô tả: Sự kiện quy tụ 500 kỹ sư chia sẻ về Kubernetes và Microservices. Vé bao gồm tài liệu, tea-break và chứng nhận tham dự. Check-in tự động bằng mã QR trên app EventHub. Hoàn tiền 100% nếu sự kiện bị hoãn/hủy theo chính sách chung của EventHub hoặc gửi yêu cầu trước 7 ngày.
Địa điểm: Trung tâm Hội nghị Quốc gia, 57 Phạm Hùng, Nam Từ Liêm, Hà Nội
Thời gian: 2026-11-20 từ 08:00 đến 17:30
Giá vé: 300.000 VNĐ"""
    else:
        print("\nNhập thông tin sự kiện của bạn:")
        title = input("Tên sự kiện: ")
        desc = input("Mô tả sự kiện: ")
        location = input("Địa điểm: ")
        price = input("Giá vé: ")
        event = f"Tên sự kiện: {title}\nMô tả: {desc}\nĐịa điểm: {location}\nGiá vé: {price}"
        
    print("\n🔄 Đang đối chiếu chính sách EventHub và phân tích...")
    res = review_event(event)
    print_review_result(res)

if __name__ == "__main__":
    main()
