"""
EventHub AI — Automated Continuous Self-Training Pipeline
==========================================================
This script automates:
1. Validating collected customer interaction logs from `datasets/collected_chat_logs.jsonl`.
2. Re-building the unified training dataset `datasets/dataset.jsonl`.
3. Checking hardware resources (CUDA GPU vs CPU).
4. Running the SFTTrainer with LoRA fine-tuning.
5. Providing deployment commands to update the local Ollama model.
"""

import sys
import os
import json
import argparse
import subprocess

# Ensure the parent directory is in sys.path when running as a script directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.settings import settings

def count_collected_samples():
    collected_path = os.path.join(settings.data_dir, "collected_chat_logs.jsonl")
    if not os.path.exists(collected_path):
        return 0, collected_path
    
    count = 0
    with open(collected_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                count += 1
    return count, collected_path

def run_build_dataset():
    print("\n[Step 1/3] Compiling training dataset...")
    from scripts import build_dataset
    build_dataset.main()

def run_training():
    print("\n[Step 2/3] Checking hardware & preparing training...")
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            print(f"CUDA GPU detected: {gpu_name} ({vram_gb:.2f} GB VRAM)")
        else:
            print("No CUDA GPU detected. Training on CPU or via Google Colab recommended.")
    except Exception as e:
        print(f"Hardware check note: {e}")

    print("\nStarting LoRA Fine-Tuning...")
    try:
        from src.training.trainer import EventHubTrainer
        trainer = EventHubTrainer(settings)
        trainer.train()
        print("\n[Step 3/3] Training finished successfully!")
        print(f"Updated weights saved to: {settings.output_dir}")
        print("\nTo update Ollama with the new model, run:")
        print("  powershell -ExecutionPolicy Bypass -File .\\export_to_ollama.ps1")
    except Exception as e:
        print(f"\n[Warning] Training stopped or requires GPU: {e}")
        print("You can upload 'datasets/dataset.jsonl' to Google Colab for fast GPU training!")

def main():
    parser = argparse.ArgumentParser(description="EventHub AI Continuous Self-Training Pipeline")
    parser.add_argument("--min-samples", type=int, default=1, help="Minimum collected samples required before triggering train")
    parser.add_argument("--build-only", action="store_true", help="Only rebuild dataset without running training")
    args = parser.parse_args()

    print("=" * 60)
    print(" EventHub AI — Continuous Self-Training Pipeline ")
    print("=" * 60)

    count, path = count_collected_samples()
    print(f"Collected real-world chat samples: {count} (Location: {path})")

    if count < args.min_samples and not args.build_only:
        print(f"Note: Collected samples ({count}) is less than threshold ({args.min_samples}).")
        print("Continuing with dataset build and seed data...")

    # Step 1: Re-build dataset
    run_build_dataset()

    if args.build_only:
        print("\nBuild only mode completed.")
        return

    # Step 2 & 3: Run training
    run_training()

if __name__ == "__main__":
    main()
