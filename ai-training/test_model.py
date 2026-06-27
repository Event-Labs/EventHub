import torch
import re
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


BASE_MODEL = "Qwen/Qwen3-0.6B"
ADAPTER_DIR = "outputs/eventhub-financial-qwen3-lora"


def format_money(value):
    return f"{value:,.0f}".replace(",", ".") + " VND"


def main():
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        device_map=None,
        low_cpu_mem_usage=False,
    )
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()

    sample = {
        "event_title": "Data Science Bootcamp",
        "gross_revenue": 36000000,
        "net_revenue": 32400000,
        "platform_fee": 3600000,
        "tickets_sold": 120,
        "total_orders": 88,
        "occupancy_rate": 40,
        "best_ticket_type": "Professional",
        "best_sales_day": "2026-06-24",
    }
    financial_context = (
        f"Tên sự kiện: {sample['event_title']}\n"
        f"Doanh thu gộp: {format_money(sample['gross_revenue'])}\n"
        f"Doanh thu ròng: {format_money(sample['net_revenue'])}\n"
        f"Phí nền tảng: {format_money(sample['platform_fee'])}\n"
        f"Vé đã bán: {sample['tickets_sold']} vé\n"
        f"Số đơn hàng: {sample['total_orders']} đơn hàng\n"
        f"Tỷ lệ lấp đầy: {sample['occupancy_rate']}%\n"
        f"Hạng vé bán tốt nhất: {sample['best_ticket_type']}\n"
        f"Ngày bán tốt nhất: {sample['best_sales_day']}"
    )

    messages = [
        {
            "role": "system",
            "content": (
                "Bạn là AI Financial Analyst của EventHub. "
                "Nhiệm vụ của bạn là viết báo cáo tài chính tiếng Việt ngắn gọn, "
                "chính xác, dựa hoàn toàn trên số liệu được cung cấp. "
                "Chỉ dùng thuật ngữ nghiệp vụ sau: gross_revenue là doanh thu gộp, "
                "net_revenue là doanh thu ròng, platform_fee là phí nền tảng, "
                "tickets_sold là vé đã bán, total_orders là đơn hàng, "
                "occupancy_rate là tỷ lệ lấp đầy, best_ticket_type là hạng vé bán tốt nhất, "
                "best_sales_day là ngày bán tốt nhất. "
                "Không dùng các cụm từ sai: tổng thu nhập, thu nhập net, thuế phí, "
                "tỷ lệ lưu lượng, giá vé tốt nhất. "
                "Không viết quá trình suy luận, không dùng thẻ <think>, chỉ trả về báo cáo cuối cùng."
            ),
        },
        {
            "role": "user",
            "content": (
                "Hãy tạo financial summary cho sự kiện sau dựa trên các dòng dữ liệu đã được diễn giải sẵn:\n"
                f"{financial_context}\n\n"
                "Yêu cầu output: viết bằng tiếng Việt tự nhiên, dùng đúng thuật ngữ EventHub, "
                "không nhắc tên field kỹ thuật như best_ticket_type, best_sales_day, gross_revenue."
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
        "(best_ticket_type)": sample["best_ticket_type"],
        "best_ticket_type": sample["best_ticket_type"],
        "(best_sales_day)": sample["best_sales_day"],
        "best_sales_day": sample["best_sales_day"],
        "gross_revenue": "doanh thu gộp",
        "net_revenue": "doanh thu ròng",
        "platform_fee": "phí nền tảng",
        "tickets_sold": "vé đã bán",
        "total_orders": "đơn hàng",
        "occupancy_rate": "tỷ lệ lấp đầy",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", text)
    print(text)


if __name__ == "__main__":
    main()
