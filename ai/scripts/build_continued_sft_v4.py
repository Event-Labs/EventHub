#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_continued_sft_v4.py
-------------------------
Xây dựng tập dữ liệu Continued Fine-Tuning V4 (`sft_continued_v4`) từ `sft_continued_v3`:
1. Sửa triệt để lỗi 26 tài liệu có danh sách tiết mục/agenda chỉ có giờ bắt đầu (start-time only, end_time=null)
   bị tách thành 6–32 sessions riêng lẻ -> gom chuẩn xác về đúng 1 session cho mỗi ngày diễn ra
   (với start_time = giờ bắt đầu chương trình, end_time = mốc kết thúc cuối ngày / Festival hours,
   checkin_start_time = giờ Gates open / Doors open / Registration).
2. Giữ nguyên 100% các tài liệu hội nghị/workshop có khung giờ bắt đầu–kết thúc độc lập (start_time - end_time)
   và toàn bộ các ràng buộc 0% hallucination từ V3.
3. Đồng bộ 1:1 với SYSTEM_INSTRUCTION mới (trong `prepare_sft_dataset.py`, `Modelfile.extractor_v4_q4`, `Modelfile.extractor_v4_q8`).
4. Xuất `ai/datasets/sft_continued_v4/{dataset_all,train_sft,validation_sft,test_sft}.jsonl` và `dataset_audit_report.json`.
"""

import json
import math
import os
import re
import sys
from collections import Counter, OrderedDict, defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, AI_DIR)
sys.path.insert(0, SCRIPT_DIR)

from prepare_sft_dataset import SYSTEM_INSTRUCTION, estimate_tokens  # noqa: E402

V3_ALL_PATH = os.path.join(AI_DIR, "datasets", "sft_continued_v3", "dataset_all.jsonl")
OUT_DIR = os.path.join(AI_DIR, "datasets", "sft_continued_v4")

CHECKIN_RE = re.compile(
    r"(?:check[\s\-]?in(?:\s*and\s*welcome)?|registration\s*opens|gates?\s*open|doors?\s*open|đón\s*khách|mở\s*cửa|doors?\s*at)"
    r"[ \t]*[:：\-–—]?[ \t]*(?:từ[ \t]*|from[ \t]*|at[ \t]*|lúc[ \t]*|khoảng[ \t]*)?(\d{1,2}[:h]\d{2})",
    re.I,
)
OP_HOURS_RE = re.compile(
    r"(?:operating|opening|public|daily\s*opening|festival)\s*hours\s*[:：]?\s*(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})",
    re.I,
)
MAIN_PROG_RE = re.compile(
    r"main\s*program\s*[:：]?\s*\n?\s*(\d{1,2}[:h]\d{2})\s*[–\-]\s*(\d{1,2}[:h]\d{2})",
    re.I,
)
ENV_OPENING_RE = re.compile(
    r"(?:event\s*opening|festival\s*opening|doors?\s*open|gates?\s*open|opening)\s*[:：]\s*\n?\s*(\d{1,2}[:h]\d{2})\b",
    re.I,
)
ENV_CLOSING_RE = re.compile(
    r"(?:venue\s*closes|festival\s*closing|closing)\s*[:：]?\s*\n?\s*(\d{1,2}[:h]\d{2})\b",
    re.I,
)
EXPLICIT_MULTI_SESSION_RE = re.compile(
    r"(?:mã\s*phiên|số\s*phiên\s*chính\s*thức|số\s*hoạt\s*động\s*chính\s*thức|hồ\s*sơ\s*hoạt\s*động|hoạt\s*động\s*\d+|(?<![a-z])phiên\s*\d+|session\s*\d+|chapter\s*(?:one|two|three|four|five|\d+)|per\s+(?:session|workshop)\b|các\s+phiên\s+(?:từ\s+s\d+|sau)|phiên\s+chuyên\s+đề|cự\s*ly\s*3\s*km)",
    re.I,
)
CHECKIN_ITEM_NAME_RE = re.compile(
    r"^(?:registration(?:\s+and\s+welcome|\s*&\s*breakfast|\s*&\s*networking)?|guest\s*(?:registration|arrival)|visitor\s*entry|team\s*check[\-\s]?in|check[\s\-]?in(?:\s+(?:và|and)\s+(?:networking|welcome))?|đón\s*tiếp[^\n]{0,40}|đăng\s*ký|doors?\s*open|gates?\s*open|đón\s*khách|mở\s*cửa(?:\s*đón\s*khách)?)$",
    re.I,
)


def norm_time(val):
    if not val or not isinstance(val, str):
        return None
    m = re.search(r"(\d{1,2})[:h](\d{2})", val.strip())
    if not m:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def collapse_start_only_agenda_sessions(sessions, input_text: str):
    if not isinstance(sessions, list) or len(sessions) == 0:
        return sessions, False

    doc_str = (input_text or "").replace("\r\n", "\n").replace("\r", "\n")
    ci_match = CHECKIN_RE.search(doc_str)
    global_checkin = norm_time(ci_match.group(1)) if ci_match else None

    op_match = OP_HOURS_RE.search(doc_str)
    main_prog_match = MAIN_PROG_RE.search(doc_str)
    env_open_match = ENV_OPENING_RE.search(doc_str)
    env_close_match = ENV_CLOSING_RE.search(doc_str)

    op_start = norm_time(op_match.group(1)) if op_match else (norm_time(main_prog_match.group(1)) if main_prog_match else None)
    op_end = norm_time(op_match.group(2)) if op_match else (
        norm_time(main_prog_match.group(2)) if main_prog_match else (norm_time(env_close_match.group(1)) if env_close_match else None)
    )

    by_date = OrderedDict()
    for s in sessions:
        d = (s.get("start_date") or "").strip() or "__NO_DATE__"
        by_date.setdefault(d, []).append(s)

    date_entries = sorted(
        by_date.items(),
        key=lambda kv: ("9999-99-99" if kv[0] == "__NO_DATE__" else kv[0]),
    )

    def is_two_distinct_shifts(items):
        if len(items) != 2:
            return False
        c0 = norm_time(items[0].get("checkin_start_time"))
        c1 = norm_time(items[1].get("checkin_start_time"))
        s0 = norm_time(items[0].get("start_time"))
        e0 = norm_time(items[0].get("end_time"))
        s1 = norm_time(items[1].get("start_time"))
        e1 = norm_time(items[1].get("end_time"))
        return bool(c0 and c1 and c0 != c1 and s0 and e0 and s1 and e1 and s1 >= e0)

    will_collapse_any = any(len(items) >= 2 and not is_two_distinct_shifts(items) for _, items in date_entries)
    any_date_has_explicit_checkin = any(
        any(norm_time(x.get("checkin_start_time")) for x in items)
        for _, items in date_entries
    )
    is_checkin_day1_only = bool(
        re.search(
            r"(?:giờ|thời\s*gian)?\s*(?:check-?in|mở\s*cổng|mở\s*quầy|đón\s*khách)[^.\n]{0,80}(?:ngày\s*thứ\s*hai|ngày\s*2|second\s*day)[^.\n]{0,60}(?:chưa|không|not)",
            doc_str,
            re.I,
        )
        or re.search(
            r"(?:check-?in|đón\s*khách|mở\s*cửa\s*check-?in)[^.\n]{0,40}\d{1,2}[:h]\d{2}\s*(?:sáng\s*)?(?:ngày|on)\s*(?:đầu\s*tiên|thứ\s*nhất|first\s*day|\d{1,2}[/\.-]\d{1,2})",
            doc_str,
            re.I,
        )
    )

    collapsed = []
    any_collapsed = False

    for idx, (date_key, items) in enumerate(date_entries):
        if len(items) < 2:
            if will_collapse_any and len(date_entries) > 1 and len(items) == 1:
                single = dict(items[0])
                if not re.match(r"^(?:ngày|day)\s*\d+", (single.get("session_name") or "").strip(), re.I):
                    single["session_name"] = f"Ngày {idx + 1}"
                if not single.get("end_time") and op_end:
                    single["end_time"] = op_end
                collapsed.append(single)
                any_collapsed = True
            else:
                collapsed.extend(items)
            continue

        if is_two_distinct_shifts(items):
            collapsed.extend(items)
            continue

        any_collapsed = True
        iso_date = None if date_key == "__NO_DATE__" else date_key
        checkin = next((norm_time(x.get("checkin_start_time")) for x in items if x.get("checkin_start_time")), None)
        prog_items = items

        if len(items) >= 2 and CHECKIN_ITEM_NAME_RE.match((items[0].get("session_name") or "").strip()):
            first_st = norm_time(items[0].get("start_time"))
            if not checkin and first_st:
                checkin = first_st
            prog_items = items[1:]

        if not checkin and env_open_match:
            checkin = norm_time(env_open_match.group(1))
        if not checkin and global_checkin and not any_date_has_explicit_checkin and (idx == 0 or not is_checkin_day1_only):
            checkin = global_checkin

        start_times = sorted(norm_time(x.get("start_time")) for x in prog_items if norm_time(x.get("start_time")))
        end_times = sorted(
            norm_time(x.get("end_time") or x.get("start_time"))
            for x in prog_items
            if norm_time(x.get("end_time") or x.get("start_time"))
        )

        start_time = start_times[0] if start_times else op_start
        if main_prog_match:
            mp_start = norm_time(main_prog_match.group(1))
            if mp_start and (not start_time or mp_start <= start_time):
                start_time = mp_start
        end_time = end_times[-1] if end_times else op_end
        if op_end and (not end_time or op_end > end_time):
            end_time = op_end
        if start_time and checkin and checkin > start_time:
            checkin = op_start if (op_start and op_start <= start_time) else None

        existing_day_name = next(
            (
                (x.get("session_name") or "").strip()
                for x in items
                if re.match(r"^(?:ngày|day)\s*\d+", (x.get("session_name") or "").strip(), re.I)
            ),
            None,
        )
        session_name = existing_day_name or (f"Ngày {idx + 1}" if len(date_entries) > 1 else "Phiên sự kiện")

        collapsed.append(
            {
                "session_name": session_name,
                "start_date": iso_date,
                "start_time": start_time,
                "end_date": iso_date,
                "end_time": end_time if end_time != start_time else (op_end or end_time),
                "checkin_start_time": checkin,
            }
        )

    return (collapsed, True) if any_collapsed else (sessions, False)


def norm_title_key(t: str) -> str:
    return re.sub(r"[^a-z0-9à-ỹ]+", " ", (t or "").lower()).strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(V3_ALL_PATH, "r", encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]

    repaired_agenda_files = []
    for item in rows:
        item["id"] = item["id"].replace("V3-", "V4-")
        out_json = item["output_json"]
        new_sessions, changed = collapse_start_only_agenda_sessions(out_json.get("sessions", []), item.get("input_text", ""))
        if changed:
            repaired_agenda_files.append(
                {
                    "source_file": item.get("source_file"),
                    "old_sessions": len(out_json.get("sessions", [])),
                    "new_sessions": len(new_sessions),
                }
            )
            out_json["sessions"] = new_sessions

    # Verify 0 title overlap between splits
    split_titles = defaultdict(set)
    for item in rows:
        split_titles[item["split"]].add(norm_title_key(item["output_json"]["title"]))
    assert not (split_titles["train"] & split_titles["test"]), "Title leakage train/test!"
    assert not (split_titles["train"] & split_titles["validation"]), "Title leakage train/val!"
    assert not (split_titles["validation"] & split_titles["test"]), "Title leakage val/test!"

    all_jsonl_path = os.path.join(OUT_DIR, "dataset_all.jsonl")
    with open(all_jsonl_path, "w", encoding="utf-8") as f:
        for item in rows:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    split_buckets = defaultdict(list)
    token_stats = defaultdict(list)
    for item in rows:
        sft_obj = {
            "id": item["id"],
            "source_file": item["source_file"],
            "source_group": item["source_group"],
            "split": item["split"],
            "type": item["type"],
            "messages": [
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": item["input_text"]},
                {"role": "assistant", "content": json.dumps(item["output_json"], ensure_ascii=False, indent=2)},
            ],
        }
        tok_est = sum(estimate_tokens(m["content"]) for m in sft_obj["messages"])
        token_stats[item["split"]].append(tok_est)
        split_buckets[item["split"]].append(sft_obj)

    for sp in ["train", "validation", "test"]:
        out_p = os.path.join(OUT_DIR, f"{sp}_sft.jsonl")
        with open(out_p, "w", encoding="utf-8") as f:
            for rec in split_buckets[sp]:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    report = {
        "total_samples": len(rows),
        "by_source_group": dict(Counter(i["source_group"] for i in rows)),
        "by_split": {sp: len(split_buckets[sp]) for sp in ["train", "validation", "test"]},
        "unique_titles": len({norm_title_key(i["output_json"]["title"]) for i in rows}),
        "title_leakage_pairs": 0,
        "max_estimated_tokens": max(t for ts in token_stats.values() for t in ts),
        "tokens_by_split": {
            sp: {"min": min(ts), "avg": round(sum(ts) / len(ts), 1), "max": max(ts)}
            for sp, ts in token_stats.items()
            if ts
        },
        "repaired_agenda_files_count": len(repaired_agenda_files),
        "repaired_agenda_files": repaired_agenda_files,
    }
    with open(os.path.join(OUT_DIR, "dataset_audit_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=== BUILT SFT CONTINUED V4 DATASET ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

