import argparse
import os
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

def merge_lora(
    base_model_name="Qwen/Qwen3-4B",
    lora_dir="./qwen3-event-extractor-2",
    output_dir="./merged_qwen3_extractor"
):
    print("=" * 60)
    print("EventHub AI - Merge LoRA Adapter into Base Model")
    print("=" * 60)
    print(f"Base model:  {base_model_name}")
    print(f"LoRA path:   {lora_dir}")
    print(f"Output path: {output_dir}")
    
    if not os.path.exists(lora_dir):
        print(f"Error: LoRA directory {lora_dir} not found!")
        sys.exit(1)

    print("1. Loading base model in FP16...")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True
    )
    tokenizer = AutoTokenizer.from_pretrained(lora_dir, trust_remote_code=True)

    print("2. Loading LoRA adapter weights...")
    model = PeftModel.from_pretrained(base_model, lora_dir)

    print("3. Merging weights (merge_and_unload)...")
    merged_model = model.merge_and_unload()

    print(f"4. Saving merged model to {output_dir}...")
    merged_model.save_pretrained(output_dir, safe_serialization=True)
    tokenizer.save_pretrained(output_dir)
    print("=" * 60)
    print("Success! Model weights merged successfully.")
    print("Next steps (Convert to GGUF FP16 -> Quantize Q4_K_M & Q8_0):")
    print(f"1) python llama.cpp/convert_hf_to_gguf.py {output_dir} --outtype f16 --outfile ./eventhub-extractor-v4-f16.gguf")
    print("2) ./llama.cpp/build/bin/llama-quantize ./eventhub-extractor-v4-f16.gguf ./eventhub-extractor-v4-Q4_K_M.gguf Q4_K_M")
    print("3) ./llama.cpp/build/bin/llama-quantize ./eventhub-extractor-v4-f16.gguf ./eventhub-extractor-v4-Q8_0.gguf Q8_0")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into Qwen3-4B base model.")
    parser.add_argument("--base-model", type=str, default="Qwen/Qwen3-4B", help="HuggingFace base model ID")
    parser.add_argument("--lora-dir", type=str, default="/content/drive/MyDrive/EventHub_AI/adapters/eventhub_qwen_v4", help="Path to trained LoRA adapter")
    parser.add_argument("--output-dir", type=str, default="./merged_qwen3_v4", help="Path to save merged FP16 HuggingFace model")
    args = parser.parse_args()
    merge_lora(base_model_name=args.base_model, lora_dir=args.lora_dir, output_dir=args.output_dir)
