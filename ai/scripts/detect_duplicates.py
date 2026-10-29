#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
detect_duplicates.py
--------------------
Phát hiện văn bản trùng lặp, gần trùng lặp và các mẫu có cùng template cấu trúc.

Usage:
    python detect_duplicates.py --input ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300/dataset_all.jsonl
"""

import os
import sys
import json
import re
import hashlib
import argparse
from difflib import SequenceMatcher
from collections import defaultdict, Counter

def compute_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

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

def sequence_ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()

def detect_duplicates_in_file(input_path, threshold=0.85, output_dir="ai/datasets/reports", prefix=""):
    os.makedirs(output_dir, exist_ok=True)
    records = []
    with open(input_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if line:
                data = json.loads(line)
                records.append({
                    "index": idx,
                    "id": data.get("id", f"SAMPLE-{idx}"),
                    "split": data.get("split", "unknown"),
                    "title": data.get("output_json", {}).get("title", ""),
                    "raw_text": data.get("input_text", "")
                })

    total = len(records)
    print(f"Loaded {total} records from {input_path}")

    # 1. Exact Hash Duplicates
    hash_map = defaultdict(list)
    for r in records:
        h = compute_hash(r["raw_text"].strip())
        hash_map[h].append(r["id"])

    exact_hash_dups = [ids for ids in hash_map.values() if len(ids) > 1]

    # 2. Normalized Text Duplicates
    norm_map = defaultdict(list)
    normalized_list = []
    ngram_list = []
    for r in records:
        norm = normalize_text(r["raw_text"])
        norm_map[norm].append(r["id"])
        normalized_list.append(norm)
        ngram_list.append(get_3grams(norm))

    exact_norm_dups = [ids for ids in norm_map.values() if len(ids) > 1]

    # 3. Near-Duplicates (Jaccard + SequenceMatcher)
    near_dups = []
    for i in range(total):
        for j in range(i + 1, total):
            id1, id2 = records[i]["id"], records[j]["id"]
            jacc = jaccard_similarity(ngram_list[i], ngram_list[j])
            if jacc >= 0.60:
                sim = sequence_ratio(normalized_list[i], normalized_list[j])
                if sim >= threshold:
                    near_dups.append({
                        "id1": id1,
                        "id2": id2,
                        "title1": records[i]["title"],
                        "title2": records[j]["title"],
                        "split1": records[i]["split"],
                        "split2": records[j]["split"],
                        "similarity": round(sim, 3)
                    })

    # 4. Template & Event Name Clusters
    title_clusters = defaultdict(list)
    for r in records:
        t = r["title"].strip()
        if t:
            title_clusters[t].append(r["id"])

    repeated_events = {t: ids for t, ids in title_clusters.items() if len(ids) > 1}

    # Opening sentence templates
    template_openings = defaultdict(list)
    for r in records:
        first_line = r["raw_text"].strip().split('\n')[0][:60].strip()
        if first_line:
            template_openings[first_line].append(r["id"])

    frequent_templates = {tpl: ids for tpl, ids in template_openings.items() if len(ids) >= 5}

    report = {
        "dataset_file": os.path.abspath(input_path),
        "total_records": total,
        "exact_hash_duplicates_count": len(exact_hash_dups),
        "exact_hash_duplicates": exact_hash_dups,
        "exact_normalized_duplicates_count": len(exact_norm_dups),
        "near_duplicates_count": len(near_dups),
        "near_duplicates": near_dups,
        "unique_event_titles": len(title_clusters),
        "repeated_event_titles_count": len(repeated_events),
        "frequent_template_openings_count": len(frequent_templates),
        "frequent_template_openings": {tpl: len(ids) for tpl, ids in frequent_templates.items()}
    }

    out_json = os.path.join(output_dir, f"{prefix}duplicate_report.json")
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    out_md = os.path.join(output_dir, f"{prefix}DUPLICATE_REPORT.md")
    with open(out_md, 'w', encoding='utf-8') as f:
        f.write("# BÁO CÁO PHÁT HIỆN TRÙNG LẶP VÀ TEMPLATE — EVENTHUB AI\n\n")
        f.write(f"- **Tệp kiểm tra:** `{input_path}`\n")
        f.write(f"- **Tổng số mẫu:** {total}\n")
        f.write(f"- **Trùng lặp chính xác (Exact Hash):** {len(exact_hash_dups)}\n")
        f.write(f"- **Trùng lặp chuẩn hóa (Normalized):** {len(exact_norm_dups)}\n")
        f.write(f"- **Số cặp gần trùng (Similarity >= {threshold*100}%):** {len(near_dups)}\n")
        f.write(f"- **Số tiêu đề sự kiện duy nhất:** {len(title_clusters)} / {total}\n")
        f.write(f"- **Số tiêu đề bị lặp lại nhiều lần:** {len(repeated_events)}\n\n")

        f.write("## 1. Các khuôn mẫu template lặp lại nhiều nhất\n\n")
        for tpl, ids in frequent_templates.items():
            f.write(f"- Template: `{tpl}...` xuất hiện trong **{len(ids)} mẫu**\n")

        f.write("\n## 2. Top sự kiện có nhiều biến thể tài liệu nhất\n\n")
        top_repeated = sorted(repeated_events.items(), key=lambda x: len(x[1]), reverse=True)[:15]
        for t, ids in top_repeated:
            f.write(f"- **{t}**: {len(ids)} mẫu (`{', '.join(ids[:5])}...`)\n")

        if near_dups:
            f.write("\n## 3. Danh sách các cặp gần trùng (>=85%)\n\n")
            for nd in near_dups[:25]:
                f.write(f"- `{nd['id1']}` ({nd['split1']}) <---> `{nd['id2']}` ({nd['split2']}) — Độ tương đồng: **{nd['similarity']*100}%**\n")

    print(f"Duplicate detection completed: {out_json}, {out_md}")
    return report

def main():
    parser = argparse.ArgumentParser(description="Detect duplicate documents and template clusters")
    parser.add_argument("--input", "-i", required=True, help="Input jsonl file")
    parser.add_argument("--threshold", "-t", type=float, default=0.85, help="Similarity threshold")
    parser.add_argument("--output-dir", default="ai/datasets/reports", help="Output directory")
    parser.add_argument("--prefix", default="", help="Prefix for report filename")
    args = parser.parse_args()

    detect_duplicates_in_file(args.input, args.threshold, args.output_dir, args.prefix)

if __name__ == "__main__":
    main()
