"""
EventHub AI Service (FastAPI) — Seat Map YOLO11 Detection & Reconstruction.
Located at EventHub/ai/main.py.
Loads ai/models/seatmap_yolo_best.pt and serves /api/seatmap/predict on port 8001.
"""

import os
import time
from pathlib import Path
from typing import Any, Dict
import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

from src.seatmap.reconstructor import reconstruct_seatmap_from_yolo

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
AI_PROFILE = os.environ.get("AI_PROFILE", "development").strip().lower()


def _resolve_default_model_path() -> Path:
    explicit = os.environ.get("SEATMAP_MODEL_PATH", "").strip()
    if explicit:
        return Path(explicit)
    if AI_PROFILE == "production":
        candidates = [
            MODELS_DIR / "seatmap_yolo11s.pt",
            MODELS_DIR / "seatmap_yolo11n.pt",
            MODELS_DIR / "seatmap_yolo_best.pt",
        ]
    else:
        candidates = [
            MODELS_DIR / "seatmap_yolo11s.pt",
            MODELS_DIR / "seatmap_yolo11n.pt",
            MODELS_DIR / "seatmap_yolo_best.pt",
        ]
    for p in candidates:
        if p.exists():
            return p
    return MODELS_DIR / "seatmap_yolo_best.pt"


MODEL_PATH = _resolve_default_model_path()
DEFAULT_IMGSZ = int(os.environ.get("SEATMAP_IMGSZ", "1024"))

app = FastAPI(
    title="EventHub Unified AI Service",
    description="YOLO11 Seat Map Object Detection & Reconstruction API for EventHub",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model: YOLO | None = None


def get_model() -> YOLO:
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model file not found at {MODEL_PATH}")
        model = YOLO(str(MODEL_PATH))
    return model


@app.on_event("startup")
def on_startup() -> None:
    if MODEL_PATH.exists():
        get_model()


@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "eventhub-seatmap-ai",
        "profile": AI_PROFILE,
        "imgsz": DEFAULT_IMGSZ,
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
    }


@app.post("/api/seatmap/predict")
async def predict_seatmap(
    file: UploadFile = File(...),
    conf: float = 0.18,
    iou: float = 0.38,
) -> Dict[str, Any]:
    """
    Accept a seat map image (PNG/JPG/WEBP), run YOLO11 detection,
    and reconstruct the full EventHub SeatMapEditor structure.
    """
    t0 = time.perf_counter()
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="File ảnh rỗng hoặc không hợp lệ.")

    nparr = np.frombuffer(contents, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Không thể giải mã định dạng file ảnh.")

    yolo_model = get_model()
    reconstructed = reconstruct_seatmap_from_yolo(
        image_bgr,
        yolo_model,
        imgsz=DEFAULT_IMGSZ,
        conf=conf,
        iou=iou,
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    reconstructed["detectionSummary"]["inferenceTimeMs"] = elapsed_ms

    if reconstructed.get("isValidSeatMap") is False:
        raise HTTPException(
            status_code=422,
            detail=reconstructed.get("invalidReason")
            or "Hình ảnh tải lên không phải là sơ đồ ghế hoặc sơ đồ sân khấu hợp lệ.",
        )

    return {
        "success": True,
        "message": "Đã phân tích và tái tạo sơ đồ ghế bằng AI thành công.",
        "data": reconstructed,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)

