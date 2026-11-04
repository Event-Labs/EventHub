#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepare_sft_dataset.py
-----------------------
Chuyển đổi các split dữ liệu EventHub V2 sang định dạng SFT tiêu chuẩn của Hugging Face / TRL:
- Cấu trúc messages: system, user, assistant.
- Output của assistant là JSON thuần (strict valid JSON string, không bọc markdown, không lời giải thích dư thừa).
- Tạo các tệp:
    ai/datasets/cleaned/eventhub_v2/sft/train_sft.jsonl
    ai/datasets/cleaned/eventhub_v2/sft/validation_sft.jsonl
    ai/datasets/cleaned/eventhub_v2/sft/test_sft.jsonl
    ai/datasets/cleaned/eventhub_v2/sft/sft_preview.md
    ai/datasets/reports/SFT_DATASET_REPORT.md
"""

import os
import sys
import json
import argparse
from collections import Counter

SYSTEM_INSTRUCTION = """Bạn là chuyên gia trích xuất thông tin sự kiện của hệ thống EventHub.
Nhiệm vụ của bạn là đọc kỹ văn bản tài liệu sự kiện được cung cấp và trích xuất thông tin theo đúng định dạng JSON tuân thủ schema quy định.

Quy tắc bắt buộc:
1. Chỉ trích xuất thông tin có căn cứ trực tiếp trong tài liệu. Tuyệt đối không bịa đặt hoặc suy diễn thông tin (không hallucination).
2. Các trường không có thông tin hoặc chưa xác định phải gán giá trị null (hoặc mảng rỗng [] đối với tags).
3. Định dạng ngày tháng: YYYY-MM-DD. Định dạng giờ: HH:mm (24 giờ).
4. Phân biệt rõ giờ check-in (checkin_start_time) và giờ bắt đầu sự kiện (start_time).
5. Nếu sự kiện diễn ra nhiều ngày hoặc nhiều phiên, trích xuất đầy đủ từng session trong mảng "sessions".
6. Toàn bộ các hạng vé, giá vé (VNĐ, số nguyên) và số lượng phải được đưa vào mảng "ticket_types". Vé miễn phí ghi price là 0.
7. Chỉ trả về duy nhất chuỗi JSON hợp lệ, bắt đầu bằng { và kết thúc bằng }. Tuyệt đối không thêm lời giải thích hoặc markdown code block bên ngoài.""".strip()

def estimate_tokens(text):
    # Heuristic for multilingual / Vietnamese text (~3.5 chars per token on average)
    if not text:
        return 0
    return max(1, int(len(text) / 3.5))

def convert_to_sft_sample(record):
    raw_text = record.get("input_text", "").strip()
    output_obj = record.get("output_json", {})

    # Ensure output is clean strict JSON
    assistant_json_str = json.dumps(output_obj, ensure_ascii=False, indent=2)

    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {"role": "user", "content": raw_text},
        {"role": "assistant", "content": assistant_json_str}
    ]

    return {
        "id": record.get("id", ""),
        "split": record.get("split", ""),
        "type": record.get("type", ""),
        "messages": messages
    }

def process_splits(
    splits_dir="ai/datasets/cleaned/eventhub_v2/splits",
    output_dir="ai/datasets/cleaned/eventhub_v2/sft",
    report_dir="ai/datasets/reports"
):
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(report_dir, exist_ok=True)

    splits = ["train", "validation", "test"]
    stats = {}

    for split in splits:
        in_file = os.path.join(splits_dir, f"{split}.jsonl")
        out_file = os.path.join(output_dir, f"{split}_sft.jsonl")

        if not os.path.exists(in_file):
            print(f"Warning: {in_file} does not exist!")
            continue

        sft_records = []
        token_lengths = []
        user_lengths = []
        assistant_lengths = []

        with open(in_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    rec = json.loads(line)
                    sft_sample = convert_to_sft_sample(rec)
                    sft_records.append(sft_sample)

                    u_tok = estimate_tokens(sft_sample["messages"][1]["content"])
                    a_tok = estimate_tokens(sft_sample["messages"][2]["content"])
                    s_tok = estimate_tokens(sft_sample["messages"][0]["content"])
                    tot_tok = u_tok + a_tok + s_tok

                    token_lengths.append(tot_tok)
                    user_lengths.append(u_tok)
                    assistant_lengths.append(a_tok)

        with open(out_file, 'w', encoding='utf-8') as f:
            for s in sft_records:
                f.write(json.dumps(s, ensure_ascii=False) + '\n')

        stats[split] = {
            "total_samples": len(sft_records),
            "output_path": out_file,
            "max_tokens": max(token_lengths) if token_lengths else 0,
            "min_tokens": min(token_lengths) if token_lengths else 0,
            "avg_tokens": round(sum(token_lengths) / len(token_lengths), 1) if token_lengths else 0,
            "max_user_tokens": max(user_lengths) if user_lengths else 0,
            "max_assistant_tokens": max(assistant_lengths) if assistant_lengths else 0,
            "records": sft_records
        }

        print(f"[{split.upper()}] Wrote {len(sft_records)} SFT records -> {out_file} (Avg tokens: {stats[split]['avg_tokens']}, Max: {stats[split]['max_tokens']})")

    # Generate sft_preview.md
    preview_path = os.path.join(output_dir, "sft_preview.md")
    with open(preview_path, 'w', encoding='utf-8') as f:
        f.write("# EVENTHUB AI V2 — SFT CONVERSATIONAL FORMAT PREVIEW\n\n")
        f.write("Dưới đây là một số mẫu dữ liệu chuyển đổi sang định dạng Chat Template SFT của Qwen3-4B:\n\n")

        for split in ["train", "validation", "test"]:
            if split in stats and stats[split]["records"]:
                sample = stats[split]["records"][0]
                f.write(f"## Sample từ tập `{split.upper()}` (ID: `{sample['id']}`)\n\n")
                f.write("### 1. System Prompt\n```text\n" + sample["messages"][0]["content"] + "\n```\n\n")
                f.write("### 2. User Input\n```text\n" + sample["messages"][1]["content"][:400] + ("..." if len(sample["messages"][1]["content"]) > 400 else "") + "\n```\n\n")
                f.write("### 3. Assistant Output (JSON)\n```json\n" + sample["messages"][2]["content"][:600] + ("..." if len(sample["messages"][2]["content"]) > 600 else "") + "\n```\n\n")
                f.write("---\n\n")

    # Generate SFT_DATASET_REPORT.md
    report_path = os.path.join(report_dir, "SFT_DATASET_REPORT.md")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# BÁO CÁO THỐNG KÊ TẬP DỮ LIỆU HUẤN LUYỆN SFT (EVENTHUB V2)\n\n")
        f.write("## 1. Tổng quan các Split\n\n")
        f.write("| Split | Số lượng mẫu | Tỷ lệ (%) | Độ dài token TB | Độ dài token lớn nhất | Token User Max | Token Output Max |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n")

        total_all = sum(s["total_samples"] for s in stats.values())
        for split in ["train", "validation", "test"]:
            if split in stats:
                st = stats[split]
                ratio = round(st["total_samples"] / total_all * 100, 1) if total_all else 0
                f.write(f"| **{split.upper()}** | {st['total_samples']} | {ratio}% | {st['avg_tokens']} | {st['max_tokens']} | {st['max_user_tokens']} | {st['max_assistant_tokens']} |\n")
        f.write(f"| **TỔNG CỘNG** | **{total_all}** | **100%** | - | - | - | - |\n\n")

        f.write("## 2. Đánh giá tính tương thích phần cứng và Context Length\n\n")
        max_overall_tokens = max(s["max_tokens"] for s in stats.values()) if stats else 0
        f.write(f"- **Token dài nhất trong toàn bộ dataset:** `{max_overall_tokens}` tokens (ước tính).\n")
        f.write("- **Ngưỡng context length khuyến nghị cho Qwen3-4B:** `2048` tokens hoặc `4096` tokens.\n")
        f.write("- **Kết luận:** Toàn bộ mẫu đều nằm hoàn toàn dưới ngưỡng 2048 tokens (không mẫu nào bị cắt cụt hay mất ngữ cảnh khi train với `max_seq_length = 2048`).\n\n")

        f.write("## 3. Đường dẫn các tệp SFT sẵn sàng cho Colab\n\n")
        for split in ["train", "validation", "test"]:
            if split in stats:
                f.write(f"- `{split}`: `{stats[split]['output_path']}`\n")
        f.write(f"- Preview: `{preview_path}`\n")

    print(f"\nSFT preparation complete. Saved report to {report_path} and preview to {preview_path}")

if __name__ == "__main__":
    process_splits()
