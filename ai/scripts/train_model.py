import argparse
import os
import sys

# Ensure the parent directory is in sys.path when running as a script directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.settings import settings
from src.training.trainer import EventHubTrainer


def main():
    parser = argparse.ArgumentParser(description="EventHub AI QLoRA Trainer (SFT + DPO)")
    parser.add_argument("--stage", choices=["both", "sft", "dpo"], default="both", help="Giai đoạn huấn luyện")
    parser.add_argument("--max-seq-length", type=int, default=settings.max_seq_length, help="Độ dài context tối đa (>=4096)")
    args = parser.parse_args()

    settings.max_seq_length = args.max_seq_length
    print(f"Initializing EventHub AI Trainer with {settings.model_id} (stage={args.stage}, max_seq_length={settings.max_seq_length})...")
    trainer = EventHubTrainer(settings)

    try:
        if args.stage == "both":
            trainer.train(max_length=args.max_seq_length, run_dpo=True)
        elif args.stage == "sft":
            trainer.train(max_length=args.max_seq_length, run_dpo=False)
        else:
            trainer.train_dpo(max_length=args.max_seq_length)
    except Exception as e:
        print(f"Training failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
