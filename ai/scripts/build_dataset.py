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
    
    print(f"Aggregating {len(all_samples)} training samples...")
    
    with open(settings.dataset_path, 'w', encoding='utf-8') as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
            
    print(f"Dataset successfully built at: {settings.dataset_path}")

if __name__ == "__main__":
    main()
