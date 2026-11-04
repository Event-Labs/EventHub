"""
EventHub - Vietnam CCCD Data Validation & Cross-Referencer
Implements Ministry of Public Security (BCA C06) 12-digit rules,
character-level cross-referencing between OCR and QR,
and computes structured confidence scores.
"""

import re
from datetime import datetime

CCCD_PROVINCES = {
    "001": "Hà Nội",
    "002": "Hà Giang",
    "004": "Cao Bằng",
    "006": "Bắc Kạn",
    "008": "Tuyên Quang",
    "010": "Lào Cai",
    "011": "Điện Biên",
    "012": "Lai Châu",
    "014": "Sơn La",
    "015": "Yên Bái",
    "017": "Hòa Bình",
    "019": "Thái Nguyên",
    "020": "Lạng Sơn",
    "022": "Quảng Ninh",
    "024": "Bắc Giang",
    "025": "Phú Thọ",
    "026": "Vĩnh Phúc",
    "027": "Bắc Ninh",
    "030": "Hải Dương",
    "031": "Hải Phòng",
    "033": "Hưng Yên",
    "034": "Thái Bình",
    "035": "Hà Nam",
    "036": "Nam Định",
    "037": "Ninh Bình",
    "038": "Thanh Hóa",
    "040": "Nghệ An",
    "042": "Hà Tĩnh",
    "044": "Quảng Bình",
    "045": "Quảng Trị",
    "046": "Thừa Thiên Huế",
    "048": "Đà Nẵng",
    "049": "Quảng Nam",
    "051": "Quảng Ngãi",
    "052": "Bình Định",
    "054": "Phú Yên",
    "056": "Khánh Hòa",
    "058": "Ninh Thuận",
    "060": "Bình Thuận",
    "062": "Kon Tum",
    "064": "Gia Lai",
    "066": "Đắk Lắk",
    "067": "Đắk Nông",
    "068": "Lâm Đồng",
    "070": "Bình Phước",
    "072": "Tây Ninh",
    "074": "Bình Dương",
    "075": "Đồng Nai",
    "077": "Bà Rịa - Vũng Tàu",
    "079": "TP. Hồ Chí Minh",
    "080": "Long An",
    "082": "Tiền Giang",
    "083": "Bến Tre",
    "084": "Trà Vinh",
    "086": "Vĩnh Long",
    "087": "Đồng Tháp",
    "089": "An Giang",
    "091": "Kiên Giang",
    "092": "Cần Thơ",
    "093": "Hậu Giang",
    "094": "Sóc Trăng",
    "095": "Bạc Liêu",
    "096": "Cà Mau",
}


class CCCDCrossValidator:
    def __init__(self):
        pass

    def validate_c06_structure(self, id_number: str, dob: str = "", gender: str = "") -> dict:
        """
        Validates the 12-digit citizen identification code according to BCA C06 rules.
        """
        result = {
            "is_valid": False,
            "province_code": "",
            "province_name": "",
            "gender": "",
            "birth_year": None,
            "errors": [],
        }

        if not id_number or not re.match(r"^\d{12}$", id_number):
            result["errors"].append("Số CCCD phải bao gồm đúng 12 chữ số theo quy chuẩn Bộ Công An.")
            return result

        # 1. First 3 digits: Province Code
        province_code = id_number[:3]
        if province_code not in CCCD_PROVINCES:
            result["errors"].append(f"Mã tỉnh '{province_code}' không thuộc danh mục 63 tỉnh/thành C06.")
        else:
            result["province_code"] = province_code
            result["province_name"] = CCCD_PROVINCES[province_code]

        # 2. 4th digit: Century & Gender
        gender_digit = int(id_number[3])
        # Century mapping:
        # 0: Male 20th C (19xx), 1: Female 20th C (19xx)
        # 2: Male 21st C (20xx), 3: Female 21st C (20xx)
        # 4: Male 22nd C (21xx), 5: Female 22nd C (21xx)
        # 6: Male 23rd C (22xx), 7: Female 23rd C (22xx)
        # 8: Male 24th C (23xx), 9: Female 24th C (23xx)
        century_map = {
            0: (1900, "Nam"), 1: (1900, "Nữ"),
            2: (2000, "Nam"), 3: (2000, "Nữ"),
            4: (2100, "Nam"), 5: (2100, "Nữ"),
            6: (2200, "Nam"), 7: (2200, "Nữ"),
            8: (2300, "Nam"), 9: (2300, "Nữ"),
        }
        century_base, cccd_gender = century_map.get(gender_digit, (None, None))
        if century_base is None:
            result["errors"].append(f"Chữ số giới tính/thế kỷ '{gender_digit}' không hợp lệ.")
        else:
            result["gender"] = cccd_gender

        # 3. 5th & 6th digits: Birth Year Suffix
        year_suffix = int(id_number[4:6])
        if century_base is not None:
            calc_birth_year = century_base + year_suffix
            result["birth_year"] = calc_birth_year

            current_year = datetime.now().year
            if calc_birth_year > current_year:
                result["errors"].append(f"Năm sinh trích xuất từ CCCD ({calc_birth_year}) ở tương lai.")
            elif calc_birth_year < 1900:
                result["errors"].append(f"Năm sinh trích xuất từ CCCD ({calc_birth_year}) không hợp lệ.")

            # Cross-check with provided DOB if available
            if dob:
                year_match = re.search(r"\b(\d{4})\b", dob)
                if year_match:
                    dob_year = int(year_match.group(1))
                    if dob_year != calc_birth_year:
                        result["errors"].append(f"Năm sinh khai báo/trích xuất ({dob_year}) không khớp với số CCCD ({calc_birth_year}).")

        # 4. Check Gender Consistency
        if gender and cccd_gender:
            norm_g = "Nam" if "nam" in gender.lower() else "Nữ" if "nữ" in gender.lower() or "nu" in gender.lower() else gender
            if norm_g != cccd_gender:
                result["errors"].append(f"Giới tính ({norm_g}) không khớp với ký tự giới tính CCCD ({cccd_gender}).")

        # 5. Last 6 digits: Random sequential number
        random_part = id_number[6:]
        if random_part == "000000":
            result["errors"].append("Dãy 6 số cuối không hợp lệ (Bộ Công An bắt đầu từ 000001).")

        result["is_valid"] = len(result["errors"]) == 0
        return result

    def cross_reference(self, ocr_data: dict, qr_data: dict | None) -> dict:
        """
        Cross-checks OCR results with QR decoded data (if present)
        and performs C06 validation.
        Produces field-by-field verification status and confidence.
        """
        has_qr = qr_data is not None and qr_data.get("is_valid_c06", False)

        fields = {}
        mismatches = []
        warnings = []

        # Target fields to synthesize:
        # id_number, full_name, dob, gender, nationality, origin, residence
        qr_fields = qr_data or {}

        # 1. ID NUMBER
        ocr_id = ocr_data.get("id_number", {}).get("value", "")
        ocr_id_conf = ocr_data.get("id_number", {}).get("confidence", 0.0)

        if has_qr and qr_fields.get("id_number"):
            qr_id = qr_fields["id_number"]
            if ocr_id and ocr_id == qr_id:
                final_id = qr_id
                id_status = "MATCHED"
                id_conf = 1.0
                id_source = "QR_AND_OCR"
            elif ocr_id and ocr_id != qr_id:
                final_id = qr_id  # QR code is tamper-resistant cryptographically
                id_status = "MISMATCH"
                id_conf = 0.85
                id_source = "QR_OVERRIDE"
                mismatches.append(f"Số CCCD từ OCR ({ocr_id}) không khớp với mã QR ({qr_id}). Ưu tiên mã QR.")
            else:
                final_id = qr_id
                id_status = "QR_DECODED"
                id_conf = 0.99
                id_source = "QR"
        else:
            final_id = ocr_id
            id_status = "OCR_ONLY" if final_id else "EMPTY"
            id_conf = ocr_id_conf
            id_source = "OCR"

        # 2. FULL NAME
        ocr_name = ocr_data.get("full_name", {}).get("value", "")
        ocr_name_conf = ocr_data.get("full_name", {}).get("confidence", 0.0)

        if has_qr and qr_fields.get("full_name"):
            qr_name = qr_fields["full_name"].upper()
            if ocr_name and (ocr_name == qr_name or ocr_name in qr_name or qr_name in ocr_name):
                final_name = qr_name
                name_status = "MATCHED"
                name_conf = 1.0
                name_source = "QR_AND_OCR"
            elif ocr_name:
                final_name = qr_name
                name_status = "MISMATCH"
                name_conf = 0.90
                name_source = "QR_OVERRIDE"
                warnings.append(f"Họ tên OCR ({ocr_name}) sai lệch chữ dấu với QR ({qr_name}).")
            else:
                final_name = qr_name
                name_status = "QR_DECODED"
                name_conf = 0.98
                name_source = "QR"
        else:
            final_name = ocr_name
            name_status = "OCR_ONLY" if final_name else "EMPTY"
            name_conf = ocr_name_conf
            name_source = "OCR"

        # 3. DATE OF BIRTH
        ocr_dob = ocr_data.get("dob", {}).get("value", "")
        ocr_dob_conf = ocr_data.get("dob", {}).get("confidence", 0.0)

        if has_qr and qr_fields.get("dob"):
            qr_dob = qr_fields["dob"]
            if ocr_dob and ocr_dob == qr_dob:
                final_dob = qr_dob
                dob_status = "MATCHED"
                dob_conf = 1.0
                dob_source = "QR_AND_OCR"
            else:
                final_dob = qr_dob
                dob_status = "QR_DECODED"
                dob_conf = 0.98
                dob_source = "QR"
        else:
            final_dob = ocr_dob
            dob_status = "OCR_ONLY" if final_dob else "EMPTY"
            dob_conf = ocr_dob_conf
            dob_source = "OCR"

        # 4. GENDER
        ocr_gender = ocr_data.get("gender", {}).get("value", "")
        ocr_gender_conf = ocr_data.get("gender", {}).get("confidence", 0.0)

        if has_qr and qr_fields.get("gender"):
            qr_gender = qr_fields["gender"]
            final_gender = qr_gender
            gender_status = "MATCHED" if ocr_gender == qr_gender else "QR_DECODED"
            gender_conf = 1.0
            gender_source = "QR"
        else:
            final_gender = ocr_gender
            gender_status = "OCR_ONLY" if final_gender else "EMPTY"
            gender_conf = ocr_gender_conf
            gender_source = "OCR"

        # 5. NATIONALITY
        final_nationality = ocr_data.get("nationality", {}).get("value", "Việt Nam") or "Việt Nam"

        # 6. ADDRESS (RESIDENCE) & ORIGIN
        ocr_residence = ocr_data.get("residence", {}).get("value", "")
        ocr_origin = ocr_data.get("origin", {}).get("value", "")

        if has_qr and qr_fields.get("address"):
            final_residence = qr_fields["address"]
            residence_status = "QR_DECODED"
            residence_conf = 0.98
            residence_source = "QR"
        else:
            final_residence = ocr_residence
            residence_status = "OCR_ONLY" if final_residence else "EMPTY"
            residence_conf = ocr_data.get("residence", {}).get("confidence", 0.0)
            residence_source = "OCR"

        final_origin = ocr_origin or final_residence

        # Perform C06 structural validation on the synthesized ID
        c06_check = self.validate_c06_structure(final_id, final_dob, final_gender)

        # Assemble field definitions
        fields = {
            "id_number": {
                "value": final_id,
                "status": id_status,
                "confidence": id_conf,
                "source": id_source,
                "ocr_raw": ocr_id,
                "qr_raw": qr_fields.get("id_number"),
            },
            "full_name": {
                "value": final_name,
                "status": name_status,
                "confidence": name_conf,
                "source": name_source,
                "ocr_raw": ocr_name,
                "qr_raw": qr_fields.get("full_name"),
            },
            "dob": {
                "value": final_dob,
                "status": dob_status,
                "confidence": dob_conf,
                "source": dob_source,
                "ocr_raw": ocr_dob,
                "qr_raw": qr_fields.get("dob"),
            },
            "gender": {
                "value": final_gender,
                "status": gender_status,
                "confidence": gender_conf,
                "source": gender_source,
                "ocr_raw": ocr_gender,
                "qr_raw": qr_fields.get("gender"),
            },
            "nationality": {
                "value": final_nationality,
                "status": "VALIDATED",
                "confidence": 0.95,
                "source": "OCR",
            },
            "origin": {
                "value": final_origin,
                "status": "OCR_ONLY" if final_origin else "EMPTY",
                "confidence": 0.85 if final_origin else 0.0,
                "source": "OCR",
            },
            "residence": {
                "value": final_residence,
                "status": residence_status,
                "confidence": residence_conf,
                "source": residence_source,
            },
        }

        # Overall confidence: weighted calculation
        weights = {"id_number": 0.35, "full_name": 0.30, "dob": 0.15, "gender": 0.10, "residence": 0.10}
        overall_conf = sum(fields[k]["confidence"] * weights[k] for k in weights if k in fields)

        if not c06_check["is_valid"]:
            warnings.extend(c06_check["errors"])
            overall_conf *= 0.7  # Penalize invalid C06 structure

        is_trustworthy = (
            c06_check["is_valid"]
            and overall_conf >= 0.75
            and bool(final_id)
            and bool(final_name)
        )

        return {
            "is_trustworthy": is_trustworthy,
            "overall_confidence": round(overall_conf, 2),
            "c06_validation": c06_check,
            "has_qr_cross_check": has_qr,
            "fields": fields,
            "mismatches": mismatches,
            "warnings": warnings,
        }

