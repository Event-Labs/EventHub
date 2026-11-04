#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_data_leakage.py
---------------------
Phát hiện hiện tượng rò rỉ dữ liệu (Data Leakage) giữa các tập train, validation và test:
- Các tài liệu cùng tên sự kiện (Title/Event cluster) xuất hiện ở nhiều split.
- Các tài liệu gần trùng (Near-duplicates >= threshold) xuất hiện ở các split khác nhau.
- Phân tích và đề xuất phân cụm nhóm (Grouped Stratified Splitting).

Usage:
    python check_data_leakage.py --input ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300/dataset_all.jsonl
"""

import os
import sys
import json
import re
import argparse
from difflib import SequenceMatcher
from collections import defaultdict, Counter

def normalize_text(text):
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    return ' '.join(text.split())

def get_3grams(text):
    words = text.split()
    if len(words) < 3:
        return set([' '.join(words)])
    return set(' '.join(words[i:i+3]) for i in range(len(words) - 2))

def jaccard_similarity(set_a, set_b):
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)

def check_leakage_in_dataset(input_path, output_dir="ai/datasets/reports", prefix=""):
    os.makedirs(output_dir, exist_ok=True)
    records = []
    with open(input_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if line:
                data = json.loads(line)
                records.append({
                    "id": data.get("id", f"SAMPLE-{idx}"),
                    "split": data.get("split", "unknown"),
                    "title": data.get("output_json", {}).get("title", "").strip(),
                    "category": data.get("output_json", {}).get("category", "").strip(),
                    "raw_text": data.get("input_text", "")
                })

    total = len(records)
    print(f"Checking leakage for {total} samples in {input_path}")

    # 1. Title/Event Group Leakage
    title_to_splits = defaultdict(set)
    title_to_samples = defaultdict(lambda: defaultdict(list))
    for r in records:
        t = r["title"]
        s = r["split"]
        title_to_splits[t].add(s)
        title_to_samples[t][s].append(r["id"])

    leaked_titles = {t: list(splits) for t, splits in title_to_splits.items() if len(splits) > 1}
    leaked_titles_detail = []
    for t, splits in leaked_titles.items():
        sample_counts = {s: len(title_to_samples[t][s]) for s in splits}
        leaked_titles_detail.append({
            "title": t,
            "splits": splits,
            "counts": sample_counts,
            "sample_ids": {s: title_to_samples[t][s] for s in splits}
        })

    # 2. Text Near-Duplicate Leakage across splits
    normalized_list = [normalize_text(r["raw_text"]) for r in records]
    ngrams_list = [get_3grams(norm) for norm in normalized_list]
    text_leakage_pairs = []

    for i in range(total):
        for j in range(i + 1, total):
            s1 = records[i]["split"]
            s2 = records[j]["split"]
            if s1 != s2 and s1 != "unknown" and s2 != "unknown":
                jacc = jaccard_similarity(ngrams_list[i], ngrams_list[j])
                if jacc >= 0.65:
                    sim = SequenceMatcher(None, normalized_list[i], normalized_list[j]).ratio()
                    if sim >= 0.85:
                        text_leakage_pairs.append({
                            "id1": records[i]["id"],
                            "split1": s1,
                            "title1": records[i]["title"],
                            "id2": records[j]["id"],
                            "split2": s2,
                            "title2": records[j]["title"],
                            "similarity": round(sim, 3)
                        })

    has_leakage = len(leaked_titles) > 0 or len(text_leakage_pairs) > 0

    report = {
        "dataset_path": os.path.abspath(input_path),
        "total_records": total,
        "has_data_leakage": has_leakage,
        "unique_titles": len(title_to_splits),
        "leaked_titles_count": len(leaked_titles),
        "leaked_titles_ratio": round(len(leaked_titles) / len(title_to_splits), 3) if title_to_splits else 0,
        "text_leakage_pairs_count": len(text_leakage_pairs),
        "leaked_titles_detail": leaked_titles_detail,
        "text_leakage_pairs": text_leakage_pairs
    }

    out_json = os.path.join(output_dir, f"{prefix}data_leakage_report.json")
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    out_md = os.path.join(output_dir, f"{prefix}DATA_LEAKAGE_REPORT.md")
    with open(out_md, 'w', encoding='utf-8') as f:
        f.write("# BÁO CÁO KIỂM TRA RÒ RỈ DỮ LIỆU (DATA LEAKAGE AUDIT)\n\n")
        f.write(f"- **Tệp kiểm tra:** `{input_path}`\n")
        f.write(f"- **Tổng số mẫu:** {total}\n")
        f.write(f"- **Phát hiện rò rỉ dữ liệu:** **{'CÓ (NGHIÊM TRỌNG)' if has_leakage else 'KHÔNG'}**\n")
        f.write(f"- **Số sự kiện bị phân mảnh vào nhiều split:** **{len(leaked_titles)} / {len(title_to_splits)} ({round(len(leaked_titles)/len(title_to_splits)*100, 1)}%)**\n")
        f.write(f"- **Số cặp tài liệu gần trùng vượt ranh giới split:** **{len(text_leakage_pairs)} cặp**\n\n")

        if leaked_titles_detail:
            f.write("## 1. Chi tiết các sự kiện bị rò rỉ giữa các Split\n\n")
            f.write("| Tên sự kiện | Các split bị rò rỉ | Chi tiết số lượng mẫu |\n| :--- | :---: | :--- |\n")
            for item in leaked_titles_detail[:25]:
                splits_str = ", ".join(item["splits"])
                counts_str = ", ".join(f"{s}: {c}" for s, c in item["counts"].items())
                f.write(f"| **{item['title']}** | `{splits_str}` | {counts_str} |\n")

        if text_leakage_pairs:
            f.write("\n## 2. Các cặp tài liệu gần trùng (>=85%) nằm ở 2 split khác nhau\n\n")
            for pair in text_leakage_pairs[:20]:
                f.write(f"- `{pair['id1']}` ({pair['split1']} - *{pair['title1']}*) <---> `{pair['id2']}` ({pair['split2']} - *{pair['title2']}*) — Sim: **{pair['similarity']*100}%**\n")

        f.write("\n## 3. Khuyến nghị khắc phục\n\n")
        f.write("1. **Áp dụng Grouped Stratified Split:** Gom toàn bộ các tài liệu của cùng một sự kiện vào DUY NHẤT một split (toàn bộ vào Train, hoặc toàn bộ vào Test, hoặc toàn bộ vào Validation).\n")
        f.write("2. **Bảo toàn tính độc lập của tập Test:** Tập Test bắt buộc phải bao gồm những sự kiện và định dạng hoàn toàn mới chưa từng xuất hiện trong tập Train.\n")

    print(f"Data leakage check complete: {out_json}, {out_md}")
    return report

def main():
    parser = argparse.ArgumentParser(description="Check cross-split data leakage")
    parser.add_argument("--input", "-i", required=True, help="Input jsonl file")
    parser.add_argument("--output-dir", default="ai/datasets/reports", help="Output directory")
    parser.add_argument("--prefix", default="", help="Prefix for report filename")
    args = parser.parse_args()

    check_leakage_in_dataset(args.input, args.output_dir, args.prefix)

if __name__ == "__main__":
    main()
