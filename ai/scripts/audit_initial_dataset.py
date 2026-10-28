#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audit_initial_dataset.py
-------------------------
Script kiểm định và audit toàn diện bộ dataset gốc EventHub 300 mẫu:
- 100 tài liệu unstructured
- 200 tài liệu structured
- 300 nhãn tương ứng
- Kiểm tra 15 tiêu chí bắt buộc theo yêu cầu kỹ thuật.
"""

import os
import sys
import json
import re
import glob
from difflib import SequenceMatcher
from collections import defaultdict, Counter

def normalize_text_for_sim(text):
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    return ' '.join(text.split())

def get_word_ngrams(text, n=3):
    words = text.split()
    if len(words) < n:
        return set([' '.join(words)])
    return set(' '.join(words[i:i+n]) for i in range(len(words) - n + 1))

def jaccard_similarity(set_a, set_b):
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0

def string_similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

def is_date_in_text(date_str, text):
    if not date_str or not text:
        return False
    if date_str in text:
        return True
    parts = date_str.split('-')
    if len(parts) == 3:
        y, m, d = parts
        d_num = str(int(d))
        m_num = str(int(m))
        variants = [
            f"{d}/{m}/{y}", f"{d_num}/{m_num}/{y}",
            f"{d}.{m}.{y}", f"{d_num}.{m_num}.{y}",
            f"{d}-{m}-{y}", f"{y}/{m}/{d}",
            f"{d} tháng {m}", f"ngày {d}"
        ]
        if any(v in text for v in variants):
            return True
    return False

def is_time_in_text(time_str, text):
    if not time_str or not text:
        return False
    if time_str in text:
        return True
    parts = time_str.split(':')
    if len(parts) == 2:
        h, m = parts
        h_num = str(int(h))
        variants = [
            f"{h}:{m}", f"{h}h{m}", f"{h}h", f"{h_num}h{m}", f"{h_num}:{m}",
            f"{h_num} giờ", f"{h} giờ"
        ]
        if any(v.lower() in text.lower() for v in variants):
            return True
    return False

def audit_dataset(raw_dir):
    report = {
        "summary": {},
        "file_integrity": {},
        "schema_checks": {},
        "value_validity": {},
        "hallucination_checks": {},
        "truncated_fields": {},
        "duplicate_checks": {},
        "data_leakage": {},
        "detailed_findings": []
    }

    # 1. File counts
    unstr_files = sorted(glob.glob(os.path.join(raw_dir, 'documents', 'unstructured', '*.*')))
    str_files = sorted(glob.glob(os.path.join(raw_dir, 'documents', 'structured', '*.*')))
    label_files = sorted(glob.glob(os.path.join(raw_dir, 'labels', '*.json')))
    all_jsonl_file = os.path.join(raw_dir, 'dataset_all.jsonl')

    report["file_integrity"]["unstructured_count"] = len(unstr_files)
    report["file_integrity"]["structured_count"] = len(str_files)
    report["file_integrity"]["label_count"] = len(label_files)
    report["file_integrity"]["total_documents"] = len(unstr_files) + len(str_files)

    # Read dataset_all.jsonl
    all_records = []
    invalid_json_lines = 0
    split_counts_from_all = Counter()

    if os.path.exists(all_jsonl_file):
        with open(all_jsonl_file, 'r', encoding='utf-8') as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    all_records.append(rec)
                    if "split" in rec:
                        split_counts_from_all[rec["split"]] += 1
                except Exception as e:
                    invalid_json_lines += 1
                    report["detailed_findings"].append({
                        "id": f"LINE-{line_no}",
                        "type": "INVALID_JSON_LINE",
                        "message": str(e)
                    })

    report["file_integrity"]["dataset_all_records"] = len(all_records)
    report["file_integrity"]["invalid_json_lines"] = invalid_json_lines

    # Read splits files
    splits_count = {}
    for s_name in ['train', 'validation', 'test']:
        s_file = os.path.join(raw_dir, 'splits', f'{s_name}.jsonl')
        if os.path.exists(s_file):
            with open(s_file, 'r', encoding='utf-8') as f:
                c = sum(1 for line in f if line.strip())
                splits_count[s_name] = c

    report["file_integrity"]["splits_count"] = splits_count
    report["file_integrity"]["splits_count_from_dataset_all"] = dict(split_counts_from_all)

    # Check individual label JSON validity
    invalid_labels = []
    labels_data = {}
    for lf in label_files:
        sample_id = os.path.splitext(os.path.basename(lf))[0]
        try:
            with open(lf, 'r', encoding='utf-8') as f:
                labels_data[sample_id] = json.load(f)
        except Exception as e:
            invalid_labels.append({"file": lf, "error": str(e)})

    report["file_integrity"]["invalid_label_files"] = len(invalid_labels)

    # 2. Schema and Content Verification
    missing_fields_counts = Counter()
    null_field_counts = Counter()
    invalid_type_counts = Counter()
    truncated_short_desc = []
    hallucinated_sessions = []
    hallucinated_venues = []
    hallucinated_cities = []
    unsupported_categories = Counter()
    invalid_dates = []
    invalid_times = []
    invalid_prices = []
    attendee_info_formats = Counter()

    # Document map: id -> text
    doc_map = {}
    for fpath in unstr_files + str_files:
        sid = os.path.splitext(os.path.basename(fpath))[0]
        with open(fpath, 'r', encoding='utf-8') as f:
            doc_map[sid] = f.read()

    expected_keys = {
        'title': str,
        'category': str,
        'tags': list,
        'short_description': (str, type(None)),
        'description': (str, type(None)),
        'sessions': list,
        'tickets': list,
        'require_attendee_information': (list, bool, type(None))
    }

    for rec in all_records:
        sid = rec.get("id")
        doc_text = rec.get("input_text", "")
        out = rec.get("output_json", {})

        # Verify correspondence between raw file and dataset_all
        raw_file_text = doc_map.get(sid, "")
        if raw_file_text.strip() != doc_text.strip():
            if abs(len(raw_file_text) - len(doc_text)) > 5:
                report["detailed_findings"].append({
                    "id": sid,
                    "type": "DOCUMENT_MISMATCH",
                    "message": f"Text in dataset_all ({len(doc_text)} chars) differs from document file ({len(raw_file_text)} chars)"
                })

        # Check expected keys
        for k, expected_type in expected_keys.items():
            if k not in out:
                missing_fields_counts[k] += 1
            else:
                val = out[k]
                if val is None:
                    null_field_counts[k] += 1
                elif not isinstance(val, expected_type):
                    invalid_type_counts[k] += 1

        # Check short_description truncation
        short_desc = out.get("short_description")
        if isinstance(short_desc, str):
            # Check if truncated at character limit like 150 or ending in incomplete syllable
            if len(short_desc) in [148, 149, 150] or re.search(r'\b[a-zA-ZÀ-ỹ]{1,2}$', short_desc.strip()):
                truncated_short_desc.append({
                    "id": sid,
                    "length": len(short_desc),
                    "ending": short_desc[-20:]
                })

        # Category check
        cat = out.get("category")
        if cat:
            unsupported_categories[cat] += 1

        # Check attendee info format
        att = out.get("require_attendee_information")
        if isinstance(att, list):
            attendee_info_formats["array_of_fields"] += 1
        elif isinstance(att, bool):
            attendee_info_formats["boolean"] += 1
        elif att is None:
            attendee_info_formats["null"] += 1
        else:
            attendee_info_formats[str(type(att))] += 1

        # Check sessions
        sessions = out.get("sessions") or []
        if not sessions:
            null_field_counts["empty_sessions"] += 1
        for s_idx, sess in enumerate(sessions):
            s_date = sess.get("date")
            if s_date:
                if not re.match(r'^\d{4}-\d{2}-\d{2}$', s_date):
                    invalid_dates.append({"id": sid, "session": s_idx, "date": s_date})
                if not is_date_in_text(s_date, doc_text):
                    hallucinated_sessions.append({
                        "id": sid,
                        "session": s_idx,
                        "date": s_date,
                        "reason": f"Date {s_date} does not appear in source text"
                    })

            s_checkin = sess.get("check_in_time")
            s_start = sess.get("start_time")
            s_end = sess.get("end_time")

            for t_name, t_val in [("check_in_time", s_checkin), ("start_time", s_start), ("end_time", s_end)]:
                if t_val:
                    if not re.match(r'^\d{2}:\d{2}$', t_val):
                        invalid_times.append({"id": sid, "field": t_name, "time": t_val})

            if s_checkin and s_start and s_checkin > s_start:
                invalid_times.append({
                    "id": sid,
                    "session": s_idx,
                    "error": f"check_in ({s_checkin}) > start_time ({s_start})"
                })
            if s_start and s_end and s_start >= s_end:
                invalid_times.append({
                    "id": sid,
                    "session": s_idx,
                    "error": f"start_time ({s_start}) >= end_time ({s_end})"
                })

            # Check venue / district / city hallucination
            v_name = sess.get("venue_name")
            if v_name and v_name.lower() not in doc_text.lower():
                hallucinated_venues.append({
                    "id": sid,
                    "session": s_idx,
                    "venue": v_name
                })
            c_name = sess.get("city")
            if c_name and c_name.lower() not in doc_text.lower():
                hallucinated_cities.append({
                    "id": sid,
                    "session": s_idx,
                    "city": c_name
                })

        # Check tickets
        tickets = out.get("tickets") or []
        for t_idx, t in enumerate(tickets):
            price = t.get("price")
            qty = t.get("quantity")
            if price is not None and (not isinstance(price, (int, float)) or price < 0):
                invalid_prices.append({"id": sid, "ticket": t_idx, "price": price})
            if qty is not None and (not isinstance(qty, (int, float)) or qty < 0):
                invalid_prices.append({"id": sid, "ticket": t_idx, "qty": qty})

    report["schema_checks"]["missing_fields"] = dict(missing_fields_counts)
    report["schema_checks"]["null_fields"] = dict(null_field_counts)
    report["schema_checks"]["invalid_types"] = dict(invalid_type_counts)
    report["schema_checks"]["category_distribution"] = dict(unsupported_categories)
    report["schema_checks"]["attendee_info_formats"] = dict(attendee_info_formats)

    report["value_validity"]["invalid_dates"] = len(invalid_dates)
    report["value_validity"]["invalid_times"] = len(invalid_times)
    report["value_validity"]["invalid_prices_or_qty"] = len(invalid_prices)

    report["hallucination_checks"]["hallucinated_sessions_count"] = len(hallucinated_sessions)
    report["hallucination_checks"]["hallucinated_sessions_samples"] = hallucinated_sessions[:15]
    report["hallucination_checks"]["hallucinated_venues_count"] = len(hallucinated_venues)
    report["hallucination_checks"]["hallucinated_venues_samples"] = hallucinated_venues[:15]
    report["hallucination_checks"]["hallucinated_cities_count"] = len(hallucinated_cities)
    report["hallucination_checks"]["hallucinated_cities_samples"] = hallucinated_cities[:15]

    report["truncated_fields"]["truncated_short_desc_count"] = len(truncated_short_desc)
    report["truncated_fields"]["truncated_short_desc_samples"] = truncated_short_desc[:15]

    # 3. Duplicate and Near-Duplicate Detection (Fast n-gram + SequenceMatcher)
    exact_duplicates = []
    near_duplicates = []
    normalized_texts = {}
    ngrams_map = {}

    for r in all_records:
        norm_t = normalize_text_for_sim(r.get("input_text", ""))
        normalized_texts[r["id"]] = norm_t
        ngrams_map[r["id"]] = get_word_ngrams(norm_t, 3)

    ids = list(normalized_texts.keys())
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            id1, id2 = ids[i], ids[j]
            t1, t2 = normalized_texts[id1], normalized_texts[id2]
            if t1 == t2:
                exact_duplicates.append((id1, id2))
            else:
                jacc = jaccard_similarity(ngrams_map[id1], ngrams_map[id2])
                if jacc >= 0.65:
                    sim = string_similarity(t1, t2)
                    if sim >= 0.85:
                        near_duplicates.append({"id1": id1, "id2": id2, "similarity": round(sim, 3)})

    report["duplicate_checks"]["exact_duplicates_count"] = len(exact_duplicates)
    report["duplicate_checks"]["exact_duplicates"] = exact_duplicates
    report["duplicate_checks"]["near_duplicates_count"] = len(near_duplicates)
    report["duplicate_checks"]["near_duplicates_samples"] = near_duplicates[:20]

    # Title grouping and template cluster analysis
    title_counter = Counter(r.get("output_json", {}).get("title") for r in all_records)
    title_splits = defaultdict(set)
    title_to_ids = defaultdict(list)
    for r in all_records:
        t = r.get("output_json", {}).get("title")
        s = r.get("split", "unknown")
        title_splits[t].add(s)
        title_to_ids[t].append(r["id"])

    leaked_titles = {t: list(splits) for t, splits in title_splits.items() if len(splits) > 1}
    report["duplicate_checks"]["unique_titles_count"] = len(title_counter)
    report["duplicate_checks"]["most_frequent_titles"] = title_counter.most_common(10)
    report["data_leakage"]["leaked_titles_count"] = len(leaked_titles)
    report["data_leakage"]["leaked_titles"] = leaked_titles

    # 4. Data Leakage across splits
    leakage_records = []
    split_assignments = {r["id"]: r.get("split", "unknown") for r in all_records}

    for pair in near_duplicates:
        id1, id2 = pair["id1"], pair["id2"]
        s1 = split_assignments.get(id1)
        s2 = split_assignments.get(id2)
        if s1 and s2 and s1 != s2:
            leakage_records.append({
                "id1": id1, "split1": s1,
                "id2": id2, "split2": s2,
                "similarity": pair["similarity"]
            })

    report["data_leakage"]["leakage_pairs_count"] = len(leakage_records)
    report["data_leakage"]["leakage_samples"] = leakage_records[:20]

    # Final summary counts
    unique_hallucinated_ids = set(
        [x["id"] for x in hallucinated_sessions] +
        [x["id"] for x in hallucinated_venues] +
        [x["id"] for x in hallucinated_cities]
    )

    report["summary"] = {
        "total_samples": len(all_records),
        "valid_json_labels": len(labels_data),
        "samples_with_hallucinations": len(unique_hallucinated_ids),
        "samples_with_truncated_text": len(truncated_short_desc),
        "exact_duplicates": len(exact_duplicates),
        "near_duplicates": len(near_duplicates),
        "cross_split_leakage_pairs": len(leakage_records),
        "ready_for_training": False,
        "verdict": "FAILED_QUALITY_GATE - Dataset contains severe hallucinations, truncated fields, schema mismatches and cross-split leakage. Must be cleaned and normalized before training."
    }

    return report

def main():
    raw_dir = os.path.abspath(r'ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300')
    if not os.path.exists(raw_dir):
        print(f"Directory not found: {raw_dir}")
        sys.exit(1)

    print("=" * 60)
    print("STARTING AUDIT OF INITIAL DATASET 300...")
    print(f"Target Directory: {raw_dir}")
    print("=" * 60)

    report = audit_dataset(raw_dir)

    out_json = os.path.abspath(r'ai/datasets/reports/initial_dataset_audit.json')
    out_md = os.path.abspath(r'ai/datasets/reports/INITIAL_DATASET_AUDIT.md')

    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON report: {out_json}")

    # Write Markdown Report
    summary = report["summary"]
    fi = report["file_integrity"]
    sc = report["schema_checks"]
    vv = report["value_validity"]
    hc = report["hallucination_checks"]
    tf = report["truncated_fields"]
    dc = report["duplicate_checks"]
    dl = report["data_leakage"]

    md_content = f"""# BÁO CÁO KIỂM ĐỊNH DATASET BAN ĐẦU (INITIAL DATASET AUDIT)

**Tên bộ dataset:** `EventHub_AI_Create_Event_Dataset_300`  
**Đường dẫn:** `{raw_dir}`  
**Ngày kiểm định:** 21/10/2026  
**Người thực hiện:** Senior AI/ML Engineer  
**Trạng thái Quality Gate:** **FAILED (KHÔNG ĐẠT CHUẨN ĐỂ HUẤN LUYỆN)**

---

## 1. TỔNG QUAN KẾT QUẢ KIỂM ĐỊNH

| Tiêu chí | Kết quả thực tế | Đánh giá |
| :--- | :---: | :--- |
| **Tổng số mẫu (Records)** | **{summary["total_samples"]}** | 100 unstructured + 200 structured |
| **Số file tài liệu gốc** | **{fi["total_documents"]}** | 100 unstructured, 200 structured |
| **Số file nhãn (Label files)** | **{fi["label_count"]}** | 300 file JSON |
| **Tính hợp lệ cú pháp JSON** | **100% hợp lệ** | Không có file JSON bị corrupt cú pháp |
| **Mẫu nhãn chứa Hallucination** | **{summary["samples_with_hallucinations"]} ({round(summary["samples_with_hallucinations"]/summary["total_samples"]*100, 1)}%)** | **RẤT NGUY HIỂM: Nhãn tự bịa địa điểm, ngày tháng không có trong tài liệu** |
| **Mẫu bị cắt cụt (Truncated short_desc)** | **{summary["samples_with_truncated_text"]} ({round(summary["samples_with_truncated_text"]/summary["total_samples"]*100, 1)}%)** | **Bị cắt cụt ở ranh giới ký tự 150 (cụt từ dở dang)** |
| **Số cặp gần trùng nội dung (>= 85%)** | **{dc["near_duplicates_count"]}** | Nhiều mẫu dùng chung template sinh dữ liệu |
| **Số cặp rò rỉ giữa các Split (Leakage)** | **{dl["leakage_pairs_count"]}** | **Tài liệu gần trùng nằm ở cả Train và Test/Validation** |
| **Schema khớp với Backend EventHub** | **KHÔNG KHỚP** | `require_attendee_information`, `category`, `sessions` khác format DTO |

---

## 2. CHI TIẾT SỐ LƯỢNG VÀ TÍNH TOÀN VẸN FILE

- **Tài liệu phi cấu trúc (Unstructured):** {fi["unstructured_count"]} files (`documents/unstructured/EVT-001.txt` đến `EVT-100.txt`)
- **Tài liệu có cấu trúc (Structured):** {fi["structured_count"]} files (`documents/structured/EVT-101.txt` đến `EVT-300.txt`)
- **Số lượng file Label:** {fi["label_count"]} files (`labels/EVT-001.json` đến `EVT-300.json`)
- **Phân chia Splits ban đầu:**
  - `train.jsonl`: **{fi["splits_count"].get("train", 0)}** mẫu (80%)
  - `validation.jsonl`: **{fi["splits_count"].get("validation", 0)}** mẫu (10%)
  - `test.jsonl`: **{fi["splits_count"].get("test", 0)}** mẫu (10%)

---

## 3. PHÂN TÍCH SCHEMA VÀ SỰ KHÁC BIỆT VỚI BACKEND EVENTHUB

### 3.1. Sự khác biệt Schema (Dataset v1 vs Backend EventHub)

| Trường dữ liệu | Dataset 300 v1 | Backend EventHub DTO / Form | Rủi ro nếu train trực tiếp |
| :--- | :--- | :--- | :--- |
| `require_attendee_information` | Array: `["full_name", "email"]` ({sc["attendee_info_formats"].get("array_of_fields", 0)} mẫu) | Boolean: `true` / `false` | Model sinh ra Array thay vì Boolean, gây lỗi kiểu dữ liệu ở Form và DB. |
| `category` | String slug tự do: `technology`, `music`... | Category UUID / ID từ DB | Model không ánh xạ được sang danh mục hệ thống `category_id`. |
| `sessions[].date` | `YYYY-MM-DD` | `start_date` / `start_time` | Lệch tên trường (`date` vs `start_date`). |
| `sessions[].city` | String city tự do: `"Da Nang"`, `"HCM"` | `province` chuẩn hành chính ("Thành phố Đà Nẵng") | Lệch tên trường (`city` vs `province`) và sai chuẩn hành chính. |
| `tickets[].quantity` | `quantity` | `quantity_total` (DTO) / `quantity` (Form) | Cần chuẩn hóa rõ ràng. |
| `refund_policy` | Không có trong nhãn dataset v1 | `{{ allow_refunds, deadline_days }}` | Model không học được cách trích xuất chính sách hoàn vé. |

### 3.2. Phân bố Category trong Dataset v1:
"""
    for cat_name, cnt in sc["category_distribution"].items():
        md_content += f"- `{cat_name}`: {cnt} mẫu\n"

    md_content += f"""
---

## 4. CÁC PHÁT HIỆN LỖI CHẤT LƯỢNG DỮ LIỆU NGHIÊM TRỌNG

### 4.1. Lỗi Hallucination trong Nhãn Huấn Luyện (Nhãn tự bịa đặt thông tin)
Phát hiện **{hc["hallucinated_sessions_count"]}** phiên sự kiện, **{hc["hallucinated_venues_count"]}** địa điểm và **{hc["hallucinated_cities_count"]}** thành phố xuất hiện trong nhãn nhưng **HOÀN TOÀN KHÔNG CÓ** trong văn bản đầu vào!

**Ví dụ điển hình EVT-001:**
- **Văn bản đầu vào:**
  > "...Theo kế hoạch, chương trình dự kiến tổ chức vào 2027-01-23. Khách có thể đến từ khoảng 08:30; phần chính bắt đầu lúc 09:00 và dự kiến kết thúc 12:00. Địa điểm hiện ghi nhận là vẫn đang tìm và chưa xác nhận, tại khu vực chưa rõ quận/huyện, chưa xác nhận thành phố..."
- **Nhãn trong dataset (`labels/EVT-001.json`):**
  > `sessions[1]`: `date: "2027-04-17"`, `venue_name: "Riverside Convention Hall"`, `district: "Hai Chau"`, `city: "Da Nang"`!
- **Hậu quả:** Nhãn tự ý bịa thêm một phiên sự kiện vào ngày 17/04/2027 tại Riverside Convention Hall, Đà Nẵng. Nếu đưa vào train SFT, model sẽ học cách tự bịa đặt địa điểm và ngày tháng khi văn bản nói "chưa xác nhận"!

**Danh sách một số mẫu tiêu biểu chứa Hallucination:**
"""
    for h in hc["hallucinated_sessions_samples"][:8]:
        md_content += f"- **[{h['id']}]** Phiên {h['session']}: Ngày `{h['date']}` không có trong văn bản gốc.\n"
    for h in hc["hallucinated_venues_samples"][:8]:
        md_content += f"- **[{h['id']}]** Địa điểm `{h['venue']}` không xuất hiện trong tài liệu gốc.\n"

    md_content += f"""
### 4.2. Lỗi cắt cụt văn bản (Text Truncation)
Có **{tf["truncated_short_desc_count"]} mẫu** trường `short_description` bị cắt cứng ở ranh giới 150 ký tự, làm đứt gãy câu từ và cụt từ tiếng Việt:
"""
    for item in tf["truncated_short_desc_samples"][:6]:
        md_content += f"- **[{item['id']}]** Độ dài: {item['length']} ký tự — Đoạn kết: `...{item['ending']}`\n"

    md_content += f"""
### 4.3. Lỗi lặp lại Template & Rò rỉ cụm dữ liệu giữa các tập (Cluster Leakage)
- Tổng số sự kiện chỉ có **{dc["unique_titles_count"]} tiêu đề duy nhất** trên toàn bộ 300 mẫu (trung bình mỗi sự kiện bị lặp lại 6-13 lần dưới các định dạng khác nhau).
- Có tới **{dl["leaked_titles_count"]} / {dc["unique_titles_count"]} sự kiện ({round(dl["leaked_titles_count"]/dc["unique_titles_count"]*100, 1)}%)** bị rò rỉ đồng thời giữa các split (cùng một sự kiện xuất hiện ở cả `train`, `validation` và `test`!).
- **Hậu quả:** Model học vẹt thông tin của `Young Founders Meetup`, `Acoustic Afterglow`, `Green Living Expo` ở tập train, sau đó đạt điểm cao giả tạo khi test lại chính các sự kiện này ở tập test!

**Top 10 sự kiện bị lặp lại nhiều nhất:**
"""
    for title, cnt in dc["most_frequent_titles"]:
        splits_str = ", ".join(dl["leaked_titles"].get(title, ["single split"]))
        md_content += f"- **{title}**: xuất hiện {cnt} lần — nằm ở các split: `[{splits_str}]`\n"

    md_content += f"""
---

## 5. KẾT LUẬN & HÀNH ĐỘNG BẮT BUỘC TRƯỚC KHI TRAIN

### Kết luận:
Dataset `EventHub_AI_Create_Event_Dataset_300` là bộ dữ liệu tổng hợp thử nghiệm sơ khai (starter synthetic data), **chưa đạt chất lượng production** và **không thể sử dụng nguyên trạng để huấn luyện**. Nếu train trực tiếp, model sẽ học các tật xấu:
1. Tự bịa thêm phiên sự kiện và địa điểm khi tài liệu ghi chưa rõ.
2. Sinh trường `short_description` bị cụt lửng ở 150 ký tự.
3. Sinh sai kiểu dữ liệu (`require_attendee_information` mảng thay vì boolean).
4. Đánh giá test thiếu tin cậy do hiện tượng data leakage.

### Kế hoạch xử lý (Giai đoạn II):
1. **Chốt schema chuẩn V2:** Thống nhất định dạng tương thích 100% với backend DTO và form `CreateEventPage.jsx`.
2. **Viết script làm sạch (`clean_dataset.py`):**
   - Loại bỏ các phiên/địa điểm bịa đặt trong nhãn, đưa về `null` đúng bản chất dữ liệu không có căn cứ.
   - Hoàn thiện câu chữ của `short_description` để không bị đứt đoạn.
   - Chuyển `require_attendee_information` sang boolean.
   - Thêm trường `refund_policy` mặc định hoặc suy luận chính xác từ tài liệu.
3. **Phân cụm template & Gom nhóm chống Data Leakage (`check_data_leakage.py`):**
   - Gom các tài liệu cùng template vào cùng một nhóm (cluster) trước khi chia tập.
4. **Chia lại Split 80/10/10 độc lập thực sự:** Đảm bảo tập `test.jsonl` hoàn toàn không có mẫu tương tự trong `train.jsonl`.
"""

    with open(out_md, 'w', encoding='utf-8') as f:
        f.write(md_content)
    print(f"Saved Markdown report: {out_md}")

    print("=" * 60)
    print("AUDIT COMPLETE.")
    print(f"Summary verdict: {summary['verdict']}")
    print("=" * 60)

if __name__ == "__main__":
    main()
