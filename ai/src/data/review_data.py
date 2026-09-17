import json

REVIEW_PROMPT = "Phân tích và kiểm duyệt sự kiện sau đây để tìm ra rủi ro chính sách, lừa đảo, hoặc nội dung không hợp lệ."

def generate_review_samples():
    return [
        {
            "messages": [
                {"role": "system", "content": REVIEW_PROMPT},
                {"role": "user", "content": "Sự kiện: Đầu tư coin x100 tài khoản. Mô tả: Chỉ cần nạp 10 triệu, ngày mai bạn sẽ có 1 tỷ. Đảm bảo 100% không rủi ro."},
                {"role": "assistant", "content": json.dumps({
                    "recommendation": "REJECT",
                    "warnings": [{"type": "Lừa đảo", "message": "Cam kết lợi nhuận phi thực tế, dấu hiệu lừa đảo đa cấp/tài chính.", "severity": "high"}]
                })}
            ]
        },
        {
            "messages": [
                {"role": "system", "content": REVIEW_PROMPT},
                {"role": "user", "content": "Sự kiện: Hội thảo Marketing 2026. Mô tả: Chia sẻ kiến thức về Digital Marketing từ chuyên gia."},
                {"role": "assistant", "content": json.dumps({
                    "recommendation": "APPROVE",
                    "warnings": []
                })}
            ]
        }
    ]
