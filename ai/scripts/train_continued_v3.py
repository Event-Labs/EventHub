"""Continued QLoRA Fine-Tuning script for EventHub AI Create Event (V2 -> V3).

IMPORTANT DESIGN INVARIANT:
This script performs CONTINUED TRAINING starting from an existing trained
PEFT/LoRA adapter (e.g., `adapters/eventhub_qwen_v2`). It NEVER resets to the
raw base model and NEVER falls back to initializing a fresh LoRA adapter via
`get_peft_model`. Missing `adapter_config.json` or adapter weight files causes an
explicit FileNotFoundError.
"""

from __future__ import annotations

import argparse
import collections
import inspect
import json
import os
import random
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

PROJECT_AI_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TRAIN_FILE = PROJECT_AI_DIR / "datasets" / "sft_continued_v3" / "train_sft.jsonl"
DEFAULT_VAL_FILE = PROJECT_AI_DIR / "datasets" / "sft_continued_v3" / "validation_sft.jsonl"
DEFAULT_TEST_FILE = PROJECT_AI_DIR / "datasets" / "sft_continued_v3" / "test_sft.jsonl"
DEFAULT_OUTPUT_DIR = Path("/content/drive/MyDrive/EventHub_AI/adapters/eventhub_qwen_v3")
DEFAULT_CHECKPOINT_DIR = Path("/content/drive/MyDrive/EventHub_AI/checkpoints/eventhub_qwen_v3")

CANDIDATE_EXISTING_ADAPTER_DIRS = [
    "/content/drive/MyDrive/EventHub_AI/adapters/eventhub_qwen_v2",
    "/content/drive/MyDrive/EventHub_AI/adapters/eventhub_qwen_dpo_final",
    "/content/drive/MyDrive/EventHub_AI/adapters/eventhub_qwen_sft",
]

REQUIRED_OUTPUT_KEYS = {
    "title",
    "category",
    "tags",
    "short_description",
    "description",
    "venue_name",
    "address_line",
    "ward",
    "district",
    "province",
    "sessions",
    "ticket_types",
    "refund_policy",
    "require_attendee_information",
    "additional_terms",
}


def norm_title_key(title: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9à-ỹ]+", " ", (title or "").lower()).strip()


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / 3.4))


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw in enumerate(fh, 1):
            stripped = raw.strip()
            if not stripped:
                continue
            try:
                rows.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON at {path}:{line_no}: {exc}") from exc
    return rows


def extract_assistant_json(row: Dict[str, Any], source: str) -> Dict[str, Any]:
    messages = row.get("messages")
    if not isinstance(messages, list) or len(messages) < 3:
        raise ValueError(f"{source}: expected ChatML 'messages' with >= 3 turns")
    roles = [m.get("role") for m in messages[:3]]
    if roles != ["system", "user", "assistant"]:
        raise ValueError(f"{source}: unexpected roles {roles}")
    assistant_content = messages[-1].get("content", "")
    try:
        parsed = json.loads(assistant_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{source}: assistant content is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{source}: assistant JSON must be an object")
    missing = REQUIRED_OUTPUT_KEYS - set(parsed.keys())
    if missing:
        raise ValueError(f"{source}: assistant JSON missing required keys: {sorted(missing)}")
    if not isinstance(parsed.get("sessions"), list):
        raise ValueError(f"{source}: 'sessions' must be a list")
    if not isinstance(parsed.get("ticket_types"), list):
        raise ValueError(f"{source}: 'ticket_types' must be a list")
    if not isinstance(parsed.get("tags"), list):
        raise ValueError(f"{source}: 'tags' must be a list")
    if not isinstance(parsed.get("refund_policy"), dict):
        raise ValueError(f"{source}: 'refund_policy' must be an object")
    return parsed


def has_valid_peft_adapter(path: Path) -> bool:
    if not path.is_dir():
        return False
    cfg = path / "adapter_config.json"
    weights = [path / "adapter_model.safetensors", path / "adapter_model.bin"]
    return cfg.is_file() and any(w.is_file() for w in weights)


def resolve_existing_adapter(adapter_path: Optional[str]) -> Tuple[Path, Dict[str, Any]]:
    """Strict continued-training guard: never initializes a fresh adapter from base."""
    resolved: Optional[Path] = None
    if adapter_path:
        candidate = Path(adapter_path)
        if not has_valid_peft_adapter(candidate):
            raise FileNotFoundError(
                f"Existing trained LoRA adapter NOT found at '{candidate}'. "
                "Requires adapter_config.json AND adapter_model.(safetensors|bin). "
                "Aborting because continued training MUST start from the trained V2 adapter, "
                "never from the raw base model."
            )
        resolved = candidate
    else:
        for cand_str in CANDIDATE_EXISTING_ADAPTER_DIRS:
            cand = Path(cand_str)
            if has_valid_peft_adapter(cand):
                resolved = cand
                break
        if resolved is None:
            raise FileNotFoundError(
                "No existing trained PEFT adapter found in --adapter-path or default paths: "
                + ", ".join(CANDIDATE_EXISTING_ADAPTER_DIRS)
                + ". Aborting to prevent resetting to base model."
            )

    with (resolved / "adapter_config.json").open("r", encoding="utf-8") as fh:
        adapter_cfg = json.load(fh)
    return resolved, adapter_cfg


def prepare_replay_and_audit(
    train_path: Path,
    val_path: Optional[Path],
    test_path: Optional[Path],
    replay_path: Optional[Path],
    replay_ratio: float,
    seed: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    train_rows = load_jsonl(train_path)
    val_rows = load_jsonl(val_path) if val_path and val_path.is_file() else []
    test_rows = load_jsonl(test_path) if test_path and test_path.is_file() else []

    if not train_rows:
        raise ValueError(f"Training dataset is empty: {train_path}")

    split_titles: Dict[str, set] = {"train": set(), "validation": set(), "test": set()}
    token_stats: Dict[str, Dict[str, Any]] = {}
    group_counts: Dict[str, Dict[str, int]] = {}

    for split_name, rows in [("train", train_rows), ("validation", val_rows), ("test", test_rows)]:
        lengths: List[int] = []
        groups = collections.Counter()
        for idx, row in enumerate(rows):
            src = f"{split_name}[{idx}]({row.get('id', row.get('source_file', '?'))})"
            parsed = extract_assistant_json(row, src)
            tkey = norm_title_key(parsed.get("title"))
            if tkey:
                split_titles[split_name].add(tkey)
            full_text = "\n".join(m.get("content", "") for m in row["messages"])
            lengths.append(estimate_tokens(full_text))
            groups[row.get("source_group", "unknown")] += 1

        group_counts[split_name] = dict(groups)
        token_stats[split_name] = {
            "count": len(rows),
            "min_tokens": min(lengths) if lengths else 0,
            "avg_tokens": round(sum(lengths) / len(lengths), 1) if lengths else 0.0,
            "max_tokens": max(lengths) if lengths else 0,
        }

    train_val_overlap = sorted(split_titles["train"] & split_titles["validation"])
    train_test_overlap = sorted(split_titles["train"] & split_titles["test"])
    val_test_overlap = sorted(split_titles["validation"] & split_titles["test"])
    if train_val_overlap or train_test_overlap or val_test_overlap:
        raise RuntimeError(
            f"Data leakage detected across splits! "
            f"train&val={train_val_overlap}, train&test={train_test_overlap}, val&test={val_test_overlap}"
        )

    blocked_eval_titles = split_titles["validation"] | split_titles["test"]
    existing_train_titles = set(split_titles["train"])
    external_replay_added = 0

    if replay_path and replay_path.is_file() and replay_ratio > 0:
        raw_replay = load_jsonl(replay_path)
        eligible_replay: List[Dict[str, Any]] = []
        for idx, row in enumerate(raw_replay):
            try:
                parsed = extract_assistant_json(row, f"replay[{idx}]")
            except ValueError:
                continue
            tkey = norm_title_key(parsed.get("title"))
            if tkey and (tkey in blocked_eval_titles or tkey in existing_train_titles):
                continue
            eligible_replay.append(
                {
                    "id": row.get("id", f"V2-REPLAY-{idx:04d}"),
                    "source_file": row.get("source_file", "historical_v2_replay"),
                    "source_group": "historical_v2_replay",
                    "split": "train",
                    "messages": row["messages"],
                }
            )
            if tkey:
                existing_train_titles.add(tkey)

        target_replay = min(len(eligible_replay), max(0, int(round(len(train_rows) * replay_ratio))))
        rng = random.Random(seed)
        chosen = rng.sample(eligible_replay, target_replay) if target_replay < len(eligible_replay) else eligible_replay
        train_rows = train_rows + chosen
        rng.shuffle(train_rows)
        external_replay_added = len(chosen)

    audit = {
        "train_samples_final": len(train_rows),
        "external_v2_replay_added": external_replay_added,
        "group_counts": group_counts,
        "token_stats": token_stats,
        "cross_split_title_leakage": 0,
    }
    return train_rows, val_rows, test_rows, audit


def filter_valid_kwargs(cls: Any, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    sig = inspect.signature(cls.__init__)
    params = sig.parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return kwargs
    return {k: v for k, v in kwargs.items() if k in params}


def apply_qwen_chat_template(tokenizer: Any, messages: List[Dict[str, str]]) -> str:
    """Applies ChatML template while disabling Qwen3 <think> mode when supported."""
    sig = inspect.signature(tokenizer.apply_chat_template)
    kwargs: Dict[str, Any] = {"tokenize": False, "add_generation_prompt": False}
    if "enable_thinking" in sig.parameters:
        kwargs["enable_thinking"] = False
    return tokenizer.apply_chat_template(messages, **kwargs)


def run_continued_training(args: argparse.Namespace) -> None:
    if not args.skip_adapter_check:
        adapter_dir, adapter_cfg = resolve_existing_adapter(args.adapter_path)
        print(f"[GUARD OK] Verified existing trained adapter: {adapter_dir}")
        print(
            f"[GUARD OK] Parent adapter config: base={adapter_cfg.get('base_model_name_or_path')}, "
            f"r={adapter_cfg.get('r')}, alpha={adapter_cfg.get('lora_alpha')}, "
            f"targets={adapter_cfg.get('target_modules')}"
        )
    else:
        adapter_dir = Path(args.adapter_path) if args.adapter_path else Path("<skipped-in-dry-run>")
        adapter_cfg = {}
        print("[DRY-RUN] Skipped local PEFT checkpoint presence check (--skip-adapter-check).")

    train_rows, val_rows, test_rows, audit = prepare_replay_and_audit(
        train_path=Path(args.train_file),
        val_path=Path(args.val_file) if args.val_file else None,
        test_path=Path(args.test_file) if args.test_file else None,
        replay_path=Path(args.replay_path) if args.replay_path else None,
        replay_ratio=args.replay_ratio,
        seed=args.seed,
    )
    print("[DATASET OK] Audit summary:")
    print(json.dumps(audit, ensure_ascii=False, indent=2))

    max_train_tok = audit["token_stats"]["train"]["max_tokens"]
    if args.max_seq_length < max_train_tok:
        print(
            f"[WARN] max_seq_length={args.max_seq_length} < max estimated train tokens ({max_train_tok}). "
            "Recommend >= 4096 for train (and 6144 for full test set coverage).",
            file=sys.stderr,
        )

    if args.validate_only:
        print("[VALIDATE-ONLY COMPLETE] Dataset, leakage check, and continued-training configuration verified.")
        return

    import torch
    from datasets import Dataset
    from peft import PeftModel, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA GPU is required for 4-bit QLoRA continued fine-tuning. "
            "Run this script or ai/colab/06_continued_train_v3.ipynb on Colab T4/L4/A100."
        )

    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    device_name = torch.cuda.get_device_name(0)
    print(f"[GPU] {device_name} | VRAM={vram_gb:.2f} GB")

    bf16_mode = vram_gb >= 22 and torch.cuda.is_bf16_supported()
    fp16_mode = not bf16_mode
    batch_size = args.batch_size
    grad_accum = args.grad_accum if args.grad_accum else max(1, 8 // max(1, batch_size))
    max_seq_len = args.max_seq_length
    if vram_gb < 14 and max_seq_len > 4096 and not args.force_seq_len:
        print(f"[GPU AUTO-TUNE] VRAM={vram_gb:.1f}GB -> capping max_seq_length from {max_seq_len} to 4096.")
        max_seq_len = 4096
    elif vram_gb < 22 and max_seq_len > 5120 and not args.force_seq_len:
        print(f"[GPU AUTO-TUNE] VRAM={vram_gb:.1f}GB (T4/V100) -> using max_seq_length=5120 (fits all {len(train_rows)} train samples up to {max_train_tok} est tokens without truncation).")
        max_seq_len = 5120

    base_model_id = args.base_model or adapter_cfg.get("base_model_name_or_path") or "Qwen/Qwen3-4B"
    print(f"[LOAD] Base model={base_model_id} (4-bit NF4), continuing adapter={adapter_dir}")

    tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if bf16_mode else torch.float16,
    )
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_id,
        quantization_config=bnb_config,
        torch_dtype=torch.bfloat16 if bf16_mode else torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )
    base_model = prepare_model_for_kbit_training(base_model, use_gradient_checkpointing=True)
    base_model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    base_model.config.use_cache = False

    # CRITICAL INVARIANT: Resume training on the EXISTING V2 LoRA weights!
    model = PeftModel.from_pretrained(base_model, str(adapter_dir), is_trainable=True)
    if not bf16_mode:
        for p in model.parameters():
            if p.requires_grad:
                p.data = p.data.to(torch.float32)
            elif p.dtype == torch.bfloat16:
                p.data = p.data.to(torch.float16)
    model.print_trainable_parameters()

    train_texts = [{"text": apply_qwen_chat_template(tokenizer, r["messages"])} for r in train_rows]
    train_ds = Dataset.from_list(train_texts)
    val_ds = (
        Dataset.from_list([{"text": apply_qwen_chat_template(tokenizer, r["messages"])} for r in val_rows])
        if val_rows
        else None
    )

    output_dir = Path(args.output_dir)
    ckpt_dir = Path(args.checkpoint_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    has_val = val_ds is not None and len(val_ds) > 0
    sft_candidates: Dict[str, Any] = {
        "output_dir": str(ckpt_dir),
        "per_device_train_batch_size": batch_size,
        "per_device_eval_batch_size": 1,
        "gradient_accumulation_steps": grad_accum,
        "learning_rate": args.learning_rate,
        "lr_scheduler_type": "cosine",
        "warmup_ratio": args.warmup_ratio,
        "weight_decay": 0.01,
        "max_grad_norm": 0.5,
        "num_train_epochs": args.epochs,
        "eval_strategy": "epoch" if has_val else "no",
        "save_strategy": "epoch",
        "save_total_limit": 2,
        "load_best_model_at_end": has_val,
        "metric_for_best_model": "eval_loss" if has_val else None,
        "fp16": False,
        "bf16": bf16_mode,
        "gradient_checkpointing": True,
        "gradient_checkpointing_kwargs": {"use_reentrant": False},
        "logging_steps": 5,
        "report_to": "none",
        "seed": args.seed,
        "max_length": max_seq_len,
        "max_seq_length": max_seq_len,
        "dataset_text_field": "text",
        "packing": False,
    }
    sft_args = SFTConfig(**filter_valid_kwargs(SFTConfig, {k: v for k, v in sft_candidates.items() if v is not None}))
    trainer_candidates = {
        "model": model,
        "train_dataset": train_ds,
        "eval_dataset": val_ds,
        "processing_class": tokenizer,
        "tokenizer": tokenizer,
        "args": sft_args,
    }
    trainer = SFTTrainer(**filter_valid_kwargs(SFTTrainer, trainer_candidates))

    print(
        f"[TRAIN] Starting continued QLoRA SFT: epochs={args.epochs}, lr={args.learning_rate}, "
        f"eff_batch={batch_size * grad_accum}, max_seq_length={max_seq_len}"
    )
    train_res = trainer.train()
    eval_metrics = trainer.evaluate() if has_val else {}

    trainer.model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    meta = {
        "training_mode": "continued_qlora_sft",
        "parent_adapter_path": str(adapter_dir),
        "base_model": base_model_id,
        "parent_lora_config": {
            "r": adapter_cfg.get("r"),
            "lora_alpha": adapter_cfg.get("lora_alpha"),
            "target_modules": adapter_cfg.get("target_modules"),
        },
        "hyperparameters": {
            "learning_rate": args.learning_rate,
            "epochs": args.epochs,
            "batch_size": batch_size,
            "gradient_accumulation_steps": grad_accum,
            "max_seq_length": max_seq_len,
            "warmup_ratio": args.warmup_ratio,
        },
        "dataset_audit": audit,
        "train_loss": train_res.training_loss,
        "eval_metrics": eval_metrics,
        "output_adapter_dir": str(output_dir),
    }
    with (output_dir / "continued_training_metadata.json").open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    print(f"[DONE] Saved continued V3 LoRA adapter -> {output_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Continued QLoRA fine-tuning for EventHub AI Create Event (resumes existing V2 adapter)."
    )
    parser.add_argument("--adapter-path", type=str, default=None, help="Path to existing trained V2 LoRA adapter (REQUIRED unless present in default Drive locations).")
    parser.add_argument("--base-model", type=str, default=None, help="Optional override for HF base model ID (defaults to adapter_config base_model_name_or_path or Qwen/Qwen3-4B).")
    parser.add_argument("--train-file", type=str, default=str(DEFAULT_TRAIN_FILE))
    parser.add_argument("--val-file", type=str, default=str(DEFAULT_VAL_FILE))
    parser.add_argument("--test-file", type=str, default=str(DEFAULT_TEST_FILE))
    parser.add_argument("--replay-path", type=str, default=None, help="Optional historical V2 train_sft.jsonl for extra catastrophic-forgetting replay.")
    parser.add_argument("--replay-ratio", type=float, default=0.4, help="Ratio of external V2 replay samples to add relative to train count (default: 0.4).")
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--checkpoint-dir", type=str, default=str(DEFAULT_CHECKPOINT_DIR))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--warmup-ratio", type=float, default=0.08)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=None)
    parser.add_argument("--max-seq-length", type=int, default=6144)
    parser.add_argument("--force-seq-len", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--validate-only", action="store_true", help="Validate adapter guard, dataset schema, split leakage, and token lengths without GPU/torch.")
    parser.add_argument("--skip-adapter-check", action="store_true", help="Only for --validate-only when running locally without Google Drive mounted.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.skip_adapter_check and not args.validate_only:
        parser.error("--skip-adapter-check can only be combined with --validate-only.")
    run_continued_training(args)


if __name__ == "__main__":
    main()
