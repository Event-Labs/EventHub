import json

REVIEW_SYSTEM_PROMPT = """Bạn là Chuyên gia Kiểm duyệt & Đánh giá Sự kiện tự động của nền tảng EventHub.
Nhiệm vụ của bạn là phân tích chi tiết thông tin sự kiện do Ban tổ chức gửi lên để:
1. Phát hiện các hành vi gian lận, lừa đảo tài chính (Ponzi, crypto x100, đa cấp biến tướng), cờ bạc, nội dung độc hại (18+, bạo lực, vi phạm thuần phong mỹ tục).
2. Kiểm tra tính đầy đủ, logic của thông tin (thời gian, địa điểm cụ thể, giá vé, chính sách hoàn tiền).
3. Đánh giá chất lượng bài viết và đưa ra gợi ý hoàn thiện.

Bạn PHẢI LUÔN LUÔN trả về định dạng JSON thuần túy theo schema sau:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <số nguyên từ 0 đến 100, càng cao rủi ro càng lớn>,
  "quality_score": <số nguyên từ 0 đến 100, độ hấp dẫn và đầy đủ của nội dung>,
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

def generate_review_samples():
    """
    Sinh các mẫu dữ liệu huấn luyện cho bài toán AI Event Review (Kiểm duyệt sự kiện).
    Bao gồm các kịch bản: Hợp lệ (APPROVE), Lừa đảo/Độc hại (REJECT), Cần bổ sung thông tin (NEEDS_REVIEW).
    """
    samples = [
        # --- NHÓM 1: LỪA ĐẢO TÀI CHÍNH / PONZI / ĐA CẤP (REJECT) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: ĐẦU TƯ TIỀN ẢO TƯƠNG LAI - X100 TÀI SẢN 2026\nMô tả: Tham gia hội thảo kín để nhận siêu bot tự động giao dịch. Cam kết lợi nhuận tối thiểu 30%/tháng, bao lỗ 100%. Nạp 10 triệu nhận ngay 100 triệu sau 3 tháng. Số lượng vé VIP có hạn, chuyển khoản ngay để giữ chỗ.\nĐịa điểm: Khách sạn 5 sao Hà Nội\nThời gian: 2026-10-15\nGiá vé: 500.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "REJECT",
                    "risk_score": 98,
                    "quality_score": 30,
                    "summary": "Sự kiện có dấu hiệu lừa đảo tài chính nghiêm trọng với cam kết lợi nhuận phi thực tế và bao lỗ.",
                    "flags": [
                        {
                            "category": "FRAUD_RISK",
                            "severity": "HIGH",
                            "issue": "Cam kết lợi nhuận bất khả thi và bao lỗ 100% (dấu hiệu mô hình Ponzi/lừa đảo tiền số).",
                            "highlighted_text": "Cam kết lợi nhuận tối thiểu 30%/tháng, bao lỗ 100%. Nạp 10 triệu nhận ngay 100 triệu sau 3 tháng."
                        },
                        {
                            "category": "MISSING_INFO",
                            "severity": "MEDIUM",
                            "issue": "Địa điểm tổ chức mơ hồ, không có tên khách sạn hay địa chỉ cụ thể.",
                            "highlighted_text": "Khách sạn 5 sao Hà Nội"
                        }
                    ],
                    "suggestions": [
                        "Nghiêm cấm đăng tải các nội dung cam kết lợi nhuận tài chính không được cấp phép theo chính sách EventHub."
                    ]
                }, ensure_ascii=False)}
            ]
        },
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Hội Thảo Kiếm Tiền Online Tại Nhà - Vốn 0 Đồng\nMô tả: Làm nhiệm vụ giật đơn Shopee, TikTok kiếm 500k-2tr/ngày. Không cần kinh nghiệm, chỉ cần chuyển trước 200k phí kích hoạt tài khoản cộng tác viên.\nĐịa điểm: Online qua nhóm Telegram kín\nThời gian: 2026-11-01\nGiá vé: Miễn phí"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "REJECT",
                    "risk_score": 95,
                    "quality_score": 25,
                    "summary": "Sự kiện có dấu hiệu lừa đảo tuyển cộng tác viên làm nhiệm vụ nạp tiền.",
                    "flags": [
                        {
                            "category": "FRAUD_RISK",
                            "severity": "HIGH",
                            "issue": "Chiêu trò lừa đảo làm nhiệm vụ giật đơn yêu cầu đóng phí trước qua Telegram.",
                            "highlighted_text": "Làm nhiệm vụ giật đơn Shopee, TikTok... chuyển trước 200k phí kích hoạt tài khoản cộng tác viên"
                        }
                    ],
                    "suggestions": [
                        "Từ chối xuất bản vĩnh viễn sự kiện này do vi phạm điều khoản chống lừa đảo trực tuyến."
                    ]
                }, ensure_ascii=False)}
            ]
        },

        # --- NHÓM 2: NỘI DUNG ĐỘC HẠI / CỜ BẠC / 18+ (REJECT) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Giao Lưu Kèo Bóng & Chia Sẻ Tool Hack Tài Xỉu\nMô tả: Buổi offline bí mật hướng dẫn cài đặt phần mềm dự đoán kết quả baccarat, tài xỉu chuẩn 99%. Tặng code trải nghiệm khi mua vé tham gia.\nĐịa điểm: Quán Cafe Quận 1, TP.HCM\nThời gian: 2026-10-20\nGiá vé: 200.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "REJECT",
                    "risk_score": 99,
                    "quality_score": 20,
                    "summary": "Sự kiện quảng bá và tổ chức hoạt động liên quan đến cờ bạc bất hợp pháp.",
                    "flags": [
                        {
                            "category": "POLICY_VIOLATION",
                            "severity": "HIGH",
                            "issue": "Cổ súy và chia sẻ công cụ cờ bạc, cá cược trực tuyến vi phạm pháp luật Việt Nam.",
                            "highlighted_text": "hướng dẫn cài đặt phần mềm dự đoán kết quả baccarat, tài xỉu chuẩn 99%"
                        }
                    ],
                    "suggestions": [
                        "EventHub nghiêm cấm mọi sự kiện liên quan đến cờ bạc, cá độ và tool hack dưới mọi hình thức."
                    ]
                }, ensure_ascii=False)}
            ]
        },

        # --- NHÓM 3: SỰ KIỆN HỢP LỆ, CHẤT LƯỢNG CAO (APPROVE) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: TechSummit Vietnam 2026: Trí Tuệ Nhân Tạo & Điện Toán Đám Mây\nMô tả: Hội thảo công nghệ thường niên quy tụ hơn 500 kỹ sư và chuyên gia hàng đầu từ Google, Microsoft và FPT. Nội dung bao gồm: Xu hướng Generative AI trong doanh nghiệp, Xây dựng hệ thống Microservices quy mô lớn và Workshop thực hành tối ưu hóa chi phí Cloud. Vé đã bao gồm tea-break, tài liệu hội thảo và quà tặng kỷ niệm từ nhà tài trợ.\nĐịa điểm: Trung tâm Hội nghị Quốc gia, 57 Phạm Hùng, Nam Từ Liêm, Hà Nội\nThời gian: 2026-11-20 từ 08:00 đến 17:30\nGiá vé: 350.000 VNĐ (Early Bird: 250.000 VNĐ)"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "APPROVE",
                    "risk_score": 0,
                    "quality_score": 95,
                    "summary": "Sự kiện công nghệ chuyên nghiệp, thông tin rõ ràng, minh bạch và đầy đủ chi tiết.",
                    "flags": [],
                    "suggestions": [
                        "Nội dung sự kiện rất hoàn chỉnh. Bạn có thể bổ sung thêm danh sách diễn giả cụ thể để thu hút thêm người tham dự."
                    ]
                }, ensure_ascii=False)}
            ]
        },
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Đêm Nhạc Indie Acoustic 'Tháng Mười Mưa Rơi'\nMô tả: Đêm nhạc giao lưu ấm cúng cùng các nghệ sĩ trẻ Indie tài năng tại TP.HCM. Không gian acoustic mộc mạc với 15 ca khúc nhẹ nhàng sâu lắng. Vé vào cửa đã bao gồm 1 phần đồ uống tự chọn (trà/cà phê) và bánh ngọt. Số lượng giới hạn 80 khách để đảm bảo chất lượng trải nghiệm.\nĐịa điểm: The Cozy Acoustic Cafe, 124 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP.HCM\nThời gian: 2026-10-25 từ 19:30 đến 22:00\nGiá vé: 180.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "APPROVE",
                    "risk_score": 5,
                    "quality_score": 90,
                    "summary": "Sự kiện biểu diễn âm nhạc rõ ràng, minh bạch về quyền lợi người mua vé và địa điểm.",
                    "flags": [],
                    "suggestions": [
                        "Nên ghi rõ chính sách check-in vé (QR code tại cửa) và thời gian mở cửa đón khách trước bao nhiêu phút."
                    ]
                }, ensure_ascii=False)}
            ]
        },
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Giải Chạy Bộ Vì Trẻ Em Vùng Cao 2026 (GreenRun 5K/10K/21K)\nMô tả: Giải chạy gây quỹ từ thiện thường niên do Đoàn Thanh Niên phối hợp cùng Quỹ Bảo trợ Trẻ em tổ chức. 100% lợi nhuận từ tiền bán vé sau khi trừ chi phí vận hành sẽ được chuyển trực tiếp vào quỹ xây trường học tại Hà Giang. Người tham gia được nhận trọn bộ Race Kit gồm: Áo thi đấu, BIB gắn chip đo thời gian, huy chương hoàn thành và bảo hiểm sự kiện.\nĐịa điểm: Công viên Yên Sở, Hoàng Mai, Hà Nội\nThời gian: 2026-12-06 từ 05:00 đến 11:00\nGiá vé: 300.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "APPROVE",
                    "risk_score": 0,
                    "quality_score": 98,
                    "summary": "Sự kiện thể thao thiện nguyện xuất sắc, có đơn vị tổ chức uy tín, mục đích và quyền lợi rõ ràng.",
                    "flags": [],
                    "suggestions": [
                        "Bài viết rất chi tiết và truyền cảm hứng. Có thể đính kèm thêm link sao kê hoặc báo cáo tài chính của mùa giải trước để tăng độ tin cậy."
                    ]
                }, ensure_ascii=False)}
            ]
        },

        # --- NHÓM 4: CẦN BỔ SUNG / SỬA ĐỔI THÔNG TIN (NEEDS_REVIEW) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Workshop Làm Bánh Trung Thu Handmade\nMô tả: Tự tay làm những chiếc bánh trung thu thơm ngon cho gia đình. Học làm 4 loại nhân bánh truyền thống và hiện đại. Giá vé 300k đã bao gồm nguyên liệu mang về.\nĐịa điểm: Khu vực Cầu Giấy (sẽ nhắn tin địa chỉ cụ thể cho ai mua vé)\nThời gian: 2026-09-10\nGiá vé: 300.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "NEEDS_REVIEW",
                    "risk_score": 45,
                    "quality_score": 60,
                    "summary": "Sự kiện có nội dung lành mạnh nhưng thiếu thông tin địa chỉ cụ thể và thời gian diễn ra có vấn đề.",
                    "flags": [
                        {
                            "category": "MISSING_INFO",
                            "severity": "MEDIUM",
                            "issue": "Địa điểm tổ chức không được công khai minh bạch trước khi mua vé.",
                            "highlighted_text": "Khu vực Cầu Giấy (sẽ nhắn tin địa chỉ cụ thể cho ai mua vé)"
                        },
                        {
                            "category": "TIMING_LOGIC",
                            "severity": "LOW",
                            "issue": "Chưa có khung giờ bắt đầu và kết thúc cụ thể trong ngày.",
                            "highlighted_text": "Thời gian: 2026-09-10"
                        }
                    ],
                    "suggestions": [
                        "Vui lòng cập nhật địa chỉ số nhà, tên phòng/studio tổ chức cụ thể để đảm bảo quyền lợi khách hàng.",
                        "Bổ sung khung giờ tổ chức (ví dụ: từ 09:00 - 12:00) và chính sách hoàn hủy vé."
                    ]
                }, ensure_ascii=False)}
            ]
        },
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": "Tên sự kiện: Khóa Học Master Kỹ Năng Thuyết Trình Trước Đám Đông\nMô tả: Bạn tự ti khi nói trước đám đông? Khóa học 2 ngày cuối tuần giúp bạn làm chủ giọng nói, ngôn ngữ cơ thể và kỹ năng thuyết phục đỉnh cao. Hoàn tiền 100% nếu sau khóa học bạn không thấy tự tin hơn. Lưu ý: Không hỗ trợ hoàn vé dưới mọi lý do sau khi đã thanh toán.\nĐịa điểm: Tầng 4, Tòa nhà Innovation, 285 Cách Mạng Tháng 8, Quận 10, TP.HCM\nThời gian: 2026-11-14\nGiá vé: 1.500.000 VNĐ"},
                {"role": "assistant", "content": json.dumps({
                    "decision": "NEEDS_REVIEW",
                    "risk_score": 35,
                    "quality_score": 70,
                    "summary": "Sự kiện đào tạo tốt nhưng có sự mâu thuẫn trong cam kết hoàn tiền và chính sách vé.",
                    "flags": [
                        {
                            "category": "POLICY_VIOLATION",
                            "severity": "LOW",
                            "issue": "Mâu thuẫn giữa cam kết 'Hoàn tiền 100% nếu không hài lòng' và 'Không hỗ trợ hoàn vé dưới mọi lý do'.",
                            "highlighted_text": "Hoàn tiền 100% nếu sau khóa học bạn không thấy tự tin hơn. Lưu ý: Không hỗ trợ hoàn vé dưới mọi lý do"
                        }
                    ],
                    "suggestions": [
                        "Làm rõ quy trình hoàn tiền (điều kiện và thời gian tiếp nhận yêu cầu) để tránh hiểu lầm và khiếu nại từ học viên."
                    ]
                }, ensure_ascii=False)}
            ]
        }
    ]
    return samples
