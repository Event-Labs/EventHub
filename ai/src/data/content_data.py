import json

CONTENT_PROMPT = "Sinh nội dung sự kiện (title, short_description, description) từ thông tin cơ bản sau."

def generate_content_samples():
    return [
        {
            "messages": [
                {"role": "system", "content": CONTENT_PROMPT},
                {"role": "user", "content": "Chủ đề: Khởi nghiệp công nghệ, Địa điểm: TP.HCM"},
                {"role": "assistant", "content": json.dumps({
                    "title": "Hội Nghị Khởi Nghiệp Công Nghệ 2026",
                    "short_description": "Nơi hội tụ của những bộ óc sáng tạo và các startup công nghệ hàng đầu tại TP.HCM.",
                    "description": "Hội nghị Khởi nghiệp Công nghệ 2026 mang đến cơ hội kết nối với các nhà đầu tư, lắng nghe chia sẻ từ những founder thành công..."
                })}
            ]
        }
    ]
