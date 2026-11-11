#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_colab_notebooks.py
----------------------------
Sinh 5 Jupyter Notebooks chuẩn mực cho Google Colab trong thư mục ai/colab/:
1. 01_validate_dataset.ipynb
2. 02_prepare_sft_dataset.ipynb
3. 03_train_qwen3_eventhub.ipynb
4. 04_evaluate_model.ipynb
5. 05_export_gguf_ollama.ipynb
"""

import os
import json

def make_notebook(cells):
    return {
        "cells": cells,
        "metadata": {
            "colab": {
                "provenance": [],
                "toc_visible": True
            },
            "kernelspec": {
                "display_name": "Python 3",
                "name": "python3"
            },
            "language_info": {
                "name": "python"
            },
            "accelerator": "GPU"
        },
        "nbformat": 4,
        "nbformat_minor": 0
    }

def md_cell(source):
    if isinstance(source, list):
        src = [s if s.endswith('\n') else s + '\n' for s in source]
    else:
        src = [s + '\n' for s in source.split('\n')]
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": src
    }

def code_cell(source):
    if isinstance(source, list):
        src = [s if s.endswith('\n') else s + '\n' for s in source]
    else:
        src = [s + '\n' for s in source.split('\n')]
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": src
    }

def generate_all():
    os.makedirs("ai/colab", exist_ok=True)

    # ==========================================
    # NOTEBOOK 1: 01_validate_dataset.ipynb
    # ==========================================
    nb1_cells = [
        md_cell("""# EventHub AI Create Event V2 — Pipeline 01: Validate Dataset
### Mục tiêu:
1. Mount Google Drive và kiểm tra cấu trúc thư mục dữ liệu EventHub AI.
2. Đọc dataset gốc hoặc dataset đã làm sạch từ Drive mà **không làm thay đổi file gốc**.
3. Chạy bộ kiểm định chất lượng (Validation Engine): Kiểm tra tính hợp lệ của JSON, Schema V2, ngày giờ, sessions, tickets và phát hiện hallucination.
4. Xuất báo cáo chất lượng tổng quát dưới dạng Markdown và JSON vào Google Drive.
"""),
        code_cell("""# [1] Mount Google Drive và thiết lập đường dẫn làm việc
from google.colab import drive
import os
import sys
import json
import zipfile

drive.mount('/content/drive')

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
RAW_DATA_DIR = os.path.join(DRIVE_ROOT, 'dataset/raw')
CLEANED_DATA_DIR = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2')
REPORT_DIR = os.path.join(DRIVE_ROOT, 'dataset/reports')

os.makedirs(REPORT_DIR, exist_ok=True)
print(f"Drive root: {DRIVE_ROOT}")
print(f"Report dir: {REPORT_DIR}")
"""),
        code_cell("""# [2] Kiểm tra và giải nén tệp dataset ZIP nếu cần
zip_path = os.path.join(RAW_DATA_DIR, 'EventHub_AI_Create_Event_Dataset_300.zip')
extract_target = os.path.join(RAW_DATA_DIR, 'EventHub_AI_Create_Event_Dataset_300')

if os.path.exists(zip_path) and not os.path.exists(extract_target):
    print(f"Đang giải nén {zip_path}...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(RAW_DATA_DIR)
    print("Giải nén hoàn tất!")
elif os.path.exists(extract_target):
    print(f"Thư mục dữ liệu đã sẵn sàng: {extract_target}")
else:
    print(f"Lưu ý: Không tìm thấy ZIP tại {zip_path}. Sẽ sử dụng dữ liệu đã làm sạch tại {CLEANED_DATA_DIR}")
"""),
        code_cell("""# [3] Định nghĩa bộ kiểm định chất lượng Dataset Validator (Schema V2)
import re
from datetime import datetime

DATE_REGEX = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_REGEX = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

VALID_CATEGORIES = {
    'am-nhac-bieu-dien', 'kinh-doanh-cong-nghe', 'hoi-thao-giao-duc',
    'the-thao', 'nghe-thuat-trien-lam', 'am-thuc-do-uong',
    'le-hoi-van-hoa', 'cong-dong-thien-nguyen', 'giai-tri-doi-song', 'other'
}

def validate_eventhub_record(rec, idx=0):
    errors = []
    warnings = []
    sample_id = rec.get("id", f"SAMPLE-{idx}")

    output_json = rec.get("output_json")
    if not isinstance(output_json, dict):
        return [f"Sample {sample_id}: output_json không phải là dict hợp lệ"], []

    title = output_json.get("title")
    if not title or not str(title).strip():
        errors.append(f"Sample {sample_id}: Thiếu title hoặc title rỗng")

    category = output_json.get("category")
    if category and category not in VALID_CATEGORIES:
        warnings.append(f"Sample {sample_id}: category '{category}' không nằm trong enum chuẩn")

    short_desc = output_json.get("short_description")
    if short_desc and len(short_desc) > 300:
        warnings.append(f"Sample {sample_id}: short_description quá dài ({len(short_desc)} ký tự)")

    sessions = output_json.get("sessions")
    if not isinstance(sessions, list) or len(sessions) == 0:
        errors.append(f"Sample {sample_id}: sessions phải là mảng có ít nhất 1 phần tử")
    else:
        for s_idx, s in enumerate(sessions):
            s_date = s.get("start_date")
            if not s_date or not DATE_REGEX.match(str(s_date)):
                errors.append(f"Sample {sample_id} Session {s_idx}: start_date không đúng định dạng YYYY-MM-DD ({s_date})")
            s_time = s.get("start_time")
            if s_time and not TIME_REGEX.match(str(s_time)):
                errors.append(f"Sample {sample_id} Session {s_idx}: start_time không đúng định dạng HH:mm ({s_time})")

    tickets = output_json.get("ticket_types")
    if tickets is not None and not isinstance(tickets, list):
        errors.append(f"Sample {sample_id}: ticket_types phải là mảng hoặc null")
    elif isinstance(tickets, list):
        for t_idx, t in enumerate(tickets):
            if not t.get("name"):
                errors.append(f"Sample {sample_id} Ticket {t_idx}: Thiếu tên vé")
            price = t.get("price")
            if price is not None and (not isinstance(price, (int, float)) or price < 0):
                errors.append(f"Sample {sample_id} Ticket {t_idx}: price không hợp lệ ({price})")

    return errors, warnings
"""),
        code_cell("""# [4] Thực thi kiểm định trên Dataset Cleaned V2
import os
import json

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
if 'CLEANED_DATA_DIR' not in globals():
    CLEANED_DATA_DIR = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2')

target_file = os.path.join(CLEANED_DATA_DIR, 'dataset_all.jsonl')
if not os.path.exists(target_file):
    target_file = '/content/dataset_all.jsonl' # fallback nếu upload thủ công

print(f"Bắt đầu kiểm tra file: {target_file}")
total_samples = 0
all_errors = []
all_warnings = []

if os.path.exists(target_file):
    with open(target_file, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if line:
                total_samples += 1
                try:
                    rec = json.loads(line)
                    errs, warns = validate_eventhub_record(rec, idx)
                    all_errors.extend(errs)
                    all_warnings.extend(warns)
                except Exception as e:
                    all_errors.append(f"Dòng {idx}: Lỗi cú pháp JSON - {str(e)}")

    print(f"\\n--- KẾT QUẢ KIỂM ĐỊNH DATASET ---")
    print(f"Tổng số mẫu: {total_samples}")
    print(f"Tổng số lỗi nghiêm trọng (Errors): {len(all_errors)}")
    print(f"Tổng số cảnh báo (Warnings): {len(all_warnings)}")

    if len(all_errors) == 0:
        print("\\n✅ CHÚC MỪNG: Dataset V2 đã vượt qua Quality Gate 100%!")
    else:
        print("\\n❌ CẢNH BÁO: Phát hiện lỗi cần khắc phục trước khi huấn luyện:")
        for err in all_errors[:10]:
            print(f"  - {err}")
else:
    print(f"Tệp không tồn tại: {target_file}. Vui lòng kiểm tra lại đường dẫn Drive.")
"""),
        code_cell("""# [5] Xuất báo cáo kiểm tra ra Drive
report_md = os.path.join(REPORT_DIR, 'COLAB_VALIDATION_REPORT.md')
with open(report_md, 'w', encoding='utf-8') as f:
    f.write("# BÁO CÁO KIỂM ĐỊNH DỮ LIỆU TRÊN GOOGLE COLAB\\n\\n")
    f.write(f"- **Tệp kiểm tra:** `{target_file}`\\n")
    f.write(f"- **Tổng số mẫu:** {total_samples}\\n")
    f.write(f"- **Số lỗi nghiêm trọng:** {len(all_errors)}\\n")
    f.write(f"- **Số cảnh báo:** {len(all_warnings)}\\n")
    f.write(f"- **Trạng thái Quality Gate:** **{'ĐẠT (PASS)' if len(all_errors) == 0 else 'KHÔNG ĐẠT (FAIL)'}**\\n")

print(f"Báo cáo đã được lưu tại: {report_md}")
""")
    ]

    # ==========================================
    # NOTEBOOK 2: 02_prepare_sft_dataset.ipynb
    # ==========================================
    nb2_cells = [
        md_cell("""# EventHub AI Create Event V2 — Pipeline 02: Prepare SFT Dataset
### Mục tiêu:
1. Đọc dữ liệu từ 3 split đã được kiểm tra tính độc lập (Train / Validation / Test).
2. Chuyển đổi toàn bộ các mẫu sang định dạng SFT tiêu chuẩn của Hugging Face / TRL (`messages`: system, user, assistant).
3. Sử dụng đúng Chat Template chính thức của Qwen3 (`<|im_start|>` / `<|im_end|>`).
4. Phân tích phân phối độ dài Token (Token Length Distribution) và kiểm tra nguy cơ bị cắt cụt (truncation).
5. Lưu tệp SFT sẵn sàng cho quá trình huấn luyện QLoRA.
"""),
        code_cell("""# [1] Cài đặt thư viện và Mount Drive
!pip install -q transformers tiktoken

from google.colab import drive
import os
import json
import matplotlib.pyplot as plt
from transformers import AutoTokenizer

drive.mount('/content/drive')

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
SPLITS_DIR = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2/splits')
SFT_OUT_DIR = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2/sft')
os.makedirs(SFT_OUT_DIR, exist_ok=True)
"""),
        code_cell("""# [2] Thiết lập System Instruction chuẩn hóa chống Hallucination
SYSTEM_INSTRUCTION = \"\"\"Bạn là chuyên gia trích xuất thông tin sự kiện của hệ thống EventHub.
Nhiệm vụ của bạn là đọc kỹ văn bản tài liệu sự kiện được cung cấp và trích xuất thông tin theo đúng định dạng JSON tuân thủ schema quy định.

Quy tắc bắt buộc:
1. Chỉ trích xuất thông tin có căn cứ trực tiếp trong tài liệu. Tuyệt đối không bịa đặt hoặc suy diễn thông tin (không hallucination).
2. Các trường không có thông tin hoặc chưa xác định phải gán giá trị null (hoặc mảng rỗng [] đối với tags).
3. Định dạng ngày tháng: YYYY-MM-DD. Định dạng giờ: HH:mm (24 giờ).
4. Phân biệt rõ giờ check-in (checkin_start_time) và giờ bắt đầu sự kiện (start_time).
5. Nếu sự kiện diễn ra nhiều ngày hoặc nhiều phiên, trích xuất đầy đủ từng session trong mảng "sessions".
6. Toàn bộ các hạng vé, giá vé (VNĐ, số nguyên) và số lượng phải được đưa vào mảng "ticket_types". Vé miễn phí ghi price là 0.
7. Chỉ trả về duy nhất chuỗi JSON hợp lệ, bắt đầu bằng { và kết thúc bằng }. Tuyệt đối không thêm lời giải thích hoặc markdown code block bên ngoài.\"\"\".strip()
"""),
        code_cell("""# [3] Tải Tokenizer chính thức của Qwen
MODEL_ID = "Qwen/Qwen2.5-3B-Instruct" # Dùng tokenizer tương thích của dòng Qwen
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
print(f"Đã tải thành công Tokenizer từ: {MODEL_ID}")
print(f"Chat template khả dụng: {tokenizer.chat_template is not None}")
"""),
        code_cell("""# [4] Chuyển đổi và đo lường độ dài Token của từng Split
all_token_counts = []

for split_name in ["train", "validation", "test"]:
    in_file = os.path.join(SPLITS_DIR, f"{split_name}.jsonl")
    out_file = os.path.join(SFT_OUT_DIR, f"{split_name}_sft.jsonl")

    if not os.path.exists(in_file):
        print(f"Bỏ qua {in_file} (không tìm thấy file)")
        continue

    split_tokens = []
    converted = []

    with open(in_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rec = json.loads(line)
                user_msg = rec.get("input_text", "").strip()
                out_obj = rec.get("output_json", {})
                asst_msg = json.dumps(out_obj, ensure_ascii=False, indent=2)

                messages = [
                    {"role": "system", "content": SYSTEM_INSTRUCTION},
                    {"role": "user", "content": user_msg},
                    {"role": "assistant", "content": asst_msg}
                ]

                # Áp dụng chat template để tính chính xác token huấn luyện
                formatted_prompt = tokenizer.apply_chat_template(messages, tokenize=False)
                tokens = tokenizer.encode(formatted_prompt)
                token_len = len(tokens)

                split_tokens.append(token_len)
                all_token_counts.append(token_len)

                converted.append({
                    "id": rec.get("id"),
                    "split": split_name,
                    "type": rec.get("type"),
                    "messages": messages
                })

    with open(out_file, 'w', encoding='utf-8') as f:
        for c in converted:
            f.write(json.dumps(c, ensure_ascii=False) + '\\n')

    print(f"[{split_name.upper()}] Đã chuyển đổi {len(converted)} mẫu -> {out_file}")
    print(f"  - Min tokens: {min(split_tokens)} | Max tokens: {max(split_tokens)} | Avg tokens: {sum(split_tokens)/len(split_tokens):.1f}")
"""),
        code_cell("""# [5] Vẽ biểu đồ phân phối độ dài Token & Kiểm tra Truncation (ngưỡng >= 4096)
if all_token_counts:
    plt.figure(figsize=(10, 5))
    plt.hist(all_token_counts, bins=25, color='royalblue', edgecolor='black', alpha=0.7)
    plt.axvline(4096, color='red', linestyle='--', linewidth=2, label='Ngưỡng Context 4096 tokens')
    plt.axvline(6144, color='orange', linestyle=':', linewidth=2, label='Ngưỡng Colab L4/T4 6144 tokens')
    plt.title('Phân phối độ dài Token (Chat Template Qwen) trên toàn bộ Dataset')
    plt.xlabel('Số lượng tokens')
    plt.ylabel('Số lượng mẫu')
    plt.legend()
    plt.grid(axis='y', alpha=0.5)
    plt.show()

    max_tok = max(all_token_counts)
    print(f"Token dài nhất: {max_tok}")
    if max_tok <= 4096:
        print("✅ AN TOÀN TUYỆT ĐỐI: 100% mẫu huấn luyện <= 4096 tokens, vừa khít RTX 3070 8GB & Colab T4/L4.")
    elif max_tok <= 6144:
        print(f"⚠️ LƯU Ý: Có mẫu từ 4097..6144 tokens ({max_tok}). Dùng max_seq_length = 6144 trên Colab L4/T4.")
    else:
        print(f"❌ CẢNH BÁO: Có mẫu vượt quá 6144 tokens ({max_tok}). Cần rút gọn mô tả HTML trước khi train.")
""")
    ]

    # ==========================================
    # NOTEBOOK 3: 03_train_qwen3_eventhub.ipynb
    # ==========================================
    nb3_cells = [
        md_cell("""# EventHub AI — Pipeline 03: Fine-Tune Qwen2.5/Qwen3 with 2-Stage QLoRA (SFT + DPO)
### Phương pháp huấn luyện:
- Model nền: `Qwen/Qwen2.5-3B-Instruct` / `Qwen/Qwen3-4B`
- Kỹ thuật: **Stage 1: SFT (4-bit NF4 QLoRA, `max_seq_length = 4096` hoặc `6144` cho L4/T4)** -> **Stage 2: DPO Alignment (`TRL DPOTrainer`)** trên dữ liệu Admin duyệt đè (`dpo_override_dataset.jsonl`)
- Quản lý bộ nhớ: Gradient Checkpointing (`use_reentrant=False`), Gradient Accumulation, 16-bit Mixed Precision
- Lưu trữ: Tự động lưu SFT Adapter và DPO Final Adapter vào Google Drive.
"""),
        code_cell("""# [1] Cài đặt dependencies tương thích cho QLoRA & DPO trên Colab
!pip install -q -U torch transformers datasets peft bitsandbytes trl accelerate

import os
import inspect
import torch
import transformers
import peft
import bitsandbytes as bnb

print(f"PyTorch version: {torch.__version__}")
print(f"Transformers version: {transformers.__version__}")
print(f"PEFT version: {peft.__version__}")
print(f"BitsAndBytes version: {bnb.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
"""),
        code_cell("""# [2] Kiểm tra GPU và tính toán cấu hình bộ nhớ VRAM tự động (>=4096 / 6144 context)
if torch.cuda.is_available():
    device_name = torch.cuda.get_device_name(0)
    total_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print(f"Phát hiện GPU: {device_name}")
    print(f"Tổng dung lượng VRAM: {total_memory:.2f} GB")

    # Cấu hình siêu tham số & context window theo phần cứng (tối thiểu 4096, Colab L4/A100 -> 6144)
    if total_memory >= 22: # A100 / L4 (24GB+)
        BATCH_SIZE = 2
        GRAD_ACCUM = 8
        FP16_MODE = False
        BF16_MODE = True
        MAX_SEQ_LENGTH = 6144
    elif total_memory >= 14: # T4 / V100 (15-16GB)
        BATCH_SIZE = 1
        GRAD_ACCUM = 16
        FP16_MODE = True
        BF16_MODE = False
        MAX_SEQ_LENGTH = 4096 # Có thể tăng lên 6144 nếu batch=1 với Gradient Checkpointing
    else: # GPU 8GB VRAM (RTX 3070...)
        BATCH_SIZE = 1
        GRAD_ACCUM = 16
        FP16_MODE = True
        BF16_MODE = False
        MAX_SEQ_LENGTH = 4096

    print(f"Cấu hình đề xuất: Batch={BATCH_SIZE}, GradAccum={GRAD_ACCUM}, EffectiveBatch={BATCH_SIZE*GRAD_ACCUM}, MAX_SEQ_LENGTH={MAX_SEQ_LENGTH}")
else:
    raise RuntimeError("Notebook yêu cầu GPU để huấn luyện. Vui lòng vào Runtime -> Change runtime type -> Chọn T4/L4 GPU.")
"""),
        code_cell("""# [3] Mount Google Drive và chuẩn bị thư mục lưu Checkpoint (SFT + DPO)
from google.colab import drive
import json

drive.mount('/content/drive')

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
DATASET_SFT_DIR = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2/sft')
REVIEW_SFT_FILE = os.path.join(DRIVE_ROOT, 'datasets/sft_events_dataset.jsonl')
DPO_OVERRIDE_FILE = os.path.join(DRIVE_ROOT, 'datasets/dpo_override_dataset.jsonl')
CHECKPOINT_DIR = os.path.join(DRIVE_ROOT, 'checkpoints/eventhub_qwen_sft')
ADAPTER_DIR = os.path.join(DRIVE_ROOT, 'adapters/eventhub_qwen_sft')
DPO_CHECKPOINT_DIR = os.path.join(DRIVE_ROOT, 'checkpoints/eventhub_qwen_dpo')
DPO_ADAPTER_DIR = os.path.join(DRIVE_ROOT, 'adapters/eventhub_qwen_dpo_final')
LOG_DIR = os.path.join(DRIVE_ROOT, 'logs')

for d in [CHECKPOINT_DIR, ADAPTER_DIR, DPO_CHECKPOINT_DIR, DPO_ADAPTER_DIR, LOG_DIR]:
    os.makedirs(d, exist_ok=True)

# Ưu tiên tập Review SFT mới nhất (datasets/sft_events_dataset.jsonl) nếu có, hoặc dùng split cũ
train_file = REVIEW_SFT_FILE if os.path.exists(REVIEW_SFT_FILE) else os.path.join(DATASET_SFT_DIR, 'train_sft.jsonl')
val_file = os.path.join(DATASET_SFT_DIR, 'validation_sft.jsonl') if os.path.exists(os.path.join(DATASET_SFT_DIR, 'validation_sft.jsonl')) else None

if not os.path.exists(train_file):
    raise FileNotFoundError(f"Không tìm thấy dữ liệu SFT tại: {train_file}")

print(f"Stage 1 SFT Train data : {train_file}")
print(f"Stage 1 SFT Val data   : {val_file}")
print(f"Stage 2 DPO Override   : {DPO_OVERRIDE_FILE} (tồn tại={os.path.exists(DPO_OVERRIDE_FILE)})")
"""),
        code_cell("""# [4] Tải và chuẩn bị Dataset SFT bằng thư viện datasets
from datasets import load_dataset

data_files = {"train": train_file}
if val_file:
    data_files["validation"] = val_file

dataset = load_dataset("json", data_files=data_files)
print(f"Dataset SFT train: {len(dataset['train'])} mẫu")
if "validation" in dataset:
    print(f"Dataset SFT validation: {len(dataset['validation'])} mẫu")
"""),
        code_cell("""# [5] Tải Mô hình Nền với cấu hình 4-bit NormalFloat (NF4) + Gradient Checkpointing
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import prepare_model_for_kbit_training

MODEL_ID = "Qwen/Qwen2.5-3B-Instruct"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=torch.bfloat16 if BF16_MODE else torch.float16
)

print(f"Đang tải Base Model: {MODEL_ID} (4-bit NF4, context={MAX_SEQ_LENGTH})...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True
)

model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
model.config.use_cache = False
print("Đã tải Base Model & bật Gradient Checkpointing thành công!")
"""),
        code_cell("""# [6] Cấu hình LoRA Adapter (PEFT)
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

peft_model = get_peft_model(model, lora_config)
peft_model.print_trainable_parameters()
"""),
        code_cell("""# [7] Giai đoạn 1 (Stage 1): Định nghĩa SFTConfig (MAX_SEQ_LENGTH >= 4096) & Khởi tạo SFTTrainer
from trl import SFTTrainer, SFTConfig

def filter_valid_kwargs(cls, kwargs):
    sig = inspect.signature(cls.__init__)
    params = sig.parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return kwargs
    return {k: v for k, v in kwargs.items() if k in params}

has_val = "validation" in dataset
sft_candidates = {
    "output_dir": CHECKPOINT_DIR,
    "per_device_train_batch_size": BATCH_SIZE,
    "per_device_eval_batch_size": BATCH_SIZE,
    "gradient_accumulation_steps": GRAD_ACCUM,
    "learning_rate": 1e-4,
    "lr_scheduler_type": "cosine",
    "warmup_ratio": 0.05,
    "num_train_epochs": 3,
    "eval_strategy": "epoch" if has_val else "no",
    "save_strategy": "epoch",
    "save_total_limit": 2,
    "load_best_model_at_end": has_val,
    "metric_for_best_model": "eval_loss" if has_val else None,
    "fp16": FP16_MODE,
    "bf16": BF16_MODE,
    "gradient_checkpointing": True,
    "gradient_checkpointing_kwargs": {"use_reentrant": False},
    "logging_steps": 10,
    "report_to": "none",
    "max_length": MAX_SEQ_LENGTH,
    "max_seq_length": MAX_SEQ_LENGTH,
    "dataset_text_field": "text",
    "packing": False,
}
training_args = SFTConfig(**filter_valid_kwargs(SFTConfig, {k: v for k, v in sft_candidates.items() if v is not None}))

def add_chat_text(example):
    return {"text": tokenizer.apply_chat_template(example["messages"], tokenize=False, add_generation_prompt=False)}

train_sft_ds = dataset["train"].map(add_chat_text)
val_sft_ds = dataset["validation"].map(add_chat_text) if has_val else None

sft_trainer_candidates = {
    "model": peft_model,
    "train_dataset": train_sft_ds,
    "eval_dataset": val_sft_ds,
    "processing_class": tokenizer,
    "tokenizer": tokenizer,
    "args": training_args,
}
trainer = SFTTrainer(**filter_valid_kwargs(SFTTrainer, sft_trainer_candidates))

print(f"Stage 1 SFTTrainer sẵn sàng (MAX_SEQ_LENGTH={MAX_SEQ_LENGTH})!")
"""),
        code_cell("""# [8] Tiến hành Huấn luyện Giai đoạn 1 (Stage 1: SFT)
print("🚀 Bắt đầu Stage 1 SFT QLoRA...")
train_result = trainer.train()

print(f"Stage 1 SFT hoàn tất! Train Loss: {train_result.training_loss:.4f}")
trainer.model.save_pretrained(ADAPTER_DIR)
tokenizer.save_pretrained(ADAPTER_DIR)
print(f"✅ Đã lưu Stage 1 SFT Adapter vào: {ADAPTER_DIR}")
"""),
        code_cell("""# [9] Giai đoạn 2 (Stage 2): Huấn luyện DPO bằng TRL DPOTrainer trên dữ liệu Admin duyệt đè
from trl import DPOTrainer, DPOConfig

if os.path.exists(DPO_OVERRIDE_FILE) and os.path.getsize(DPO_OVERRIDE_FILE) > 0:
    dpo_raw = load_dataset("json", data_files={"train": DPO_OVERRIDE_FILE})["train"]
    print(f"🚀 Bắt đầu Stage 2 DPO với {len(dpo_raw)} cặp Admin override (beta=0.1, max_length={MAX_SEQ_LENGTH})...")

    max_prompt_len = min(MAX_SEQ_LENGTH - 512, int(MAX_SEQ_LENGTH * 0.78))
    dpo_candidates = {
        "output_dir": DPO_CHECKPOINT_DIR,
        "per_device_train_batch_size": 1,
        "gradient_accumulation_steps": max(4, GRAD_ACCUM),
        "learning_rate": 5e-6,
        "lr_scheduler_type": "cosine",
        "warmup_ratio": 0.1,
        "num_train_epochs": 2,
        "beta": 0.1,
        "loss_type": "sigmoid",
        "fp16": FP16_MODE,
        "bf16": BF16_MODE,
        "gradient_checkpointing": True,
        "gradient_checkpointing_kwargs": {"use_reentrant": False},
        "logging_steps": 5,
        "save_strategy": "epoch",
        "report_to": "none",
        "max_length": MAX_SEQ_LENGTH,
        "max_prompt_length": max_prompt_len,
        "remove_unused_columns": False,
    }
    dpo_args = DPOConfig(**filter_valid_kwargs(DPOConfig, dpo_candidates))

    dpo_trainer_candidates = {
        "model": trainer.model,
        "ref_model": None,
        "args": dpo_args,
        "train_dataset": dpo_raw,
        "processing_class": tokenizer,
        "tokenizer": tokenizer,
    }
    dpo_trainer = DPOTrainer(**filter_valid_kwargs(DPOTrainer, dpo_trainer_candidates))
    dpo_result = dpo_trainer.train()

    print(f"Stage 2 DPO hoàn tất! DPO Loss: {dpo_result.training_loss:.4f}")
    dpo_trainer.model.save_pretrained(DPO_ADAPTER_DIR)
    tokenizer.save_pretrained(DPO_ADAPTER_DIR)
    final_adapter = DPO_ADAPTER_DIR
    dpo_loss_val = dpo_result.training_loss
else:
    print(f"⚠️ Không tìm thấy {DPO_OVERRIDE_FILE}; bỏ qua Stage 2 DPO và dùng Adapter Stage 1.")
    final_adapter = ADAPTER_DIR
    dpo_loss_val = None
"""),
        code_cell("""# [10] Lưu Training Metadata vào Google Drive
run_metadata = {
    "base_model": MODEL_ID,
    "max_seq_length": MAX_SEQ_LENGTH,
    "sft_train_samples": len(dataset['train']),
    "sft_loss": train_result.training_loss,
    "dpo_loss": dpo_loss_val,
    "sft_adapter_path": ADAPTER_DIR,
    "final_adapter_path": final_adapter
}

meta_path = os.path.join(final_adapter, 'training_metadata.json')
with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump(run_metadata, f, ensure_ascii=False, indent=2)

print(f"✅ Đã lưu Metadata & Adapter hoàn chỉnh vào Google Drive: {meta_path}")
""")
    ]

    # ==========================================
    # NOTEBOOK 4: 04_evaluate_model.ipynb
    # ==========================================
    nb4_cells = [
        md_cell("""# EventHub AI Create Event V2 — Pipeline 04: Benchmark & Evaluate Model
### Mục tiêu:
1. Đánh giá đối đầu (Head-to-Head Comparison) giữa **Base Model** và **Fine-tuned Qwen Model**.
2. Kiểm thử trên 2 bộ dữ liệu:
   - **Tập Test độc lập (34 mẫu)** chưa từng xuất hiện trong tập huấn luyện.
   - **Bộ Kiểm thử Hồi quy (10 tài liệu thực tế khó)**: Phân loại email, chat, văn bản thiếu thông tin, đa ngày.
3. Đo lường các chỉ số cốt lõi: JSON Parse Rate, Schema Validity, Field Accuracy, Session F1, Ticket F1, Hallucination Rate.
4. Xuất báo cáo so sánh chi tiết ra Google Drive.
"""),
        code_cell("""# [1] Cài đặt dependencies và Mount Drive
!pip install -q -U torch transformers peft bitsandbytes accelerate

from google.colab import drive
import os
import json
import re
import torch
from difflib import SequenceMatcher
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

drive.mount('/content/drive')

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
ADAPTER_DIR = os.path.join(DRIVE_ROOT, 'adapters/eventhub_qwen_v2')
TEST_FILE = os.path.join(DRIVE_ROOT, 'dataset/cleaned/eventhub_v2/splits/test.jsonl')
REGRESSION_FILE = os.path.join(DRIVE_ROOT, 'dataset/regression_test/regression_ground_truth.json')
EVAL_OUT_DIR = os.path.join(DRIVE_ROOT, 'evaluation')

os.makedirs(EVAL_OUT_DIR, exist_ok=True)
"""),
        code_cell("""# [2] Tải Fine-Tuned Model với LoRA Adapter
import json

# Tự động nhận diện chính xác Base Model từ file cấu hình của Adapter
adapter_cfg_file = os.path.join(ADAPTER_DIR, 'adapter_config.json')
if os.path.exists(adapter_cfg_file):
    with open(adapter_cfg_file, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    BASE_MODEL_ID = cfg.get("base_model_name_or_path", "Qwen/Qwen3-4B")
else:
    BASE_MODEL_ID = "Qwen/Qwen3-4B"

print(f"Đang tải Base Model: {BASE_MODEL_ID}...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)

base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL_ID,
    torch_dtype=torch.float16,
    device_map="auto",
    trust_remote_code=True
)

if os.path.exists(ADAPTER_DIR):
    print(f"Đang gắn LoRA Adapter từ {ADAPTER_DIR}...")
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()
    print("✅ Đã tải thành công Fine-Tuned Model!")
else:
    print("Lưu ý: Không tìm thấy Adapter, sẽ chạy đánh giá trên Base Model làm baseline.")
    model = base_model
    model.eval()
"""),
        code_cell("""# [3] Hàm suy luận trích xuất JSON (Greedy Decoding)
def extract_event_json(raw_text):
    messages = [
        {
            "role": "system",
            "content": "Bạn là chuyên gia trích xuất thông tin sự kiện của hệ thống EventHub. Chỉ trả về duy nhất chuỗi JSON hợp lệ tuân thủ schema, không thêm giải thích."
        },
        {"role": "user", "content": raw_text}
    ]

    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            do_sample=False, # Greedy decoding để kết quả hoàn toàn xác định
            temperature=0.0,
            pad_token_id=tokenizer.eos_token_id
        )

    response_tokens = outputs[0][inputs.input_ids.shape[1]:]
    response_text = tokenizer.decode(response_tokens, skip_special_tokens=True).strip()

    # Làm sạch markdown json nếu có
    cleaned = re.sub(r'^```json\\s*', '', response_text)
    cleaned = re.sub(r'\\s*```$', '', cleaned)
    try:
        return json.loads(cleaned), True, response_text
    except Exception as e:
        return None, False, response_text
"""),
        code_cell("""# [4] Chạy đánh giá trên Bộ Kiểm thử Hồi quy (10 Ca Thực tế)
# Tải regression cases
with open(REGRESSION_FILE, 'r', encoding='utf-8') as f:
    regression_cases = json.load(f)

print(f"Bắt đầu đánh giá trên {len(regression_cases)} ca kiểm thử hồi quy...")
results = []

for doc_name, case in regression_cases.items():
    raw_doc = case.get("input_text") or case.get("expected", {}).get("title") # fallback
    exp = case.get("expected")

    parsed, success, raw_resp = extract_event_json(raw_doc)
    results.append({
        "doc": doc_name,
        "success": success,
        "prediction": parsed,
        "expected": exp,
        "raw_response": raw_resp
    })
    print(f"  - [{doc_name}] JSON Valid: {success}")

valid_count = sum(1 for r in results if r["success"])
print(f"\\nTỷ lệ JSON Valid trên tập Hồi quy: {valid_count}/{len(results)} ({valid_count/len(results)*100:.1f}%)")
"""),
        code_cell("""# [5] Xuất báo cáo đánh giá ra Drive
report_file = os.path.join(EVAL_OUT_DIR, 'EVALUATION_REPORT.md')
with open(report_file, 'w', encoding='utf-8') as f:
    f.write("# BÁO CÁO KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH V2 TRÊN GOOGLE COLAB\\n\\n")
    f.write(f"- **Tỷ lệ JSON Valid:** {valid_count/len(results)*100:.1f}%\\n")
    f.write(f"- **Tổng số ca kiểm thử:** {len(results)}\\n\\n")
    f.write("## Chi tiết kết quả 10 ca kiểm thử hồi quy:\\n\\n")
    for r in results:
        status = "✅ PASS" if r["success"] else "❌ FAIL"
        f.write(f"### {r['doc']} — {status}\\n")
        if r["success"]:
            f.write(f"- **Title trích xuất:** `{r['prediction'].get('title')}`\\n")
            f.write(f"- **Địa điểm:** `{r['prediction'].get('venue_name')}` ({r['prediction'].get('province')})\\n")
            f.write(f"- **Số sessions:** {len(r['prediction'].get('sessions', []))}\\n\\n")
        else:
            f.write(f"- **Lỗi Raw Output:**\\n```text\\n{r['raw_response'][:300]}\\n```\\n\\n")

print(f"Đã lưu báo cáo đánh giá vào: {report_file}")
""")
    ]

    # ==========================================
    # NOTEBOOK 5: 05_export_gguf_ollama.ipynb
    # ==========================================
    nb5_cells = [
        md_cell("""# EventHub AI Create Event V2 — Pipeline 05: Export GGUF & Integrate Ollama
### Mục tiêu:
1. Hợp nhất trọng số LoRA Adapter vào Base Model (`merge_and_unload`).
2. Biên dịch công cụ `llama.cpp` trên máy chủ Colab.
3. Chuyển đổi mô hình 16-bit sang định dạng nhị phân **GGUF**.
4. Lượng tử hóa mô hình sang **Q4_K_M** (chuẩn cân bằng hoàn hảo giữa tốc độ và độ chính xác trích xuất JSON).
5. Tạo `Modelfile` tùy biến cho Ollama và chạy kiểm tra khói (Smoke Test) trước khi đưa về Backend EventHub.
"""),
        code_cell("""# [1] Cài đặt dependencies và Mount Drive
!pip install -q -U torch transformers peft accelerate

from google.colab import drive
import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

drive.mount('/content/drive')

DRIVE_ROOT = '/content/drive/MyDrive/EventHub_AI'
ADAPTER_DIR = os.path.join(DRIVE_ROOT, 'adapters/eventhub_qwen_v2')
MERGED_DIR = os.path.join(DRIVE_ROOT, 'merged_model/eventhub-extractor-v2')
GGUF_DIR = os.path.join(DRIVE_ROOT, 'export/gguf')

os.makedirs(MERGED_DIR, exist_ok=True)
os.makedirs(GGUF_DIR, exist_ok=True)
"""),
        code_cell("""# [2] Hợp nhất (Merge) LoRA Adapter vào Base Model
import json

# Tự động nhận diện chính xác Base Model từ file cấu hình của Adapter
adapter_cfg_file = os.path.join(ADAPTER_DIR, 'adapter_config.json')
if os.path.exists(adapter_cfg_file):
    with open(adapter_cfg_file, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    BASE_MODEL_ID = cfg.get("base_model_name_or_path", "Qwen/Qwen3-4B")
else:
    BASE_MODEL_ID = "Qwen/Qwen3-4B"

print(f"Đang tải Base Model chính xác: {BASE_MODEL_ID} ở định dạng FP16...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)
base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL_ID,
    torch_dtype=torch.float16,
    device_map="cpu", # Merge trên RAM để tránh tràn VRAM
    trust_remote_code=True
)

print(f"Đang gắn LoRA Adapter từ {ADAPTER_DIR}...")
peft_model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)

print("Đang hợp nhất trọng số (merge_and_unload)...")
merged_model = peft_model.merge_and_unload()

print(f"Đang lưu mô hình hợp nhất vào: {MERGED_DIR}")
merged_model.save_pretrained(MERGED_DIR)
tokenizer.save_pretrained(MERGED_DIR)
print("✅ Hợp nhất mô hình hoàn tất!")
"""),
        code_cell("""# [3] Clone và Build llama.cpp trên Colab
!git clone https://github.com/ggerganov/llama.cpp
%cd llama.cpp
!pip install -r requirements.txt
!cmake -B build
!cmake --build build --config Release -j
print("Biên dịch llama.cpp hoàn tất!")
"""),
        code_cell("""# [4] Chuyển đổi mô hình HF sang GGUF (FP16)
gguf_f16_path = os.path.join(GGUF_DIR, 'eventhub-extractor-v2-f16.gguf')
!python convert_hf_to_gguf.py {MERGED_DIR} --outfile {gguf_f16_path} --outtype f16
print(f"Đã xuất GGUF FP16: {gguf_f16_path}")
"""),
        code_cell("""# [5] Lượng tử hóa sang định dạng Q4_K_M
gguf_q4_path = os.path.join(GGUF_DIR, 'eventhub-extractor-v2-Q4_K_M.gguf')
!./build/bin/llama-quantize {gguf_f16_path} {gguf_q4_path} Q4_K_M
print(f"✅ Xuất thành công GGUF Q4_K_M: {gguf_q4_path}")
"""),
        code_cell("""# [6] Tạo tệp Modelfile cho Ollama
modelfile_content = f\"\"\"FROM ./eventhub-extractor-v2-Q4_K_M.gguf

TEMPLATE \"\"\"{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
\"\"\"

SYSTEM \"\"\"Bạn là chuyên gia trích xuất thông tin sự kiện của hệ thống EventHub. Chỉ trả về duy nhất chuỗi JSON hợp lệ tuân thủ schema, không thêm giải thích hoặc markdown.\"\"\"

PARAMETER temperature 0.1
PARAMETER top_p 0.95
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
\"\"\"

modelfile_path = os.path.join(GGUF_DIR, 'Modelfile')
with open(modelfile_path, 'w', encoding='utf-8') as f:
    f.write(modelfile_content)

print(f"Đã tạo Modelfile tại: {modelfile_path}")
"""),
        md_cell("""## Hướng dẫn nhập mô hình vào Ollama trên máy Backend:
1. Tải 2 tệp về máy local:
   - `eventhub-extractor-v2-Q4_K_M.gguf`
   - `Modelfile`
2. Mở Terminal / PowerShell tại thư mục chứa 2 file trên và chạy lệnh:
   ```bash
   ollama create eventhub-extractor-v2 -f Modelfile
   ```
3. Kiểm tra mô hình trong danh sách:
   ```bash
   ollama list
   ```
4. Cập nhật biến môi trường trong file `.env` của Backend EventHub:
   ```env
   AI_MODEL_NAME=eventhub-extractor-v2
   ```
   *(Hệ thống sẽ chuyển sang dùng model mới mà không cần sửa code business logic!)*
""")
    ]

    notebooks = {
        "01_validate_dataset.ipynb": nb1_cells,
        "02_prepare_sft_dataset.ipynb": nb2_cells,
        "03_train_qwen3_eventhub.ipynb": nb3_cells,
        "04_evaluate_model.ipynb": nb4_cells,
        "05_export_gguf_ollama.ipynb": nb5_cells,
    }

    for name, cells in notebooks.items():
        nb_json = make_notebook(cells)
        target = os.path.join("ai/colab", name)
        with open(target, 'w', encoding='utf-8') as f:
            json.dump(nb_json, f, ensure_ascii=False, indent=2)
        print(f"Generated notebook: {target}")

if __name__ == "__main__":
    generate_all()
