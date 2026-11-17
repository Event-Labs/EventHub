#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_continued_sft_v3.py
-------------------------
Xây dựng tập dữ liệu Continued Fine-Tuning (SFT v3) cho mô hình AI Create Event (`eventhub_qwen_v2 -> v3`):
1. Hợp nhất toàn bộ 91 tài liệu mới trong `ai/Test_doc`, 10 tài liệu hồi quy cũ (`EventHub_AI_Create_Event_Test_Documents`)
   và 8 mẫu edge-case replay (`DIVERSE_SAMPLES` từ `generate_diverse_samples_v2.py`) để chống Catastrophic Forgetting.
2. Áp dụng bảng hiệu chỉnh nhãn chuẩn (GOLD_REPAIRS) cho các ca bị parser rule-based trước đó sót vé miễn phí,
   sai tên phiên văn xuôi, hoặc tự chèn vé mặc định trên tài liệu bị cắt cụt -> đảm bảo 0% hallucination.
3. Chuẩn hóa 100% theo V2 Schema (`validate_dataset.py`) và ChatML SFT format (`prepare_sft_dataset.py`),
   chia split phân tầng theo cụm tiêu đề (0% title leakage giữa train/validation/test).
4. Xuất `ai/datasets/sft_continued_v3/{train_sft,validation_sft,test_sft,dataset_all}.jsonl` và báo cáo kiểm định.
"""

import json
import os
import re
import sys
from collections import Counter, defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(AI_DIR)
sys.path.insert(0, AI_DIR)
sys.path.insert(0, SCRIPT_DIR)

from prepare_sft_dataset import SYSTEM_INSTRUCTION, estimate_tokens  # noqa: E402
from generate_diverse_samples_v2 import DIVERSE_SAMPLES  # noqa: E402

DEFAULT_GOLD_EVAL_PATH = (
    r"C:\Users\ACER\.gemini\antigravity\brain\48ff4cfc-6e8c-4488-ab1f-abc4167ef43f\scratch\eval_all_docs_v3_out.json"
)
DEFAULT_DUMP_PATH = (
    r"C:\Users\ACER\.gemini\antigravity\brain\48ff4cfc-6e8c-4488-ab1f-abc4167ef43f\scratch\all_test_docs_dump.json"
)
OLD_TEST_DIR = os.path.join(os.path.dirname(PROJECT_DIR), "EventHub_AI_Create_Event_Test_Documents")
OUT_DIR = os.path.join(AI_DIR, "datasets", "sft_continued_v3")

# Map extended backend category IDs/slugs về 5 canonical slugs của V2 SFT schema (`validate_dataset.py`)
CANONICAL_V2_CATEGORY = {
    "cat-music": "am-nhac-bieu-dien",
    "am-nhac-bieu-dien": "am-nhac-bieu-dien",
    "cat-tech": "kinh-doanh-cong-nghe",
    "kinh-doanh-cong-nghe": "kinh-doanh-cong-nghe",
    "cat-edu": "hoi-thao-giao-duc",
    "hoi-thao-giao-duc": "hoi-thao-giao-duc",
    "cat-sport": "the-thao",
    "the-thao": "the-thao",
    "cat-culture": "le-hoi-van-hoa",
    "le-hoi-van-hoa": "le-hoi-van-hoa",
    "cat-art": "le-hoi-van-hoa",
    "nghe-thuat-trien-lam": "le-hoi-van-hoa",
    "cat-food": "le-hoi-van-hoa",
    "am-thuc-do-uong": "le-hoi-van-hoa",
    "cat-comm": "le-hoi-van-hoa",
    "cong-dong-thien-nguyen": "le-hoi-van-hoa",
}

EVAL_META_RE = re.compile(
    r"\n[ \t]*(?:#{1,6}\s*)?(?:\*{1,2})?(?:Kết\s*quả\s*kỳ\s*vọng|Kết\s*quả\s*cần\s*trích\s*xuất|BẢNG\s*ĐÁP\s*ÁN\s*KIỂM\s*THỬ|BẢNG\s*TỔNG\s*HỢP\s*KIỂM\s*THỬ|EXPECTED\s*OUTPUT)(?:\*{1,2})?\s*[:：]?[\s\S]*$",
    re.I,
)


def strip_eval_metadata(text: str) -> str:
    return EVAL_META_RE.sub("", text or "").strip()


def empty_to_none(val):
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        return s if s else None
    return val


def normalize_time_or_none(t):
    s = empty_to_none(t)
    if not s:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        return f"{int(m.group(1)):02d}:{int(m.group(2)):02d}"
    return s


# Kiểm định & hiệu chỉnh nhãn chuẩn xác dựa trực tiếp trên văn bản nguồn đã kiểm tra
GOLD_REPAIRS = {
    "Final confirmation – Asia FinTech Investment Week 2034.txt": {
        "ticket_types": [],
        "refund_policy": {"allow_refunds": False, "deadline_days": None},
        "additional_terms": None,
    },
    "03_semistructured_workshop.txt": {
        "ticket_types": [
            {"name": "Learner ticket", "price": 80000, "quantity_total": 45, "description": "Standard learner workshop seat including worksheets, refreshments, and certificate"},
            {"name": "Team ticket", "price": 250000, "quantity_total": 5, "description": "Up to 4 people per team"},
            {"name": "Volunteer access", "price": 0, "quantity_total": None, "description": "Free volunteer admission; quantity not decided"},
        ]
    },
    "ĐẶC TẢ GIẢI THỂ THAO.txt": {
        "category": "the-thao",
        "ticket_types": [
            {"name": "Community Runner — 3 KM", "price": 180000, "quantity_total": 500, "description": "Đối tượng: người tham gia giải chạy cộng đồng."},
            {"name": "Night Runner — 5 KM", "price": 280000, "quantity_total": 700, "description": "Đối tượng: người đăng ký cự ly 5 km."},
            {"name": "Challenge Runner — 10 KM", "price": 400000, "quantity_total": 300, "description": "Đối tượng: người đăng ký cự ly 10 km."},
        ],
        "refund_policy": {"allow_refunds": False, "deadline_days": None},
    },
    "ASIA AI STARTUP DEMO 2032.txt": {
        "ticket_types": [
            {"name": "Investor", "price": 1000000, "quantity_total": None, "description": None},
            {"name": "Founder", "price": 500000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 700000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 100000, "quantity_total": None, "description": None},
        ]
    },
    "VIETNAM LOGISTICS TECHNOLOGY WEEK 2.txt": {
        "ticket_types": [
            {"name": "Visitor", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 400000, "quantity_total": None, "description": None},
            {"name": "Executive", "price": 1000000, "quantity_total": None, "description": None},
            {"name": "Three-Day Pass", "price": 600000, "quantity_total": None, "description": None},
        ]
    },
    "VIETNAM INDIE GAME FESTIVAL 2034.txt": {
        "ticket_types": [
            {"name": "Industry Pass", "price": 600000, "quantity_total": None, "description": None},
            {"name": "Public Day Pass", "price": 150000, "quantity_total": None, "description": None},
            {"name": "Full Festival Pass", "price": 450000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 100000, "quantity_total": None, "description": None},
        ]
    },
    "SMART AGRICULTURE EXPO 2031.txt": {
        "category": "kinh-doanh-cong-nghe",
        "ticket_types": [
            {"name": "Visitor", "price": 80000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 250000, "quantity_total": None, "description": None},
            {"name": "Full Pass", "price": 500000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 40000, "quantity_total": None, "description": None},
        ]
    },
    "PROPOSAL.txt": {
        "ticket_types": [
            {"name": "Student Ticket", "price": 0, "quantity_total": None, "description": "Free registration for students"},
            {"name": "Business Partner Pass", "price": 500000, "quantity_total": None, "description": None},
            {"name": "VIP Recruitment Package", "price": 2500000, "quantity_total": None, "description": None},
        ]
    },
    "VIETNAM CONTEMPORARY ART TRIENNALE.txt": {
        "ticket_types": [
            {"name": "Admission", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 50000, "quantity_total": None, "description": None},
            {"name": "Children under 6", "price": 0, "quantity_total": None, "description": "Free admission"},
            {"name": "Workshop tickets", "price": 50000, "quantity_total": None, "description": "50.000 VNĐ per workshop"},
        ]
    },
    "OFFICIAL ANNOUNCEMENT.txt": {
        "ticket_types": [
            {"name": "General", "price": 150000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 400000, "quantity_total": None, "description": None},
            {"name": "Government Delegate", "price": 0, "quantity_total": None, "description": "Free for government delegates"},
            {"name": "Student", "price": 50000, "quantity_total": None, "description": None},
        ]
    },
    "RURAL INNOVATION CONFERENCE 2030.txt": {
        "ticket_types": [
            {"name": "General", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 300000, "quantity_total": None, "description": None},
            {"name": "Startup", "price": 0, "quantity_total": None, "description": "Free; registered startup teams may receive a free booth"},
            {"name": "Student", "price": 50000, "quantity_total": None, "description": None},
        ]
    },
    "HANOI BOOK & PUBLISHING FAIR 2030.txt": {
        "ticket_types": [
            {"name": "Visitor", "price": 50000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 30000, "quantity_total": None, "description": None},
            {"name": "Three-Day Pass", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Children under 6", "price": 0, "quantity_total": None, "description": "Free"},
        ]
    },
    "FUTURE EDUCATION EXPO 2029.txt": {
        "ticket_types": [
            {"name": "Student", "price": 0, "quantity_total": None, "description": "Free"},
            {"name": "General", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Professional", "price": 300000, "quantity_total": None, "description": None},
            {"name": "Premium", "price": 700000, "quantity_total": None, "description": None},
        ]
    },
    "HUE TRADITIONAL CRAFT FESTIVAL 2031.txt": {
        "ticket_types": [
            {"name": "Festival Pass", "price": 200000, "quantity_total": None, "description": None},
            {"name": "Workshop Ticket", "price": 50000, "quantity_total": None, "description": None},
            {"name": "Student", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Children under 6", "price": 0, "quantity_total": None, "description": "Free"},
        ]
    },
    "INTERNAL MEMORANDUM.txt": {
        "ticket_types": [
            {"name": "Founder Pass", "price": 0, "quantity_total": None, "description": "Free"},
            {"name": "Investor Pass", "price": 300000, "quantity_total": None, "description": None},
            {"name": "General Pass", "price": 100000, "quantity_total": None, "description": None},
        ]
    },
    "PRESS RELEASE.txt": {
        "category": "kinh-doanh-cong-nghe",
        "ticket_types": [
            {"name": "One-Day Pass", "price": 200000, "quantity_total": None, "description": None},
            {"name": "Three-Day Pass", "price": 450000, "quantity_total": None, "description": None},
            {"name": "Developer Pass", "price": 700000, "quantity_total": None, "description": None},
            {"name": "Student Pass", "price": 100000, "quantity_total": None, "description": None},
            {"name": "Children under 6", "price": 0, "quantity_total": None, "description": "Free admission"},
        ],
    },
    "REQUEST FOR PROPOSAL.txt": {
        "ticket_types": [
            {"name": "Visitor Pass", "price": 150000, "quantity_total": None, "description": None},
            {"name": "Professional Pass", "price": 500000, "quantity_total": None, "description": None},
            {"name": "Conference Pass", "price": 900000, "quantity_total": None, "description": None},
            {"name": "VIP Pass", "price": 1800000, "quantity_total": None, "description": None},
            {"name": "Exhibitor Pass", "price": 0, "quantity_total": None, "description": "Free for registered exhibitors"},
        ]
    },
    "VIETNAM EDUCATION TECHNOLOGY SUMMIT.txt": {
        "sessions": [
            {"session_name": "Registration", "start_date": "2032-05-16", "start_time": "08:00", "end_time": "09:00", "checkin_start_time": "08:00"},
            {"session_name": "Opening Ceremony", "start_date": "2032-05-16", "start_time": "09:00", "end_time": "09:30", "checkin_start_time": None},
            {"session_name": "Keynote: Future of AI in Education", "start_date": "2032-05-16", "start_time": "09:30", "end_time": "10:30", "checkin_start_time": None},
            {"session_name": "Panel: Digital Classrooms", "start_date": "2032-05-16", "start_time": "10:45", "end_time": "12:00", "checkin_start_time": None},
            {"session_name": "Education Technology Workshop", "start_date": "2032-05-16", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Teacher Innovation Forum", "start_date": "2032-05-16", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Networking", "start_date": "2032-05-16", "start_time": "16:45", "end_time": "17:30", "checkin_start_time": None},
            {"session_name": "Education Data Forum", "start_date": "2032-05-17", "start_time": "08:30", "end_time": "10:00", "checkin_start_time": None},
            {"session_name": "Adaptive Learning Session", "start_date": "2032-05-17", "start_time": "10:15", "end_time": "11:30", "checkin_start_time": None},
            {"session_name": "AI Curriculum Workshop", "start_date": "2032-05-17", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Education Startup Showcase", "start_date": "2032-05-17", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Closing Panel", "start_date": "2032-05-17", "start_time": "16:45", "end_time": "17:30", "checkin_start_time": None},
            {"session_name": "Closing Ceremony", "start_date": "2032-05-17", "start_time": "17:30", "end_time": "18:00", "checkin_start_time": None},
        ],
        "ticket_types": [
            {"name": "General Attendee", "price": 300000, "quantity_total": None, "description": None},
            {"name": "Professional Attendee", "price": 700000, "quantity_total": None, "description": None},
            {"name": "Education Executive", "price": 1200000, "quantity_total": None, "description": None},
            {"name": "Student Pass", "price": 150000, "quantity_total": None, "description": None},
        ],
    },
    "HANOI CREATIVE TECHNOLOGY WEEK 2033.txt": {
        "sessions": [
            {"session_name": "Opening Ceremony", "start_date": "2033-10-03", "start_time": "09:30", "end_time": "10:00", "checkin_start_time": "09:00"},
            {"session_name": "Technology Exhibition", "start_date": "2033-10-03", "start_time": "10:00", "end_time": "20:00", "checkin_start_time": None},
            {"session_name": "Creative Coding Workshop", "start_date": "2033-10-03", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Digital Art Panel", "start_date": "2033-10-03", "start_time": "15:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Public Installation Tour", "start_date": "2033-10-03", "start_time": "18:00", "end_time": "19:00", "checkin_start_time": None},
            {"session_name": "UX Design Workshop", "start_date": "2033-10-04", "start_time": "09:30", "end_time": "11:00", "checkin_start_time": None},
            {"session_name": "Creative Entrepreneurship Session", "start_date": "2033-10-04", "start_time": "11:15", "end_time": "12:15", "checkin_start_time": None},
            {"session_name": "AI Art Workshop", "start_date": "2033-10-04", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Motion Design Showcase", "start_date": "2033-10-04", "start_time": "15:30", "end_time": "17:00", "checkin_start_time": None},
            {"session_name": "Creative Technology in Schools Forum", "start_date": "2033-10-05", "start_time": "09:00", "end_time": "10:30", "checkin_start_time": None},
            {"session_name": "Student Project Showcase", "start_date": "2033-10-05", "start_time": "11:00", "end_time": "12:30", "checkin_start_time": None},
            {"session_name": "Game Design Workshop", "start_date": "2033-10-05", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Startup Demo Session", "start_date": "2033-10-06", "start_time": "10:00", "end_time": "11:30", "checkin_start_time": None},
            {"session_name": "Creative Industry Investment Panel", "start_date": "2033-10-06", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Experimental Media Showcase", "start_date": "2033-10-06", "start_time": "16:00", "end_time": "17:30", "checkin_start_time": None},
            {"session_name": "Future of Creativity Keynote", "start_date": "2033-10-07", "start_time": "09:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Community Project Presentation", "start_date": "2033-10-07", "start_time": "11:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Awards Ceremony", "start_date": "2033-10-07", "start_time": "15:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Closing Ceremony", "start_date": "2033-10-07", "start_time": "17:00", "end_time": "20:00", "checkin_start_time": None},
        ]
    },
    "VIETNAM AI SAFETY & GOVERNANCE FORU.txt": {
        "sessions": [
            {"session_name": "Registration", "start_date": "2035-04-17", "start_time": "08:00", "end_time": "09:00", "checkin_start_time": "08:00"},
            {"session_name": "Opening Ceremony", "start_date": "2035-04-17", "start_time": "09:00", "end_time": "09:30", "checkin_start_time": None},
            {"session_name": "Keynote: AI Safety in 2035", "start_date": "2035-04-17", "start_time": "09:30", "end_time": "10:30", "checkin_start_time": None},
            {"session_name": "Technical Evaluation Panel", "start_date": "2035-04-17", "start_time": "10:45", "end_time": "12:00", "checkin_start_time": None},
            {"session_name": "AI Red Teaming Workshop", "start_date": "2035-04-17", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Policy Discussion", "start_date": "2035-04-17", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Research Networking Session", "start_date": "2035-04-17", "start_time": "16:45", "end_time": None, "checkin_start_time": None},
            {"session_name": "AI Governance Keynote", "start_date": "2035-04-18", "start_time": "09:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "AI Regulation in Southeast Asia Panel", "start_date": "2035-04-18", "start_time": "10:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Model Evaluation Workshop", "start_date": "2035-04-18", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Industry Governance Panel", "start_date": "2035-04-18", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Final Recommendations Session", "start_date": "2035-04-18", "start_time": "16:45", "end_time": "17:30", "checkin_start_time": None},
            {"session_name": "Closing Ceremony", "start_date": "2035-04-18", "start_time": "17:30", "end_time": "18:00", "checkin_start_time": None},
        ]
    },
    "SOUTHEAST ASIA CLIMATE RESEARCH FOR.txt": {
        "sessions": [
            {"session_name": "Registration", "start_date": "2034-03-20", "start_time": "08:00", "end_time": "09:00", "checkin_start_time": "08:00"},
            {"session_name": "Opening Ceremony", "start_date": "2034-03-20", "start_time": "09:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Keynote: Climate Risk in Southeast Asia", "start_date": "2034-03-20", "start_time": "09:00", "end_time": "10:30", "checkin_start_time": None},
            {"session_name": "Coastal Adaptation Session", "start_date": "2034-03-20", "start_time": "10:45", "end_time": None, "checkin_start_time": None},
            {"session_name": "Urban Resilience Workshop", "start_date": "2034-03-20", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Climate Finance Panel", "start_date": "2034-03-20", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Researcher Networking Session", "start_date": "2034-03-20", "start_time": "16:45", "end_time": "17:30", "checkin_start_time": None},
            {"session_name": "Climate Data Session", "start_date": "2034-03-21", "start_time": "08:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Biodiversity and Ecosystem Panel", "start_date": "2034-03-21", "start_time": "10:15", "end_time": None, "checkin_start_time": None},
            {"session_name": "Climate Modeling Workshop", "start_date": "2034-03-21", "start_time": "13:30", "end_time": "15:00", "checkin_start_time": None},
            {"session_name": "Regional Policy Roundtable", "start_date": "2034-03-21", "start_time": "15:15", "end_time": "16:30", "checkin_start_time": None},
            {"session_name": "Closing Panel", "start_date": "2034-03-21", "start_time": "16:45", "end_time": "17:30", "checkin_start_time": None},
        ]
    },
    "VIETNAM HERITAGE FOOD FESTIVAL 2034.txt": {
        "sessions": [
            {"session_name": "Opening Ceremony", "start_date": "2034-06-08", "start_time": "09:00", "end_time": None, "checkin_start_time": "08:00"},
            {"session_name": "Vietnamese Regional Cuisine Showcase", "start_date": "2034-06-08", "start_time": "10:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Central Vietnam Cooking Workshop", "start_date": "2034-06-08", "start_time": "13:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Southern Food Heritage Talk", "start_date": "2034-06-08", "start_time": "15:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Cultural Performance", "start_date": "2034-06-08", "start_time": "19:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Traditional Breakfast Session", "start_date": "2034-06-09", "start_time": "08:30", "end_time": None, "checkin_start_time": "08:00"},
            {"session_name": "Northern Cuisine Workshop", "start_date": "2034-06-09", "start_time": "10:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Sustainable Food Panel", "start_date": "2034-06-09", "start_time": "13:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Young Chefs Competition", "start_date": "2034-06-09", "start_time": "15:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Folk Music Performance", "start_date": "2034-06-09", "start_time": "19:00", "end_time": "20:30", "checkin_start_time": None},
            {"session_name": "Street Food Photography Walk", "start_date": "2034-06-10", "start_time": "08:30", "end_time": None, "checkin_start_time": "08:00"},
            {"session_name": "International Food Culture Panel", "start_date": "2034-06-10", "start_time": "10:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Family Cooking Workshop", "start_date": "2034-06-10", "start_time": "13:30", "end_time": None, "checkin_start_time": None},
            {"session_name": "Festival Awards", "start_date": "2034-06-10", "start_time": "16:00", "end_time": None, "checkin_start_time": None},
            {"session_name": "Closing Ceremony", "start_date": "2034-06-10", "start_time": "17:00", "end_time": None, "checkin_start_time": None},
        ],
        "ticket_types": [
            {"name": "Festival Pass", "price": 150000, "quantity_total": None, "description": None},
            {"name": "Workshop Pass", "price": 250000, "quantity_total": None, "description": None},
            {"name": "VIP Pass", "price": 600000, "quantity_total": None, "description": None},
        ],
    },
    "FUTURE MOBILITY EXPO 2030.txt": {
        "category": "kinh-doanh-cong-nghe",
    },
    "DIGITAL CREATOR EXPO 2027.txt": {
        "category": "kinh-doanh-cong-nghe",
    },
    "VIETNAM CHILDREN'S LITERATURE CONFE.txt": {
        "venue_name": "Hanoi Museum",
        "address_line": "Phạm Hùng, Nam Từ Liêm, Hà Nội.",
    },
}

# Các tài liệu holdout kiểm thử không nằm trong tập train/validation (bao phủ đa dạng định dạng, ngữ cảnh khó & chống bịa)
DESIGNATED_TEST_FILES = {
    "TIÊU ĐỀ.docx",
    "NHẬT KÝ ĐIỀU PHỐI.txt",
    "ASIA STARTUP INVESTMENT FORUM 2029.txt",
    "Green_Living_Expo_2027_Phi_Cau_Truc.docx",
    "PHIẾU YÊU CẦU DỊCH VỤ VÀ ĐĂNG KÝ HỘ.txt",
    "MEKONG SUSTAINABLE TOURISM FORUM 20.txt",
    "[0912] Event Director.txt",
    "SỔ TAY VẬN HÀNH HỘI CHỢ.txt",
    "Final confirmation – Asia FinTech Investment Week 2034.txt",
    "# ĐỀ XUẤT HỢP TÁC TỔ CHỨC SỰ KIỆN.txt",
    "BẢN GHI DỮ LIỆU SỰ KIỆ.txt",
    "EMAIL THREAD.txt",
    "MEETING MINUTES.txt",
    "REQUEST FOR PROPOSAL.txt",
    "PRESS RELEASE.txt",
    "KỊCH BẢN ĐIỀU PHỐI SÂN KHẤU.txt",
    "🎵 VIETNAM INDIE MUSIC WEEKEND 2033.txt",
    "ĐẶC TẢ GIẢI THỂ THAO.txt",
    "FUTURE EDUCATION EXPO 2029.txt",
    "THƯ MỜI VÀ BÁO GIÁ THAM DỰ EDUVERSE.txt",
    "03_semistructured_workshop.txt",
    "10_messy_notes_missing_fields.txt",
}

DESIGNATED_VAL_FILES = {
    "VIETNAM AI SAFETY & GOVERNANCE FORU.txt",
    "VIETNAM HERITAGE FOOD FESTIVAL 2034.txt",
    "HANOI CREATIVE TECHNOLOGY WEEK 2033.txt",
    "SOUTHEAST ASIA CLIMATE RESEARCH FOR.txt",
    "VIETNAM EDUCATION TECHNOLOGY SUMMIT.txt",
    "PHIẾU CẬP NHẬT CHƯƠNG TRÌNH MUSIC W.txt",
    "DA NANG BEACH SPORTS FESTIVAL 2030.txt",
    "ARTIST PERFORMANCE AGREEMENT.txt",
    "OFFICIAL ANNOUNCEMENT.txt",
    "RURAL INNOVATION CONFERENCE 2030.txt",
    "VIETNAM INDIE GAME FESTIVAL 2034.txt",
    "07_json_event_launch.txt",
}


def build_clean_v2_output(raw_rec: dict, repair: dict = None) -> dict:
    rep = repair or {}
    cat_raw = rep.get("category") or raw_rec.get("category") or raw_rec.get("category_id") or "le-hoi-van-hoa"
    cat = CANONICAL_V2_CATEGORY.get(cat_raw, "le-hoi-van-hoa")

    short_desc = empty_to_none(raw_rec.get("short_description"))
    if short_desc and len(short_desc) > 500:
        short_desc = short_desc[:497].rsplit(" ", 1)[0] + "."
    if short_desc and not short_desc.endswith((".", "!", "?", '"', "”", ")")):
        short_desc += "."

    raw_sessions = rep.get("sessions") if "sessions" in rep else raw_rec.get("sessions", [])
    sessions = []
    for s in raw_sessions:
        st_date = empty_to_none(s.get("start_date") or s.get("date"))
        ed_date = empty_to_none(s.get("end_date")) or st_date
        ci = normalize_time_or_none(s.get("checkin_start_time") or s.get("check_in_time"))
        st = normalize_time_or_none(s.get("start_time"))
        et = normalize_time_or_none(s.get("end_time"))
        if ci and st and ci > st:
            ci = None
        if st and et and st >= et:
            et = None
        sessions.append(
            {
                "session_name": empty_to_none(s.get("session_name")) or "Phiên sự kiện",
                "start_date": st_date,
                "start_time": st,
                "end_date": ed_date,
                "end_time": et,
                "checkin_start_time": ci,
            }
        )

    raw_tickets = rep.get("ticket_types") if "ticket_types" in rep else raw_rec.get("ticket_types", [])
    ticket_types = []
    for t in raw_tickets:
        qty = t.get("quantity_total")
        if qty is not None:
            try:
                qty = int(qty)
                if qty < 1:
                    qty = None
            except Exception:
                qty = None
        price = t.get("price")
        if price is not None:
            price = int(price)
        ticket_types.append(
            {
                "name": empty_to_none(t.get("name")) or "Standard Ticket",
                "price": price,
                "quantity_total": qty,
                "description": empty_to_none(t.get("description")),
            }
        )

    refund = rep.get("refund_policy") if "refund_policy" in rep else raw_rec.get("refund_policy")
    if not isinstance(refund, dict):
        refund = {"allow_refunds": False, "deadline_days": None}

    add_terms = rep.get("additional_terms") if "additional_terms" in rep else raw_rec.get("additional_terms")

    return {
        "title": empty_to_none(rep.get("title") or raw_rec.get("title")),
        "category": cat,
        "tags": [str(x).strip() for x in (raw_rec.get("tags") or []) if str(x).strip()],
        "short_description": short_desc,
        "description": empty_to_none(raw_rec.get("description")),
        "venue_name": empty_to_none(rep["venue_name"]) if "venue_name" in rep else empty_to_none(raw_rec.get("venue_name")),
        "address_line": empty_to_none(rep["address_line"]) if "address_line" in rep else empty_to_none(raw_rec.get("address_line")),
        "ward": empty_to_none(raw_rec.get("ward")),
        "district": empty_to_none(raw_rec.get("district")),
        "province": empty_to_none(raw_rec.get("province")),
        "sessions": sessions,
        "ticket_types": ticket_types,
        "refund_policy": {
            "allow_refunds": bool(refund.get("allow_refunds", False)),
            "deadline_days": refund.get("deadline_days"),
        },
        "require_attendee_information": bool(raw_rec.get("require_attendee_information", False)),
        "additional_terms": empty_to_none(add_terms),
    }


def norm_title_key(t: str) -> str:
    return re.sub(r"[^a-z0-9à-ỹ]+", " ", (t or "").lower()).strip()


def infer_doc_style(fname: str, text: str) -> str:
    low = text.lower()
    if re.search(r"(?m)^\[\d{2}:\d{2}\]", text):
        return "chat"
    if re.search(r"(?m)^(from|to|subject|từ|đến|chủ đề|kính gửi|dear)\s*:", text, re.I):
        return "email"
    if re.search(r"(nhật ký \d+|lịch chương trình ban đầu)", low):
        return "chronological_log"
    if re.search(r"\|.*\|", text) or "\t" in text:
        return "structured_table"
    return "narrative_mixed"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(DEFAULT_GOLD_EVAL_PATH, "r", encoding="utf-8") as f:
        eval_out = json.load(f)
    with open(DEFAULT_DUMP_PATH, "r", encoding="utf-8") as f:
        new_dump = {d["filename"]: d["text"] for d in json.load(f)}

    new_gold_map = {r["file"]: r for r in eval_out["newRes"]}
    old_gold_map = {r["file"]: r for r in eval_out["oldRes"]}

    raw_items = []

    # 1. 91 new documents from ai/Test_doc
    for idx, (fn, raw_txt) in enumerate(sorted(new_dump.items()), 1):
        clean_input = strip_eval_metadata(raw_txt)
        out_json = build_clean_v2_output(new_gold_map[fn], GOLD_REPAIRS.get(fn))
        raw_items.append(
            {
                "id": f"V3-NEW-{idx:03d}",
                "source_file": fn,
                "source_group": "test_doc_91",
                "type": infer_doc_style(fn, clean_input),
                "input_text": clean_input,
                "output_json": out_json,
            }
        )

    # 2. 10 legacy regression documents (Anti-Forgetting Replay + Edge Cases)
    for idx, (fn, greq) in enumerate(sorted(old_gold_map.items()), 1):
        fpath = os.path.join(OLD_TEST_DIR, fn)
        with open(fpath, "r", encoding="utf-8") as f:
            clean_input = strip_eval_metadata(f.read())
        out_json = build_clean_v2_output(greq, GOLD_REPAIRS.get(fn))
        raw_items.append(
            {
                "id": f"V3-OLD-{idx:02d}",
                "source_file": fn,
                "source_group": "old_test_10_replay",
                "type": infer_doc_style(fn, clean_input),
                "input_text": clean_input,
                "output_json": out_json,
            }
        )

    # 3. 8 DIVERSE_SAMPLES from V2 (`generate_diverse_samples_v2.py`) replay
    for s in DIVERSE_SAMPLES:
        out_json = build_clean_v2_output(s["output_json"], None)
        raw_items.append(
            {
                "id": f"V3-REPLAY-{s['id']}",
                "source_file": s["id"],
                "source_group": "v2_diverse_replay",
                "type": s.get("type", "unstructured"),
                "input_text": s["input_text"].strip(),
                "output_json": out_json,
            }
        )

    # Title-grouped split assignment (ensuring shared title groups stay in same split)
    title_to_split = {}
    for item in raw_items:
        fn = item["source_file"]
        tkey = norm_title_key(item["output_json"]["title"])
        if fn in DESIGNATED_TEST_FILES:
            title_to_split[tkey] = "test"
        elif fn in DESIGNATED_VAL_FILES and title_to_split.get(tkey) != "test":
            title_to_split[tkey] = "validation"

    for item in raw_items:
        tkey = norm_title_key(item["output_json"]["title"])
        item["split"] = title_to_split.get(tkey, "train")

    # Double check 0 title overlap between splits
    split_titles = defaultdict(set)
    for item in raw_items:
        split_titles[item["split"]].add(norm_title_key(item["output_json"]["title"]))
    assert not (split_titles["train"] & split_titles["test"]), "Title leakage train/test!"
    assert not (split_titles["train"] & split_titles["validation"]), "Title leakage train/val!"
    assert not (split_titles["validation"] & split_titles["test"]), "Title leakage val/test!"

    # Save `dataset_all.jsonl` (EventHub standard pre-SFT JSONL format for `validate_dataset.py` & `check_data_leakage.py`)
    all_jsonl_path = os.path.join(OUT_DIR, "dataset_all.jsonl")
    with open(all_jsonl_path, "w", encoding="utf-8") as f:
        for item in raw_items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Save ChatML SFT splits (`train_sft.jsonl`, `validation_sft.jsonl`, `test_sft.jsonl`)
    split_buckets = defaultdict(list)
    token_stats = defaultdict(list)
    for item in raw_items:
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

    # Generate concise summary JSON report
    report = {
        "total_samples": len(raw_items),
        "by_source_group": dict(Counter(i["source_group"] for i in raw_items)),
        "by_split": {sp: len(split_buckets[sp]) for sp in ["train", "validation", "test"]},
        "unique_titles": len({norm_title_key(i["output_json"]["title"]) for i in raw_items}),
        "title_leakage_pairs": 0,
        "max_estimated_tokens": max(t for ts in token_stats.values() for t in ts),
        "tokens_by_split": {
            sp: {"min": min(ts), "avg": round(sum(ts) / len(ts), 1), "max": max(ts)}
            for sp, ts in token_stats.items()
            if ts
        },
        "repaired_gold_files": sorted(GOLD_REPAIRS.keys()),
        "zero_hallucination_null_venue_samples": [i["source_file"] for i in raw_items if i["output_json"]["venue_name"] is None],
        "zero_ticket_samples": [i["source_file"] for i in raw_items if not i["output_json"]["ticket_types"]],
    }
    with open(os.path.join(OUT_DIR, "dataset_audit_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=== BUILT SFT CONTINUED V3 DATASET ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
