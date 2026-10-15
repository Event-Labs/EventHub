import sys
import os

# Ensure the parent directory is in sys.path when running as a script directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from src.config.settings import settings
from src.data import (
    generate_chatbot_samples,
    generate_finance_samples,
    generate_review_samples,
    generate_content_samples
)

def main():
    settings.ensure_dirs()
    
    all_samples = []
    all_samples.extend(generate_chatbot_samples())
    all_samples.extend(generate_finance_samples())
    all_samples.extend(generate_review_samples())
    all_samples.extend(generate_content_samples())
    
    # Merge real-world customer conversations collected by backend
    collected_path = os.path.join(settings.data_dir, "collected_chat_logs.jsonl")
    if os.path.exists(collected_path):
        collected_count = 0
        with open(collected_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if "messages" in data and len(data["messages"]) >= 2:
                        all_samples.append({"messages": data["messages"]})
                        collected_count += 1
                except Exception as e:
                    pass
        print(f"Loaded {collected_count} real-world customer interaction samples from {collected_path}")

    print(f"Aggregating {len(all_samples)} total training samples...")
    
    with open(settings.dataset_path, 'w', encoding='utf-8') as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
            
    print(f"Dataset successfully built at: {settings.dataset_path}")

if __name__ == "__main__":
    main()
