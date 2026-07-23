---
title: Event Hub AI
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: "5.38.2"
python_version: "3.11"
app_file: app.py
pinned: false
---

# Event Hub AI

# AI Training Setup

Chạy các lệnh bắt buộc sau sau khi pull code.

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

## Tạo lại Dataset nếu cần

```bat
python generate_dataset.py
```

## Train LoRA

```bat
python train_lora.py
```

## Test Model

```bat
python test_model.py
```

## Chạy Local AI Service

```bat
uvicorn serve_model:app --host 127.0.0.1 --port 8001
```

## Lưu ý

`.venv/` và `outputs/` không được commit lên Git.