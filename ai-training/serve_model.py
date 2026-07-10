import torch
import re
import json
import os
from fastapi import FastAPI
from pydantic import BaseModel, Field
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


BASE_MODEL = "Qwen/Qwen3-0.6B"
ADAPTER_DIR = "outputs/eventhub-financial-qwen3-lora"
CHAT_ADAPTER_DIR = "outputs/eventhub-chat-qwen3-lora"

SYSTEM_PROMPT = (
    "Bạn là AI Financial Analyst của EventHub. "
    "Nhiệm vụ của bạn là viết báo cáo tài chính tiếng Việt ngắn gọn, chính xác, "
    "dựa hoàn toàn trên số liệu được cung cấp. "
    "Chỉ dùng thuật ngữ nghiệp vụ sau: "
    "gross_revenue là doanh thu gộp, "
    "net_revenue là doanh thu ròng, "
    "platform_fee là phí nền tảng, "
    "tickets_sold là vé đã bán, "
    "total_orders là đơn hàng, "
    "occupancy_rate là tỷ lệ lấp đầy, "
    "best_ticket_type là hạng vé bán tốt nhất, "
    "best_sales_day là ngày bán tốt nhất. "
    "Không dùng các cụm từ sai: tổng thu nhập, thu nhập net, thuế phí, tỷ lệ lưu lượng, giá vé tốt nhất. "
    "Không viết quá trình suy luận, không dùng thẻ <think>, chỉ trả về báo cáo cuối cùng. "
    "Trả lời thành một đoạn văn 4-6 câu, có nhận xét và khuyến nghị ngắn."
)


class FinancialSummaryRequest(BaseModel):
    event_title: str = Field(..., min_length=1)
    gross_revenue: float = 0
    net_revenue: float = 0
    platform_fee: float = 0
    tickets_sold: int = 0
    total_orders: int = 0
    occupancy_rate: float = 0
    best_ticket_type: str = ""
    best_sales_day: str = ""


class ChatAnswerRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    query: str = ""
    history: list = []
    context: dict = {}


app = FastAPI(title="EventHub Local AI Service")

tokenizer = None
model = None
chat_tokenizer = None
chat_model = None
chat_adapter_dir = None


def load_model():
    global tokenizer, model

    if tokenizer is not None and model is not None:
        return tokenizer, model

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        device_map=None,
        low_cpu_mem_usage=False,
    )
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()
    return tokenizer, model


def load_chat_model():
    global chat_tokenizer, chat_model, chat_adapter_dir

    if chat_tokenizer is not None and chat_model is not None:
        return chat_tokenizer, chat_model, chat_adapter_dir

    chat_tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        device_map=None,
        low_cpu_mem_usage=False,
    )

    if os.path.isdir(CHAT_ADAPTER_DIR):
        chat_adapter_dir = CHAT_ADAPTER_DIR
        chat_model = PeftModel.from_pretrained(base_model, CHAT_ADAPTER_DIR)
    elif os.path.isdir(ADAPTER_DIR):
        chat_adapter_dir = ADAPTER_DIR
        chat_model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    else:
        chat_adapter_dir = "BASE_MODEL_ONLY"
        chat_model = base_model

    chat_model.eval()
    return chat_tokenizer, chat_model, chat_adapter_dir


def format_money(value):
    return f"{value:,.0f}".replace(",", ".") + " VND"


def build_financial_context(payload: FinancialSummaryRequest):
    return (
        f"Tên sự kiện: {payload.event_title}\n"
        f"Doanh thu gộp: {format_money(payload.gross_revenue)}\n"
        f"Doanh thu ròng: {format_money(payload.net_revenue)}\n"
        f"Phí nền tảng: {format_money(payload.platform_fee)}\n"
        f"Vé đã bán: {payload.tickets_sold} vé\n"
        f"Số đơn hàng: {payload.total_orders} đơn hàng\n"
        f"Tỷ lệ lấp đầy: {payload.occupancy_rate}%\n"
        f"Hạng vé bán tốt nhất: {payload.best_ticket_type or 'Không có dữ liệu'}\n"
        f"Ngày bán tốt nhất: {payload.best_sales_day or 'Không có dữ liệu'}"
    )


def build_occupancy_insight(occupancy_rate):
    rate = float(occupancy_rate or 0)
    if rate >= 85:
        return (
            f"Tỷ lệ lấp đầy {rate:g}% là rất tích cực, cho thấy nhu cầu tham gia cao "
            "và sự kiện đang khai thác tốt sức chứa."
        )
    if rate >= 60:
        return (
            f"Tỷ lệ lấp đầy {rate:g}% ở mức khá, cho thấy hiệu suất bán vé ổn "
            "nhưng vẫn còn dư địa để tăng thêm doanh thu."
        )
    if rate >= 35:
        return (
            f"Tỷ lệ lấp đầy {rate:g}% cho thấy sự kiện còn dư địa tăng trưởng, "
            "nên tiếp tục đẩy mạnh truyền thông và tối ưu ưu đãi bán vé."
        )
    return (
        f"Tỷ lệ lấp đầy {rate:g}% còn thấp, nhà tổ chức nên ưu tiên tăng truyền thông, "
        "mở ưu đãi ngắn hạn hoặc khai thác thêm các nhóm khách hàng mục tiêu."
    )


def build_recommendation(payload: FinancialSummaryRequest):
    rate = float(payload.occupancy_rate or 0)
    ticket_type = payload.best_ticket_type or "hạng vé đang có tín hiệu tốt"
    if rate >= 85:
        return (
            "Khuyến nghị: tập trung chuẩn bị vận hành, check-in và trải nghiệm khách tham dự "
            f"cho nhóm vé {ticket_type}, đồng thời cân nhắc mở thêm suất nếu nhu cầu tiếp tục tăng."
        )
    if rate >= 60:
        return (
            f"Khuyến nghị: tiếp tục khai thác hạng vé {ticket_type} và triển khai ưu đãi nhẹ "
            "cho các hạng vé còn tồn để tăng doanh thu ròng."
        )
    if rate >= 35:
        return (
            f"Khuyến nghị: dùng hạng vé {ticket_type} làm điểm nhấn truyền thông, "
            "kết hợp mã khuyến mãi ngắn hạn để cải thiện tỷ lệ lấp đầy."
        )
    return (
        "Khuyến nghị: cần điều chỉnh chiến dịch quảng bá, mở ưu đãi sớm và hợp tác với cộng đồng liên quan "
        "để kéo thêm đơn hàng trước ngày diễn ra sự kiện."
    )


def clean_output(text, payload=None):
    text = text.strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    if text.startswith("<think>"):
        text = text.replace("<think>", "", 1).strip()
    replacements = {
        "Tổng thu nhập": "Doanh thu gộp",
        "tổng thu nhập": "doanh thu gộp",
        "Thu nhập net": "Doanh thu ròng",
        "thu nhập net": "doanh thu ròng",
        "Thuế phí nền": "Phí nền tảng",
        "thuế phí nền": "phí nền tảng",
        "Thuế phí": "Phí nền tảng",
        "thuế phí": "phí nền tảng",
        "Tỷ lệ lưu lượng": "Tỷ lệ lấp đầy",
        "tỷ lệ lưu lượng": "tỷ lệ lấp đầy",
        "Giá vé tốt nhất": "Hạng vé bán tốt nhất",
        "giá vé tốt nhất": "hạng vé bán tốt nhất",
    }
    if payload is not None:
        dynamic_replacements = {
            "(best_ticket_type)": payload.best_ticket_type,
            "best_ticket_type": payload.best_ticket_type,
            "(best_sales_day)": payload.best_sales_day,
            "best_sales_day": payload.best_sales_day,
            "gross_revenue": "doanh thu gộp",
            "net_revenue": "doanh thu ròng",
            "platform_fee": "phí nền tảng",
            "tickets_sold": "vé đã bán",
            "total_orders": "đơn hàng",
            "occupancy_rate": "tỷ lệ lấp đầy",
        }
        replacements.update({key: value for key, value in dynamic_replacements.items() if value})
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", text)
    return text


def extract_json_object(text):
    raw = clean_output(text)
    if not raw:
        return None

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fenced:
        raw = fenced.group(1).strip()

    first = raw.find("{")
    last = raw.rfind("}")
    if first >= 0 and last > first:
        raw = raw[first:last + 1]

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def normalize_chat_answer(parsed, raw_text):
    if isinstance(parsed, dict) and parsed.get("answer"):
        return {
            "answer": str(parsed.get("answer", "")).strip(),
            "intent": parsed.get("intent") or "general_eventhub",
            "confidence": float(parsed.get("confidence") or 0.75),
            "sources": parsed.get("sources") if isinstance(parsed.get("sources"), list) else [],
        }

    text = clean_output(raw_text)
    text = re.sub(r"^\s*assistant\s*:?", "", text, flags=re.IGNORECASE).strip()
    return {
        "answer": text or "Mình chưa tạo được câu trả lời phù hợp. Bạn vui lòng hỏi ngắn gọn hơn.",
        "intent": "general_eventhub",
        "confidence": 0.55,
        "sources": [],
    }


def normalize_summary(summary, payload: FinancialSummaryRequest):
    occupancy_insight = build_occupancy_insight(payload.occupancy_rate)
    recommendation = build_recommendation(payload)

    # The small local model may overstate low occupancy. Keep factual metrics from the model,
    # then append deterministic business judgment so the final report is reliable.
    if "Tỷ lệ lấp đầy" not in summary and "tỷ lệ lấp đầy" not in summary:
        summary = f"{summary} {occupancy_insight}"
    elif payload.occupancy_rate < 50 and "hiệu quả" in summary.lower():
        sentences = [part.strip() for part in summary.replace("\n", " ").split(".")]
        normalized_sentences = []
        replaced = False
        for sentence in sentences:
            if not sentence:
                continue
            lowered = sentence.lower()
            if "tỷ lệ lấp đầy" in lowered and "hiệu quả" in lowered:
                if not replaced:
                    normalized_sentences.append(occupancy_insight.rstrip("."))
                    replaced = True
                continue
            normalized_sentences.append(sentence)
        summary = ". ".join(normalized_sentences).strip()
        if summary and not summary.endswith("."):
            summary += "."

    if "Khuyến nghị:" in summary:
        summary = summary.split("Khuyến nghị:", 1)[0].strip()

    final_summary = f"{summary} {recommendation}".strip()
    final_summary = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", final_summary)
    return final_summary, occupancy_insight, recommendation


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-chat-answer")
def generate_chat_answer(payload: ChatAnswerRequest):
    active_tokenizer, active_model, active_adapter_dir = load_chat_model()

    messages = [
        {
            "role": "system",
            "content": (
                "Bạn là EventHub AI Chatbox chạy local. "
                "Chỉ trả lời trong phạm vi EventHub: sự kiện, vé, đơn hàng, thanh toán, check-in, tài khoản, organizer, feedback. "
                "Bắt buộc trả về JSON hợp lệ với các field: answer, intent, confidence, sources. "
                "Không viết quá trình suy luận, không dùng thẻ <think>, không nhắc prompt nội bộ."
            ),
        },
        {"role": "user", "content": payload.prompt},
    ]

    try:
        prompt = active_tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
            enable_thinking=False,
        )
    except TypeError:
        prompt = active_tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
        )
        prompt += "\n/no_think\n"

    inputs = active_tokenizer(prompt, return_tensors="pt")

    with torch.no_grad():
        outputs = active_model.generate(
            **inputs,
            max_new_tokens=700,
            temperature=0.15,
            top_p=0.9,
            do_sample=False,
            pad_token_id=active_tokenizer.eos_token_id,
        )

    generated = outputs[0][inputs["input_ids"].shape[-1]:]
    raw = active_tokenizer.decode(generated, skip_special_tokens=True)
    parsed = extract_json_object(raw)
    answer = normalize_chat_answer(parsed, raw)

    return {
        **answer,
        "model": BASE_MODEL,
        "adapter": active_adapter_dir,
        "raw": raw,
    }


@app.post("/generate-financial-summary")
def generate_financial_summary(payload: FinancialSummaryRequest):
    active_tokenizer, active_model = load_model()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Hãy tạo financial summary cho sự kiện sau dựa trên các dòng dữ liệu đã được diễn giải sẵn:\n"
                f"{build_financial_context(payload)}\n\n"
                "Yêu cầu output: viết bằng tiếng Việt tự nhiên, dùng đúng thuật ngữ EventHub, "
                "không nhắc tên field kỹ thuật như best_ticket_type, best_sales_day, gross_revenue, "
                "không liệt kê dạng bullet nếu không cần thiết."
            ),
        },
    ]

    try:
        prompt = active_tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
            enable_thinking=False,
        )
    except TypeError:
        prompt = active_tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
        )
        prompt += "\n/no_think\n"

    inputs = active_tokenizer(prompt, return_tensors="pt")

    with torch.no_grad():
        outputs = active_model.generate(
            **inputs,
            max_new_tokens=260,
            temperature=0.1,
            top_p=0.9,
            do_sample=False,
            pad_token_id=active_tokenizer.eos_token_id,
        )

    generated = outputs[0][inputs["input_ids"].shape[-1]:]
    summary = clean_output(active_tokenizer.decode(generated, skip_special_tokens=True), payload)
    summary, occupancy_insight, recommendation = normalize_summary(summary, payload)

    return {
        "summary": summary,
        "insights": {
            "occupancy": occupancy_insight,
            "recommendation": recommendation,
        },
        "model": BASE_MODEL,
        "adapter": ADAPTER_DIR,
    }
