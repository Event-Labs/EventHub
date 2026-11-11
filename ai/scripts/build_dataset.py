import json
import os
import sys

# Ensure the `ai/` directory is in sys.path when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.settings import settings
from src.data import (
    generate_chatbot_samples,
    generate_content_samples,
    generate_finance_samples,
    generate_review_samples,
)

REQUIRED_REVIEW_KEYS = {
    "decision",
    "risk_score",
    "quality_score",
    "summary",
    "content_review",
    "image_review",
    "document_review",
    "compliant_checks",
    "critical_violations",
    "warnings",
    "suggestions",
}


def _load_token_counter():
    """Tải tokenizer Qwen local (nếu đã cache), fallback tiktoken hoặc char estimator."""
    try:
        from transformers import AutoTokenizer

        for model_name in [settings.model_id, "Qwen/Qwen3-0.6B", "Qwen/Qwen2.5-3B-Instruct"]:
            try:
                tok = AutoTokenizer.from_pretrained(model_name, local_files_only=True, trust_remote_code=True)

                def _count_qwen(messages):
                    rendered = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
                    return len(tok.encode(rendered))

                return f"Qwen({model_name})", _count_qwen
            except Exception:
                continue
    except Exception:
        pass

    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")

        def _count_tiktoken(messages):
            raw = "\n".join(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>" for m in messages)
            return len(enc.encode(raw))

        return "tiktoken(cl100k_base)", _count_tiktoken
    except Exception:
        pass

    def _count_chars(messages):
        raw = "\n".join(str(m.get("content", "")) for m in messages)
        return max(1, int(len(raw) * 0.4))

    return "char-estimate", _count_chars


def _validate_review_json(assistant_text: str, idx_label: str):
    parsed = json.loads(assistant_text)
    if not isinstance(parsed, dict):
        raise ValueError(f"[{idx_label}] Review assistant output không phải JSON object.")
    missing = REQUIRED_REVIEW_KEYS - set(parsed.keys())
    if missing:
        raise ValueError(f"[{idx_label}] Thiếu trường bắt buộc trong JSON review: {sorted(missing)}")
    if parsed.get("decision") not in ("APPROVE", "REJECT", "NEEDS_REVIEW"):
        raise ValueError(f"[{idx_label}] Giá trị decision không hợp lệ: {parsed.get('decision')}")
    img_items = parsed.get("image_review", {}).get("items", [])
    for it in img_items:
        if str(it.get("source", "")).startswith("PERMIT"):
            raise ValueError(f"[{idx_label}] Lỗi tách lớp: phát hiện '{it.get('source')}' lọt vào image_review.")


def _validate_samples(samples, max_seq_length: int):
    tok_name, count_fn = _load_token_counter()
    token_lengths = []
    review_checked = 0
    over_limit = []

    for idx, sample in enumerate(samples, 1):
        msgs = sample.get("messages")
        if not isinstance(msgs, list) or len(msgs) < 2:
            raise ValueError(f"Mẫu #{idx} không có mảng messages hợp lệ.")

        sys_text = str(msgs[0].get("content", ""))
        asst_text = str(msgs[-1].get("content", ""))
        is_review = "BỘ ĐIỀU KHOẢN & TIÊU CHÍ DUYỆT SỰ KIỆN" in sys_text or (
            asst_text.lstrip().startswith("{") and '"decision"' in asst_text
        )
        if is_review:
            _validate_review_json(asst_text, f"SFT #{idx}")
            review_checked += 1

        tl = count_fn(msgs)
        token_lengths.append(tl)
        if tl > max_seq_length:
            over_limit.append((idx, tl))

    if over_limit:
        raise ValueError(f"Phát hiện {len(over_limit)} mẫu vượt ngưỡng {max_seq_length} tokens: {over_limit[:5]}")

    dpo_count = 0
    dpo_max = 0
    dpo_path = getattr(settings, "dpo_dataset_path", "")
    if dpo_path and os.path.exists(dpo_path):
        with open(dpo_path, "r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                prompt = rec.get("prompt", [])
                chosen = rec.get("chosen", [])
                rejected = rec.get("rejected", [])
                _validate_review_json(chosen[0]["content"], f"DPO #{line_no} chosen")
                _validate_review_json(rejected[0]["content"], f"DPO #{line_no} rejected")
                c_len = count_fn(prompt + chosen)
                r_len = count_fn(prompt + rejected)
                pair_max = max(c_len, r_len)
                dpo_max = max(dpo_max, pair_max)
                if pair_max > max_seq_length:
                    raise ValueError(f"DPO #{line_no} vượt ngưỡng {max_seq_length} tokens ({pair_max}).")
                dpo_count += 1

    return {
        "tokenizer": tok_name,
        "total": len(samples),
        "review_json_validated": review_checked,
        "min_tokens": min(token_lengths) if token_lengths else 0,
        "avg_tokens": round(sum(token_lengths) / len(token_lengths), 1) if token_lengths else 0,
        "max_tokens": max(token_lengths) if token_lengths else 0,
        "dpo_pairs": dpo_count,
        "dpo_max_tokens": dpo_max,
    }


def _trim_chat_turns_to_budget(messages, count_fn, max_seq_length: int):
    """Nếu log chat nhiều lượt từ collected_chat_logs vượt quá max_seq_length, giữ system + các lượt gần nhất vừa ngưỡng."""
    if count_fn(messages) <= max_seq_length or len(messages) <= 2:
        return messages

    sys_msg = messages[0] if messages[0].get("role") == "system" else None
    tail_pool = messages[1:] if sys_msg else list(messages)

    # Luôn giữ tối thiểu 2 lượt cuối cùng (user -> assistant) hoặc giảm dần số lượt đầu
    while len(tail_pool) > 2:
        tail_pool.pop(0)
        # Bắt đầu đoạn hội thoại sạch tại role 'user' hoặc 'assistant'
        while len(tail_pool) > 2 and tail_pool[0].get("role") == "tool":
            tail_pool.pop(0)
        candidate = ([sys_msg] + tail_pool) if sys_msg else tail_pool
        if count_fn(candidate) <= max_seq_length:
            return candidate

    candidate = ([sys_msg] + tail_pool) if sys_msg else tail_pool
    return candidate


def main():
    settings.ensure_dirs()
    max_len = getattr(settings, "max_seq_length", 4096)
    _, count_fn = _load_token_counter()

    all_samples = []
    all_samples.extend(generate_chatbot_samples())
    all_samples.extend(generate_finance_samples())
    all_samples.extend(generate_review_samples())
    all_samples.extend(generate_content_samples())

    seen_pairs = {
        (
            str(s["messages"][-2].get("content", "")),
            str(s["messages"][-1].get("content", "")),
        )
        for s in all_samples
        if len(s.get("messages", [])) >= 2
    }

    # Merge real-world customer conversations collected by backend
    collected_path = os.path.join(settings.data_dir, "collected_chat_logs.jsonl")
    if os.path.exists(collected_path):
        collected_count = 0
        trimmed_chat_count = 0
        with open(collected_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    msgs = data.get("messages")
                    if msgs and len(msgs) >= 2:
                        orig_len = count_fn(msgs)
                        fitted = _trim_chat_turns_to_budget(msgs, count_fn, max_len)
                        if len(fitted) < len(msgs) or orig_len > max_len:
                            trimmed_chat_count += 1
                        if count_fn(fitted) <= max_len:
                            all_samples.append({"messages": fitted})
                            collected_count += 1
                except Exception:
                    pass
        print(f"Loaded {collected_count} real-world customer interaction samples from {collected_path} (windowed {trimmed_chat_count} long multi-turn logs)")

    # Merge DB-exported reviewed events from sft_events_dataset.jsonl (deduplicated)
    sft_events_path = getattr(settings, "sft_events_dataset_path", os.path.join(settings.data_dir, "sft_events_dataset.jsonl"))
    if os.path.exists(sft_events_path):
        db_merged = 0
        with open(sft_events_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    msgs = data.get("messages", [])
                    if len(msgs) >= 2:
                        sig = (str(msgs[-2].get("content", "")), str(msgs[-1].get("content", "")))
                        if sig not in seen_pairs:
                            all_samples.append({"messages": msgs})
                            seen_pairs.add(sig)
                            db_merged += 1
                except Exception:
                    pass
        print(f"Merged {db_merged} DB reviewed event samples from {sft_events_path}")

    max_len = getattr(settings, "max_seq_length", 4096)
    stats = _validate_samples(all_samples, max_seq_length=max_len)

    with open(settings.dataset_path, "w", encoding="utf-8") as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    print("\n=== DATASET BUILD & VALIDATION REPORT ===")
    print(f"- Output file             : {settings.dataset_path}")
    print(f"- Tokenizer check         : {stats['tokenizer']}")
    print(f"- Total SFT samples       : {stats['total']} (Review JSON verified: {stats['review_json_validated']})")
    print(f"- Token budget (limit {max_len}): min={stats['min_tokens']} | avg={stats['avg_tokens']} | max={stats['max_tokens']} | over_limit=0")
    if stats["dpo_pairs"] > 0:
        print(f"- DPO pairs validated     : {stats['dpo_pairs']} pairs (max_tokens={stats['dpo_max_tokens']} <= {max_len})")


if __name__ == "__main__":
    main()
