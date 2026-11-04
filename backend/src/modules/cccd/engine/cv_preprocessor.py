"""
EventHub - Vietnam CCCD Computer Vision Preprocessor
Handles image quality assessment, card boundary detection, perspective rectification, and contrast enhancement.
"""

import cv2
import numpy as np


class CVPreprocessor:
    def __init__(self, target_width: int = 1000, target_height: int = 630):
        self.target_width = target_width
        self.target_height = target_height
        self.card_aspect_ratio = target_width / target_height  # ~1.587 (ISO/IEC 7810 ID-1 standard)

    def assess_quality(self, image: np.ndarray) -> dict:
        """
        Assesses image quality against blur, darkness, glare, and resolution thresholds.
        Returns a quality summary and guidance if unreadable.
        """
        h, w = image.shape[:2]
        issues = []
        guidance = []

        # 1. Resolution Check
        if w < 400 or h < 250:
            issues.append("LOW_RESOLUTION")
            guidance.append("Ảnh quá nhỏ hoặc độ phân giải thấp. Vui lòng chụp rõ nét với khoảng cách gần hơn.")

        # Convert to grayscale for metric evaluations
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # 2. Blur / Sharpness Check (Laplacian Variance)
        # High-res cards have variance > 100; blurry photos drop below 50-60
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_blurry = lap_var < 55.0
        if is_blurry:
            issues.append("BLURRY")
            guidance.append("Ảnh bị mờ hoặc rung tay. Vui lòng giữ chắc điện thoại và lấy nét lại khi chụp.")

        # 3. Brightness / Lighting Check
        mean_brightness = float(np.mean(gray))
        if mean_brightness < 45.0:
            issues.append("TOO_DARK")
            guidance.append("Ảnh quá tối hoặc thiếu sáng. Vui lòng chụp ở nơi có ánh sáng tự nhiên đầy đủ.")
        elif mean_brightness > 230.0:
            issues.append("OVEREXPOSED")
            guidance.append("Ảnh bị lóa sáng hoặc chói đèn flash. Vui lòng tắt flash hoặc tránh nguồn sáng chiếu trực diện.")

        # 4. Contrast Check
        contrast = float(np.std(gray))
        if contrast < 22.0:
            issues.append("LOW_CONTRAST")
            guidance.append("Độ tương phản thấp khiến chữ mờ nhạt. Vui lòng đặt thẻ trên mặt phẳng tối màu hoặc tương phản.")

        # 5. Glare / Reflection Detection
        # Check percentage of saturated white pixels
        white_pixels_ratio = float(np.sum(gray > 250)) / (h * w)
        if white_pixels_ratio > 0.08:
            issues.append("GLARE_DETECTED")
            guidance.append("Có vệt sáng chói trên bề mặt thẻ CCCD làm mất chữ. Vui lòng điều chỉnh góc chụp tránh phản chiếu.")

        is_valid = len(issues) == 0 or (len(issues) == 1 and issues[0] == "LOW_CONTRAST")

        return {
            "is_valid": is_valid,
            "width": w,
            "height": h,
            "blur_score": round(lap_var, 2),
            "brightness_score": round(mean_brightness, 2),
            "contrast_score": round(contrast, 2),
            "white_pixels_ratio": round(white_pixels_ratio, 4),
            "issues": issues,
            "guidance": guidance,
        }

    def order_points(self, pts: np.ndarray) -> np.ndarray:
        """
        Orders coordinates in: [top-left, top-right, bottom-right, bottom-left]
        """
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]

        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def detect_and_warp(self, image: np.ndarray) -> tuple[np.ndarray, bool]:
        """
        Finds the 4-corner boundary of the CCCD card, corrects perspective tilt,
        and warps it to standard (target_width, target_height).
        Returns: (rectified_image, card_boundary_detected: bool)
        """
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()

        # Slight blur to reduce edge noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Multi-threshold Canny edge detection
        edges = cv2.Canny(blurred, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        detected_box = None
        img_area = float(w * h)

        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            area = cv2.contourArea(approx)

            # Card must occupy at least 15% of image area
            if len(approx) == 4 and area > (0.15 * img_area):
                pts = approx.reshape(4, 2)
                # Compute aspect ratio of bounding box
                x, y, bw, bh = cv2.boundingRect(approx)
                aspect = max(bw, bh) / (min(bw, bh) + 1e-5)
                if 1.2 <= aspect <= 1.9:
                    detected_box = pts
                    break

        if detected_box is not None:
            # Perspective Warp to standard ID-1 card (1000x630)
            rect = self.order_points(detected_box)
            dst = np.array([
                [0, 0],
                [self.target_width - 1, 0],
                [self.target_width - 1, self.target_height - 1],
                [0, self.target_height - 1]
            ], dtype="float32")

            matrix = cv2.getPerspectiveTransform(rect, dst)
            warped = cv2.warpPerspective(image, matrix, (self.target_width, self.target_height))
            return warped, True

        # Fallback: User already cropped or card boundaries align closely with frame
        current_aspect = w / (h + 1e-5)
        if 1.35 <= current_aspect <= 1.85:
            # Directly resize to standard dimensions
            resized = cv2.resize(image, (self.target_width, self.target_height), interpolation=cv2.INTER_AREA)
            return resized, False

        # Center crop to 1.587 ratio and resize
        target_ratio = self.card_aspect_ratio
        if current_aspect > target_ratio:
            # Too wide: crop left & right
            new_w = int(h * target_ratio)
            offset_x = (w - new_w) // 2
            cropped = image[:, offset_x:offset_x + new_w]
        else:
            # Too tall: crop top & bottom
            new_h = int(w / target_ratio)
            offset_y = (h - new_h) // 2
            cropped = image[offset_y:offset_y + new_h, :]

        warped = cv2.resize(cropped, (self.target_width, self.target_height), interpolation=cv2.INTER_AREA)
        return warped, False

    def enhance_contrast(self, image: np.ndarray) -> np.ndarray:
        """
        Enhances local contrast using CLAHE on the L-channel in LAB space.
        Maintains natural color fidelity while making text significantly clearer for OCR.
        """
        if len(image.shape) == 2:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            return clahe.apply(image)

        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_chan, a_chan, b_chan = cv2.split(lab)

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l_chan)

        merged = cv2.merge([l_enhanced, a_chan, b_chan])
        return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

