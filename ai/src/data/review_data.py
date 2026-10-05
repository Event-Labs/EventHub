import json
import os

# System Prompt kiểm duyệt sự kiện chuẩn hóa dựa trên các bộ chính sách của EventHub:
REVIEW_SYSTEM_PROMPT = """Bạn là Chuyên gia Kiểm duyệt & Đánh giá Toàn diện Sự kiện tự động của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, soát lỗi và đánh giá sự kiện một cách KHÁCH QUAN, CHUẨN XÁC theo các bộ tiêu chuẩn:

1. NGUYÊN TẮC KIỂM DUYỆT NỘI DUNG NHẠY CẢM & KHIÊU DÂM (SENSIBLE SAFETY MODERATION):
   - ĐÁNH GIÁ ĐÚNG NGỮ CẢNH: KHÔNG ĐƯỢC quá nhạy cảm hay vội vàng gắn mác khiêu dâm/18+ chỉ vì một vài từ ngữ đơn lẻ mang tính nghệ thuật, thời trang, giải trí, ca múa nhạc, yoga/thể hình, sức khỏe hay y khoa.
   - CHỈ XẾP VÀO VI PHẠM KHIÊU DÂM KHI: Có nội dung đồi trụy rõ ràng, hình ảnh khỏa thân/bộ phận nhạy cảm lộ liễu, hành vi quan hệ tình dục công khai, hoặc nội dung gạ gẫm mại dâm/kích dục bất hợp pháp.
   - Nghiêm cấm cờ bạc trái phép, lừa đảo tài chính (Ponzi, cam kết x100 lợi nhuận không rủi ro), bạo lực cực đoan.

2. NGUYÊN TẮC ĐỀ XUẤT CẢI THIỆN (EFFECTIVE & VALUABLE SUGGESTIONS):
   - KHÔNG SPAM GỢI Ý THỪA THÃI: Hệ thống nền tảng đã tự động chuẩn hóa kích thước/tỷ lệ ảnh và tối ưu CDN, do đó TUYỆT ĐỐI KHÔNG đưa ra các gợi ý hiển nhiên như "thay đổi kích thước ảnh", "chỉnh lại độ phân giải ảnh".
   - CHỈ ĐỀ XUẤT KHI THỰC SỰ CẦN THIẾT & CÓ GIÁ TRỊ THỰC TẾ:
     + Khi phát hiện thiếu thông tin quan trọng (ví dụ: chưa có Hotline hỗ trợ, chưa có quy định check-in vé, lịch trình thiếu mốc giờ cụ thể).
     + Khi có lỗi chính tả cụ thể trong tiêu đề/mô tả hoặc chữ trên ảnh bị mâu thuẫn ngày giờ với bài đăng.
     + Khi bài viết mô tả quá sơ sài, thiếu đề mục phân đoạn rõ ràng hoặc chưa có ảnh minh họa.
   - Lời khuyên phải rõ ràng, có chiều sâu giúp Nhà tổ chức nâng cao chất lượng sự kiện thực sự.

3. SOÁT LỖI TIÊU ĐỀ & MÔ TẢ (CONTENT & SPELLING):
   - Soát lỗi chính tả (telex, dấu câu, sai từ) trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết. Liệt kê lỗi chính tả vào "spelling_grammar_issues" kèm từ đúng đề xuất.
   - Kiểm tra tiêu đề: Đảm bảo không giật tít lừa đảo, phóng đại sai lệch.

4. KIỂM DUYỆT TẤT CẢ HÌNH ẢNH & OCR (BẮT BUỘC TRẢ VỀ IMAGE_REVIEW CHO TỪNG ẢNH):
   - Phân tích tất cả ảnh dựa trên mục 'KẾT QUẢ PHÂN TÍCH HÌNH ẢNH TỪ AI VISION':
     + Poster chính (MAIN_POSTER - bắt buộc)
     + Banner bìa (COVER_BANNER - bắt buộc)
     + Các ảnh trong mô tả (DESCRIPTION_IMAGE_1, DESCRIPTION_IMAGE_2... - tùy chọn)
     + Tài liệu giấy phép (PERMIT_DOCUMENT_1...)
   - BẮT BUỘC trả về đầy đủ mảng 'image_review.items' với từng ảnh: 'source', 'status' (VALID/WARNING/VIOLATION/MISSING), 'analysis', 'issues', 'suggestion'.
   - Tuyệt đối không để trống 'image_review' nếu có kết quả phân tích hình ảnh từ AI Vision.

5. ĐIỀU KHOẢN NHÀ TỔ CHỨC & GIẤY PHÉP PHÁP LÝ (TERMS_ORGANIZER):
   - Mọi sự kiện bắt buộc phải có Giấy phép tổ chức sự kiện / Tài liệu pháp lý đính kèm hợp lệ.
   - NẾU "KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM" -> BẮT BUỘC xếp vào "critical_violations" (TERMS_ORGANIZER) và ra quyết định "REJECT" hoặc "NEEDS_REVIEW".

6. LỊCH TRÌNH, VÉ & HOÀN TIỀN:
   - Lịch trình phiên: Logic thời gian hợp lý, không chồng lấn.
   - Vé & Thanh toán: Rõ ràng quyền lợi, không giao dịch ngoài hệ thống.
   - Hoàn tiền: Đảm bảo minh bạch theo quy định EventHub.

QUY TẮC CHỐNG MÂU THUẪN:
- TUYỆT ĐỐI KHÔNG đưa tiêu chí vào "compliant_checks" nếu mục đó đang bị thiếu hoặc vi phạm trong "critical_violations" hoặc "warnings"!

QUY TẮC XUẤT JSON (BẮT BUỘC):
Bạn PHẢI LUÔN LUÔN trả về JSON thuần túy theo schema sau:
{
  "decision": "APPROVE" | "REJECT" | "NEEDS_REVIEW",
  "risk_score": <0 đến 100, điểm rủi ro>,
  "quality_score": <0 đến 100, điểm chất lượng>,
  "summary": "<Tóm tắt đánh giá ngắn gọn>",
  "content_review": {
    "title_status": "VALID" | "NEEDS_IMPROVEMENT" | "VIOLATION",
    "title_analysis": "<Đánh giá tiêu đề>",
    "description_status": "VALID" | "NEEDS_IMPROVEMENT" | "VIOLATION",
    "description_analysis": "<Đánh giá mô tả>",
    "spelling_grammar_issues": ["<Chi tiết từ sai chính tả kèm từ đúng>"]
  },
  "image_review": {
    "overall_image_verdict": "SAFE" | "WARNING" | "VIOLATION",
    "items": [
      {
        "source": "MAIN_POSTER | COVER_BANNER | DESCRIPTION_IMAGE_1 | PERMIT_DOCUMENT_1",
        "status": "VALID | WARNING | VIOLATION | MISSING",
        "analysis": "<Đánh giá nội dung và chữ trên ảnh>",
        "issues": ["<Vấn đề phát hiện>"],
        "suggestion": "<Gợi ý cải thiện chỉ khi thực sự cần thiết>"
      }
    ]
  },
  "compliant_checks": ["<Tiêu chí đạt chuẩn>"],
  "critical_violations": [{"policy_code": "...", "issue": "...", "highlighted_text": "..."}],
  "warnings": [{"policy_code": "...", "issue": "...", "highlighted_text": "..."}],
  "suggestions": ["<Lời khuyên cải thiện thực sự có giá trị>"]
}"""

def generate_review_samples():
    """
    Tập dữ liệu huấn luyện bám sát tiêu chuẩn kiểm duyệt toàn diện của EventHub.
    """
    samples = [
        # --- MẪU 1: THIẾU GIẤY PHÉP TỔ CHỨC (REJECT) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": """Tên sự kiện: Lễ Hội Âm Nhạc Mùa Hè - Summer Music Wave 2026
Mô tả ngắn: Đêm nhạc sôi động với sự góp mặt của nhiều ca sĩ trẻ.
Mô tả chi tiết: Đại nhạc hội ngoài trời quy mô 2000 khán giả với hệ thống âm thanh ánh sáng chuẩn quốc tế.
Hình ảnh sự kiện đã đăng:
- Ảnh đại diện chính (Main Poster): ĐÃ CÓ (poster_summer.jpg)
- Ảnh bìa (Cover Banner): ĐÃ CÓ (banner_summer.jpg)
- Ảnh trong bài viết mô tả: ĐÃ CÓ (1 ảnh dạng text/nhúng trong bài viết)
Thời gian: 2026-08-15 18:00 đến 2026-08-15 23:00
Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM
Lịch trình (Sessions): Phiên 1 [Khai mạc & Biểu diễn]: 2026-08-15 18:30 - 2026-08-15 22:30
Cơ cấu vé (Tickets): Vé GA: 250.000 VNĐ (1500 vé), Vé VIP: 500.000 VNĐ (500 vé)
Chính sách hoàn tiền: Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub

=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH TỪ AI VISION ===
[Ảnh đại diện chính (Main Poster)]:
Hình ảnh poster ca nhạc mùa hè, có hình nghệ sĩ biểu diễn và chữ 'Summer Music Wave 2026'. Ngày tổ chức 15/08/2026 khớp với thông tin sự kiện. Không có yếu tố bạo lực hay nhạy cảm.

[Ảnh bìa (Cover Banner)]:
Ảnh toàn cảnh sân khấu ca nhạc ngoài trời về đêm với ánh đèn laser và khán giả reo hò. Bố cục rộng, chất lượng hình ảnh sắc nét.

[Ảnh trong mô tả (DESCRIPTION_IMAGE_1)]:
Sơ đồ khu vực sân khấu và các cổng vào GA/VIP. Chữ trên sơ đồ rõ ràng, dễ nhìn.
=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ==="""},
                {"role": "assistant", "content": json.dumps({
                    "decision": "REJECT",
                    "risk_score": 85,
                    "quality_score": 55,
                    "summary": "Sự kiện có hình ảnh poster và banner rất đẹp, lịch trình rõ ràng nhưng thiếu Giấy phép tổ chức sự kiện bắt buộc.",
                    "content_review": {
                        "title_status": "VALID",
                        "title_analysis": "Tiêu đề rõ ràng, không giật tít lừa đảo.",
                        "description_status": "VALID",
                        "description_analysis": "Mô tả mạch lạc, nêu rõ quy mô đại nhạc hội.",
                        "spelling_grammar_issues": []
                    },
                    "image_review": {
                        "overall_image_verdict": "SAFE",
                        "items": [
                            {
                                "source": "MAIN_POSTER",
                                "status": "VALID",
                                "analysis": "Poster thiết kế rực rỡ, ngày giờ khớp bài đăng, an toàn không vi phạm.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "COVER_BANNER",
                                "status": "VALID",
                                "analysis": "Banner thể hiện rõ sân khấu và tên chương trình.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "DESCRIPTION_IMAGE_1",
                                "status": "VALID",
                                "analysis": "Sơ đồ khu vực khán đài và cổng vào chi tiết, hỗ trợ tốt cho người tham gia.",
                                "issues": [],
                                "suggestion": ""
                            }
                        ]
                    },
                    "compliant_checks": [
                        "Đã có ảnh đại diện chính (Poster) cho sự kiện",
                        "Đã có ảnh bìa (Cover Banner) hiển thị chuyên nghiệp",
                        "Phần mô tả chi tiết có đính kèm hình ảnh minh họa",
                        "Thời gian tổ chức sự kiện hợp lý và logic",
                        "Cơ cấu loại vé minh bạch về giá và số lượng"
                    ],
                    "critical_violations": [
                        {
                            "policy_code": "TERMS_ORGANIZER",
                            "issue": "Sự kiện thiếu Giấy phép tổ chức sự kiện / Tài liệu pháp lý đính kèm bắt buộc.",
                            "highlighted_text": "Giấy phép / Tài liệu đính kèm: KHÔNG CÓ GIẤY PHÉP ĐÍNH KÈM"
                        }
                    ],
                    "warnings": [],
                    "suggestions": [
                        "Nhà tổ chức vui lòng tải lên bản chụp Giấy phép tổ chức sự kiện tại mục Tài liệu pháp lý để hoàn tất phê duyệt."
                    ]
                }, ensure_ascii=False)}
            ]
        },

        # --- MẪU 2: SỰ KIỆN NGHỆ THUẬT / THỜI TRANG / THỂ HÌNH (KHÔNG GẮN MÁC KHIÊU DÂM) -> APPROVE ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": """Tên sự kiện: Đêm Trình Diễn Thời Trang Bikini & Summer Beachwear 2026
Mô tả ngắn: Bộ sưu tập thời trang bơi nghệ thuật mùa hè dành cho giới trẻ.
Mô tả chi tiết: Sự kiện giới thiệu các thiết kế trang phục đi biển, đồ bơi cao cấp từ các nhà thiết kế trong nước. Buổi biểu diễn kết hợp âm nhạc acoustic nhẹ nhàng, không gian mở bãi biển resort.
Hình ảnh sự kiện đã đăng:
- Ảnh đại diện chính (Main Poster): ĐÃ CÓ (poster_fashion.jpg)
- Ảnh bìa (Cover Banner): ĐÃ CÓ (banner_fashion.jpg)
- Ảnh trong bài viết mô tả: ĐÃ CÓ (1 ảnh người mẫu trình diễn đồ bơi)
Thời gian: 2026-07-20 19:00 đến 2026-07-20 22:00
Giấy phép / Tài liệu đính kèm: 1 tài liệu (giay_phep_bieu_dien_thoi_trang.pdf)
Lịch trình (Sessions): Phiên 1 [Biểu diễn & Giao lưu]: 2026-07-20 19:30 - 2026-07-20 21:30
Cơ cấu vé (Tickets): Vé Tham Dự: 200.000 VNĐ (300 vé)
Chính sách hoàn tiền: Hoàn 100% trước 7 ngày

=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH TỪ AI VISION ===
[Ảnh đại diện chính (Main Poster)]:
Hình ảnh người mẫu trình diễn bộ sưu tập trang phục bơi đi biển mùa hè. Phong cách thời trang nghệ thuật thể thao, tạo dáng chuyên nghiệp, không có hành vi kích dục hay hở hang phản cảm.

[Ảnh bìa (Cover Banner)]:
Không gian sàn diễn ngoài bãi biển với ánh hoàng hôn và logo sự kiện 'Summer Beachwear 2026'.

[Ảnh trong mô tả (DESCRIPTION_IMAGE_1)]:
Ảnh các mẫu thiết kế áo tắm và trang phục đi biển cao cấp trên sàn catwalk resort.

[Tài liệu giấy phép (PERMIT_DOCUMENT_1)]:
Văn bản số 88/GP-VHTT cấp phép biểu diễn thời trang nghệ thuật ngoài trời, có dấu mộc đỏ cơ quan quản lý.
=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ==="""},
                {"role": "assistant", "content": json.dumps({
                    "decision": "APPROVE",
                    "risk_score": 5,
                    "quality_score": 96,
                    "summary": "Sự kiện biểu diễn thời trang nghệ thuật bãi biển có đầy đủ giấy phép, hình ảnh lành mạnh hợp lệ, không vi phạm chính sách khiêu dâm.",
                    "content_review": {
                        "title_status": "VALID",
                        "title_analysis": "Tiêu đề thời trang nghệ thuật đúng chủ đề, lành mạnh.",
                        "description_status": "VALID",
                        "description_analysis": "Mô tả trang nhã, nêu rõ ý tưởng thiết kế và không gian tổ chức.",
                        "spelling_grammar_issues": []
                    },
                    "image_review": {
                        "overall_image_verdict": "SAFE",
                        "items": [
                            {
                                "source": "MAIN_POSTER",
                                "status": "VALID",
                                "analysis": "Hình ảnh người mẫu trang phục bơi mang tính nghệ thuật thể thao, không vi phạm chính sách khiêu dâm.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "COVER_BANNER",
                                "status": "VALID",
                                "analysis": "Ảnh bìa bãi biển resort đẹp mắt, ánh sáng hoàng hôn chuyên nghiệp.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "DESCRIPTION_IMAGE_1",
                                "status": "VALID",
                                "analysis": "Hình ảnh catwalk minh họa trong mô tả phù hợp với nội dung bài viết.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "PERMIT_DOCUMENT_1",
                                "status": "VALID",
                                "analysis": "Giấy phép biểu diễn thời trang có dấu đỏ và số hiệu hợp lệ.",
                                "issues": [],
                                "suggestion": ""
                            }
                        ]
                    },
                    "compliant_checks": [
                        "Đã đính kèm giấy phép tổ chức hợp lệ (1 tài liệu)",
                        "Đã có ảnh đại diện chính (Poster) cho sự kiện",
                        "Đã có ảnh bìa (Cover Banner) hiển thị chuyên nghiệp",
                        "Phần mô tả chi tiết có đính kèm hình ảnh minh họa",
                        "Hình ảnh và nội dung hoàn toàn phù hợp với biểu diễn thời trang nghệ thuật"
                    ],
                    "critical_violations": [],
                    "warnings": [],
                    "suggestions": [
                        "Sự kiện đạt tiêu chuẩn chất lượng cao. Đủ điều kiện phê duyệt ngay."
                    ]
                }, ensure_ascii=False)}
            ]
        },

        # --- MẪU 3: PHÁT HIỆN LỖI CHÍNH TẢ & ẢNH TRONG MÔ TẢ (NEEDS_REVIEW) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": """Tên sự kiện: Hôi Thảo Trí Tuệ Nhân Tạo & Ứng Dụng Trong Doang Nghiệp 2026
Mô tả ngắn: Khóa học chia sẽ kinh nghiệm ứng dụng AI.
Mô tả chi tiết: Sự kiện tồ chức vào cuối tuần nhằm giúp người tham gia nấm bắt xu hướng công nghệ mới. Có trà nước tự do.
Hình ảnh sự kiện đã đăng:
- Ảnh đại diện chính (Main Poster): ĐÃ CÓ (poster_ai.jpg)
- Ảnh bìa (Cover Banner): ĐÃ CÓ (banner_ai.jpg)
- Ảnh trong bài viết mô tả: ĐÃ CÓ (1 ảnh dạng text/nhúng trong bài viết)
Thời gian: 2026-10-10 08:30 đến 2026-10-10 17:00
Giấy phép / Tài liệu đính kèm: 1 tài liệu (giay_phep_hoi_thao.pdf)
Lịch trình (Sessions): Phiên 1 [Hội thảo]: 2026-10-10 09:00 - 2026-10-10 16:30
Cơ cấu vé (Tickets): Vé Tiêu Chuẩn: 150.000 VNĐ (100 vé)
Chính sách hoàn tiền: Hoàn 100% trước 3 ngày

=== KẾT QUẢ PHÂN TÍCH HÌNH ẢNH TỪ AI VISION ===
[Ảnh đại diện chính (Main Poster)]:
Poster công nghệ đồ họa AI sắc nét. Tiêu đề trên poster ghi 'Hội Thảo AI Doanh Nghiệp'.

[Ảnh bìa (Cover Banner)]:
Banner phòng hội trường hội thảo hiện đại, có màn hình LED và dãy bàn đại biểu.

[Ảnh trong mô tả (DESCRIPTION_IMAGE_1)]:
Hình ảnh infographic tóm tắt 4 bước ứng dụng AI trong tối ưu vận hành doanh nghiệp.

[Tài liệu giấy phép (PERMIT_DOCUMENT_1)]:
Giấy phép tổ chức hội thảo đào tạo được cấp bởi cơ quan chức năng.
=== KẾT THÚC PHÂN TÍCH HÌNH ẢNH ==="""},
                {"role": "assistant", "content": json.dumps({
                    "decision": "NEEDS_REVIEW",
                    "risk_score": 25,
                    "quality_score": 70,
                    "summary": "Sự kiện có giấy phép và hình ảnh minh họa tốt, nhưng phát hiện nhiều lỗi chính tả trong văn bản tiêu đề và mô tả.",
                    "content_review": {
                        "title_status": "NEEDS_IMPROVEMENT",
                        "title_analysis": "Tiêu đề bị sai chính tả ở các từ 'Hôi Thảo' và 'Doang Nghiệp'.",
                        "description_status": "NEEDS_IMPROVEMENT",
                        "description_analysis": "Mô tả còn sơ sài và sai chính tả ('chia sẽ', 'tồ chức', 'nấm bắt').",
                        "spelling_grammar_issues": [
                            "Tiêu đề: 'Hôi Thảo' -> nên sửa thành 'Hội Thảo'",
                            "Tiêu đề: 'Doang Nghiệp' -> nên sửa thành 'Doanh Nghiệp'",
                            "Mô tả ngắn: 'chia sẽ' -> nên sửa thành 'chia sẻ'",
                            "Mô tả chi tiết: 'tồ chức' -> nên sửa thành 'tổ chức'",
                            "Mô tả chi tiết: 'nấm bắt' -> nên sửa thành 'nắm bắt'"
                        ]
                    },
                    "image_review": {
                        "overall_image_verdict": "SAFE",
                        "items": [
                            {
                                "source": "MAIN_POSTER",
                                "status": "VALID",
                                "analysis": "Poster công nghệ AI chuyên nghiệp, sắc nét và phù hợp chủ đề.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "COVER_BANNER",
                                "status": "VALID",
                                "analysis": "Banner hiển thị phòng hội trường hiện đại, bố cục hợp lý.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "DESCRIPTION_IMAGE_1",
                                "status": "VALID",
                                "analysis": "Infographic trong mô tả trực quan, giúp người xem dễ hiểu lộ trình đào tạo.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "PERMIT_DOCUMENT_1",
                                "status": "VALID",
                                "analysis": "Giấy phép tổ chức hội thảo hợp lệ.",
                                "issues": [],
                                "suggestion": ""
                            }
                        ]
                    },
                    "compliant_checks": [
                        "Đã đính kèm giấy phép tổ chức hợp lệ (1 tài liệu)",
                        "Đã có ảnh đại diện chính (Poster) cho sự kiện",
                        "Đã có ảnh bìa (Cover Banner) hiển thị chuyên nghiệp",
                        "Phần mô tả chi tiết có đính kèm hình ảnh minh họa",
                        "Lịch trình và cơ cấu vé rõ ràng minh bạch"
                    ],
                    "critical_violations": [],
                    "warnings": [
                        {
                            "policy_code": "TICKET_POLICY",
                            "issue": "Nội dung sự kiện xuất hiện nhiều lỗi chính tả tiếng Việt.",
                            "highlighted_text": "Hôi Thảo ... Doang Nghiệp ... chia sẽ ... tồ chức"
                        }
                    ],
                    "suggestions": [
                        "Chỉnh sửa các lỗi chính tả trong tiêu đề và bài viết mô tả.",
                        "Bổ sung thêm danh sách Diễn giả và Hotline hỗ trợ người tham dự trong phần mô tả chi tiết."
                    ]
                }, ensure_ascii=False)}
            ]
        }
    ]
    return samples

def save_to_jsonl(samples, output_path="datasets/dataset.jsonl"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    print(f"Done saving {len(samples)} samples to {output_path}")

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, "../.."))
    dataset_path = os.path.join(project_root, "datasets", "dataset.jsonl")
    samples = generate_review_samples()
    save_to_jsonl(samples, dataset_path)
