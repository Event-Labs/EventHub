import os
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer
from datasets import Dataset
import json

class EventHubTrainer:
    def __init__(self, settings):
        self.settings = settings
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = None
        self.model = None

    def load_data(self):
        print(f"Loading dataset from {self.settings.dataset_path}...")
        data = []
        with open(self.settings.dataset_path, 'r', encoding='utf-8') as f:
            for line in f:
                data.append(json.loads(line))
        
        dataset = Dataset.from_list(data)
        
        def format_chat_template(example):
            text = self.tokenizer.apply_chat_template(example['messages'], tokenize=False, add_generation_prompt=False)
            return {"text": text}
            
        print("Formatting dataset...")
        return dataset.map(format_chat_template)

    def prepare_model(self):
        print(f"Loading tokenizer {self.settings.model_id}...")
        self.tokenizer = AutoTokenizer.from_pretrained(self.settings.model_id, trust_remote_code=True)
        self.tokenizer.pad_token = self.tokenizer.eos_token

        print(f"Loading model {self.settings.model_id} in 4-bit on {self.device}...")
        
        if self.device == "cuda":
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
            )
        else:
            bnb_config = None

        self.model = AutoModelForCausalLM.from_pretrained(
            self.settings.model_id,
            quantization_config=bnb_config,
            device_map={"": 0} if self.device == "cuda" else None,
            trust_remote_code=True
        )
        
        if self.device == "cuda":
            self.model = prepare_model_for_kbit_training(self.model)
        
        lora_config = LoraConfig(
            r=self.settings.lora_r,
            lora_alpha=self.settings.lora_alpha,
            target_modules=self.settings.target_modules,
            lora_dropout=self.settings.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM"
        )
        self.model = get_peft_model(self.model, lora_config)

    def train(self):
        self.settings.ensure_dirs()
        self.prepare_model()
        dataset = self.load_data()

        print("Tokenizing dataset...")
        def tokenize_function(examples):
            return self.tokenizer(examples["text"], truncation=True, max_length=1024)
        tokenized_dataset = dataset.map(tokenize_function, batched=True)

        training_args = TrainingArguments(
            output_dir=self.settings.output_dir,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            num_train_epochs=3,
            logging_steps=10,
            save_strategy="epoch",
            optim="paged_adamw_32bit" if self.device == "cuda" else "adamw_torch",
            fp16=(self.device == "cuda"),
            lr_scheduler_type="constant",
            remove_unused_columns=True,
            report_to="none"
        )

        from transformers import Trainer, DataCollatorForLanguageModeling
        trainer = Trainer(
            model=self.model,
            train_dataset=tokenized_dataset,
            args=training_args,
            data_collator=DataCollatorForLanguageModeling(self.tokenizer, mlm=False)
        )

        print("Starting training...")
        trainer.train()

        print(f"Training complete! Model saved to: {self.settings.output_dir}")
        trainer.model.save_pretrained(self.settings.output_dir)
        self.tokenizer.save_pretrained(self.settings.output_dir)
