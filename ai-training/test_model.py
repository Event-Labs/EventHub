import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


BASE_MODEL = "Qwen/Qwen3-0.6B"
ADAPTER_DIR = "outputs/eventhub-financial-qwen3-lora"


def main():
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        device_map=None,
        low_cpu_mem_usage=False,
    )
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()

    messages = [
        {
            "role": "system",
            "content": (
                "Bạn là AI Financial Analyst của EventHub. "
                "Nhiệm vụ của bạn là viết báo cáo tài chính tiếng Việt ngắn gọn, "
                "chính xác, dựa hoàn toàn trên số liệu được cung cấp. "
                "Không viết quá trình suy luận, không dùng thẻ <think>, chỉ trả về báo cáo cuối cùng."
            ),
        },
        {
            "role": "user",
            "content": (
                "Hãy tạo financial summary cho sự kiện sau:\n"
                '{"event_title":"Data Science Bootcamp","gross_revenue":36000000,'
                '"net_revenue":32400000,"platform_fee":3600000,'
                '"tickets_sold":120,"total_orders":88,"occupancy_rate":40,'
                '"best_ticket_type":"Professional","best_sales_day":"2026-06-24"}'
            ),
        },
    ]

    try:
        prompt = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
            enable_thinking=False,
        )
    except TypeError:
        prompt = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=False,
        )
        prompt += "\n/no_think\n"
    inputs = tokenizer(prompt, return_tensors="pt")

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=220,
            temperature=0.2,
            top_p=0.9,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )

    generated = outputs[0][inputs["input_ids"].shape[-1]:]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    if text.startswith("<think>"):
        text = text.replace("<think>", "", 1).strip()
    print(text)


if __name__ == "__main__":
    main()
