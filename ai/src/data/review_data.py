import json
import os

# System Prompt kiểm duyệt sự kiện chuẩn hóa dựa trên các bộ chính sách của EventHub:
REVIEW_SYSTEM_PROMPT = """Bạn là Chuyên gia Kiểm duyệt & Đánh giá Toàn diện Sự kiện tự động của nền tảng EventHub.
Nhiệm vụ của bạn là kiểm tra, soát lỗi và đánh giá sự kiện một cách KHÁCH QUAN, CHUẨN XÁC theo các bộ tiêu chuẩn:

1. NGUYÊN TẮC KIỂM DUYỆT NỘI DUNG NHẠY CẢM & KHIÊU DÂM (SENSIBLE SAFETY MODERATION):
   - ĐÁNH GIÁ ĐÚNG NGỮ CẢNH: KHÔNG ĐƯỢC quá nhạy cảm hay vội vàng gắn mác khiêu dâm/18+ chỉ vì một vài từ ngữ đơn lẻ mang tính nghệ thuật, thời trang, giải trí, ca múa nhạc, yoga/thể hình, sức khỏe hay y khoa.
   - CHỈ XẾP VÀO VI PHẠM KHIÊU DÂM KHI: Có nội dung đồi trụy rõ ràng, hình ảnh khỏa thân/bộ phận nhạy cảm lộ liễu, hành vi quan hệ tình dục công khai, hoặc nội dung gạ gẫm mại dâm/kích dục bất hợp pháp.
   - Nghiêm cấm cờ bạc trái phép, lừa đảo tài chính (Ponzi, cam kết x100 lợi nhuận không rủi ro), bạo lực cực đoan.

2. TÍNH NHẤT QUÁN & XÁC THỰC CHỦ ĐỀ SỰ KIỆN (EVENT_COHERENCE):
   - BẮT BUỘC SUY LUẬN CHỦ ĐỀ SỰ KIỆN: Đọc Tiêu đề, Thể loại, Mô tả và Hình ảnh để suy ra chủ đề cốt lõi của sự kiện.
   - ĐỐI CHIẾU CHÉO TÍNH LIÊN QUAN: Tất cả Tiêu đề, Mô tả, Hình ảnh, Vé, Lịch trình và Tài liệu đính kèm BẮT BUỘC PHẢI LIÊN QUAN CHẶT CHẼ đến cùng một chủ đề sự kiện cụ thể.
   - NGHIÊM CẤM LẠC ĐỀ & NGỤY TẠO: Nghiêm cấm sự kiện âm nhạc/hội thảo nhưng tài liệu đính kèm là cuốn từ vựng ngoại ngữ N5, giáo trình, bài tập. Vi phạm -> BẮT BUỘC REJECT.

3. ĐIỀU KHOẢN NHÀ TỔ CHỨC & BẢN CHẤT GIẤY PHÉP PHÁP LÝ (TERMS_ORGANIZER & LEGAL_PERMIT_AUTHENTICITY):
   - Mọi sự kiện bắt buộc phải có Giấy phép tổ chức sự kiện / Tài liệu pháp lý đính kèm hợp lệ (Giấy phép biểu diễn, ĐKKD, Hợp đồng thuê địa điểm, Quyết định phê duyệt).
   - BẢN CHẤT PHÁP LÝ BẮT BUỘC: Tài liệu đính kèm bắt buộc phải là văn bản pháp lý chính thống. Tuyệt đối nghiêm cấm tải lên tài liệu học tập, sách vở, cuốn từ vựng ngoại ngữ (như từ vựng tiếng Nhật N5, ôn thi tiếng Anh...), giáo trình, đề thi, bài tập, truyện tranh, tài liệu cá nhân.
   - NẾU TÀI LIỆU LÀ SÁCH, TỪ VỰNG HOẶC PHI PHÁP LÝ -> BẮT BUỘC xếp vào "critical_violations" (TERMS_ORGANIZER / LEGAL_PERMIT_AUTHENTICITY) và ra quyết định REJECT!

4. NGUYÊN TẮC ĐỀ XUẤT CẢI THIỆN (EFFECTIVE & VALUABLE SUGGESTIONS):
   - KHÔNG SPAM GỢI Ý THỪA THÃI: Hệ thống nền tảng đã tự động chuẩn hóa kích thước/tỷ lệ ảnh và tối ưu CDN, do đó TUYỆT ĐỐI KHÔNG đưa ra các gợi ý hiển nhiên như "thay đổi kích thước ảnh", "chỉnh lại độ phân giải ảnh".
   - CHỈ ĐỀ XUẤT KHI THỰC SỰ CẦN THIẾT & CÓ GIÁ TRỊ THỰC TẾ:
     + Khi phát hiện thiếu thông tin quan trọng (ví dụ: chưa có Hotline hỗ trợ, chưa có quy định check-in vé, lịch trình thiếu mốc giờ cụ thể).
     + Khi có lỗi chính tả cụ thể trong tiêu đề/mô tả hoặc chữ trên ảnh bị mâu thuẫn ngày giờ với bài đăng.
     + Khi bài viết mô tả quá sơ sài, thiếu đề mục phân đoạn rõ ràng hoặc chưa có ảnh minh họa.

5. SOÁT LỖI TIÊU ĐỀ & MÔ TẢ (CONTENT & SPELLING):
   - Soát lỗi chính tả (telex, dấu câu, sai từ) trong Tiêu đề, Mô tả ngắn và Mô tả chi tiết. Liệt kê lỗi chính tả vào "spelling_grammar_issues" kèm từ đúng đề xuất.
   - Kiểm tra tiêu đề: Đảm bảo không giật tít lừa đảo, phóng đại sai lệch.

6. KIỂM DUYỆT TẤT CẢ HÌNH ẢNH & OCR:
   - Duyệt từng ảnh: Poster chính (bắt buộc), Banner bìa (bắt buộc), Các ảnh mô tả (tùy chọn), Giấy phép đính kèm.
   - Đánh giá tính phù hợp với chủ đề sự kiện, kiểm tra OCR chữ trên ảnh.

7. LỊCH TRÌNH, VÉ & HOÀN TIỀN:
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
        },

        # --- MẪU 4: TÀI LIỆU LẠC ĐỀ / CUỐN TỪ VỰNG TIẾNG NHẬT N5 (REJECT) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": """Tên sự kiện: Đêm Nhạc Hội Indie Acoustic Chill Night
Thể loại / Định dạng: OFFLINE
Mô tả ngắn: Đêm nhạc giao lưu các ban nhạc trẻ tại Hà Nội.
Mô tả chi tiết: Thưởng thức những giai điệu acoustic mộc mạc và sâu lắng cùng các nghệ sĩ indie được yêu thích.
Hình ảnh sự kiện đã đăng:
- Ảnh đại diện chính (Main Poster): ĐÃ CÓ (Đã tải lên)
- Ảnh bìa (Cover Banner): ĐÃ CÓ (Đã tải lên)
- Ảnh trong bài viết mô tả: CHƯA CÓ
Thời gian tổng thể: 2026-11-20 19:30 đến 2026-11-20 22:30
Hồ sơ Giấy phép & Tài liệu đính kèm:
1 tài liệu đính kèm:
  + [Tài liệu #1] "tai-lieu-n5.pdf" (application/pdf)
Lịch trình (Sessions): Phiên 1 [Biểu diễn chính]: 2026-11-20 19:30 - 2026-11-20 22:30
Cơ cấu vé (Tickets): Vé Tiêu Chuẩn: 120.000 VNĐ (150 vé)
Chính sách hoàn tiền sự kiện: Cho phép hoàn vé trước 3 ngày (Tỷ lệ: 100%)

=== KẾT QUẢ PHÂN TÍCH TÀI LIỆU & HÌNH ẢNH TỪ HỆ THỐNG ===
[Ảnh đại diện chính (Main Poster)]:
Poster đêm nhạc acoustic với hình cây đàn guitar và ánh đèn vàng ấm cúng.

[Ảnh bìa (Cover Banner)]:
Banner sân khấu ca nhạc với thông tin ngày giờ biểu diễn.

[Tài liệu giấy phép (tai-lieu-n5.pdf)]:
[VI PHẠM TÀI LIỆU PHÁP LÝ / LẠC ĐỀ]: Tệp PDF 'tai-lieu-n5.pdf' không phải giấy phép sự kiện mà là Tài liệu học tập/Từ vựng/Giáo trình. Nội dung trích xuất: 'Bài 1: Watashi (Tôi), Anata (Bạn), Sensei (Giáo viên), Nihongo (Tiếng Nhật), N5 Vocabulary list, Kanji, Hiragana, Katakana...'."""},
                {"role": "assistant", "content": json.dumps({
                    "decision": "REJECT",
                    "risk_score": 90,
                    "quality_score": 40,
                    "summary": "Sự kiện bị từ chối do tài liệu đính kèm là cuốn từ vựng tiếng Nhật N5, hoàn toàn không phải giấy phép tổ chức hay hợp đồng địa điểm của sự kiện.",
                    "content_review": {
                        "title_status": "VALID",
                        "title_analysis": "Tiêu đề đêm nhạc acoustic rõ ràng, phù hợp.",
                        "description_status": "VALID",
                        "description_analysis": "Mô tả sự kiện ca nhạc acoustic đầy đủ.",
                        "spelling_grammar_issues": []
                    },
                    "image_review": {
                        "overall_image_verdict": "VIOLATION",
                        "items": [
                            {
                                "source": "MAIN_POSTER",
                                "status": "VALID",
                                "analysis": "Ảnh poster phong cách acoustic đúng chủ đề âm nhạc.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "COVER_BANNER",
                                "status": "VALID",
                                "analysis": "Ảnh bìa sân khấu âm nhạc phù hợp.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "PERMIT_DOCUMENT_1",
                                "status": "VIOLATION",
                                "analysis": "Nội dung tệp là cuốn từ vựng tiếng Nhật N5, không có bất kỳ giá trị pháp lý hay thẩm quyền tổ chức sự kiện âm nhạc nào.",
                                "issues": ["Tài liệu đính kèm là tài liệu học tập/từ vựng ngoại ngữ, không phải Giấy phép tổ chức sự kiện hay Hợp đồng địa điểm."],
                                "suggestion": "Bắt buộc tải lên Giấy phép biểu diễn hoặc Hợp đồng thuê địa điểm hợp lệ của sự kiện."
                            }
                        ]
                    },
                    "compliant_checks": [
                        "Đã có ảnh đại diện chính (Poster) đúng chủ đề âm nhạc",
                        "Đã có ảnh bìa (Cover Banner) hiển thị chuyên nghiệp",
                        "Chính sách hoàn vé minh bạch và cơ cấu vé rõ ràng"
                    ],
                    "critical_violations": [
                        {
                            "policy_code": "EVENT_COHERENCE",
                            "issue": "Nội dung tài liệu đính kèm hoàn toàn không liên quan đến chủ đề sự kiện (Sự kiện đêm nhạc nhưng đính kèm tài liệu học từ vựng tiếng Nhật N5).",
                            "highlighted_text": "Tài liệu #1: tai-lieu-n5.pdf"
                        },
                        {
                            "policy_code": "TERMS_ORGANIZER",
                            "issue": "Tài liệu đính kèm không phải văn bản pháp lý hợp lệ. Nghiêm cấm dùng tài liệu học tập, từ vựng hoặc văn bản phi pháp lý để đối phó quy định giấy phép.",
                            "highlighted_text": "tai-lieu-n5.pdf"
                        }
                    ],
                    "warnings": [],
                    "suggestions": [
                        "Vui lòng thay thế tệp 'tai-lieu-n5.pdf' bằng Giấy phép biểu diễn từ cơ quan có thẩm quyền hoặc Hợp đồng thuê mặt bằng/địa điểm tổ chức đêm nhạc."
                    ]
                }, ensure_ascii=False)}
            ]
        },
        # --- MẪU 5: SỰ KIỆN FAN MEETING QUỐC TẾ — POSTER CHUẨN MỰC & OCR TIẾNG VIỆT (APPROVE) ---
        {
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": """Tên sự kiện: HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH
Thể loại / Định dạng: OFFLINE
Mô tả ngắn: Buổi gặp gỡ và giao lưu độc quyền cùng bộ đôi diễn viên Force & Book tại TP. Hồ Chí Minh.
Mô tả chi tiết: Sự kiện âm nhạc và giao lưu fan meeting chính thức của cặp đôi nghệ sĩ ForceBook. Khán giả sẽ được tham gia các hoạt động tương tác trực tiếp, thưởng thức các tiết mục biểu diễn độc quyền và nhận quà lưu niệm chính hãng từ ban tổ chức.
Hình ảnh sự kiện đã đăng:
- Ảnh đại diện chính (Main Poster): ĐÃ CÓ (Đã tải lên)
- Ảnh bìa (Cover Banner): ĐÃ CÓ (Đã tải lên)
- Ảnh trong bài viết mô tả: CHƯA CÓ (Tùy chọn - không bắt buộc)
Thời gian: 2026-11-20 18:00 đến 2026-11-20 22:00
Giấy phép / Tài liệu đính kèm:
  + [Tài liệu #1] "Giay-Phep-Bieu-Dien-So-VHTT-TPHCM.pdf" (application/pdf)
Lịch trình (Sessions): Phiên 1 [Giao lưu & Biểu diễn]: 18:30 - 21:30
Cơ cấu vé (Tickets): Vé Standard: 800.000 VNĐ (500 vé), Vé VIP (Hi-touch + Photo): 2.500.000 VNĐ (200 vé)
Chính sách hoàn tiền: Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.

=== KẾT QUẢ PHÂN TÍCH TÀI LIỆU & HÌNH ẢNH TỪ HỆ THỐNG ===
[Ảnh đại diện chính (Main Poster)]:
Poster tông màu cam vàng ấm áp, hiển thị hình ảnh hai nghệ sĩ nam Force và Book trong trang phục vest lịch lãm. Chữ OCR trên ảnh: Tiêu đề 'HOMIES - FORCEBOOK FAN MEETING IN HO CHI MINH', thời gian tổ chức 20/11/2026 tại Nhà thi đấu Nguyễn Du, logo đơn vị tổ chức và nhà tài trợ. Bố cục sắc nét, phù hợp hoàn hảo với chủ đề giao lưu nghệ sĩ, không chứa yếu tố nhạy cảm hay vi phạm quy định.

[Ảnh bìa (Cover Banner)]:
Banner ngang khổ rộng thiết kế đồng bộ với poster chính, chữ nổi bật tên chương trình và bộ đôi nghệ sĩ trên phông nền đồ họa hiện đại.

[Tài liệu giấy phép (Giay-Phep-Bieu-Dien-So-VHTT-TPHCM.pdf)]:
[VĂN BẢN ĐỌC TỪ TỆP PDF 'Giay-Phep-Bieu-Dien-So-VHTT-TPHCM.pdf']:
UBND THÀNH PHỐ HỒ CHÍ MINH - SỞ VĂN HÓA VÀ THỂ THAO
Số: 456/GP-SVHTT
QUYẾT ĐỊNH
Về việc chấp thuận tổ chức chương trình biểu diễn nghệ thuật và giao lưu giao lưu văn hóa quốc tế 'HOMIES - FORCEBOOK FAN MEETING'.
Thời gian: Ngày 20 tháng 11 năm 2026. Địa điểm: Nhà thi đấu Nguyễn Du, Quận 1, TP. Hồ Chí Minh.
Dấu mộc đỏ và chữ ký của Phó Giám đốc Sở Văn hóa và Thể thao TP. Hồ Chí Minh.
=== KẾT THÚC PHÂN TÍCH TÀI LIỆU & HÌNH ẢNH ==="""},
                {"role": "assistant", "content": json.dumps({
                    "decision": "APPROVE",
                    "risk_score": 5,
                    "quality_score": 95,
                    "summary": "Sự kiện chuẩn bị hồ sơ xuất sắc: Poster và Banner chuyên nghiệp, thông tin ngày giờ khớp OCR trên ảnh, Giấy phép biểu diễn từ Sở VH&TT TP.HCM hợp lệ.",
                    "content_review": {
                        "title_status": "VALID",
                        "title_analysis": "Tiêu đề chuẩn mực, nêu rõ tên nghệ sĩ và địa điểm tổ chức.",
                        "description_status": "VALID",
                        "description_analysis": "Mô tả chi tiết quyền lợi người tham gia, lịch trình rõ ràng.",
                        "spelling_grammar_issues": []
                    },
                    "image_review": {
                        "overall_image_verdict": "SAFE",
                        "items": [
                            {
                                "source": "MAIN_POSTER",
                                "status": "VALID",
                                "analysis": "Poster chụp hai nghệ sĩ chỉn chu, chữ tiêu đề và ngày giờ 20/11/2026 khớp thông tin bài đăng, hình ảnh sắc nét và hoàn toàn an toàn.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "COVER_BANNER",
                                "status": "VALID",
                                "analysis": "Ảnh bìa ngang hiển thị logo và tên sự kiện rõ ràng, bố cục cân đối và màu sắc bắt mắt.",
                                "issues": [],
                                "suggestion": ""
                            },
                            {
                                "source": "PERMIT_DOCUMENT_1",
                                "status": "VALID",
                                "analysis": "Giấy phép biểu diễn số 456/GP-SVHTT do Sở Văn hóa & Thể thao TP.HCM cấp phép đúng địa điểm và thời gian tổ chức sự kiện.",
                                "issues": [],
                                "suggestion": ""
                            }
                        ]
                    },
                    "compliant_checks": [
                        "Đã có ảnh đại diện chính (Poster) đúng chủ đề sự kiện",
                        "Đã có ảnh bìa (Cover Banner) hiển thị chuyên nghiệp",
                        "Đã có Giấy phép biểu diễn chính thức từ cơ quan nhà nước có thẩm quyền",
                        "Thông tin ngày giờ và địa điểm trên poster khớp với bài đăng",
                        "Chính sách vé và hoàn tiền minh bạch"
                    ],
                    "critical_violations": [],
                    "warnings": [],
                    "suggestions": [
                        "Gợi ý bổ sung sơ đồ ghế ngồi chi tiết trong phần mô tả để người mua vé VIP và Standard dễ chọn chỗ."
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
