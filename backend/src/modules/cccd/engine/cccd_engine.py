"""
EventHub - Vietnam CCCD Processing Pipeline CLI
Main entry point invoked by Node.js backend to analyze CCCD images.
Outputs structured JSON to stdout.
"""

import sys
import os
import json
import cv2
import numpy as np

# Force UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Ensure local module directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from cv_preprocessor import CVPreprocessor
from qr_decoder import CCCDQRDecoder
from ocr_extractor import CCCDOCRExtractor
from cross_validator import CCCDCrossValidator


def process_cccd(image_path: str) -> dict:
    if not os.path.exists(image_path):
        return {
            "success": False,
            "stage": "FILE_READ",
            "error": f"Tệp ảnh không tồn tại: {image_path}",
        }

    # Read image (handles UTF-8 paths in Windows correctly via numpy fromfile)
    try:
        img_array = np.fromfile(image_path, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    except Exception as e:
        img = None

    if img is None:
        return {
            "success": False,
            "stage": "IMAGE_DECODE",
            "error": "Không thể giải mã tệp ảnh. Định dạng không hợp lệ hoặc tệp bị hỏng.",
        }

    # Initialize components
    preprocessor = CVPreprocessor()
    qr_decoder = CCCDQRDecoder()
    cross_validator = CCCDCrossValidator()

    # Stage 1: Quality Assessment
    quality = preprocessor.assess_quality(img)
    if not quality["is_valid"]:
        return {
            "success": False,
            "stage": "QUALITY_CHECK",
            "quality": quality,
            "error": "Chất lượng ảnh không đạt tiêu chuẩn đối soát CCCD.",
            "guidance": quality["guidance"],
        }

    # Stage 2: Card Detection & Perspective Rectification
    warped_card, card_detected = preprocessor.detect_and_warp(img)

    # Stage 3: Contrast & Lighting Enhancement (CLAHE)
    enhanced_card = preprocessor.enhance_contrast(warped_card)

    # Stage 4: QR Decoding (try enhanced card, fallback to raw warped, then original)
    qr_result = qr_decoder.decode(enhanced_card)
    if not qr_result["found"]:
        qr_result = qr_decoder.decode(warped_card)
    if not qr_result["found"]:
        qr_result = qr_decoder.decode(img)

    # Stage 5: OCR Extraction
    # OCR is loaded lazily
    ocr_extractor = CCCDOCRExtractor()
    ocr_result = ocr_extractor.extract_fields(enhanced_card)

    # Stage 6: Cross-Referencing & C06 Structure Validation
    verification = cross_validator.cross_reference(
        ocr_result,
        qr_result["data"] if qr_result["found"] else None,
    )

    return {
        "success": True,
        "stage": "COMPLETED",
        "quality": quality,
        "card_detected": card_detected,
        "qr_found": qr_result["found"],
        "qr_scan_method": qr_result.get("scan_method"),
        "qr_data": qr_result.get("data"),
        "ocr_fields": {k: v["value"] for k, v in ocr_result.items()},
        "verification": verification,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python cccd_engine.py <image_path>"
        }, ensure_ascii=False))
        sys.exit(1)

    image_path = sys.argv[1]
    result = process_cccd(image_path)
    # Output single-line or pretty JSON to stdout
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
