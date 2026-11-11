import inspect
import json
import os
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training


def _load_hf_dataset(records):
    from datasets import Dataset
    return Dataset.from_list(records)


def _extract_valid_kwargs(cls, candidates: dict) -> dict:
    sig = inspect.signature(cls.__init__)
    params = sig.parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return candidates
    return {k: v for k, v in candidates.items() if k in params}


class EventHubTrainer:
    """
    2-stage QLoRA trainer for EventHub AI:
      - Stage 1 (SFT): Supervises full System + Event + Vision/Document + JSON Output up to max_seq_length >= 4096.
      - Stage 2 (DPO): Aligns decisions against Admin overrides (ai/datasets/dpo_override_dataset.jsonl) with TRL DPOTrainer.
    """

    def __init__(self, settings):
        self.settings = settings
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = None
        self.model = None

    def _resolve_seq_length(self, override=None) -> int:
        seq_len = int(override or getattr(self.settings, "max_seq_length", 4096))
        if seq_len < 4096:
            raise ValueError(f"max_seq_length phải >= 4096 để tránh cắt cụt prompt/JSON (nhận {seq_len}).")
        return seq_len

    def load_data(self, dataset_path=None):
        target_path = dataset_path or self.settings.dataset_path
        print(f"Loading SFT dataset from {target_path}...")
        data = []
        with open(target_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    data.append(json.loads(line))

        dataset = _load_hf_dataset(data)

        def format_chat_template(example):
            text = self.tokenizer.apply_chat_template(
                example["messages"], tokenize=False, add_generation_prompt=False
            )
            return {"text": text}

        print(f"Formatting {len(data)} SFT samples with chat template...")
        return dataset.map(format_chat_template)

    def load_dpo_data(self, dpo_dataset_path=None):
        target_path = dpo_dataset_path or getattr(
            self.settings, "dpo_dataset_path", os.path.join(self.settings.data_dir, "dpo_override_dataset.jsonl")
        )
        if not os.path.exists(target_path):
            return None

        records = []
        with open(target_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if "prompt" in rec and "chosen" in rec and "rejected" in rec:
                    records.append({
                        "prompt": rec["prompt"],
                        "chosen": rec["chosen"],
                        "rejected": rec["rejected"],
                    })

        if not records:
            return None
        print(f"Loaded {len(records)} DPO preference pairs from {target_path}.")
        return _load_hf_dataset(records)

    def _load_tokenizer(self):
        if self.tokenizer is not None:
            return
        print(f"Loading tokenizer {self.settings.model_id}...")
        self.tokenizer = AutoTokenizer.from_pretrained(self.settings.model_id, trust_remote_code=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.tokenizer.padding_side = "right"

    def prepare_model(self, adapter_path=None):
        self._load_tokenizer()
        print(f"Loading model {self.settings.model_id} in 4-bit on {self.device}...")

        use_bf16 = self.device == "cuda" and torch.cuda.is_bf16_supported()
        compute_dtype = torch.bfloat16 if use_bf16 else torch.float16

        if self.device == "cuda":
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=compute_dtype,
                bnb_4bit_use_double_quant=True,
            )
        else:
            bnb_config = None

        base_model = AutoModelForCausalLM.from_pretrained(
            self.settings.model_id,
            quantization_config=bnb_config,
            device_map={"": 0} if self.device == "cuda" else None,
            trust_remote_code=True,
        )

        if self.device == "cuda":
            base_model = prepare_model_for_kbit_training(base_model, use_gradient_checkpointing=True)
            base_model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})

        base_model.config.use_cache = False

        if adapter_path and os.path.exists(os.path.join(adapter_path, "adapter_config.json")):
            print(f"Loading existing LoRA adapter from {adapter_path} (trainable)...")
            self.model = PeftModel.from_pretrained(base_model, adapter_path, is_trainable=True)
        else:
            lora_config = LoraConfig(
                r=self.settings.lora_r,
                lora_alpha=self.settings.lora_alpha,
                target_modules=self.settings.target_modules,
                lora_dropout=self.settings.lora_dropout,
                bias="none",
                task_type="CAUSAL_LM",
            )
            self.model = get_peft_model(base_model, lora_config)

    def train(self, max_length=None, run_dpo=True, dataset_path=None):
        """Stage 1: SFT QLoRA with max_seq_length >= 4096 (default 4096; 6144 supported on T4/L4)."""
        from trl import SFTTrainer, SFTConfig

        seq_len = self._resolve_seq_length(max_length)
        self.settings.ensure_dirs()
        self.prepare_model()
        dataset = self.load_data(dataset_path=dataset_path)

        use_bf16 = self.device == "cuda" and torch.cuda.is_bf16_supported()
        sft_candidates = {
            "output_dir": self.settings.output_dir,
            "per_device_train_batch_size": 1,
            "gradient_accumulation_steps": 4,
            "learning_rate": 1e-4,
            "lr_scheduler_type": "cosine",
            "warmup_ratio": 0.05,
            "num_train_epochs": 3,
            "logging_steps": 10,
            "save_strategy": "epoch",
            "optim": "paged_adamw_32bit" if self.device == "cuda" else "adamw_torch",
            "fp16": (self.device == "cuda" and not use_bf16),
            "bf16": use_bf16,
            "gradient_checkpointing": True,
            "gradient_checkpointing_kwargs": {"use_reentrant": False},
            "max_length": seq_len,
            "max_seq_length": seq_len,
            "dataset_text_field": "text",
            "packing": False,
            "remove_unused_columns": True,
            "report_to": "none",
        }
        training_args = SFTConfig(**_extract_valid_kwargs(SFTConfig, sft_candidates))

        trainer_candidates = {
            "model": self.model,
            "train_dataset": dataset,
            "args": training_args,
            "processing_class": self.tokenizer,
            "tokenizer": self.tokenizer,
        }
        sft_trainer = SFTTrainer(**_extract_valid_kwargs(SFTTrainer, trainer_candidates))

        print(f"Starting Stage 1 SFT QLoRA training (max_seq_length={seq_len})...")
        sft_trainer.train()

        print(f"Stage 1 SFT complete! Saving adapter to: {self.settings.output_dir}")
        sft_trainer.model.save_pretrained(self.settings.output_dir)
        self.tokenizer.save_pretrained(self.settings.output_dir)

        if run_dpo:
            dpo_path = getattr(self.settings, "dpo_dataset_path", "")
            if dpo_path and os.path.exists(dpo_path) and os.path.getsize(dpo_path) > 0:
                self.train_dpo(dpo_dataset_path=dpo_path, max_length=seq_len)
            else:
                print("No non-empty DPO dataset found; skipping Stage 2 DPO.")

    def train_dpo(self, dpo_dataset_path=None, beta=None, max_length=None):
        """Stage 2: Direct Preference Optimization (TRL DPOTrainer) trên dữ liệu Admin duyệt đè."""
        from trl import DPOTrainer, DPOConfig

        seq_len = self._resolve_seq_length(max_length)
        beta_val = float(beta if beta is not None else getattr(self.settings, "dpo_beta", 0.1))
        dpo_out = getattr(self.settings, "dpo_output_dir", os.path.join(self.settings.output_dir, "dpo_final"))
        os.makedirs(dpo_out, exist_ok=True)

        self._load_tokenizer()
        dpo_dataset = self.load_dpo_data(dpo_dataset_path=dpo_dataset_path)
        if dpo_dataset is None:
            print("Empty or missing DPO override dataset; skipping Stage 2 DPO.")
            return

        if self.model is None:
            self.prepare_model(adapter_path=self.settings.output_dir)

        use_bf16 = self.device == "cuda" and torch.cuda.is_bf16_supported()
        max_prompt_len = min(seq_len - 512, int(seq_len * 0.78))
        dpo_candidates = {
            "output_dir": dpo_out,
            "per_device_train_batch_size": 1,
            "gradient_accumulation_steps": 4,
            "learning_rate": 5e-6,
            "lr_scheduler_type": "cosine",
            "warmup_ratio": 0.1,
            "num_train_epochs": 2,
            "beta": beta_val,
            "loss_type": "sigmoid",
            "logging_steps": 5,
            "save_strategy": "epoch",
            "optim": "paged_adamw_32bit" if self.device == "cuda" else "adamw_torch",
            "fp16": (self.device == "cuda" and not use_bf16),
            "bf16": use_bf16,
            "gradient_checkpointing": True,
            "gradient_checkpointing_kwargs": {"use_reentrant": False},
            "max_length": seq_len,
            "max_prompt_length": max_prompt_len,
            "remove_unused_columns": False,
            "report_to": "none",
        }
        dpo_args = DPOConfig(**_extract_valid_kwargs(DPOConfig, dpo_candidates))

        trainer_candidates = {
            "model": self.model,
            "ref_model": None,
            "args": dpo_args,
            "train_dataset": dpo_dataset,
            "processing_class": self.tokenizer,
            "tokenizer": self.tokenizer,
        }
        dpo_trainer = DPOTrainer(**_extract_valid_kwargs(DPOTrainer, trainer_candidates))

        print(f"Starting Stage 2 DPO training (beta={beta_val}, max_length={seq_len})...")
        dpo_trainer.train()

        print(f"Stage 2 DPO complete! Saving final aligned adapter to: {dpo_out}")
        dpo_trainer.model.save_pretrained(dpo_out)
        self.tokenizer.save_pretrained(dpo_out)
