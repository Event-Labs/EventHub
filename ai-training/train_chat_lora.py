from datasets import load_dataset
from pathlib import Path
from peft import LoraConfig, TaskType
from transformers import AutoModelForCausalLM
from trl import SFTConfig, SFTTrainer


BASE_DIR = Path(__file__).resolve().parent
MODEL_NAME = "Qwen/Qwen3-0.6B"
DATA_FILE = str(BASE_DIR / "data/eventhub_chat_train.jsonl")
OUTPUT_DIR = str(BASE_DIR / "outputs/eventhub-chat-qwen3-lora")
MAX_TRAIN_SAMPLES = None


def format_messages(example):
    messages = example["messages"]
    system = messages[0]["content"]
    user = messages[1]["content"]
    assistant = messages[2]["content"]

    return {
        "text": (
            "<|im_start|>system\n"
            f"{system}<|im_end|>\n"
            "<|im_start|>user\n"
            f"{user}<|im_end|>\n"
            "<|im_start|>assistant\n"
            f"{assistant}<|im_end|>"
        )
    }


def main():
    dataset = load_dataset("json", data_files=DATA_FILE, split="train")
    if MAX_TRAIN_SAMPLES:
        dataset = dataset.select(range(min(MAX_TRAIN_SAMPLES, len(dataset))))
    dataset = dataset.map(format_messages, remove_columns=dataset.column_names)

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        device_map=None,
        low_cpu_mem_usage=False,
    )
    model.config.use_cache = False

    peft_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )

    training_args = SFTConfig(
        output_dir=OUTPUT_DIR,
        num_train_epochs=2,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=2,
        learning_rate=1.5e-4,
        logging_steps=5,
        save_steps=50,
        max_length=1536,
        fp16=False,
        bf16=False,
        report_to="none",
        dataset_text_field="text",
        dataloader_pin_memory=False,
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        args=training_args,
    )

    trainer.train()
    trainer.model.save_pretrained(OUTPUT_DIR)
    print(f"Saved LoRA adapter to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
