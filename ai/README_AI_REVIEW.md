# 🛡️ Tính Năng AI Event Review & Moderation (Kiểm Duyệt Sự Kiện Tự Động)

Tài liệu này hướng dẫn chi tiết về kiến trúc, bộ tiêu chí kiểm duyệt, định dạng dữ liệu (Dataset) và cách thức tích hợp tính năng **AI Review** vào nền tảng **EventHub**.

---

## 1. 🎯 Mục Tiêu & Đối Tượng Sử Dụng

Tính năng **AI Event Review** đóng 2 vai trò trọng yếu trong hệ thống:
1. **Dành cho Quản trị viên (Admin):** Tự động phát hiện các sự kiện lừa đảo tài chính (Ponzi, crypto x100, đa cấp), cờ bạc, nội dung độc hại (18+, bạo lực) để tự động từ chối hoặc gắn cờ cảnh báo kèm lý do chi tiết cho Admin duyệt nhanh.
2. **Dành cho Ban tổ chức (Organizer):** Đánh giá chất lượng nội dung bài viết sự kiện, kiểm tra độ logic (thời gian, địa điểm, chính sách vé) và đưa ra các gợi ý chỉnh sửa cụ thể để tăng độ tin cậy và tỷ lệ bán vé.

---

## 2. 📋 Bộ Tiêu Chí Kiểm Duyệt (5 Lớp Đánh Giá)

| Lớp Kiểm Duyệt | Phạm Vi Phân Tích | Hành Động Khi Vi Phạm |
| :--- | :--- | :--- |
| **1. Chống Lừa Đảo (Anti-Fraud)** | Cam kết lợi nhuận bất khả thi (*"x100 vốn", "lãi 30%/tháng", "bao lỗ 100%"*), chiêu trò nạp tiền làm nhiệm vụ giật đơn, cọc tiền vào nhóm kín Telegram. | ❌ **`REJECT`** (Rủi ro cao) |
| **2. Pháp Lý & Thuần Phong Mỹ Tục** | Cổ súy cờ bạc, chia sẻ tool hack tài xỉu/baccarat, cá độ thể thao, nội dung 18+, bạo lực, chính trị nhạy cảm. | ❌ **`REJECT`** (Rủi ro cao) |
| **3. Tính Hợp Lý & Đầy Đủ (Validation)** | Giấu địa chỉ (*"Địa chỉ bí mật sẽ nhắn tin sau"*), thiếu địa điểm cụ thể, thời gian phi logic (trong quá khứ, không có khung giờ bắt đầu/kết thúc). | ⚠️ **`NEEDS_REVIEW`** |
| **4. Chính Sách Vé & Hoàn Tiền** | Mâu thuẫn quyền lợi (*"Cam kết hoàn tiền 100% nếu không hài lòng"* nhưng lại ghi *"Không hỗ trợ hoàn tiền dưới mọi lý do"*), ép cọc phí vô lý. | ⚠️ **`NEEDS_REVIEW`** |
| **5. Điểm Chất Lượng & Gợi Ý** | Đánh giá độ dài, tính chuyên nghiệp, cấu trúc bài viết và gợi ý bổ sung danh sách diễn giả, lịch trình, chính sách check-in QR code. | 💡 **Gợi ý hoàn thiện** |

---

## 3. 📂 Cấu Trúc Dataset Huấn Luyện (`src/data/review_data.py`)

Bộ dữ liệu kiểm duyệt được định nghĩa tại `src/data/review_data.py` và được chuẩn hóa theo định dạng Chat (System, User, Assistant).

### Các nhóm kịch bản có sẵn trong Dataset:
- **Nhóm REJECT:**
  - Lừa đảo đầu tư coin x100, bao lỗ.
  - Làm nhiệm vụ giật đơn sàn TMĐT nạp tiền trước.
  - Hội thảo offline chia sẻ tool hack cờ bạc/baccarat.
- **Nhóm APPROVE:**
  - Hội thảo công nghệ TechSummit (AI & Cloud) chuyên nghiệp.
  - Đêm nhạc Indie Acoustic có thông tin check-in và quyền lợi vé rõ ràng.
  - Giải chạy thiện nguyện GreenRun vì trẻ em vùng cao có đơn vị bảo trợ uy tín.
- **Nhóm NEEDS_REVIEW:**
  - Workshop làm bánh giấu địa chỉ cụ thể.
  - Khóa học kỹ năng thuyết trình mâu thuẫn chính sách hoàn tiền.

---

## 4. 📦 Định Dạng Output JSON Chuẩn của AI

AI luôn được cấu hình để phản hồi bằng định dạng **JSON nguyên bản** (Pure JSON), giúp Backend dễ dàng bóc tách dữ liệu và lưu trữ vào Database:

```json
{
  "decision": "REJECT", // "APPROVE" | "NEEDS_REVIEW" | "REJECT"
  "risk_score": 85,      // Thang điểm rủi ro: 0 (An toàn) -> 100 (Cực kỳ nguy hiểm)
  "quality_score": 30,   // Thang điểm chất lượng bài viết: 0 -> 100
  "summary": "Sự kiện có dấu hiệu lừa đảo tài chính với cam kết lợi nhuận phi thực tế và địa điểm tổ chức không rõ ràng.",
  "flags": [
    {
      "category": "FRAUD_RISK",
      "severity": "HIGH",
      "issue": "Cam kết lợi nhuận bất khả thi và bao lỗ 100%.",
      "highlighted_text": "Nạp 10 triệu nhận 100 triệu sau 3 ngày, cam kết bảo hiểm vốn 100%"
    },
    {
      "category": "MISSING_INFO",
      "severity": "MEDIUM",
      "issue": "Địa điểm tổ chức không công khai minh bạch.",
      "highlighted_text": "Khách sạn bí mật"
    }
  ],
  "suggestions": [
    "Loại bỏ các cam kết tài chính không được cấp phép theo quy định.",
    "Cập nhật địa chỉ số nhà, tên hội trường cụ thể."
  ]
}
```

---

## 5. 🔌 Hướng Dẫn Tích Hợp Cho Backend (API Calling)

Backend (Java Spring Boot, .NET Core, NodeJS) có thể gọi trực tiếp vào dịch vụ Ollama nội bộ:

### Endpoint:
- **URL:** `POST http://localhost:11434/api/chat`
- **Headers:** `Content-Type: application/json`

### Body Request Mẫu:
```json
{
  "model": "eventhub-qwen3",
  "messages": [
    {
      "role": "system",
      "content": "Bạn là Chuyên gia Kiểm duyệt Sự kiện EventHub. Hãy phân tích sự kiện sau và trả về JSON chuẩn theo schema: decision (APPROVE/REJECT/NEEDS_REVIEW), risk_score (0-100), quality_score (0-100), summary, flags, suggestions."
    },
    {
      "role": "user",
      "content": "Tên sự kiện: Tech AI Workshop 2026\nMô tả: Hội thảo thực hành ứng dụng GenAI trong doanh nghiệp tại Tòa nhà Innovation, 285 Cách Mạng Tháng 8, Q10, TP.HCM từ 08:30 - 12:00. Vé 150.000 VNĐ bao gồm tài liệu và tea-break."
    }
  ],
  "stream": false,
  "format": "json"
}
```

---

## 6. 🧪 Chạy Thử Nghiệm Kiểm Tra (Test Script)

Bạn có thể chạy script kiểm tra nhanh tính năng review bằng lệnh:
```bash
python scripts/test_review.py
```
Script sẽ gửi một sự kiện mẫu tới AI và in ra kết quả phân tích JSON chi tiết trên màn hình.
