import os
import re
import torch
import gradio as gr
from transformers import AutoModelForCausalLM, AutoTokenizer

try:
    from peft import PeftModel
    PEFT_AVAILABLE = True
except ImportError:
    PEFT_AVAILABLE = False

try:
    import spaces
except ImportError:
    class spaces:
        @staticmethod
        def GPU(func):
            return func

BASE_MODEL = "Qwen/Qwen3-0.6B"
ADAPTER_DIR = "outputs/eventhub-financial-qwen3-lora"

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

tokenizer = None
model = None

def get_model_and_tokenizer():
    global tokenizer, model
    if tokenizer is None or model is None:
        print(f"Loading base model & tokenizer: {BASE_MODEL}...")
        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            low_cpu_mem_usage=True,
        )
        if PEFT_AVAILABLE and os.path.exists(ADAPTER_DIR):
            print(f"Loading LoRA adapter from {ADAPTER_DIR}...")
            model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
        else:
            print("Adapter directory not found or PEFT unavailable. Using base model directly.")
            model = base_model
        model.eval()
    return tokenizer, model

def format_money(value):
    try:
        val = float(value or 0)
    except (ValueError, TypeError):
        val = 0
    return f"{val:,.0f}".replace(",", ".") + " VND"

def build_financial_context(event_title, gross_revenue, net_revenue, platform_fee,
                            tickets_sold, total_orders, occupancy_rate, best_ticket_type, best_sales_day):
    return (
        f"Tên sự kiện: {event_title}\n"
        f"Doanh thu gộp: {format_money(gross_revenue)}\n"
        f"Doanh thu ròng: {format_money(net_revenue)}\n"
        f"Phí nền tảng: {format_money(platform_fee)}\n"
        f"Vé đã bán: {tickets_sold} vé\n"
        f"Số đơn hàng: {total_orders} đơn hàng\n"
        f"Tỷ lệ lấp đầy: {occupancy_rate}%\n"
        f"Hạng vé bán tốt nhất: {best_ticket_type or 'Không có dữ liệu'}\n"
        f"Ngày bán tốt nhất: {best_sales_day or 'Không có dữ liệu'}"
    )

def build_occupancy_insight(occupancy_rate):
    try:
        rate = float(occupancy_rate or 0)
    except (ValueError, TypeError):
        rate = 0
    if rate >= 85:
        return f"Tỷ lệ lấp đầy {rate:g}% là rất tích cực, cho thấy nhu cầu tham gia cao và sự kiện đang khai thác tốt sức chứa."
    if rate >= 60:
        return f"Tỷ lệ lấp đầy {rate:g}% ở mức khá, cho thấy hiệu suất bán vé ổn nhưng vẫn còn dư địa để tăng thêm doanh thu."
    if rate >= 35:
        return f"Tỷ lệ lấp đầy {rate:g}% cho thấy sự kiện còn dư địa tăng trưởng, nên tiếp tục đẩy mạnh truyền thông và tối ưu ưu đãi bán vé."
    return f"Tỷ lệ lấp đầy {rate:g}% còn thấp, nhà tổ chức nên ưu tiên tăng truyền thông, mở ưu đãi ngắn hạn hoặc khai thác thêm các nhóm khách hàng mục tiêu."

def build_recommendation(occupancy_rate, best_ticket_type):
    try:
        rate = float(occupancy_rate or 0)
    except (ValueError, TypeError):
        rate = 0
    ticket_type = best_ticket_type or "hạng vé đang có tín hiệu tốt"
    if rate >= 85:
        return f"Khuyến nghị: tập trung chuẩn bị vận hành, check-in và trải nghiệm khách tham dự cho nhóm vé {ticket_type}, đồng thời cân nhắc mở thêm suất nếu nhu cầu tiếp tục tăng."
    if rate >= 60:
        return f"Khuyến nghị: tiếp tục khai thác hạng vé {ticket_type} và triển khai ưu đãi nhẹ cho các hạng vé còn tồn để tăng doanh thu ròng."
    if rate >= 35:
        return f"Khuyến nghị: dùng hạng vé {ticket_type} làm điểm nhấn truyền thông, kết hợp mã khuyến mãi ngắn hạn để cải thiện tỷ lệ lấp đầy."
    return "Khuyến nghị: cần điều chỉnh chiến dịch quảng bá, mở ưu đãi sớm và hợp tác với cộng đồng liên quan để kéo thêm đơn hàng trước ngày diễn ra sự kiện."

def clean_output(text, best_ticket_type="", best_sales_day=""):
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
        "(best_ticket_type)": best_ticket_type,
        "best_ticket_type": best_ticket_type,
        "(best_sales_day)": best_sales_day,
        "best_sales_day": best_sales_day,
        "gross_revenue": "doanh thu gộp",
        "net_revenue": "doanh thu ròng",
        "platform_fee": "phí nền tảng",
        "tickets_sold": "vé đã bán",
        "total_orders": "đơn hàng",
        "occupancy_rate": "tỷ lệ lấp đầy",
    }
    for source, target in replacements.items():
        if source and target:
            text = text.replace(source, target)
    text = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", text)
    return text

def normalize_summary(summary, occupancy_rate, best_ticket_type):
    occupancy_insight = build_occupancy_insight(occupancy_rate)
    recommendation = build_recommendation(occupancy_rate, best_ticket_type)

    if "Tỷ lệ lấp đầy" not in summary and "tỷ lệ lấp đầy" not in summary:
        summary = f"{summary} {occupancy_insight}"
    elif float(occupancy_rate or 0) < 50 and "hiệu quả" in summary.lower():
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
    return final_summary

@spaces.GPU
def generate_financial_summary(
    event_title,
    gross_revenue,
    net_revenue,
    platform_fee,
    tickets_sold,
    total_orders,
    occupancy_rate,
    best_ticket_type,
    best_sales_day
):
    try:
        active_tokenizer, active_model = get_model_and_tokenizer()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        active_model.to(device)

        context = build_financial_context(
            event_title, gross_revenue, net_revenue, platform_fee,
            tickets_sold, total_orders, occupancy_rate, best_ticket_type, best_sales_day
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Hãy tạo financial summary cho sự kiện sau dựa trên các dòng dữ liệu đã được diễn giải sẵn:\n"
                    f"{context}\n\n"
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

        inputs = active_tokenizer(prompt, return_tensors="pt").to(device)

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
        raw_summary = active_tokenizer.decode(generated, skip_special_tokens=True)
        cleaned = clean_output(raw_summary, best_ticket_type, best_sales_day)
        final_report = normalize_summary(cleaned, occupancy_rate, best_ticket_type)

        return final_report
    except Exception as e:
        return f"Lỗi khi tạo báo cáo AI: {str(e)}"

# UI Layout
with gr.Blocks(title="EventHub Financial Summary AI") as demo:
    gr.Markdown("# 🤖 EventHub AI - Financial Summary Generator")
    gr.Markdown("Nhập thông số tài chính sự kiện để AI viết báo cáo tổng hợp và phân tích cho Nhà tổ chức.")

    with gr.Row():
        with gr.Column():
            event_title = gr.Textbox(label="Tên sự kiện", value="Data Science Bootcamp 2026")
            with gr.Row():
                gross_revenue = gr.Number(label="Doanh thu gộp (VND)", value=36000000)
                net_revenue = gr.Number(label="Doanh thu ròng (VND)", value=32400000)
                platform_fee = gr.Number(label="Phí nền tảng (VND)", value=3600000)
            with gr.Row():
                tickets_sold = gr.Number(label="Số vé đã bán", value=120)
                total_orders = gr.Number(label="Số đơn hàng", value=88)
                occupancy_rate = gr.Number(label="Tỷ lệ lấp đầy (%)", value=75)
            with gr.Row():
                best_ticket_type = gr.Textbox(label="Hạng vé bán tốt nhất", value="VIP Pass")
                best_sales_day = gr.Textbox(label="Ngày bán tốt nhất", value="2026-06-24")

            btn_submit = gr.Button("🚀 Tạo Báo Cáo Tài Chính", variant="primary")

        with gr.Column():
            output_report = gr.Textbox(label="Báo Báo Tài Chính (AI Report)", lines=10)

    btn_submit.click(
        fn=generate_financial_summary,
        inputs=[
            event_title,
            gross_revenue,
            net_revenue,
            platform_fee,
            tickets_sold,
            total_orders,
            occupancy_rate,
            best_ticket_type,
            best_sales_day
        ],
        outputs=output_report
    )

    gr.Examples(
        examples=[
            ["Data Science Bootcamp 2026", 36000000, 32400000, 3600000, 120, 88, 75, "VIP Pass", "2026-06-24"],
            ["Tech Concert Night", 150000000, 135000000, 15000000, 500, 350, 95, "Early Bird", "2026-07-01"],
            ["Indie Film Festival", 10000000, 9000000, 1000000, 40, 30, 25, "Standard", "2026-06-15"]
        ],
        inputs=[
            event_title,
            gross_revenue,
            net_revenue,
            platform_fee,
            tickets_sold,
            total_orders,
            occupancy_rate,
            best_ticket_type,
            best_sales_day
        ]
    )

demo.launch()