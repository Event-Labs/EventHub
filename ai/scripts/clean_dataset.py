#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
clean_dataset.py
----------------
Làm sạch và chuẩn hóa dataset EventHub theo Schema V2.
- Tự động sửa các lỗi kỹ thuật có quy tắc rõ ràng (truncated text, data types, schema alignment).
- Loại bỏ các thông tin hallucination (phiên ảo, địa điểm ảo không có trong tài liệu).
- Ghi lại log chi tiết mọi thay đổi và danh sách cần review.
- Hoàn toàn deterministic: Chạy lại nhiều lần luôn cho kết quả đồng nhất.

Usage:
    python clean_dataset.py \
        --input ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300/dataset_all.jsonl \
        --output ai/datasets/cleaned/eventhub_v2/dataset_all.jsonl \
        --log-dir ai/datasets/reports
"""

import os
import sys
import json
import re
import argparse
from collections import defaultdict, Counter

CATEGORY_MAPPING = {
    'technology': 'kinh-doanh-cong-nghe',
    'tech': 'kinh-doanh-cong-nghe',
    'business': 'kinh-doanh-cong-nghe',
    'startup': 'kinh-doanh-cong-nghe',
    'music': 'am-nhac-bieu-dien',
    'entertainment': 'am-nhac-bieu-dien',
    'education': 'hoi-thao-giao-duc',
    'workshop': 'hoi-thao-giao-duc',
    'culture': 'le-hoi-van-hoa',
    'arts': 'le-hoi-van-hoa',
    'food': 'le-hoi-van-hoa',
    'sports': 'the-thao',
    'sport': 'the-thao',
    # Already standard slugs
    'am-nhac-bieu-dien': 'am-nhac-bieu-dien',
    'kinh-doanh-cong-nghe': 'kinh-doanh-cong-nghe',
    'hoi-thao-giao-duc': 'hoi-thao-giao-duc',
    'le-hoi-van-hoa': 'le-hoi-van-hoa',
    'the-thao': 'the-thao'
}

PROVINCE_NORMALIZATION = {
    'da nang': 'Thành phố Đà Nẵng',
    'đà nẵng': 'Thành phố Đà Nẵng',
    'ho chi minh': 'Thành phố Hồ Chí Minh',
    'hồ chí minh': 'Thành phố Hồ Chí Minh',
    'tp.hcm': 'Thành phố Hồ Chí Minh',
    'tphcm': 'Thành phố Hồ Chí Minh',
    'hcm': 'Thành phố Hồ Chí Minh',
    'sài gòn': 'Thành phố Hồ Chí Minh',
    'ha noi': 'Thành phố Hà Nội',
    'hà nội': 'Thành phố Hà Nội',
    'can tho': 'Thành phố Cần Thơ',
    'cần thơ': 'Thành phố Cần Thơ',
    'hai phong': 'Thành phố Hải Phòng',
    'hải phòng': 'Thành phố Hải Phòng',
    'hue': 'Thừa Thiên Huế',
    'huế': 'Thừa Thiên Huế',
    'hue city': 'Thừa Thiên Huế',
    'thừa thiên huế': 'Thừa Thiên Huế'
}

def normalize_province(prov_str):
    if not prov_str or not isinstance(prov_str, str):
        return None
    p_clean = prov_str.strip().lower()
    for k, v in PROVINCE_NORMALIZATION.items():
        if k in p_clean:
            return v
    return prov_str.strip()

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

def fix_truncated_short_description(short_desc, full_desc, input_text):
    if not short_desc:
        return None
    # Check if truncated at ~150 chars or ending with incomplete word
    is_truncated = (
        len(short_desc) in [148, 149, 150] or
        re.search(r'\b[a-zA-ZÀ-ỹ]{1,2}$', short_desc.strip()) or
        not short_desc.strip().endswith(('.', '!', '?', '"', '”', ')'))
    )
    if not is_truncated:
        return short_desc.strip()

    # Try to find the full sentence in full_desc or input_text
    prefix = short_desc[:80].strip()
    source_texts = [full_desc or "", input_text or ""]
    for src in source_texts:
        if prefix in src:
            start_pos = src.find(prefix)
            # Find end of sentence
            sentence_end = re.search(r'[\.!?\n]', src[start_pos:])
            if sentence_end:
                full_sentence = src[start_pos:start_pos + sentence_end.start() + 1].strip()
                if len(full_sentence) <= 500 and len(full_sentence) > len(short_desc):
                    return full_sentence

    # Fallback: clean trailing partial word and append period if meaningful
    cleaned = re.sub(r'\s+[a-zA-ZÀ-ỹ]{1,3}$', '', short_desc.strip())
    if not cleaned.endswith('.'):
        cleaned += '.'
    return cleaned

def clean_record(raw_record):
    changes = []
    review_reasons = []

    sid = raw_record.get("id", "UNKNOWN")
    input_text = raw_record.get("input_text", "")
    out = json.loads(json.dumps(raw_record.get("output_json", {})))  # deepcopy

    # 1. Require attendee information -> boolean
    raw_att = out.get("require_attendee_information")
    if isinstance(raw_att, list):
        new_att = len(raw_att) > 0
        changes.append({
            "field": "require_attendee_information",
            "from": raw_att,
            "to": new_att,
            "reason": "Convert array of field names to boolean flag for backend DB compatibility"
        })
        out["require_attendee_information"] = new_att
    elif isinstance(raw_att, bool):
        pass
    else:
        # Check text
        new_att = bool(re.search(r'(?:thu\s*thập\s*thông\s*tin|cung\s*cấp\s*họ\s*tên|full\s*name|attendee\s*info)', input_text, re.I))
        changes.append({
            "field": "require_attendee_information",
            "from": raw_att,
            "to": new_att,
            "reason": "Inferred boolean attendee requirement from source text"
        })
        out["require_attendee_information"] = new_att

    # 2. Category normalization
    raw_cat = out.get("category")
    if raw_cat in CATEGORY_MAPPING:
        new_cat = CATEGORY_MAPPING[raw_cat]
        if new_cat != raw_cat:
            changes.append({
                "field": "category",
                "from": raw_cat,
                "to": new_cat,
                "reason": f"Map category '{raw_cat}' to official EventHub slug '{new_cat}'"
            })
            out["category"] = new_cat
    else:
        # Infer from title / input text
        cat_inferred = "hoi-thao-giao-duc"
        lower_txt = (out.get("title", "") + " " + input_text).lower()
        if any(w in lower_txt for w in ['nhạc', 'music', 'concert', 'acoustic', 'liveshow']):
            cat_inferred = 'am-nhac-bieu-dien'
        elif any(w in lower_txt for w in ['tech', 'công nghệ', 'ai', 'startup', 'software', 'kinh doanh']):
            cat_inferred = 'kinh-doanh-cong-nghe'
        elif any(w in lower_txt for w in ['ẩm thực', 'food', 'triển lãm', 'expo', 'văn hóa', 'festival']):
            cat_inferred = 'le-hoi-van-hoa'
        elif any(w in lower_txt for w in ['thể thao', 'marathon', 'chạy bộ', 'sport']):
            cat_inferred = 'the-thao'

        changes.append({
            "field": "category",
            "from": raw_cat,
            "to": cat_inferred,
            "reason": f"Infer standardized category slug '{cat_inferred}'"
        })
        out["category"] = cat_inferred

    # 3. Short description repair
    raw_short = out.get("short_description")
    fixed_short = fix_truncated_short_description(raw_short, out.get("description"), input_text)
    if fixed_short != raw_short:
        changes.append({
            "field": "short_description",
            "from": raw_short,
            "to": fixed_short,
            "reason": "Complete truncated sentence from full description/source text"
        })
        out["short_description"] = fixed_short

    # 4. Location & Venue extraction/cleaning
    raw_sessions = out.get("sessions") or []
    first_sess = raw_sessions[0] if raw_sessions else {}

    raw_venue = out.get("venue_name") or first_sess.get("venue_name")
    raw_district = out.get("district") or first_sess.get("district")
    raw_city = out.get("province") or out.get("city") or first_sess.get("city")

    # Check venue hallucination: does venue exist in text?
    clean_venue = None
    if raw_venue:
        if raw_venue.lower() in input_text.lower():
            clean_venue = raw_venue.strip()
        elif "chưa xác nhận" in input_text.lower() or "đang tìm" in input_text.lower() or "chưa chốt" in input_text.lower():
            changes.append({
                "field": "venue_name",
                "from": raw_venue,
                "to": None,
                "reason": f"Remove hallucinated venue '{raw_venue}' because document explicitly states venue is unconfirmed"
            })
            clean_venue = None
            review_reasons.append(f"Removed hallucinated venue '{raw_venue}'")
        else:
            clean_venue = raw_venue.strip()

    clean_province = normalize_province(raw_city)
    if clean_province and clean_province.lower() not in input_text.lower() and (raw_city and raw_city.lower() not in input_text.lower()):
        changes.append({
            "field": "province",
            "from": raw_city,
            "to": None,
            "reason": f"Remove hallucinated city/province '{raw_city}' not present in source text"
        })
        clean_province = None

    clean_district = raw_district.strip() if raw_district else None
    if clean_district and clean_district.lower() not in input_text.lower():
        clean_district = None

    out["venue_name"] = clean_venue
    out["address_line"] = out.get("address_line", None)
    out["ward"] = out.get("ward", None)
    out["district"] = clean_district
    out["province"] = clean_province

    # 5. Clean sessions and remove hallucinated extra sessions
    valid_sessions = []
    for s_idx, sess in enumerate(raw_sessions):
        s_date = sess.get("date") or sess.get("start_date")
        s_ci = sess.get("check_in_time") or sess.get("checkin_start_time")
        s_st = sess.get("start_time")
        s_et = sess.get("end_time")

        # Check date hallucination: if date is not in document and there are multiple sessions, check if it's invented
        is_hallucinated = False
        if s_date and not is_date_in_text(s_date, input_text):
            # If session 2 was added with a date completely absent from text (like EVT-001)
            if s_idx > 0:
                is_hallucinated = True
                changes.append({
                    "field": f"sessions[{s_idx}]",
                    "from": sess,
                    "to": None,
                    "reason": f"Drop hallucinated session #{s_idx+1} with date '{s_date}' not present in document"
                })
                review_reasons.append(f"Dropped hallucinated session #{s_idx+1} on {s_date}")

        if not is_hallucinated:
            sess_name = sess.get("session_name") or (f"Phiên {s_idx+1}" if len(raw_sessions) > 1 else "Phiên sự kiện")
            valid_sessions.append({
                "session_name": sess_name,
                "start_date": s_date if (s_date and is_date_in_text(s_date, input_text)) else (s_date if s_idx == 0 else None),
                "start_time": s_st if (s_st and re.match(r'^\d{2}:\d{2}$', str(s_st))) else None,
                "end_date": sess.get("end_date") or s_date,
                "end_time": s_et if (s_et and re.match(r'^\d{2}:\d{2}$', str(s_et))) else None,
                "checkin_start_time": s_ci if (s_ci and re.match(r'^\d{2}:\d{2}$', str(s_ci))) else None
            })

    if not valid_sessions:
        valid_sessions.append({
            "session_name": "Phiên sự kiện",
            "start_date": None,
            "start_time": None,
            "end_date": None,
            "end_time": None,
            "checkin_start_time": None
        })

    out["sessions"] = valid_sessions

    # 6. Ticket types normalization
    raw_tickets = out.get("ticket_types") or out.get("tickets") or []
    clean_tickets = []
    for t_idx, t in enumerate(raw_tickets):
        t_name = str(t.get("name") or f"Hạng vé {t_idx+1}").strip()
        t_price = t.get("price")
        if t_price is not None:
            try:
                t_price = int(t_price)
            except (ValueError, TypeError):
                t_price = None

        t_qty = t.get("quantity_total") if t.get("quantity_total") is not None else t.get("quantity")
        if t_qty is not None:
            try:
                t_qty = int(t_qty)
            except (ValueError, TypeError):
                t_qty = None

        clean_tickets.append({
            "name": t_name,
            "price": t_price,
            "quantity_total": t_qty,
            "description": str(t.get("description") or t.get("type") or "").strip()
        })

    if not clean_tickets:
        clean_tickets.append({
            "name": "Vé Tiêu Chuẩn",
            "price": 0,
            "quantity_total": None,
            "description": "Hạng vé chung tham gia sự kiện"
        })

    out["ticket_types"] = clean_tickets
    if "tickets" in out:
        del out["tickets"]

    # 7. Refund policy
    is_non_ref = bool(re.search(r'(?:không\s*hoàn\s*(?:vé|tiền)|không\s*được\s*hoàn\s*trả|non-refundable)', input_text, re.I))
    out["refund_policy"] = {
        "allow_refunds": not is_non_ref,
        "deadline_days": 7
    }

    # 8. Additional terms
    if "additional_terms" not in out:
        out["additional_terms"] = ""

    cleaned_record = {
        "id": sid,
        "type": raw_record.get("type", "unstructured" if int(sid.replace('EVT-', '0')) <= 100 else "structured"),
        "split": raw_record.get("split", "train"),
        "input_text": input_text,
        "output_json": out
    }

    return cleaned_record, changes, review_reasons

def clean_dataset_file(input_path, output_path, log_dir="ai/datasets/reports"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    os.makedirs(log_dir, exist_ok=True)

    all_cleaned = []
    change_log = []
    review_list = []
    stats = Counter()

    with open(input_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            cleaned, changes, reviews = clean_record(rec)
            all_cleaned.append(cleaned)

            if changes:
                stats["records_modified"] += 1
                for c in changes:
                    stats[f"modified_{c['field']}"] += 1
                    change_log.append({
                        "id": cleaned["id"],
                        **c
                    })

            if reviews:
                review_list.append({
                    "id": cleaned["id"],
                    "reasons": reviews
                })

    # Write cleaned dataset
    with open(output_path, 'w', encoding='utf-8') as f:
        for r in all_cleaned:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    # Write change log JSON
    change_log_path = os.path.join(log_dir, "dataset_cleaning_log.json")
    with open(change_log_path, 'w', encoding='utf-8') as f:
        json.dump({
            "total_records": len(all_cleaned),
            "stats": dict(stats),
            "review_needed_count": len(review_list),
            "review_needed": review_list,
            "changes": change_log
        }, f, ensure_ascii=False, indent=2)

    # Write Markdown summary
    summary_md_path = os.path.join(log_dir, "DATASET_CLEANING_REPORT.md")
    with open(summary_md_path, 'w', encoding='utf-8') as f:
        f.write("# BÁO CÁO LÀM SẠCH VÀ CHUẨN HÓA DATASET — EVENTHUB V2\n\n")
        f.write(f"- **Tệp gốc:** `{input_path}`\n")
        f.write(f"- **Tệp đã làm sạch:** `{output_path}`\n")
        f.write(f"- **Tổng số mẫu:** {len(all_cleaned)}\n")
        f.write(f"- **Số mẫu được sửa đổi:** **{stats['records_modified']} / {len(all_cleaned)} ({round(stats['records_modified']/len(all_cleaned)*100, 1)}%)**\n")
        f.write(f"- **Số mẫu đưa vào danh sách cần review:** **{len(review_list)}**\n\n")

        f.write("## 1. Thống kê các trường đã được chuẩn hóa\n\n")
        f.write("| Trường dữ liệu | Số lần chuẩn hóa | Nội dung thay đổi |\n| :--- | :---: | :--- |\n")
        f.write(f"| `require_attendee_information` | {stats['modified_require_attendee_information']} | Chuyển đổi array trường sang boolean |\n")
        f.write(f"| `short_description` | {stats['modified_short_description']} | Khôi phục câu hoàn chỉnh, xóa lỗi cụt từ 150 ký tự |\n")
        f.write(f"| `category` | {stats['modified_category']} | Chuẩn hóa sang slug danh mục hệ thống |\n")
        f.write(f"| `sessions` | {stats.get('modified_sessions[1]', 0) + stats.get('modified_sessions', 0)} | Xóa bỏ các phiên ảo do nhãn tự bịa đặt |\n")
        f.write(f"| `venue_name` / `province` | {stats['modified_venue_name'] + stats['modified_province']} | Xóa địa điểm hallucination, chuẩn hóa danh xưng tỉnh thành |\n\n")

        if review_list:
            f.write("## 2. Danh sách các mẫu cần review thủ công\n\n")
            for item in review_list[:25]:
                f.write(f"- **`{item['id']}`**: {'; '.join(item['reasons'])}\n")

    print(f"Cleaning complete!")
    print(f"  Cleaned dataset saved: {output_path}")
    print(f"  Changes logged: {change_log_path}")
    print(f"  Report saved: {summary_md_path}")
    return all_cleaned

def main():
    parser = argparse.ArgumentParser(description="Clean and standardize EventHub dataset to V2 schema")
    parser.add_argument("--input", "-i", default="ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300/dataset_all.jsonl")
    parser.add_argument("--output", "-o", default="ai/datasets/cleaned/eventhub_v2/dataset_all.jsonl")
    parser.add_argument("--log-dir", default="ai/datasets/reports")
    args = parser.parse_args()

    clean_dataset_file(args.input, args.output, args.log_dir)

if __name__ == "__main__":
    main()
