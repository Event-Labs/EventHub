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

    print("1. Loading base model...")
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
    merged_model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print("=" * 60)
    print("Success! Model weights merged successfully.")
    print("Next step: Convert to GGUF using llama.cpp:")
    print("python llama.cpp/convert_hf_to_gguf.py ./merged_qwen3_extractor --outtype q8_0 --outfile ./qwen3-event-extractor-2.gguf")
    print("Then import to Ollama:")
    print("ollama create qwen3-event-extractor-2 -f Modelfile.extractor")
    print("=" * 60)

if __name__ == "__main__":
    merge_lora()
