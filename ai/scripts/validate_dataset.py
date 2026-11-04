#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_dataset.py
--------------------
Kiểm tra và xác thực chất lượng dataset theo Schema EventHub V2.
Có thể chạy độc lập trên bất kỳ file JSONL hoặc thư mục dataset nào.

Usage:
    python validate_dataset.py --input ai/datasets/cleaned/eventhub_v2/dataset_all.jsonl
    python validate_dataset.py --input ai/datasets/raw/EventHub_AI_Create_Event_Dataset_300/dataset_all.jsonl --report-prefix raw_
"""

import os
import sys
import json
import re
import argparse
from collections import Counter, defaultdict

VALID_PROVINCES = {
    'Thành phố Hồ Chí Minh', 'Thành phố Hà Nội', 'Thành phố Đà Nẵng',
    'Thành phố Cần Thơ', 'Thành phố Hải Phòng', 'Thừa Thiên Huế'
}

VALID_CATEGORIES = {
    'am-nhac-bieu-dien', 'kinh-doanh-cong-nghe', 'hoi-thao-giao-duc',
    'le-hoi-van-hoa', 'the-thao',
    # Legacy category slugs
    'technology', 'music', 'business', 'education', 'culture', 'sports', 'entertainment', 'arts'
}

def validate_record(rec, idx=0):
    errors = []
    warnings = []
    
    sid = rec.get("id", f"SAMPLE-{idx}")
    input_text = rec.get("input_text", "")
    out = rec.get("output_json", {})
    
    if not input_text or len(input_text.strip()) < 10:
        errors.append(f"[{sid}] input_text rỗng hoặc quá ngắn (<10 ký tự)")
        
    if not isinstance(out, dict):
        errors.append(f"[{sid}] output_json không phải là một JSON object")
        return errors, warnings
        
    # Title
    title = out.get("title")
    if not title or not isinstance(title, str) or len(title.strip()) < 2:
        errors.append(f"[{sid}] title bị rỗng hoặc không hợp lệ")
    elif re.match(r'^(TIÊU ĐỀ|EVENT PROPOSAL|PROPOSAL|EMAIL TRAO ĐỔI)[:：\s-]', title, re.I):
        warnings.append(f"[{sid}] title chứa tiền tố hành chính: '{title}'")
        
    # Category
    cat = out.get("category")
    if cat is not None and not isinstance(cat, str):
        errors.append(f"[{sid}] category phải là string hoặc null, nhận: {type(cat)}")
    elif cat and cat not in VALID_CATEGORIES:
        warnings.append(f"[{sid}] category '{cat}' chưa nằm trong danh mục chuẩn EventHub")
        
    # Tags
    tags = out.get("tags")
    if not isinstance(tags, list):
        errors.append(f"[{sid}] tags phải là array, nhận: {type(tags)}")
    elif any(not isinstance(t, str) for t in tags):
        errors.append(f"[{sid}] tags chứa phần tử không phải là string")
        
    # Short description
    short_desc = out.get("short_description")
    if short_desc is not None:
        if not isinstance(short_desc, str):
            errors.append(f"[{sid}] short_description phải là string hoặc null")
        elif len(short_desc) > 500:
            warnings.append(f"[{sid}] short_description vượt quá 500 ký tự ({len(short_desc)})")
        elif re.search(r'\b[a-zA-ZÀ-ỹ]{1,2}$', short_desc.strip()) and len(short_desc) in [148, 149, 150]:
            errors.append(f"[{sid}] short_description bị cắt cụt từ dở dang: '...{short_desc[-20:]}'")
            
    # Sessions
    sessions = out.get("sessions")
    if not isinstance(sessions, list):
        errors.append(f"[{sid}] sessions phải là array, nhận: {type(sessions)}")
    else:
        if len(sessions) == 0:
            warnings.append(f"[{sid}] sessions rỗng")
        for s_idx, s in enumerate(sessions):
            if not isinstance(s, dict):
                errors.append(f"[{sid}] session #{s_idx} không phải là object")
                continue
            
            # Start date
            s_date = s.get("start_date") or s.get("date")
            if s_date is not None:
                if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(s_date)):
                    errors.append(f"[{sid}] session #{s_idx} ngày không đúng định dạng YYYY-MM-DD: '{s_date}'")
                    
            # Times
            s_ci = s.get("checkin_start_time") or s.get("check_in_time")
            s_st = s.get("start_time")
            s_et = s.get("end_time")
            
            for t_name, t_val in [("checkin", s_ci), ("start_time", s_st), ("end_time", s_et)]:
                if t_val is not None:
                    if not re.match(r'^\d{2}:\d{2}$', str(t_val)):
                        errors.append(f"[{sid}] session #{s_idx} {t_name} sai định dạng HH:mm: '{t_val}'")
                    else:
                        h, m = map(int, str(t_val).split(':'))
                        if h > 23 or m > 59:
                            errors.append(f"[{sid}] session #{s_idx} {t_name} giờ không hợp lệ: '{t_val}'")
                            
            if s_ci and s_st and str(s_ci) > str(s_st):
                errors.append(f"[{sid}] session #{s_idx} checkin ({s_ci}) > start_time ({s_st})")
            if s_st and s_et and str(s_st) >= str(s_et):
                errors.append(f"[{sid}] session #{s_idx} start_time ({s_st}) >= end_time ({s_et})")
                
    # Tickets
    tickets = out.get("ticket_types") or out.get("tickets")
    if not isinstance(tickets, list):
        errors.append(f"[{sid}] tickets / ticket_types phải là array, nhận: {type(tickets)}")
    else:
        for t_idx, t in enumerate(tickets):
            if not isinstance(t, dict):
                errors.append(f"[{sid}] ticket #{t_idx} không phải là object")
                continue
            t_name = t.get("name")
            if not t_name or not isinstance(t_name, str):
                errors.append(f"[{sid}] ticket #{t_idx} tên vé bị rỗng")
                
            t_price = t.get("price")
            if t_price is not None:
                if not isinstance(t_price, (int, float)) or t_price < 0:
                    errors.append(f"[{sid}] ticket #{t_idx} giá vé không hợp lệ: {t_price}")
                    
            t_qty = t.get("quantity_total") if t.get("quantity_total") is not None else t.get("quantity")
            if t_qty is not None:
                if not isinstance(t_qty, (int, float)) or t_qty < 1:
                    errors.append(f"[{sid}] ticket #{t_idx} số lượng vé không hợp lệ: {t_qty}")
                    
    # Require attendee info
    att = out.get("require_attendee_information")
    if att is not None and not isinstance(att, bool):
        errors.append(f"[{sid}] require_attendee_information phải là boolean (true/false), nhận: {type(att)}")
        
    return errors, warnings

def validate_dataset_file(jsonl_path, report_dir="ai/datasets/reports", report_prefix=""):
    os.makedirs(report_dir, exist_ok=True)
    total_records = 0
    all_errors = []
    all_warnings = []
    error_by_type = Counter()
    warning_by_type = Counter()
    
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            total_records += 1
            try:
                rec = json.loads(line)
            except Exception as e:
                all_errors.append(f"[LINE-{idx}] Lỗi cú pháp JSON: {e}")
                error_by_type["JSON_SYNTAX_ERROR"] += 1
                continue
                
            errs, warns = validate_record(rec, idx)
            for e in errs:
                all_errors.append(e)
                # classify error
                m = re.search(r'\]\s*([^:]+)', e)
                cat = m.group(1).strip() if m else "GENERAL_ERROR"
                error_by_type[cat] += 1
            for w in warns:
                all_warnings.append(w)
                m = re.search(r'\]\s*([^:]+)', w)
                cat = m.group(1).strip() if m else "GENERAL_WARNING"
                warning_by_type[cat] += 1
                
    is_valid = len(all_errors) == 0
    
    summary = {
        "file": os.path.abspath(jsonl_path),
        "total_records": total_records,
        "is_valid": is_valid,
        "total_errors": len(all_errors),
        "total_warnings": len(all_warnings),
        "error_categories": dict(error_by_type),
        "warning_categories": dict(warning_by_type),
        "sample_errors": all_errors[:25],
        "sample_warnings": all_warnings[:25]
    }
    
    # Save JSON report
    out_json = os.path.join(report_dir, f"{report_prefix}validation_report.json")
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        
    # Save Markdown report
    out_md = os.path.join(report_dir, f"{report_prefix}VALIDATION_REPORT.md")
    with open(out_md, 'w', encoding='utf-8') as f:
        f.write(f"# BÁO CÁO VALIDATION DATASET — EVENTHUB AI\n\n")
        f.write(f"- **Tệp kiểm tra:** `{jsonl_path}`\n")
        f.write(f"- **Tổng số mẫu:** {total_records}\n")
        f.write(f"- **Trạng thái:** **{'ĐẠT (PASSED)' if is_valid else 'KHÔNG ĐẠT (FAILED)'}**\n")
        f.write(f"- **Tổng số lỗi (Errors):** {len(all_errors)}\n")
        f.write(f"- **Tổng số cảnh báo (Warnings):** {len(all_warnings)}\n\n")
        
        f.write("## Thống kê lỗi theo phân loại\n\n")
        if error_by_type:
            f.write("| Phân loại lỗi | Số lượng |\n| :--- | :---: |\n")
            for k, v in error_by_type.most_common():
                f.write(f"| {k} | {v} |\n")
        else:
            f.write("Không phát hiện lỗi cú pháp hoặc schema nào.\n")
            
        f.write("\n## Thống kê cảnh báo theo phân loại\n\n")
        if warning_by_type:
            f.write("| Phân loại cảnh báo | Số lượng |\n| :--- | :---: |\n")
            for k, v in warning_by_type.most_common():
                f.write(f"| {k} | {v} |\n")
        else:
            f.write("Không có cảnh báo nào.\n")
            
        if all_errors:
            f.write("\n## Danh sách một số lỗi cụ thể\n\n")
            for e in all_errors[:20]:
                f.write(f"- {e}\n")
                
    print(f"Validation complete for: {jsonl_path}")
    print(f"  Total records: {total_records}")
    print(f"  Errors: {len(all_errors)}")
    print(f"  Warnings: {len(all_warnings)}")
    print(f"  Saved JSON: {out_json}")
    print(f"  Saved Markdown: {out_md}")
    
    return is_valid, summary

def main():
    parser = argparse.ArgumentParser(description="Validate EventHub Dataset against Schema V2")
    parser.add_argument("--input", "-i", required=True, help="Path to jsonl file")
    parser.add_argument("--report-dir", default="ai/datasets/reports", help="Output directory for reports")
    parser.add_argument("--report-prefix", default="", help="Prefix for report filename")
    args = parser.parse_args()
    
    is_valid, _ = validate_dataset_file(args.input, args.report_dir, args.report_prefix)
    sys.exit(0 if is_valid else 1)

if __name__ == "__main__":
    main()
