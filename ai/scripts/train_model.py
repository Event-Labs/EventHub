import sys
import os

# Ensure the parent directory is in sys.path when running as a script directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.settings import settings
from src.training.trainer import EventHubTrainer

def main():
    print(f"Initializing EventHub AI Trainer with {settings.model_id}...")
    trainer = EventHubTrainer(settings)
    
    try:
        trainer.train()
    except Exception as e:
        print(f"Training failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
