#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
create_grouped_splits.py
-------------------------
Chia dataset EventHub V2 theo phương pháp Grouped Stratified Splitting:
- Nhóm toàn bộ mẫu theo Tên sự kiện (Event Title).
- Đảm bảo 100% không rò rỉ (0% title leakage): Mỗi sự kiện chỉ xuất hiện trong DUY NHẤT một tập.
- Tỷ lệ mục tiêu: ~80% train, ~10% validation, ~10% test.
- Đảm bảo tập Test và Validation có đủ các nhóm category và định dạng (structured / unstructured).
- Phân bổ các mẫu edge-cases đa dạng vào các tập để đánh giá năng lực tổng quát hóa.
"""

import os
import sys
import json
import random
from collections import defaultdict, Counter

def create_grouped_splits(
    input_file="ai/datasets/cleaned/eventhub_v2/dataset_all.jsonl",
    output_dir="ai/datasets/cleaned/eventhub_v2/splits",
    random_seed=42
):
    random.seed(random_seed)
    os.makedirs(output_dir, exist_ok=True)

    with open(input_file, 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    total_records = len(records)
    print(f"Total input records: {total_records}")

    # Group by title
    event_groups = defaultdict(list)
    for r in records:
        title = r["output_json"].get("title", "UNKNOWN").strip()
        event_groups[title].append(r)

    print(f"Unique event titles: {len(event_groups)}")

    # We want:
    # Train: ~244 samples (~80%)
    # Val: ~32 samples (~10%)
    # Test: ~32 samples (~10%)

    # Diverse edge-case titles (EVT-V2-001 to EVT-V2-008)
    diverse_titles = [
        "Vietnam GameDev Summit 2027",
        "Thanh Âm Mùa Thu",
        "Workshop Thiết Kế Gốm Thủ Công & Trà Đạo",
        "Jungle Trail 2027",
        "Hội Chợ Ẩm Thực Chay Toàn Quốc 2027",
        "Đà Nẵng Startup Demo Day 2027",
        "Acoustic Trên Mây - Đà Lạt Sunset",
        "Cloud Native & Kubernetes Community Day Vietnam 2027"
    ]

    # Pre-allocate diverse cases to test generalization:
    # 4 to test (e.g., EVT-V2-004 Jungle Trail [unconfirmed fields], EVT-V2-005 Hội chợ [table markdown], EVT-V2-007 Acoustic chat, EVT-V2-008 English)
    # 2 to val (EVT-V2-002 Nhà hát Lớn [multi-location], EVT-V2-006 Đà Nẵng Demo Day [json])
    # 2 to train (EVT-V2-001 GameDev [multi-session], EVT-V2-003 Gốm [updated time])
    diverse_allocation = {
        "Cloud Native & Kubernetes Community Day Vietnam 2027": "test",
        "Jungle Trail 2027": "test",
        "Hội Chợ Ẩm Thực Chay Toàn Quốc 2027": "test",
        "Acoustic Trên Mây - Đà Lạt Sunset": "test",
        "Thanh Âm Mùa Thu": "validation",
        "Đà Nẵng Startup Demo Day 2027": "validation",
        "Vietnam GameDev Summit 2027": "train",
        "Workshop Thiết Kế Gốm Thủ Công & Trà Đạo": "train"
    }

    # Group standard titles by primary category to balance categories
    category_to_titles = defaultdict(list)
    for title, samples in event_groups.items():
        if title in diverse_allocation:
            continue
        cat = samples[0]["output_json"].get("category", "other")
        category_to_titles[cat].append((title, len(samples)))

    # Target counts
    target_test = int(total_records * 0.10)
    target_val = int(total_records * 0.10)

    test_titles = [t for t, s in diverse_allocation.items() if s == "test"]
    val_titles = [t for t, s in diverse_allocation.items() if s == "validation"]
    train_titles = [t for t, s in diverse_allocation.items() if s == "train"]

    test_count = sum(len(event_groups[t]) for t in test_titles)
    val_count = sum(len(event_groups[t]) for t in val_titles)
    train_count = sum(len(event_groups[t]) for t in train_titles)

    # Distribute standard titles across splits ensuring category representation
    # Sort categories to be deterministic
    for cat in sorted(category_to_titles.keys()):
        titles_with_counts = category_to_titles[cat]
        # Shuffle with fixed seed
        random.shuffle(titles_with_counts)
        for t, cnt in titles_with_counts:
            # Check if val or test need items
            if test_count + cnt <= target_test + 4 and test_count <= val_count:
                test_titles.append(t)
                test_count += cnt
            elif val_count + cnt <= target_val + 4:
                val_titles.append(t)
                val_count += cnt
            else:
                train_titles.append(t)
                train_count += cnt

    # Verify no title in multiple splits
    s_train = set(train_titles)
    s_val = set(val_titles)
    s_test = set(test_titles)

    assert len(s_train & s_val) == 0, "Train and Val overlap!"
    assert len(s_train & s_test) == 0, "Train and Test overlap!"
    assert len(s_val & s_test) == 0, "Val and Test overlap!"

    # Compile samples
    train_samples = []
    val_samples = []
    test_samples = []

    for t in train_titles:
        for item in event_groups[t]:
            item["split"] = "train"
            train_samples.append(item)

    for t in val_titles:
        for item in event_groups[t]:
            item["split"] = "validation"
            val_samples.append(item)

    for t in test_titles:
        for item in event_groups[t]:
            item["split"] = "test"
            test_samples.append(item)

    # Sort samples by ID for deterministic output
    train_samples.sort(key=lambda x: x.get("id", ""))
    val_samples.sort(key=lambda x: x.get("id", ""))
    test_samples.sort(key=lambda x: x.get("id", ""))

    train_path = os.path.join(output_dir, "train.jsonl")
    val_path = os.path.join(output_dir, "validation.jsonl")
    test_path = os.path.join(output_dir, "test.jsonl")

    with open(train_path, 'w', encoding='utf-8') as f:
        for s in train_samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    with open(val_path, 'w', encoding='utf-8') as f:
        for s in val_samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    with open(test_path, 'w', encoding='utf-8') as f:
        for s in test_samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    # Update dataset_all.jsonl with assigned split tags
    all_updated = train_samples + val_samples + test_samples
    all_updated.sort(key=lambda x: x.get("id", ""))
    with open(input_file, 'w', encoding='utf-8') as f:
        for s in all_updated:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    print("\n--- GROUPED SPLIT SUMMARY ---")
    print(f"Train:      {len(train_samples):3d} samples ({len(train_titles):2d} events) - {len(train_samples)/total_records*100:.1f}%")
    print(f"Validation: {len(val_samples):3d} samples ({len(val_titles):2d} events) - {len(val_samples)/total_records*100:.1f}%")
    print(f"Test:       {len(test_samples):3d} samples ({len(test_titles):2d} events) - {len(test_samples)/total_records*100:.1f}%")
    print(f"Total:      {len(all_updated):3d} samples ({len(event_groups):2d} events)")

    # Report type distribution
    for name, split_data in [("Train", train_samples), ("Validation", val_samples), ("Test", test_samples)]:
        type_c = Counter(s.get("type", "unknown") for s in split_data)
        cat_c = Counter(s["output_json"].get("category", "unknown") for s in split_data)
        print(f"\n[{name}] Type: {dict(type_c)} | Categories: {len(cat_c)}")

if __name__ == "__main__":
    create_grouped_splits()
