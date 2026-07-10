# AI Training Setup

Chay cac lenh bat buoc sau sau khi pull code.

## Windows CMD

```bat
cd ai-training
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python -c "import torch; print('torch:', torch.__version__); print('cuda:', torch.cuda.is_available())"
python -c "import json; from pathlib import Path; lines=Path('data/financial_summary_train.jsonl').read_text(encoding='utf-8').splitlines(); [json.loads(line) for line in lines]; print('JSON OK:', len(lines), 'samples')"
```

## Tao Lai Dataset Neu Can

```bat
python generate_dataset.py
python generate_chat_dataset.py
```

## Train LoRA

```bat
python train_lora.py
python train_chat_lora.py
```

## Test Model

```bat
python test_model.py
```

## Chay Local AI Service

```bat
uvicorn serve_model:app --host 127.0.0.1 --port 8001
```

## Test AI Chatbox Local

```bat
curl -X POST http://127.0.0.1:8001/generate-chat-answer -H "Content-Type: application/json" -d "{\"prompt\":\"Hãy trả lời JSON: Tôi có thể hỏi gì trên EventHub?\"}"
```

## Backend Ket Noi Chatbox Local

```bat
set EVENTHUB_AI_URL=http://127.0.0.1:8001
```

## Luu Y

`.venv/` va `outputs/` khong duoc commit len Git.
