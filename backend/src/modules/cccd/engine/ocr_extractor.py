"""
EventHub - Vietnam CCCD OCR Extractor
Uses VietOCR (VGG-Transformer) to perform accurate diacritic-aware Vietnamese text recognition
from standardized (1000x630) CCCD card regions.
"""

import re
import cv2
import numpy as np
from PIL import Image
from vietocr.tool.config import Cfg
from vietocr.tool.predictor import Predictor


class CCCDOCRExtractor:
    _instance = None
    _predictor = None

    def __init__(self):
        if CCCDOCRExtractor._predictor is None:
            # Initialize VietOCR with CPU config
            config = Cfg.load_config_from_name("vgg_transformer")
            config["device"] = "cpu"
            config["predictor"]["beamsearch"] = False
            CCCDOCRExtractor._predictor = Predictor(config)
        self.predictor = CCCDOCRExtractor._predictor

        # Standard field coordinate bounding boxes on a normalized 1000x630 card
        # Format: (ymin, ymax, xmin, xmax)
        self.regions = {
            "id_number": (260, 340, 330, 930),
            "full_name": (335, 415, 330, 950),
            "dob": (410, 465, 380, 750),
            "gender": (460, 515, 380, 580),
            "nationality": (460, 515, 680, 950),
            "origin": (505, 570, 330, 980),
            "residence": (560, 630, 330, 980),
        }

    def _crop_region(self, card_img: np.ndarray, bbox: tuple[int, int, int, int]) -> Image.Image:
        ymin, ymax, xmin, xmax = bbox
        h, w = card_img.shape[:2]

        # Clamp safely within boundaries
        ymin = max(0, min(ymin, h - 1))
        ymax = max(ymin + 1, min(ymax, h))
        xmin = max(0, min(xmin, w - 1))
        xmax = max(xmin + 1, min(xmax, w))

        crop = card_img[ymin:ymax, xmin:xmax]
        # Convert BGR to RGB for PIL
        if len(crop.shape) == 3:
            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        else:
            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(rgb_crop)

    def _clean_id_number(self, text: str) -> tuple[str, float]:
        """Extracts 12-digit citizen ID number."""
        if not text:
            return "", 0.0
        # Remove non-digits
        digits = re.sub(r"\D", "", text)
        if len(digits) == 12:
            return digits, 0.95
        # If OCR concatenated with labels (e.g. 079...):
        match = re.search(r"\b(\d{12})\b", text)
        if match:
            return match.group(1), 0.95
        # 12 digits inside longer string of numbers
        if len(digits) >= 12:
            return digits[:12], 0.70
        return digits, 0.30

    def _clean_name(self, text: str) -> tuple[str, float]:
        """Cleans and extracts full legal name in uppercase."""
        if not text:
            return "", 0.0
        cleaned = text.strip()
        # Remove common prefixes: "Họ và tên / Full name:", "Họ và tên:"
        cleaned = re.sub(r"^(họ\s*và\s*tên|full\s*name|họ\s*tên)[\s/:]*", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"^[:;.,\-_ ]+", "", cleaned)
        cleaned = cleaned.upper()
        if len(cleaned) >= 3 and any(c.isalpha() for c in cleaned):
            return cleaned, 0.90
        return cleaned, 0.40

    def _clean_dob(self, text: str) -> tuple[str, float]:
        """Extracts date of birth in DD/MM/YYYY format."""
        if not text:
            return "", 0.0
        # Look for DD/MM/YYYY or DD-MM-YYYY
        match = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
        if match:
            d, m, y = match.group(1).zfill(2), match.group(2).zfill(2), match.group(3)
            return f"{d}/{m}/{y}", 0.92
        digits = re.sub(r"\D", "", text)
        if len(digits) == 8:
            return f"{digits[:2]}/{digits[2:4]}/{digits[4:]}", 0.80
        return text.strip(), 0.35

    def _clean_gender(self, text: str) -> tuple[str, float]:
        """Extracts gender: Nam or Nữ."""
        lower = text.lower()
        if "nữ" in lower or "nu" in lower or "female" in lower:
            return "Nữ", 0.92
        if "nam" in lower or "male" in lower:
            return "Nam", 0.92
        return text.strip(), 0.30

    def _clean_nationality(self, text: str) -> tuple[str, float]:
        lower = text.lower()
        if "việt nam" in lower or "vietnam" in lower or "vn" in lower:
            return "Việt Nam", 0.95
        return "Việt Nam", 0.90

    def _clean_address(self, text: str, prefix_type: str = "origin") -> tuple[str, float]:
        """Cleans place of origin or residence address string."""
        if not text:
            return "", 0.0
        cleaned = text.strip()
        if prefix_type == "origin":
            cleaned = re.sub(r"^(quê\s*quán|place\s*of\s*origin)[\s/:]*", "", cleaned, flags=re.IGNORECASE).strip()
        else:
            cleaned = re.sub(r"^(nơi\s*thường\s*trú|place\s*of\s*residence)[\s/:]*", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"^[:;.,\-_ ]+", "", cleaned)
        if len(cleaned) >= 5:
            return cleaned, 0.85
        return cleaned, 0.40

    def extract_fields(self, card_img: np.ndarray) -> dict:
        """
        Runs VietOCR on each localized bounding box of the normalized card image.
        Returns a dictionary of extracted fields with raw output, cleaned text, and confidence.
        """
        results = {}

        for field_name, bbox in self.regions.items():
            crop_pil = self._crop_region(card_img, bbox)
            try:
                raw_pred = self.predictor.predict(crop_pil)
            except Exception:
                raw_pred = ""

            if field_name == "id_number":
                val, conf = self._clean_id_number(raw_pred)
            elif field_name == "full_name":
                val, conf = self._clean_name(raw_pred)
            elif field_name == "dob":
                val, conf = self._clean_dob(raw_pred)
            elif field_name == "gender":
                val, conf = self._clean_gender(raw_pred)
            elif field_name == "nationality":
                val, conf = self._clean_nationality(raw_pred)
            elif field_name == "origin":
                val, conf = self._clean_address(raw_pred, "origin")
            elif field_name == "residence":
                val, conf = self._clean_address(raw_pred, "residence")
            else:
                val, conf = raw_pred.strip(), 0.50

            results[field_name] = {
                "raw": raw_pred,
                "value": val,
                "confidence": round(conf, 2),
            }

        return results

