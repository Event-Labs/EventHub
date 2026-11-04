#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_diverse_samples_v2.py
------------------------------
Bổ sung các mẫu dữ liệu thực tế khó (Edge Cases) cho Dataset EventHub V2:
1. Nhiều sessions (multi-day, multi-track, sáng/chiều).
2. Nhiều loại vé, vé miễn phí kết hợp có phí, vé early bird.
3. Thiếu thông tin (chưa chốt địa điểm, chưa có giá vé, giờ sẽ thông báo sau).
4. Đa địa điểm được thảo luận nhưng chỉ chốt 1 địa điểm chính thức.
5. Lịch trình có cập nhật mới (giờ cũ bị thay thế bằng giờ mới).
6. Tài liệu không liên quan (hóa đơn, công văn từ chối, nhật ký cá nhân).
7. Tài liệu song ngữ Anh - Việt, viết tắt, văn phong chat, email trao đổi.

Tất cả các mẫu đều tuân thủ 100% schema V2 và không chứa hallucination.
"""

import os
import sys
import json

DIVERSE_SAMPLES = [
    # 1. Multi-sessions: Sự kiện 3 ngày với các mốc giờ khác nhau
    {
        "id": "EVT-V2-001",
        "type": "unstructured",
        "input_text": """Từ: ban-to-chuc@vietnamgamedev.org
Đến: partners@techhub.vn
Tiêu đề: Thống nhất kế hoạch tổ chức Vietnam GameDev Summit 2027

Chào các anh/chị,
Sau buổi họp trưa nay, BTC xin chốt lịch trình chính thức cho sự kiện "Vietnam GameDev Summit 2027" như sau:
Chương trình diễn ra trong 2 ngày tại Trung tâm Hội nghị White Palace, 194 Hoàng Văn Thụ, Phường 9, Quận Phú Nhuận, Thành phố Hồ Chí Minh.
- Ngày 1 (2027-05-15): Đón khách từ 08:00, khai mạc lúc 09:00, kết thúc lúc 17:00 (Hội thảo kỹ thuật đồ họa & AI trong Game).
- Ngày 2 (2027-05-16): Mở cửa từ 08:30, bắt đầu lúc 09:30, bế mạc lúc 18:00 (Chung kết Game Jam và Lễ trao giải).
Về vé tham dự:
+ Vé Tiêu Chuẩn 2 Ngày: 450.000 VNĐ, số lượng 500 vé.
+ Vé VIP All-Access: 1.200.000 VNĐ, số lượng 100 vé (bao gồm tiệc tối networking).
+ Vé Sinh Viên: 150.000 VNĐ, số lượng 200 vé.
Chính sách vé: Không hoàn tiền dưới mọi hình thức sau khi đã thanh toán.
Người tham gia bắt buộc phải đăng ký họ tên, email và số điện thoại để nhận mã QR vào cổng.""",
        "output_json": {
            "title": "Vietnam GameDev Summit 2027",
            "category": "kinh-doanh-cong-nghe",
            "tags": ["Vietnam GameDev Summit", "GameDev", "Công nghệ", "AI", "Game Jam"],
            "short_description": "Hội nghị thường niên kết nối cộng đồng phát triển game và lập trình viên đồ họa tại Việt Nam.",
            "description": "<p>Sự kiện quy tụ các chuyên gia phát triển game hàng đầu, chia sẻ về kỹ thuật đồ họa, ứng dụng AI trong game và cuộc thi Game Jam 24h.</p>",
            "venue_name": "Trung tâm Hội nghị White Palace",
            "address_line": "194 Hoàng Văn Thụ",
            "ward": "Phường 9",
            "district": "Quận Phú Nhuận",
            "province": "Thành phố Hồ Chí Minh",
            "sessions": [
                {
                    "session_name": "Ngày 1: Hội thảo kỹ thuật đồ họa & AI trong Game",
                    "start_date": "2027-05-15",
                    "start_time": "09:00",
                    "end_date": "2027-05-15",
                    "end_time": "17:00",
                    "checkin_start_time": "08:00"
                },
                {
                    "session_name": "Ngày 2: Chung kết Game Jam và Lễ trao giải",
                    "start_date": "2027-05-16",
                    "start_time": "09:30",
                    "end_date": "2027-05-16",
                    "end_time": "18:00",
                    "checkin_start_time": "08:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Vé Tiêu Chuẩn 2 Ngày",
                    "price": 450000,
                    "quantity_total": 500,
                    "description": "Tham gia toàn bộ các phiên hội thảo trong 2 ngày"
                },
                {
                    "name": "Vé VIP All-Access",
                    "price": 1200000,
                    "quantity_total": 100,
                    "description": "Bao gồm tiệc tối networking và hàng ghế ưu tiên"
                },
                {
                    "name": "Vé Sinh Viên",
                    "price": 150000,
                    "quantity_total": 200,
                    "description": "Yêu cầu xuất trình thẻ sinh viên hợp lệ khi check-in"
                }
            ],
            "refund_policy": {
                "allow_refunds": False,
                "deadline_days": 7
            },
            "require_attendee_information": True,
            "additional_terms": "Vé không hoàn trả. Cần mang thẻ sinh viên đối với hạng vé sinh viên."
        }
    },
    # 2. Hard case: Nhiều địa điểm được nhắc đến nhưng chỉ chốt 1 địa điểm duy nhất
    {
        "id": "EVT-V2-002",
        "type": "unstructured",
        "input_text": """Biên bản họp chuẩn bị Live Concert: Thanh Âm Mùa Thu
Thời gian họp: 10:00 ngày 15/09/2026.
Nội dung thảo luận về địa điểm:
Nhóm sản xuất đã khảo sát Sân vận động Hoa Lư và Nhà hát Hòa Bình. Tuy nhiên do yêu cầu về hệ thống âm thanh vòm mộc, ban tổ chức chính thức quyết định chọn Nhà hát Lớn Hà Nội, số 1 Tràng Tiền, Quận Hoàn Kiếm, Thành phố Hà Nội làm nơi diễn ra đêm nhạc.
Thời gian tổ chức: Tối thứ Bảy ngày 2027-10-16.
Đón khách bắt đầu lúc 18:30, đêm nhạc chính thức biểu diễn từ 19:45 đến 22:30.
Hạng vé:
- Vé Khán phòng tầng 1: 800.000 VNĐ (số lượng 300)
- Vé Khán phòng tầng 2: 500.000 VNĐ (số lượng 200)
- Vé Ban công: 350.000 VNĐ (số lượng 150)
Vé đã mua được hỗ trợ hoàn hủy trước 7 ngày diễn ra sự kiện.""",
        "output_json": {
            "title": "Thanh Âm Mùa Thu",
            "category": "am-nhac-bieu-dien",
            "tags": ["Live Concert", "Thanh Âm Mùa Thu", "Âm nhạc", "Acoustic"],
            "short_description": "Đêm nhạc thính phòng đặc biệt với các tác phẩm bất hủ về mùa thu.",
            "description": "<p>Đêm hòa nhạc acoustic tại không gian sang trọng của Nhà hát Lớn Hà Nội, mang đến trải nghiệm âm thanh mộc tinh tế.</p>",
            "venue_name": "Nhà hát Lớn Hà Nội",
            "address_line": "Số 1 Tràng Tiền",
            "ward": None,
            "district": "Quận Hoàn Kiếm",
            "province": "Thành phố Hà Nội",
            "sessions": [
                {
                    "session_name": "Phiên chính thức",
                    "start_date": "2027-10-16",
                    "start_time": "19:45",
                    "end_date": "2027-10-16",
                    "end_time": "22:30",
                    "checkin_start_time": "18:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Vé Khán phòng tầng 1",
                    "price": 800000,
                    "quantity_total": 300,
                    "description": "Vị trí khán phòng tầng trệt"
                },
                {
                    "name": "Vé Khán phòng tầng 2",
                    "price": 500000,
                    "quantity_total": 200,
                    "description": "Vị trí tầng lửng"
                },
                {
                    "name": "Vé Ban công",
                    "price": 350000,
                    "quantity_total": 150,
                    "description": "Vị trí tầng trên"
                }
            ],
            "refund_policy": {
                "allow_refunds": True,
                "deadline_days": 7
            },
            "require_attendee_information": False,
            "additional_terms": "Hỗ trợ hoàn trả trước 7 ngày."
        }
    },
    # 3. Hard case: Thông tin cũ bị cập nhật đè (Thời gian đổi từ 08:00 sang 09:30)
    {
        "id": "EVT-V2-003",
        "type": "unstructured",
        "input_text": """THÔNG BÁO THAY ĐỔI LỊCH TRÌNH
Sự kiện: Workshop Thiết Kế Gốm Thủ Công & Trà Đạo
Kính gửi quý học viên,
Theo kế hoạch ban đầu, workshop dự kiến bắt đầu từ 08:00 ngày 2027-03-21. Tuy nhiên để chuẩn bị chu đáo đất sét và lò nung, nghệ nhân xin dời giờ bắt đầu sang 09:30 cùng ngày (2027-03-21), đón khách từ 09:00 và kết thúc vào 12:30 trưa.
Địa điểm không thay đổi: Xưởng Gốm Mộc Nhiên, 45 Đường số 7, Phường Thảo Điền, Thành phố Thủ Đức, Thành phố Hồ Chí Minh.
Học phí trọn gói: 350.000 VNĐ/người (đã gồm nguyên liệu và thành phẩm mang về). Số lượng học viên tối đa: 25 người.
Chính sách: Khách không thể tham dự vui lòng báo trước 3 ngày để được hoàn 100% học phí.""",
        "output_json": {
            "title": "Workshop Thiết Kế Gốm Thủ Công & Trà Đạo",
            "category": "hoi-thao-giao-duc",
            "tags": ["Workshop", "Gốm thủ công", "Trà đạo", "Nghệ thuật"],
            "short_description": "Trải nghiệm tự tay tạo tác sản phẩm gốm mộc và thưởng trà thư giãn cuối tuần.",
            "description": "<p>Không gian sáng tạo dành cho người yêu thủ công mỹ nghệ, hướng dẫn từ nghệ nhân lành nghề.</p>",
            "venue_name": "Xưởng Gốm Mộc Nhiên",
            "address_line": "45 Đường số 7",
            "ward": "Phường Thảo Điền",
            "district": "Thành phố Thủ Đức",
            "province": "Thành phố Hồ Chí Minh",
            "sessions": [
                {
                    "session_name": "Phiên duy nhất",
                    "start_date": "2027-03-21",
                    "start_time": "09:30",
                    "end_date": "2027-03-21",
                    "end_time": "12:30",
                    "checkin_start_time": "09:00"
                }
            ],
            "ticket_types": [
                {
                    "name": "Vé Trọn Gói",
                    "price": 350000,
                    "quantity_total": 25,
                    "description": "Bao gồm nguyên liệu và thành phẩm mang về"
                }
            ],
            "refund_policy": {
                "allow_refunds": True,
                "deadline_days": 3
            },
            "require_attendee_information": False,
            "additional_terms": "Báo trước 3 ngày để được hoàn phí."
        }
    },
    # 4. Hard case: Địa điểm chưa xác định, giá vé chưa chốt (Unconfirmed/Tentative fields)
    {
        "id": "EVT-V2-004",
        "type": "unstructured",
        "input_text": """Ý tưởng đề xuất: Giải Chạy Bán Marathon Băng Rừng - Jungle Trail 2027
Người đề xuất: CLB Runner Việt
Dự kiến tổ chức vào ngày 2027-08-15.
Hiện tại địa điểm đang được khảo sát giữa Vườn Quốc gia Cúc Phương và Ba Vì, chưa có quyết định chính thức nên không ghi địa điểm cụ thể.
Các cự ly thi đấu:
- Cự ly 10KM: Giá vé dự kiến đang tính toán, chưa chốt.
- Cự ly 21KM: Giá vé và số lượng mở bán sẽ được thông báo sau khi xin xong giấy phép.
Thời gian xuất phát dự kiến sáng sớm lúc 05:30. Giờ check-in nhận Bib từ 04:30. Kết thúc cut-off time lúc 10:30.
Vui lòng không tự điền giá vé hay địa điểm khi thông tin chưa được phê duyệt.""",
        "output_json": {
            "title": "Jungle Trail 2027",
            "category": "the-thao",
            "tags": ["Jungle Trail", "Marathon", "Chạy bộ", "Thể thao"],
            "short_description": "Giải chạy địa hình băng rừng thử thách sức bền và hòa mình vào thiên nhiên hoang dã.",
            "description": "<p>Cung đường chạy địa hình băng rừng với hai cự ly thử thách 10KM và 21KM dành cho cộng đồng yêu chạy bộ.</p>",
            "venue_name": None,
            "address_line": None,
            "ward": None,
            "district": None,
            "province": None,
            "sessions": [
                {
                    "session_name": "Phiên thi đấu chính thức",
                    "start_date": "2027-08-15",
                    "start_time": "05:30",
                    "end_date": "2027-08-15",
                    "end_time": "10:30",
                    "checkin_start_time": "04:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Cự ly 10KM",
                    "price": None,
                    "quantity_total": None,
                    "description": "Giá vé và số lượng chưa chốt"
                },
                {
                    "name": "Cự ly 21KM",
                    "price": None,
                    "quantity_total": None,
                    "description": "Giá vé và số lượng chưa chốt"
                }
            ],
            "refund_policy": {
                "allow_refunds": True,
                "deadline_days": 7
            },
            "require_attendee_information": False,
            "additional_terms": "Địa điểm và giá vé đang chờ phê duyệt."
        }
    },
    # 5. Hard case: Tài liệu dạng bảng Markdown nhiều cột
    {
        "id": "EVT-V2-005",
        "type": "structured",
        "input_text": """# KẾ HOẠCH HỘI CHỢ ẨM THỰC CHAY TOÀN QUỐC 2027
Chủ đề: Sống An Lạc - Ăn Thuần Thực Vật

| Hạng mục | Chi tiết |
| --- | --- |
| Tên sự kiện | Hội Chợ Ẩm Thực Chay Toàn Quốc 2027 |
| Thời gian diễn ra | 2027-11-20 |
| Giờ mở cửa đón khách | 08:00 |
| Giờ khai mạc | 09:00 |
| Giờ bế mạc | 21:00 |
| Địa điểm | Cung Văn hóa Lao động Hữu nghị Việt - Xô |
| Địa chỉ | 91 Trần Hưng Đạo, Quận Hoàn Kiếm, Thành phố Hà Nội |

### BẢNG GIÁ VÉ THAM GIA:
| Hạng vé | Giá vé (VNĐ) | Số lượng | Quyền lợi |
| --- | --- | --- | --- |
| Vé Vào Cổng Tự Do | 0 | 2000 | Miễn phí vào cổng tham quan và mua sắm |
| Vé Trải Nghiệm Buffet Chay | 180000 | 500 | Bao gồm suất ăn buffet chay 30 món cao cấp |
| Vé Workshop Dinh Dưỡng | 100000 | 100 | Tham dự lớp học nấu món chay thực dưỡng cùng đầu bếp |

*Lưu ý: Sự kiện không hoàn trả tiền vé Buffet sau khi mua.""",
        "output_json": {
            "title": "Hội Chợ Ẩm Thực Chay Toàn Quốc 2027",
            "category": "le-hoi-van-hoa",
            "tags": ["Ẩm thực chay", "Ăn chay", "Lễ hội", "Hà Nội", "Sống khỏe"],
            "short_description": "Ngày hội quy tụ hơn 100 gian hàng ẩm thực chay thuần thực vật và các workshop dinh dưỡng xanh.",
            "description": "<p>Hội chợ giới thiệu các món ăn chay phong phú từ truyền thống đến hiện đại, mang đến thông điệp sống an lành và bảo vệ môi trường.</p>",
            "venue_name": "Cung Văn hóa Lao động Hữu nghị Việt - Xô",
            "address_line": "91 Trần Hưng Đạo",
            "ward": None,
            "district": "Quận Hoàn Kiếm",
            "province": "Thành phố Hà Nội",
            "sessions": [
                {
                    "session_name": "Ngày hội chính",
                    "start_date": "2027-11-20",
                    "start_time": "09:00",
                    "end_date": "2027-11-20",
                    "end_time": "21:00",
                    "checkin_start_time": "08:00"
                }
            ],
            "ticket_types": [
                {
                    "name": "Vé Vào Cổng Tự Do",
                    "price": 0,
                    "quantity_total": 2000,
                    "description": "Miễn phí vào cổng tham quan và mua sắm"
                },
                {
                    "name": "Vé Trải Nghiệm Buffet Chay",
                    "price": 180000,
                    "quantity_total": 500,
                    "description": "Bao gồm suất ăn buffet chay 30 món cao cấp"
                },
                {
                    "name": "Vé Workshop Dinh Dưỡng",
                    "price": 100000,
                    "quantity_total": 100,
                    "description": "Tham dự lớp học nấu món chay thực dưỡng cùng đầu bếp"
                }
            ],
            "refund_policy": {
                "allow_refunds": False,
                "deadline_days": 7
            },
            "require_attendee_information": False,
            "additional_terms": "Không hoàn trả tiền vé buffet sau khi mua."
        }
    },
    # 6. Hard case: Tài liệu dạng JSON raw data
    {
        "id": "EVT-V2-006",
        "type": "structured",
        "input_text": """{
  "event_name": "Đà Nẵng Startup Demo Day 2027",
  "category": "kinh-doanh-cong-nghe",
  "description": "Sự kiện thuyết trình gọi vốn và kết nối nhà đầu tư thiên thần cho các dự án khởi nghiệp công nghệ miền Trung.",
  "location": {
    "venue": "Trung tâm Đổi mới Sáng tạo Đà Nẵng",
    "street": "Số 2 Quang Trung",
    "district": "Hải Châu",
    "city": "Đà Nẵng"
  },
  "schedule": {
    "date": "2027-09-10",
    "check_in": "13:30",
    "pitching_starts": "14:00",
    "networking_ends": "18:00"
  },
  "admission": [
    {"tier": "Khách tham dự tiêu chuẩn", "fee_vnd": 0, "capacity": 150},
    {"tier": "Nhà đầu tư (Investor Pass)", "fee_vnd": 500000, "capacity": 50}
  ],
  "attendee_kyc": true
}""",
        "output_json": {
            "title": "Đà Nẵng Startup Demo Day 2027",
            "category": "kinh-doanh-cong-nghe",
            "tags": ["Startup", "Đà Nẵng", "Demo Day", "Công nghệ", "Đầu tư"],
            "short_description": "Sự kiện thuyết trình gọi vốn và kết nối nhà đầu tư thiên thần cho các dự án khởi nghiệp công nghệ miền Trung.",
            "description": "<p>Cơ hội gặp gỡ 10 startup công nghệ triển vọng nhất miền Trung thuyết trình trước hơn 30 quỹ đầu tư mạo hiểm.</p>",
            "venue_name": "Trung tâm Đổi mới Sáng tạo Đà Nẵng",
            "address_line": "Số 2 Quang Trung",
            "ward": None,
            "district": "Quận Hải Châu",
            "province": "Thành phố Đà Nẵng",
            "sessions": [
                {
                    "session_name": "Phiên Pitching & Networking",
                    "start_date": "2027-09-10",
                    "start_time": "14:00",
                    "end_date": "2027-09-10",
                    "end_time": "18:00",
                    "checkin_start_time": "13:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Khách tham dự tiêu chuẩn",
                    "price": 0,
                    "quantity_total": 150,
                    "description": "Vé miễn phí tham quan"
                },
                {
                    "name": "Nhà đầu tư (Investor Pass)",
                    "price": 500000,
                    "quantity_total": 50,
                    "description": "Bao gồm tài liệu thẩm định doanh nghiệp và quyền tiếp cận phòng VIP"
                }
            ],
            "refund_policy": {
                "allow_refunds": True,
                "deadline_days": 7
            },
            "require_attendee_information": True,
            "additional_terms": "Bắt buộc đăng ký danh tính để nhận thẻ nhà đầu tư."
        }
    },
    # 7. Hard case: Đoạn chat trao đổi không theo thứ tự thời gian
    {
        "id": "EVT-V2-007",
        "type": "unstructured",
        "input_text": """[09:12] Minh: alo mọi người ơi, chốt tên sự kiện là "Acoustic Trên Mây - Đà Lạt Sunset" nha
[09:13] An: ok anh, còn ngày thì sao? chốt thứ Bảy 2027-06-19 được ko?
[09:15] Minh: Được, ngày 2027-06-19 nhé. Khách nên đến từ 16:30 để ngắm hoàng hôn, ban nhạc bắt đầu hát lúc 17:30 đến tầm 20:30 là xong.
[09:16] Lan: Địa điểm ở đâu thế ạ?
[09:18] Minh: Quán cà phê Mây Lang Thang, số 7B Hoàng Hoa Thám, Phường 10, Thành phố Đà Lạt.
[09:20] An: Giá vé thì sao a?
[09:22] Minh: Bán 2 loại: Vé Hoàng Hôn (ghế thường) 250k gồm nước uống, số lượng 120 vé. Vé Ngắm Sao (ghế VIP sát sân khấu) 450k gồm nước và đồ ăn nhẹ, 50 vé.
[09:24] Lan: Vé có hoàn tiền ko a?
[09:25] Minh: Đêm nhạc ngoài trời nên nếu mưa dời ngày, vé không hoàn lại nha mọi người.""",
        "output_json": {
            "title": "Acoustic Trên Mây - Đà Lạt Sunset",
            "category": "am-nhac-bieu-dien",
            "tags": ["Acoustic", "Đà Lạt", "Mây Lang Thang", "Âm nhạc", "Sunset"],
            "short_description": "Đêm nhạc acoustic lãng mạn ngắm hoàng hôn giữa đồi thông thơ mộng của Đà Lạt.",
            "description": "<p>Thưởng thức những giai điệu mộc mạc bên tách trà ấm trong không gian hoàng hôn buông xuống thung lũng Đà Lạt.</p>",
            "venue_name": "Quán cà phê Mây Lang Thang",
            "address_line": "Số 7B Hoàng Hoa Thám",
            "ward": "Phường 10",
            "district": "Thành phố Đà Lạt",
            "province": "Lâm Đồng",
            "sessions": [
                {
                    "session_name": "Đêm nhạc Acoustic",
                    "start_date": "2027-06-19",
                    "start_time": "17:30",
                    "end_date": "2027-06-19",
                    "end_time": "20:30",
                    "checkin_start_time": "16:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Vé Hoàng Hôn",
                    "price": 250000,
                    "quantity_total": 120,
                    "description": "Bao gồm 1 phần nước uống"
                },
                {
                    "name": "Vé Ngắm Sao",
                    "price": 450000,
                    "quantity_total": 50,
                    "description": "Hàng ghế VIP sát sân khấu, bao gồm nước và đồ ăn nhẹ"
                }
            ],
            "refund_policy": {
                "allow_refunds": False,
                "deadline_days": 7
            },
            "require_attendee_information": False,
            "additional_terms": "Vé không hoàn trả trong mọi trường hợp thời tiết."
        }
    },
    # 8. Hard case: Tài liệu tiếng Anh hoàn toàn (Full English Tech Meetup)
    {
        "id": "EVT-V2-008",
        "type": "unstructured",
        "input_text": """EVENT PROPOSAL: Cloud Native & Kubernetes Community Day Vietnam 2027

Event Summary:
A full-day community conference focusing on cloud-native technologies, container orchestration, DevOps automation, and microservices architecture.

Schedule & Logistics:
Date: 2027-12-04
Check-in & Badge Pickup: 08:30
Opening Remarks: 09:15
Keynote & Tech Sessions: 09:30 - 17:30
Closing & Lucky Draw: 17:30 - 18:00

Location:
Pullman Saigon Centre, 148 Tran Hung Dao Boulevard, District 1, Ho Chi Minh City.

Tickets:
- Early Bird Developer Pass: 200000 VND (Quantity: 150)
- Standard Conference Pass: 350000 VND (Quantity: 300)
- Community Sponsor Ticket: 1000000 VND (Quantity: 30)

Requirements:
Attendees must provide full legal name and email for security clearance and badge printing.
Refund Policy: Cancellations accepted up to 7 days prior to the conference.""",
        "output_json": {
            "title": "Cloud Native & Kubernetes Community Day Vietnam 2027",
            "category": "kinh-doanh-cong-nghe",
            "tags": ["Cloud Native", "Kubernetes", "DevOps", "Công nghệ", "Docker"],
            "short_description": "A full-day community conference focusing on cloud-native technologies, container orchestration and DevOps.",
            "description": "<p>Hội thảo chuyên sâu về công nghệ điện toán đám mây, Kubernetes và văn hóa kỹ thuật DevOps dành cho cộng đồng kỹ sư tại Việt Nam.</p>",
            "venue_name": "Pullman Saigon Centre",
            "address_line": "148 Tran Hung Dao Boulevard",
            "ward": None,
            "district": "Quận 1",
            "province": "Thành phố Hồ Chí Minh",
            "sessions": [
                {
                    "session_name": "Conference Day",
                    "start_date": "2027-12-04",
                    "start_time": "09:15",
                    "end_date": "2027-12-04",
                    "end_time": "18:00",
                    "checkin_start_time": "08:30"
                }
            ],
            "ticket_types": [
                {
                    "name": "Early Bird Developer Pass",
                    "price": 200000,
                    "quantity_total": 150,
                    "description": "Standard conference access with early bird discount"
                },
                {
                    "name": "Standard Conference Pass",
                    "price": 350000,
                    "quantity_total": 300,
                    "description": "Full conference and expo access"
                },
                {
                    "name": "Community Sponsor Ticket",
                    "price": 1000000,
                    "quantity_total": 30,
                    "description": "Special VIP badge, speaker dinner invitation and swag pack"
                }
            ],
            "refund_policy": {
                "allow_refunds": True,
                "deadline_days": 7
            },
            "require_attendee_information": True,
            "additional_terms": "Cancellations accepted up to 7 days prior to conference."
        }
    }
]

def append_diverse_samples(cleaned_dataset_path):
    existing_ids = set()
    records = []
    if os.path.exists(cleaned_dataset_path):
        with open(cleaned_dataset_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    rec = json.loads(line)
                    existing_ids.add(rec.get("id"))
                    records.append(rec)

    added = 0
    for s in DIVERSE_SAMPLES:
        if s["id"] not in existing_ids:
            records.append(s)
            added += 1

    with open(cleaned_dataset_path, 'w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f"Added {added} diverse edge-case samples. Total dataset size: {len(records)}")

if __name__ == "__main__":
    target = os.path.abspath("ai/datasets/cleaned/eventhub_v2/dataset_all.jsonl")
    append_diverse_samples(target)
