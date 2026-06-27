import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


BASE_MODEL = "Qwen/Qwen3-0.6B"
ADAPTER_DIR = "outputs/eventhub-financial-qwen3-lora"

SYSTEM_PROMPT = (
    "Bạn là AI Financial Analyst của EventHub. "
    "Nhiệm vụ của bạn là viết báo cáo tài chính tiếng Việt ngắn gọn, chính xác, "
    "dựa hoàn toàn trên số liệu được cung cấp. "
    "Không viết quá trình suy luận, không dùng thẻ <think>, chỉ trả về báo cáo cuối cùng."
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


app = FastAPI(title="EventHub Financial Summary AI")

tokenizer = None
model = None


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


def clean_output(text):
    text = text.strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    if text.startswith("<think>"):
        text = text.replace("<think>", "", 1).strip()
    return text


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-financial-summary")
def generate_financial_summary(payload: FinancialSummaryRequest):
    active_tokenizer, active_model = load_model()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Hãy tạo financial summary cho sự kiện sau:\n"
                f"{payload.model_dump_json()}"
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
            temperature=0.2,
            top_p=0.9,
            do_sample=True,
            pad_token_id=active_tokenizer.eos_token_id,
        )

    generated = outputs[0][inputs["input_ids"].shape[-1]:]
    summary = clean_output(active_tokenizer.decode(generated, skip_special_tokens=True))

    return {
        "summary": summary,
        "model": BASE_MODEL,
        "adapter": ADAPTER_DIR,
    }
