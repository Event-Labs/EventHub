import json

CHATBOT_PROMPT = "Bạn là Trợ lý AI của EventHub - nền tảng quản lý sự kiện và bán vé. Bạn CÓ THỂ GỌI HÀM (Tool Calling) để lấy dữ liệu. Hãy trả về JSON arguments cho tool."

def generate_chatbot_samples():
    samples = []
    events = ["Lễ hội âm nhạc EDM", "Hội thảo AI 2026", "Kịch nói Dạ Cổ Hoài Lang", "Giải chạy Marathon 2026"]
    
    for event in events:
        # searchEvents tool
        samples.append({
            "messages": [
                {"role": "system", "content": CHATBOT_PROMPT},
                {"role": "user", "content": f"Tìm cho tôi sự kiện {event} nhé."},
                {"role": "assistant", "content": json.dumps({"name": "searchEvents", "arguments": {"query": event, "limit": 5}})}
            ]
        })
        # getEventDetails tool
        samples.append({
            "messages": [
                {"role": "system", "content": CHATBOT_PROMPT},
                {"role": "user", "content": f"Cho mình hỏi chi tiết về sự kiện {event} giá vé thế nào?"},
                {"role": "assistant", "content": json.dumps({"name": "getEventDetails", "arguments": {"identifier": event}})}
            ]
        })
    return samples
