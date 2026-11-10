"""
EventHub - Vietnam CCCD QR Code Decoder
Extracts and parses standard Ministry of Public Security (BCA C06) QR codes from CCCD chip cards.
Schema: ID_NUMBER|OLD_CMND|FULL_NAME|DOB(DDMMYYYY)|GENDER|ADDRESS|ISSUE_DATE(DDMMYYYY)
"""

import cv2
import numpy as np
import zxingcpp
import re
from datetime import datetime


class CCCDQRDecoder:
    def __init__(self):
        pass

    def _format_date(self, raw_str: str) -> str:
        """Converts DDMMYYYY to DD/MM/YYYY or returns raw if format differs."""
        if not raw_str:
            return ""
        clean = re.sub(r"\D", "", raw_str)
        if len(clean) == 8:
            day = clean[:2]
            month = clean[2:4]
            year = clean[4:]
            try:
                datetime(int(year), int(month), int(day))
                return f"{day}/{month}/{year}"
            except ValueError:
                return f"{day}/{month}/{year}"
        return raw_str

    def parse_qr_text(self, text: str) -> dict | None:
        """
        Parses Vietnam BCA C06 delimited QR payload.
        Standard: ID_NUMBER|OLD_CMND|FULL_NAME|DOB(DDMMYYYY)|GENDER|ADDRESS|ISSUE_DATE(DDMMYYYY)
        """
        if not text:
            return None

        clean_text = text.strip()
        parts = clean_text.split("|")

        if len(parts) >= 6:
            # 7 parts standard:
            # [0] = 12-digit ID
            # [1] = Old 9-digit CMND (can be empty)
            # [2] = Full Name
            # [3] = DOB (DDMMYYYY)
            # [4] = Gender
            # [5] = Permanent Address
            # [6] = Issue Date (DDMMYYYY) (optional in some versions)
            id_number = parts[0].strip()
            old_id = parts[1].strip() if len(parts) > 1 else ""
            full_name = parts[2].strip().upper() if len(parts) > 2 else ""
            raw_dob = parts[3].strip() if len(parts) > 3 else ""
            gender = parts[4].strip() if len(parts) > 4 else ""
            address = parts[5].strip() if len(parts) > 5 else ""
            raw_issue_date = parts[6].strip() if len(parts) > 6 else ""

            # Check if 12-digit ID matches pattern
            if re.match(r"^\d{12}$", id_number):
                return {
                    "raw_payload": clean_text,
                    "id_number": id_number,
                    "old_id_number": old_id or None,
                    "full_name": full_name,
                    "dob": self._format_date(raw_dob),
                    "gender": "Nam" if "nam" in gender.lower() else "Nữ" if "nữ" in gender.lower() or "nu" in gender.lower() else gender,
                    "address": address,
                    "issue_date": self._format_date(raw_issue_date) if raw_issue_date else None,
                    "is_valid_c06": True,
                }

        # Fallback regex for non-standard formats containing 12-digit number
        id_match = re.search(r"\b(\d{12})\b", clean_text)
        if id_match:
            return {
                "raw_payload": clean_text,
                "id_number": id_match.group(1),
                "old_id_number": None,
                "full_name": "",
                "dob": "",
                "gender": "",
                "address": "",
                "issue_date": None,
                "is_valid_c06": False,
            }

        return None

    def decode(self, image: np.ndarray) -> dict:
        """
        Attempts to locate and decode CCCD QR code across multiple regions & visual enhancements.
        """
        result = {
            "found": False,
            "data": None,
            "scan_method": None,
        }

        h, w = image.shape[:2]

        # Candidates to try:
        # 1. Full image
        # 2. Top-right quadrant crop (where C06 QR code is standardized)
        candidates = [("FULL_IMAGE", image)]

        if w >= 300 and h >= 200:
            # Crop top-right zone: x in [0.55 * w, w], y in [0.02 * h, 0.48 * h]
            qr_crop = image[int(h * 0.02):int(h * 0.48), int(w * 0.55):w]
            candidates.append(("TOP_RIGHT_QUADRANT", qr_crop))

        for method_label, candidate_img in candidates:
            # 1. Try directly with zxingcpp
            barcode = zxingcpp.read_barcode(candidate_img, zxingcpp.BarcodeFormat.QRCode)
            if barcode and barcode.valid and barcode.text:
                parsed = self.parse_qr_text(barcode.text)
                if parsed:
                    result["found"] = True
                    result["data"] = parsed
                    result["scan_method"] = method_label
                    return result

            # 2. Try with grayscale + 2x resize for small QR codes
            gray = cv2.cvtColor(candidate_img, cv2.COLOR_BGR2GRAY) if len(candidate_img.shape) == 3 else candidate_img
            scaled = cv2.resize(gray, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            barcode = zxingcpp.read_barcode(scaled, zxingcpp.BarcodeFormat.QRCode)
            if barcode and barcode.valid and barcode.text:
                parsed = self.parse_qr_text(barcode.text)
                if parsed:
                    result["found"] = True
                    result["data"] = parsed
                    result["scan_method"] = f"{method_label}_SCALED"
                    return result

            # 3. Try Otsu adaptive threshold
            _, thresh = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
            barcode = zxingcpp.read_barcode(thresh, zxingcpp.BarcodeFormat.QRCode)
            if barcode and barcode.valid and barcode.text:
                parsed = self.parse_qr_text(barcode.text)
                if parsed:
                    result["found"] = True
                    result["data"] = parsed
                    result["scan_method"] = f"{method_label}_OTSU"
                    return result

        return result
