# EventHub AI Training Pipeline

This folder contains the complete AI training pipeline and Python package architecture for EventHub's local AI agent.

## Architecture

The project follows a standard scalable Python package architecture:
- `src/config/`: Configuration settings (Model ID, directories, LoRA settings).
- `src/data/`: Data generators modularized per feature (Chatbot, Finance, Review, Content).
- `src/training/`: Training modules (SFTTrainer wrappers).
- `scripts/`: Executable entry points.
- `datasets/`: Storage for JSONL datasets.

## Prerequisites

1. Install dependencies:
```bash
pip install -e .
```
*(Or `pip install -r requirements.txt`)*

2. CUDA-compatible GPU (Recommended) or use Google Colab.

## Workflow

### 1. Build the Dataset
Generate the `datasets/dataset.jsonl` from the data modules.
```bash
python -m scripts.build_dataset
```

### 2. Fine-tune the Model
Start the LoRA fine-tuning process. The configuration will automatically detect if a GPU is available.
```bash
python -m scripts.train_model
```

### 3. Deploy to Ollama (Local Server)
After getting the GGUF model (`eventhub-qwen3-4b.gguf`), place it in the root of this folder and run:
```powershell
.\export_to_ollama.ps1
```

*(Note: See `colab_instructions.md` for running on Google Colab).*

---

## 🚀 Hướng dẫn cho Team Members (Sau khi Pull code về)

Vì file mô hình AI (`eventhub-qwen3-4b.gguf`) nặng tới 6.2GB nên nó **không được đẩy lên Git**. Để chạy được AI trên máy cá nhân, các thành viên trong team chỉ cần làm đúng 3 bước:

**Bước 1: Cài đặt phần mềm chạy AI (Ollama)**
- Tải và cài đặt Ollama tại: [https://ollama.com/download](https://ollama.com/download)

**Bước 2: Lấy bộ não AI (File GGUF)**
- Xin người train mô hình (chủ dự án) link Google Drive để tải file `eventhub-qwen3-4b.gguf`.
- Tải về xong, chép file đó vào đúng thư mục `EventHub/ai/`.

**Bước 3: Gắn não vào hệ thống**
- Mở Terminal tại thư mục `EventHub/ai/` và chạy lệnh sau để nạp mô hình:
  ```bash
  ollama create eventhub-qwen3 -f Modelfile
  ```
- Sau khi nạp xong (báo success), test thử bằng lệnh:
  ```bash
  ollama run eventhub-qwen3
  ```
Lúc này API nội bộ của AI đã mở tại `http://localhost:11434/api/chat`, các bạn làm Backend có thể gọi thẳng vào API này để dùng!
