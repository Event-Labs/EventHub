"""
Unit & Integration Test Suite for EventHub CCCD Pipeline
Tests quality rejection, card rectification, QR decoding, OCR extraction, and C06 validation.
"""

import os
import sys
import cv2
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from cv_preprocessor import CVPreprocessor
from qr_decoder import CCCDQRDecoder
from cross_validator import CCCDCrossValidator
from cccd_engine import process_cccd


def create_mock_cccd_image(output_path: str, id_number="079099012345", name="NGUYEN VAN AN", dob="15/05/1999", gender="Nam", address="Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh", include_qr=True):
    """Generates a synthetic CCCD image with or without a QR code."""
    # 1000 x 630 card
    card = np.ones((630, 1000, 3), dtype=np.uint8) * 240
    # Add subtle blue-green gradient background resembling CCCD
    for y in range(630):
        color = [230 - int(y * 0.05), 245 - int(y * 0.04), 250 - int(y * 0.03)]
        card[y, :] = color

    if include_qr:
        # Add BCA C06 QR code
        dob_digits = dob.replace("/", "")
        qr_payload = f"{id_number}||{name}|{dob_digits}|{gender}|{address}|01012022"
        qr = qrcode.QRCode(box_size=4, border=1)
        qr.add_data(qr_payload)
        qr.make(fit=True)
        qr_img = np.array(qr.make_image(fill_color="black", back_color="white").convert("RGB"))
        qr_h, qr_w = qr_img.shape[:2]
        # Paste QR in top-right corner: x: 700..900, y: 50..250
        card[60:60 + qr_h, 720:720 + qr_w] = qr_img

    # Convert to PIL to draw text
    pil_img = Image.fromarray(cv2.cvtColor(card, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img)

    try:
        font_title = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20)
        font_num = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 32)
        font_text = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 22)
    except Exception:
        font_title = font_num = font_text = None

    # Draw simulated fields
    draw.text((280, 70), "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", fill=(180, 0, 0), font=font_title)
    draw.text((320, 140), "CĂN CƯỚC CÔNG DÂN", fill=(0, 50, 150), font=font_title)
    draw.text((350, 275), id_number, fill=(200, 20, 20), font=font_num)
    draw.text((350, 355), name, fill=(0, 0, 0), font=font_text)
    draw.text((350, 425), dob, fill=(0, 0, 0), font=font_text)
    draw.text((350, 475), gender, fill=(0, 0, 0), font=font_text)
    draw.text((350, 575), address, fill=(0, 0, 0), font=font_text)

    final_cv = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    # Place on simulated dark desk background
    desk = np.ones((900, 1400, 3), dtype=np.uint8) * 45
    desk[130:130 + 630, 200:200 + 1000] = final_cv

    cv2.imwrite(output_path, desk)
    return output_path


def run_tests():
    print("=== STARTING CCCD PIPELINE TEST SUITE ===")

    # 1. Test C06 Validation Logic
    validator = CCCDCrossValidator()
    # Test valid case: 079 (TP.HCM), 0 (male 20th C, 19xx), 99 (1999), 012345
    res = validator.validate_c06_structure("079099012345", "15/05/1999", "Nam")
    assert res["is_valid"] is True, f"Valid C06 failed: {res['errors']}"
    assert res["province_name"] == "TP. Hồ Chí Minh"
    assert res["birth_year"] == 1999
    assert res["gender"] == "Nam"
    print("[PASS] Test 1: C06 valid structure")

    # Test invalid province
    res_bad_prov = validator.validate_c06_structure("999099012345")
    assert res_bad_prov["is_valid"] is False
    assert any("không thuộc danh mục 63 tỉnh" in err for err in res_bad_prov["errors"])
    print("[PASS] Test 2: C06 invalid province caught")

    # Test gender digit mismatch
    res_bad_gender = validator.validate_c06_structure("079099012345", "15/05/1999", "Nữ")
    assert res_bad_gender["is_valid"] is False
    assert any("không khớp với ký tự giới tính" in err for err in res_bad_gender["errors"])
    print("[PASS] Test 3: C06 gender conflict caught")

    # 2. Test Quality Check with Blurry Image
    preprocessor = CVPreprocessor()
    blurry_img = np.ones((500, 500, 3), dtype=np.uint8) * 128
    # Uniform gray image has Laplacian variance ~ 0
    quality = preprocessor.assess_quality(blurry_img)
    assert quality["is_valid"] is False
    assert "BLURRY" in quality["issues"]
    print("[PASS] Test 4: Quality check rejected blurry image")

    # 3. Test End-to-End Pipeline on Synthetic Card
    test_img_path = os.path.join(os.path.dirname(__file__), "test_cccd_sample.jpg")
    try:
        create_mock_cccd_image(test_img_path)
        print(f"Created synthetic test image at {test_img_path}")

        result = process_cccd(test_img_path)
        assert result["success"] is True, f"Pipeline failed: {result}"
        assert result["qr_found"] is True, "QR code was not decoded"
        assert result["qr_data"]["id_number"] == "079099012345"
        assert result["qr_data"]["full_name"] == "NGUYEN VAN AN"
        assert result["verification"]["c06_validation"]["is_valid"] is True
        assert result["verification"]["is_trustworthy"] is True
        print("[PASS] Test 5: End-to-End CCCD pipeline passed successfully!")
        print(f"       Overall confidence: {result['verification']['overall_confidence']}")
        print(f"       ID Number: {result['verification']['fields']['id_number']['value']}")
        print(f"       Full Name: {result['verification']['fields']['full_name']['value']}")
        print(f"       DOB: {result['verification']['fields']['dob']['value']}")
        print(f"       Province: {result['verification']['c06_validation']['province_name']}")
    finally:
        if os.path.exists(test_img_path):
            os.remove(test_img_path)

    # 4. Test Card without QR code (OCR only fallback)
    test_no_qr_path = os.path.join(os.path.dirname(__file__), "test_cccd_no_qr.jpg")
    try:
        create_mock_cccd_image(test_no_qr_path, id_number="001195098765", name="TRAN THI MAI", dob="20/10/1995", gender="Nữ", address="Quận Ba Đình, Hà Nội", include_qr=False)

        result_no_qr = process_cccd(test_no_qr_path)
        assert result_no_qr["success"] is True
        assert result_no_qr["qr_found"] is False
        assert result_no_qr["verification"]["fields"]["id_number"]["source"] == "OCR"
        assert result_no_qr["verification"]["c06_validation"]["province_name"] == "Hà Nội"
        assert result_no_qr["verification"]["c06_validation"]["gender"] == "Nữ"
        print("[PASS] Test 6: Non-QR card successfully parsed with OCR + C06 validation")
    finally:
        if os.path.exists(test_no_qr_path):
            os.remove(test_no_qr_path)

    print("=== ALL CCCD PIPELINE TESTS PASSED ===")


if __name__ == "__main__":
    run_tests()
