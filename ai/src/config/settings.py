import os
from dataclasses import dataclass

@dataclass
class ProjectSettings:
    """Configuration settings for the AI project."""
    
    # Model configs
    model_id: str = "Qwen/Qwen2.5-3B-Instruct"
    max_seq_length: int = 4096
    dpo_beta: float = 0.1
    
    # Paths
    base_dir: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir: str = os.path.join(base_dir, "datasets")
    dataset_path: str = os.path.join(data_dir, "dataset.jsonl")
    sft_events_dataset_path: str = os.path.join(data_dir, "sft_events_dataset.jsonl")
    dpo_dataset_path: str = os.path.join(data_dir, "dpo_override_dataset.jsonl")
    output_dir: str = os.path.join(base_dir, "checkpoints")
    dpo_output_dir: str = os.path.join(output_dir, "dpo_final")
    
    # LoRA configs
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list = None
    
    def __post_init__(self):
        if self.target_modules is None:
            self.target_modules = [
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj",
            ]
            
    def ensure_dirs(self):
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.dpo_output_dir, exist_ok=True)

settings = ProjectSettings()
