# EventHub AI Training Pipeline & Unified AI Service

This folder contains the complete AI training pipeline, Ollama GGUF models, and the **FastAPI Seat Map YOLO11 Service** for EventHub.

## Architecture

The project follows a standard scalable Python package architecture:
- `main.py`: FastAPI Unified AI Server (port `8001`) serving `/api/seatmap/predict` and `/health`.
- `models/seatmap_yolo_best.pt`: Trained YOLO11 weights (`5.59 MB`) for Seat Map Object Detection.
- `src/seatmap/reconstructor.py`: Post-processing engine that converts YOLO detections into EventHub `SeatMapEditor` JSON.
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

### 4. Start Seat Map AI Service (FastAPI + YOLO11 on Port 8001)
From the `EventHub/ai/` directory, run:
```powershell
.\start_seatmap_ai.ps1
```
Or directly with Uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```
- **Health Check**: `http://localhost:8001/health`
- **Swagger UI**: `http://localhost:8001/docs`
- **Predict Endpoint**: `POST http://localhost:8001/api/seatmap/predict`

---

## Hướng dẫn cho Team Members

**Bước 1: Cài đặt phần mềm chạy AI (Ollama)**
- Tải và cài đặt Ollama tại: [https://ollama.com/download](https://ollama.com/download)

**Bước 2: Lấy bộ não AI (File GGUF)**
- Tải file model tại: https://drive.google.com/file/d/1ooapIamcWThRdXlM9gnWpzQ_6uLV9TPy/view?usp=sharing
- Đặt file đó vào thư mục `EventHub/ai/`.

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

**Bước 4: Chạy AI Tạo Sơ Đồ Ghế (FastAPI Seatmap AI)**
- Trọng số model đã có sẵn tại `EventHub/ai/models/seatmap_yolo_best.pt`.
- Mở Terminal tại `EventHub/ai/` và chạy:
  ```powershell
  .\start_seatmap_ai.ps1
  ```
- Dịch vụ sẽ chạy tại `http://localhost:8001` (khớp với `AI_SERVICE_URL=http://localhost:8001` trong `backend/.env`).
- 📘 Hướng dẫn chi tiết (cài đặt, API, xử lý lỗi): xem [README_SEATMAP.md](./README_SEATMAP.md).
