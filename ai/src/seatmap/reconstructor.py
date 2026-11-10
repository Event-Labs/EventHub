"""
Post-Processing & Seat Map Reconstruction Engine for EventHub (v3 Hybrid SAHI + OpenCV).
Combines Multi-Scale Tiled YOLO Inference (SAHI), OpenCV Distance-Transform Seat Recovery,
Core-Based Anti-Hallucination, and Faithful 2D Geometry Preservation.
"""

import math
import re
import unicodedata
import uuid
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
    _OCR_ENGINE: Optional[Any] = RapidOCR()
except Exception:
    _OCR_ENGINE = None


# Official EventHub SeatMapEditor constants
EDITOR_SEAT_W = 28
EDITOR_SEAT_H = 28
EDITOR_SNAP_X = 34
EDITOR_SNAP_Y = 36
EDITOR_DEFAULT_W = 900
EDITOR_DEFAULT_H = 600

CLASS_MAP = {
    0: "seat",
    1: "stage",
    2: "standing_area",
    3: "screen",
    4: "foh",
    5: "table",
    6: "entrance",
    7: "obstacle",
    8: "section_block",
}

# EventHub canonical zone palette & default Vietnamese names
EVENTHUB_ZONE_PALETTE = [
    {"hex": "#EF4444", "bgr": (68, 68, 239), "name": "Khu vực VIP"},
    {"hex": "#F59E0B", "bgr": (11, 158, 245), "name": "Khu vực Hạng A (Gold)"},
    {"hex": "#EC4899", "bgr": (153, 72, 236), "name": "Khu vực Sweetbox / VIP"},
    {"hex": "#8B5CF6", "bgr": (246, 92, 139), "name": "Khu vực Premium"},
    {"hex": "#3B82F6", "bgr": (246, 130, 59), "name": "Khu vực Standard"},
    {"hex": "#06B6D4", "bgr": (212, 182, 6), "name": "Khu vực Standard B"},
    {"hex": "#10B981", "bgr": (129, 185, 16), "name": "Khu vực Economy"},
    {"hex": "#14B8A6", "bgr": (166, 184, 20), "name": "Khu vực Phổ thông"},
]

CANVAS_THEMES = [
    {"hex": "#0F172A", "bgr": (42, 23, 15)},
    {"hex": "#090D16", "bgr": (22, 13, 9)},
    {"hex": "#1E293B", "bgr": (59, 41, 30)},
    {"hex": "#F8FAFC", "bgr": (252, 250, 248)},
]


def row_label_for_index(r: int) -> str:
    """Convert 0-based row index to A..Z, AA..ZZ matching SeatMapEditor.jsx."""
    if r < 26:
        return chr(65 + r)
    return chr(64 + (r // 26)) + chr(65 + (r % 26))


def bgr_to_hex(bgr: Tuple[float, float, float]) -> str:
    b, g, r = [int(max(0, min(255, round(v)))) for v in bgr]
    return f"#{r:02X}{g:02X}{b:02X}"


def color_distance_bgr(c1: Tuple[float, float, float], c2: Tuple[float, float, float]) -> float:
    """Weighted Euclidean distance in BGR space (human perception weights)."""
    db = c1[0] - c2[0]
    dg = c1[1] - c2[1]
    dr = c1[2] - c2[2]
    return math.sqrt(0.114 * (db ** 2) + 0.587 * (dg ** 2) + 0.299 * (dr ** 2))


def detect_canvas_bg(image_bgr: np.ndarray) -> str:
    """Detect the background theme hex from image corners and border strips."""
    h, w = image_bgr.shape[:2]
    pad = max(4, min(20, min(h, w) // 25))
    patches = [
        image_bgr[0:pad, 0:pad],
        image_bgr[0:pad, w - pad : w],
        image_bgr[h - pad : h, 0:pad],
        image_bgr[h - pad : h, w - pad : w],
    ]
    all_pixels = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    med_bgr = tuple(np.median(all_pixels, axis=0).tolist())

    best_theme = min(
        CANVAS_THEMES,
        key=lambda t: color_distance_bgr(med_bgr, t["bgr"]),
    )
    return best_theme["hex"]


def sample_box_color_and_disabled(
    image_bgr: np.ndarray, x1: float, y1: float, x2: float, y2: float
) -> Tuple[Tuple[float, float, float], bool]:
    """
    Sample the dominant BGR color inside a seat bounding box and detect whether
    it is a disabled seat (slate-gray fill with red X mark).
    Filters out dark/white text stroke pixels so seat labels ('O30', 'W22') never skew seat color.
    """
    h, w = image_bgr.shape[:2]
    bw = x2 - x1
    bh = y2 - y1
    ix1 = max(0, int(round(x1 + bw * 0.14)))
    iy1 = max(0, int(round(y1 + bh * 0.14)))
    ix2 = min(w, int(round(x2 - bw * 0.14)))
    iy2 = min(h, int(round(y2 - bh * 0.14)))

    if ix2 <= ix1 or iy2 <= iy1:
        cx = max(0, min(w - 1, int(round((x1 + x2) / 2))))
        cy = max(0, min(h - 1, int(round((y1 + y2) / 2))))
        px = image_bgr[cy, cx]
        return (float(px[0]), float(px[1]), float(px[2])), False

    roi = image_bgr[iy1:iy2, ix1:ix2]
    pixels = roi.reshape(-1, 3).astype(np.float32)
    hsv_px = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(np.float32)

    brightness = 0.114 * pixels[:, 0] + 0.587 * pixels[:, 1] + 0.299 * pixels[:, 2]
    valid_mask = (brightness > 32.0) & (brightness < 235.0)
    filtered = pixels[valid_mask] if np.any(valid_mask) else pixels

    med_b, med_g, med_r = np.median(filtered, axis=0).tolist()
    max_c = max(med_b, med_g, med_r)
    min_c = min(med_b, med_g, med_r)
    saturation = (max_c - min_c) / max(1.0, max_c)

    red_dominance = (pixels[:, 2] > 170) & (pixels[:, 2] > pixels[:, 1] * 1.6) & (pixels[:, 2] > pixels[:, 0] * 1.6)
    red_ratio = float(np.mean(red_dominance))
    is_disabled = bool(saturation < 0.28 and 0.04 <= red_ratio <= 0.48)

    if not is_disabled:
        # Prefer pure chromatic fill pixels (excluding dark/gray anti-aliased text strokes inside the seat)
        chroma_mask = (brightness > 82.0) & (brightness < 238.0) & (hsv_px[:, 1] > 22.0)
        if int(np.sum(chroma_mask)) >= 4:
            cand_px = pixels[chroma_mask]
            cand_s = hsv_px[chroma_mask, 1]
            s_cut = float(np.percentile(cand_s, 35))
            pure_px = cand_px[cand_s >= s_cut]
            if len(pure_px) > 0:
                med_b, med_g, med_r = np.median(pure_px, axis=0).tolist()

    return (float(med_b), float(med_g), float(med_r)), is_disabled


def deduplicate_boxes(
    boxes: List[Dict[str, Any]], iou_threshold: float = 0.40
) -> List[Dict[str, Any]]:
    """Remove duplicate overlapping bounding boxes of the same class, keeping higher confidence."""
    if not boxes:
        return []
    sorted_boxes = sorted(boxes, key=lambda b: b["conf"], reverse=True)
    kept: List[Dict[str, Any]] = []

    for b in sorted_boxes:
        cx = (b["x1"] + b["x2"]) / 2.0
        cy = (b["y1"] + b["y2"]) / 2.0
        bw = b["x2"] - b["x1"]
        bh = b["y2"] - b["y1"]
        area_b = max(1.0, bw * bh)
        duplicate = False
        for k in kept:
            kcx = (k["x1"] + k["x2"]) / 2.0
            kcy = (k["y1"] + k["y2"]) / 2.0
            kbw = k["x2"] - k["x1"]
            kbh = k["y2"] - k["y1"]
            area_k = max(1.0, kbw * kbh)

            # If centers are substantially far apart, they are distinct areas (e.g. adjacent tilted blocks)
            center_dist = math.hypot(cx - kcx, cy - kcy)
            if center_dist > max(16.0, min(bw, bh) * 0.70):
                continue

            ix1 = max(b["x1"], k["x1"])
            iy1 = max(b["y1"], k["y1"])
            ix2 = min(b["x2"], k["x2"])
            iy2 = min(b["y2"], k["y2"])
            if ix2 > ix1 and iy2 > iy1:
                inter = (ix2 - ix1) * (iy2 - iy1)
                union = area_b + area_k - inter
                iou = inter / max(1.0, union)
                if iou > iou_threshold:
                    duplicate = True
                    break
        if not duplicate:
            kept.append(b)
    return kept


def run_sahi_and_hybrid_inference(
    yolo_model: Any,
    image_bgr: np.ndarray,
    imgsz: int = 1024,
    conf: float = 0.18,
    iou: float = 0.38,
) -> Tuple[Dict[int, List[Dict[str, Any]]], int]:
    """
    Execute 2-Stage Multi-Scale SAHI Inference + OpenCV Distance-Transform Seat Recovery:
      1. Macro Pass on full image (captures stages, standing areas, screens, foh, tables, and base seats).
      2. Micro 2x2 Overlapping Tiled Pass (magnifies tiny dense seats 2x so packed seats are resolved).
      3. Color-Saturation Verification & OpenCV Distance-Transform Recovery for rotated/dense seat strips.
    """
    img_h, img_w = image_bgr.shape[:2]
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    raw_by_class: Dict[int, List[Dict[str, Any]]] = {cid: [] for cid in CLASS_MAP}

    # --- PASS 1: Full-Image Macro & Base Seat Pass ---
    full_res = yolo_model.predict(
        source=image_bgr,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        max_det=2500,
        verbose=False,
    )[0]

    if full_res.boxes is not None and len(full_res.boxes) > 0:
        xyxy_arr = full_res.boxes.xyxy.cpu().numpy()
        cls_arr = full_res.boxes.cls.cpu().numpy().astype(int)
        conf_arr = full_res.boxes.conf.cpu().numpy()

        for idx in range(len(xyxy_arr)):
            cid = int(cls_arr[idx])
            c_val = float(conf_arr[idx])
            x1, y1, x2, y2 = [float(v) for v in xyxy_arr[idx]]
            if cid not in raw_by_class:
                continue
            if cid == 0 and c_val < 0.15:
                continue
            if cid != 0 and c_val < 0.32:
                continue
            raw_by_class[cid].append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "cx": (x1 + x2) / 2.0,
                "cy": (y1 + y2) / 2.0,
                "w": max(4.0, x2 - x1),
                "h": max(4.0, y2 - y1),
                "conf": c_val,
            })

    # --- PASS 2: SAHI 5-Tile Overlapping Micro Pass (4 Quadrants + 1 Center Bowl Tile) ---
    tiles = [
        (0, 0, int(img_w * 0.58), int(img_h * 0.58)),
        (int(img_w * 0.42), 0, img_w, int(img_h * 0.58)),
        (0, int(img_h * 0.42), int(img_w * 0.58), img_h),
        (int(img_w * 0.42), int(img_h * 0.42), img_w, img_h),
        (int(img_w * 0.20), int(img_h * 0.14), int(img_w * 0.80), int(img_h * 0.86)),
    ]
    crops = [image_bgr[ty1:ty2, tx1:tx2] for (tx1, ty1, tx2, ty2) in tiles]
    tile_results = yolo_model.predict(
        source=crops,
        imgsz=imgsz,
        conf=max(0.12, conf * 0.75),
        iou=iou,
        max_det=2500,
        verbose=False,
    )

    for (tx1, ty1, tx2, ty2), tres in zip(tiles, tile_results):
        if tres.boxes is None or len(tres.boxes) == 0:
            continue
        tw = tx2 - tx1
        th = ty2 - ty1
        t_xyxy = tres.boxes.xyxy.cpu().numpy()
        t_cls = tres.boxes.cls.cpu().numpy().astype(int)
        t_conf = tres.boxes.conf.cpu().numpy()

        for idx in range(len(t_xyxy)):
            cid = int(t_cls[idx])
            if cid != 0:
                continue  # Only harvest seats from zoomed tiles to avoid partial-macro hallucinations
            bx1, by1, bx2, by2 = [float(v) for v in t_xyxy[idx]]
            # Ignore boxes clipped right on an internal cut edge of the tile
            if (tx1 > 0 and bx1 < 4.0) or (ty1 > 0 and by1 < 4.0):
                continue
            if (tx2 < img_w and bx2 > tw - 4.0) or (ty2 < img_h and by2 > th - 4.0):
                continue
            x1, y1, x2, y2 = bx1 + tx1, by1 + ty1, bx2 + tx1, by2 + ty1
            raw_by_class[0].append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "cx": (x1 + x2) / 2.0,
                "cy": (y1 + y2) / 2.0,
                "w": max(4.0, x2 - x1),
                "h": max(4.0, y2 - y1),
                "conf": float(t_conf[idx]),
            })

    # Filter and deduplicate SAHI seats by consistent seat size & chromatic fill contrast
    sahi_recovered_count = 0
    if len(raw_by_class[0]) >= 5:
        med_w = float(np.median([s["w"] for s in raw_by_class[0]]))
        med_h = float(np.median([s["h"] for s in raw_by_class[0]]))
        size_filtered = [
            s for s in raw_by_class[0]
            if 0.56 * med_w <= s["w"] <= 1.70 * med_w
            and 0.56 * med_h <= s["h"] <= 1.70 * med_h
            and 0.58 <= (s["w"] / max(1.0, s["h"])) <= 1.75
        ]

        # Estimate board background HSV saturation from the central diagram region (25th percentile of S)
        central_hsv = hsv[int(img_h * 0.12) : int(img_h * 0.88), int(img_w * 0.12) : int(img_w * 0.88)]
        board_bg_s = float(np.percentile(central_hsv[:, :, 1], 25)) if central_hsv.size > 0 else 0.0
        board_bg_v = float(np.percentile(central_hsv[:, :, 2], 75)) if central_hsv.size > 0 else 240.0
        is_vivid_or_dark_bg = (board_bg_s > 35.0 or board_bg_v < 130.0)

        # Check if the map uses colored seats (median saturation > 32)
        sample_sats = []
        for s in size_filtered[:250]:
            ix1, iy1 = max(0, int(round(s["x1"] + 2))), max(0, int(round(s["y1"] + 2)))
            ix2, iy2 = min(img_w, int(round(s["x2"] - 2))), min(img_h, int(round(s["y2"] - 2)))
            if ix2 > ix1 and iy2 > iy1:
                sample_sats.append(float(np.median(hsv[iy1:iy2, ix1:ix2, 1])))
        is_color_coded_map = bool(sample_sats and float(np.median(sample_sats)) > max(30.0, board_bg_s + 14.0))

        # Build a mask of large solid uniform-color regions (standing gems / section blocks)
        # relative to board_bg_s so tinted/beige boards are never mistaken for solid macro blocks.
        sat_thresh_macro = max(38, int(round(board_bg_s + 22)))
        fg_sat_mask = ((hsv[:, :, 1] > sat_thresh_macro) & (hsv[:, :, 2] > 55)).astype(np.uint8)
        num_fg, fg_lbls, fg_stats, _ = cv2.connectedComponentsWithStats(fg_sat_mask, connectivity=4)
        solid_macro_mask = np.zeros((img_h, img_w), dtype=bool)
        seat_area_ref = max(64.0, med_w * med_h)
        for lbl_i in range(1, num_fg):
            cw = float(fg_stats[lbl_i, cv2.CC_STAT_WIDTH])
            ch = float(fg_stats[lbl_i, cv2.CC_STAT_HEIGHT])
            carea = float(fg_stats[lbl_i, cv2.CC_STAT_AREA])
            if carea > seat_area_ref * 5.0 and cw > med_w * 2.3 and ch > med_h * 2.3 and carea < 0.45 * img_w * img_h:
                fill_ratio = carea / max(1.0, cw * ch)
                if fill_ratio > 0.38:
                    solid_macro_mask[fg_lbls == lbl_i] = True

        color_verified = []
        for s in size_filtered:
            scx = max(0, min(img_w - 1, int(round(s["cx"]))))
            scy = max(0, min(img_h - 1, int(round(s["cy"]))))
            if solid_macro_mask[scy, scx]:
                continue

            # On vivid or dark background maps (e.g. space galaxy), trust YOLO detections
            if is_vivid_or_dark_bg:
                color_verified.append(s)
                continue

            if is_color_coded_map:
                bw_s, bh_s = s["w"], s["h"]
                ix1 = max(0, int(round(s["x1"] + bw_s * 0.14)))
                iy1 = max(0, int(round(s["y1"] + bh_s * 0.14)))
                ix2 = min(img_w, int(round(s["x2"] - bw_s * 0.14)))
                iy2 = min(img_h, int(round(s["y2"] - bh_s * 0.14)))
                if ix2 <= ix1 or iy2 <= iy1:
                    continue
                inner_bgr = image_bgr[iy1:iy2, ix1:ix2].reshape(-1, 3).astype(np.float32)
                inner_hsv = hsv[iy1:iy2, ix1:ix2].reshape(-1, 3).astype(np.float32)
                lum = 0.114 * inner_bgr[:, 0] + 0.587 * inner_bgr[:, 1] + 0.299 * inner_bgr[:, 2]
                # Exclude dark text strokes and white highlights inside the seat icon
                non_stroke = (lum > 72.0) & (lum < 238.0)
                if int(np.sum(non_stroke)) < max(3, int(len(lum) * 0.18)):
                    continue
                in_med_s = float(np.median(inner_hsv[non_stroke, 1]))
                in_med_v = float(np.median(inner_hsv[non_stroke, 2]))

                # Reject bare text on tinted/beige/white backgrounds and white letters on dark curtains
                ox1 = max(0, int(round(s["x1"] - bw_s * 0.42)))
                oy1 = max(0, int(round(s["y1"] - bh_s * 0.42)))
                ox2 = min(img_w, int(round(s["x2"] + bw_s * 0.42)))
                oy2 = min(img_h, int(round(s["y2"] + bh_s * 0.42)))
                ring_mask = np.ones((oy2 - oy1, ox2 - ox1), dtype=bool)
                ring_mask[
                    max(0, int(round(s["y1"])) - oy1) : min(oy2 - oy1, int(round(s["y2"])) - oy1),
                    max(0, int(round(s["x1"])) - ox1) : min(ox2 - ox1, int(round(s["x2"])) - ox1),
                ] = False
                ring_hsv = hsv[oy1:oy2, ox1:ox2][ring_mask].reshape(-1, 3).astype(np.float32)
                ring_p25_s = float(np.percentile(ring_hsv[:, 1], 25)) if len(ring_hsv) > 0 else board_bg_s
                ring_med_s = float(np.median(ring_hsv[:, 1])) if len(ring_hsv) > 0 else board_bg_s
                ring_med_v = float(np.median(ring_hsv[:, 2])) if len(ring_hsv) > 0 else board_bg_v
                ring_p75_v = float(np.percentile(ring_hsv[:, 2], 75)) if len(ring_hsv) > 0 else board_bg_v

                # If local ring is dark curtain/wall outside a light/beige board, reject
                if board_bg_v > 150.0 and ring_med_v < 95.0 and in_med_v < 95.0:
                    continue
                if board_bg_v > 165.0 and ring_p75_v < board_bg_v - 40.0 and s["conf"] < 0.65:
                    continue
                # Reject margin letters sitting on a tinted border/curtain whose interior is the same as the ring
                if (
                    ring_p25_s > board_bg_s + 16.0
                    and abs(in_med_s - ring_med_s) < 15.0
                    and abs(in_med_v - ring_med_v) < 25.0
                ):
                    continue

                bg_ref_s = min(ring_p25_s, board_bg_s + 8.0)
                sat_gain = in_med_s - bg_ref_s
                _, is_dis = sample_box_color_and_disabled(image_bgr, s["x1"], s["y1"], s["x2"], s["y2"])
                if not is_dis:
                    # Do not reject genuine dark colored seats (e.g. dark green, dark purple)
                    if in_med_s < 18.0 and in_med_v > 230.0:
                        continue
                    if in_med_s < 20.0 and in_med_v < 55.0:
                        continue
                    if board_bg_s >= 14.0 and sat_gain < 12.0:
                        continue
                    if ring_p25_s > board_bg_s + 30.0 and in_med_s <= ring_p25_s + 5.0 and in_med_v < 110.0:
                        continue
            else:
                # Monochrome / uncolored image: reject bare black text strokes on white paper
                bw_s, bh_s = s["w"], s["h"]
                ix1 = max(0, int(round(s["x1"] + bw_s * 0.15)))
                iy1 = max(0, int(round(s["y1"] + bh_s * 0.15)))
                ix2 = min(img_w, int(round(s["x2"] - bw_s * 0.15)))
                iy2 = min(img_h, int(round(s["y2"] - bh_s * 0.15)))
                if ix2 <= ix1 or iy2 <= iy1:
                    continue
                inner_v = hsv[iy1:iy2, ix1:ix2, 2].reshape(-1).astype(np.float32)
                if board_bg_v > 200.0:
                    # Bare text on white paper is bimodal (dark ink <95 and white paper >220) with <28% mid-tone fill
                    white_frac = float(np.mean(inner_v > 220.0))
                    mid_fill_frac = float(np.mean((inner_v >= 95.0) & (inner_v <= 215.0)))
                    if white_frac > 0.35 and mid_fill_frac < 0.28:
                        continue
            color_verified.append(s)

        color_verified.sort(key=lambda x: x["conf"], reverse=True)
        kept_seats: List[Dict[str, Any]] = []
        min_seat_dist = min(med_w, med_h) * 0.72
        for s in color_verified:
            if any(math.hypot(s["cx"] - k["cx"], s["cy"] - k["cy"]) < min_seat_dist for k in kept_seats):
                continue
            kept_seats.append(s)

        # --- PASS 3: OpenCV Hybrid Distance-Transform Recovery for Dense/Rotated Blocks ---
        # Only run on uniform/neutral/paper backgrounds where color thresholding is safe
        if is_color_coded_map and not is_vivid_or_dark_bg and len(kept_seats) >= 20:
            pass3_sat_min = max(28, int(round(board_bg_s + 22)))
            color_mask = ((hsv[:, :, 1] > pass3_sat_min) & (hsv[:, :, 2] > 65) & (~solid_macro_mask)).astype(np.uint8) * 255
            # Restrict Pass 3 to generous bounding box of confident seats so outer wing columns are not clipped
            conf_seats = [s for s in kept_seats if s["conf"] >= 0.32]
            if len(conf_seats) >= 10:
                min_valid_y = max(0, int(round(min(s["cy"] for s in conf_seats) - med_h * 3.5)))
                max_valid_y = min(img_h, int(round(max(s["cy"] for s in conf_seats) + med_h * 3.5)))
                min_valid_x = max(0, int(round(min(s["cx"] for s in conf_seats) - med_w * 3.5)))
                max_valid_x = min(img_w, int(round(max(s["cx"] for s in conf_seats) + med_w * 3.5)))
                if min_valid_y > 0:
                    color_mask[:min_valid_y, :] = 0
                if max_valid_y < img_h:
                    color_mask[max_valid_y:, :] = 0
                if min_valid_x > 0:
                    color_mask[:, :min_valid_x] = 0
                if max_valid_x < img_w:
                    color_mask[:, max_valid_x:] = 0
            # Mask out stage, standing_area, screen, and foh candidates so macro blocks are never filled with fake seats
            for macro_cid in (1, 2, 3, 4):
                for mb in raw_by_class.get(macro_cid, []):
                    if mb["conf"] >= 0.38:
                        cv2.rectangle(
                            color_mask,
                            (max(0, int(mb["x1"] - 2)), max(0, int(mb["y1"] - 2))),
                            (min(img_w, int(mb["x2"] + 2)), min(img_h, int(mb["y2"] + 2))),
                            0,
                            -1,
                        )
            # Subtract already-detected SAHI seats using tight core circles
            # so neighbor seats in dense columns (e.g. U-Shape wings) are never erased
            r_core = int(round(min(med_w, med_h) * 0.45))
            for s in kept_seats:
                cv2.circle(
                    color_mask,
                    (int(round(s["cx"])), int(round(s["cy"]))),
                    r_core,
                    0,
                    -1,
                )

            dist = cv2.distanceTransform(color_mask, cv2.DIST_L2, 3)
            num_l, lbls, stats, _ = cv2.connectedComponentsWithStats(color_mask, connectivity=8)
            seat_area_ref = max(16.0, med_w * med_h)
            for i in range(1, num_l):
                cw = stats[i, cv2.CC_STAT_WIDTH]
                ch = stats[i, cv2.CC_STAT_HEIGHT]
                carea = stats[i, cv2.CC_STAT_AREA]
                # Only suppress genuinely huge macro banners/stages, never missing seat columns
                if cw > med_w * 6.0 and ch > med_h * 6.0 and carea > seat_area_ref * 35.0:
                    dist[lbls == i] = 0

            dist_copy = dist.copy()
            min_peak_r = max(2.4, min(med_w, med_h) * 0.22)
            anchor_seats = list(kept_seats)
            step_r = min(med_w, med_h) * 0.82
            while True:
                _, max_val, _, max_loc = cv2.minMaxLoc(dist_copy)
                if max_val < min_peak_r:
                    break
                px, py = max_loc
                cv2.circle(dist_copy, (px, py), int(round(step_r)), 0, -1)
                if any(math.hypot(px - k["cx"], py - k["cy"]) < step_r * 0.95 for k in kept_seats):
                    continue
                # Require Pass 3 peak to be near existing detected seats or recovered chain anchors
                nearby_anchors = sum(
                    1 for k in anchor_seats
                    if math.hypot(px - k["cx"], py - k["cy"]) <= max(med_w, med_h) * 4.5
                )
                if nearby_anchors < 1:
                    continue
                if board_bg_v > 165.0:
                    rx1 = max(0, int(round(px - med_w * 0.9)))
                    ry1 = max(0, int(round(py - med_h * 0.9)))
                    rx2 = min(img_w, int(round(px + med_w * 0.9)))
                    ry2 = min(img_h, int(round(py + med_h * 0.9)))
                    r_patch_v = hsv[ry1:ry2, rx1:rx2, 2]
                    # Only reject truly dark curtain/void regions outside the seating board (< 72),
                    # never genuine colored seats (which typically have V in 120..220)
                    if r_patch_v.size > 0 and float(np.percentile(r_patch_v, 75)) < min(72.0, board_bg_v * 0.38):
                        continue
                new_s = {
                    "x1": float(px) - med_w / 2.0,
                    "y1": float(py) - med_h / 2.0,
                    "x2": float(px) + med_w / 2.0,
                    "y2": float(py) + med_h / 2.0,
                    "cx": float(px),
                    "cy": float(py),
                    "w": med_w,
                    "h": med_h,
                    "conf": 0.75,
                }
                kept_seats.append(new_s)
                anchor_seats.append(new_s)
                sahi_recovered_count += 1

        raw_by_class[0] = kept_seats

    for cid in raw_by_class:
        if cid != 0:
            raw_by_class[cid] = deduplicate_boxes(raw_by_class[cid], iou_threshold=0.42)

    return raw_by_class, sahi_recovered_count


def match_bgr_to_palette_hex(bgr: Tuple[float, float, float]) -> str:
    """
    Map a BGR color to the closest perceptual EventHub palette hex using HSV Hue & RGB channel dominance.
    Prevents pastel greens (G > R > B) from ever being confused with orange/amber or blue.
    """
    b, g, r = float(bgr[0]), float(bgr[1]), float(bgr[2])
    arr = np.uint8([[[max(0, min(255, int(round(b)))), max(0, min(255, int(round(g)))), max(0, min(255, int(round(r))))]]])
    hsv_px = cv2.cvtColor(arr, cv2.COLOR_BGR2HSV)[0, 0]
    h, s, _ = int(hsv_px[0]), int(hsv_px[1]), int(hsv_px[2])

    if s >= 18:
        # Green family (yellow-green, sage green, lime green, emerald green)
        if (33 <= h <= 83) or (g > r + 6.0 and g > b + 6.0 and 28 <= h <= 85):
            return "#10B981"
        # Teal / Cyan family
        if 84 <= h <= 89:
            return "#14B8A6"
        if 90 <= h <= 96 and g >= b * 0.88:
            return "#06B6D4"
        # Blue family (sky blue, steel blue, royal blue)
        if 90 <= h <= 122:
            return "#3B82F6"
        # Purple / Violet family
        if 123 <= h <= 147:
            return "#8B5CF6"
        # Pink / Magenta family
        if 148 <= h <= 169:
            return "#EC4899"
        # Red family
        if h < 8 or h >= 170:
            return "#EF4444"
        # Orange / Amber / Gold / Yellow family
        if 8 <= h <= 32:
            return "#F59E0B"

    nearest = min(
        EVENTHUB_ZONE_PALETTE,
        key=lambda p: color_distance_bgr(bgr, p["bgr"]),
    )
    return nearest["hex"]


def _extract_legend_zone_name_map(
    image_bgr: Optional[np.ndarray],
    ocr_items: Optional[List[Dict[str, Any]]],
) -> Dict[str, str]:
    """
    Read color-to-zone-name mappings from bottom/side legend text items if present
    (e.g. 'BLUE: Orchestra Front', 'GREEN: Orchestra Middle', 'ORANGE: Orchestra Rear', or color swatches).
    """
    if image_bgr is None or not ocr_items:
        return {}
    h, w = image_bgr.shape[:2]
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    hex_to_custom_name: Dict[str, str] = {}

    color_prefix_map = [
        (("BLUE", "XANHDUONG", "XANHLAM"), "#3B82F6"),
        (("GREEN", "XANHLA"), "#10B981"),
        (("ORANGE", "CAM", "GOLD", "YELLOW", "VANG"), "#F59E0B"),
        (("RED", "DO"), "#EF4444"),
        (("PURPLE", "VIOLET", "TIM"), "#8B5CF6"),
        (("PINK", "MAGENTA", "HONG"), "#EC4899"),
        (("CYAN", "XANHNGOC"), "#06B6D4"),
        (("TEAL",), "#14B8A6"),
    ]

    for it in ocr_items:
        if it["cy"] < h * 0.72:
            continue
        raw = it["raw"].strip()
        norm = it["norm"]
        if any(skip in norm for skip in ("INDIVIDUALSEAT", "CIRCLES", "VONGTRON", "SANKHAU", "SODOGHE")):
            continue

        matched_hex: Optional[str] = None
        clean_label = raw
        for prefixes, p_hex in color_prefix_map:
            for pref in prefixes:
                if norm.startswith(pref) and len(norm) > len(pref) + 2:
                    matched_hex = p_hex
                    # Strip prefix and colon from raw text
                    clean_label = re.sub(r"^[A-Za-zÀ-ỹ\s]*[:\-]\s*", "", raw).strip()
                    if clean_label.upper().startswith(pref):
                        clean_label = clean_label[len(pref):].lstrip(" :-")
                    break
            if matched_hex:
                break

        if not matched_hex and (":" in raw or "ORCHESTRA" in norm or "ZONE" in norm or "HANG" in norm or "KHU" in norm):
            clean_label = raw.lstrip(": -").strip()
            if ":" in clean_label:
                clean_label = clean_label.split(":", 1)[-1].strip()
            # Sample colored text or swatch just to the left of or inside the left part of this legend item
            sx1 = max(0, int(round(it["x1"] - 58)))
            sy1 = max(0, int(round(it["y1"] - 2)))
            sx2 = min(w, int(round(it["x1"] + min(40.0, it["w"] * 0.45))))
            sy2 = min(h, int(round(it["y2"] + 2)))
            if sx2 > sx1 + 4 and sy2 > sy1 + 4:
                patch_bgr = image_bgr[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
                patch_hsv = hsv[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
                sat_mask = (patch_hsv[:, 1] > 48.0) & (patch_hsv[:, 2] > 70.0) & (patch_hsv[:, 2] < 240.0)
                if int(np.sum(sat_mask)) >= 5:
                    med_swatch_bgr = tuple(np.median(patch_bgr[sat_mask], axis=0).tolist())
                    matched_hex = match_bgr_to_palette_hex(med_swatch_bgr)

        if matched_hex and clean_label and len(clean_label) >= 3 and not clean_label.isdigit():
            clean_label = _prettify_ocr_label(clean_label)
            hex_to_custom_name[matched_hex] = clean_label

    return hex_to_custom_name


def assign_zones_from_seat_colors(
    seats: List[Dict[str, Any]],
    image_bgr: Optional[np.ndarray] = None,
    ocr_items: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Map seat BGR colors to canonical EventHub zones using Hue-aware perceptual matching,
    apply spatial neighborhood smoothing to eliminate single-seat text-stroke color flicker,
    and enrich zone names from the image legend when available.
    """
    if not seats:
        default_zone_id = str(uuid.uuid4())
        return [{"localId": default_zone_id, "name": "Khu vực Standard", "color": "#3B82F6"}], {}

    palette_counts: Dict[str, List[Dict[str, Any]]] = {}
    seat_raw_hex: Dict[str, str] = {}
    for s in seats:
        if s.get("is_disabled"):
            continue
        p_hex = match_bgr_to_palette_hex(s["bgr"])
        seat_raw_hex[s["temp_id"]] = p_hex
        palette_counts.setdefault(p_hex, []).append(s)

    if not palette_counts:
        default_zone_id = str(uuid.uuid4())
        return [{"localId": default_zone_id, "name": "Khu vực Standard", "color": "#3B82F6"}], {}

    min_cluster_size = max(3, int(len(seats) * 0.025))
    major_hexes = [h for h, items in palette_counts.items() if len(items) >= min_cluster_size]
    if not major_hexes:
        major_hexes = [max(palette_counts.keys(), key=lambda h: len(palette_counts[h]))]

    major_hexes.sort(
        key=lambda h: float(np.mean([item["cy"] for item in palette_counts[h]]))
    )

    legend_names = _extract_legend_zone_name_map(image_bgr, ocr_items)

    zones_list: List[Dict[str, Any]] = []
    hex_to_zone_id: Dict[str, str] = {}
    used_names = set()

    for idx, hex_code in enumerate(major_hexes):
        pal_entry = next(p for p in EVENTHUB_ZONE_PALETTE if p["hex"] == hex_code)
        z_id = str(uuid.uuid4())
        base_name = legend_names.get(hex_code) or pal_entry["name"]
        if base_name in used_names:
            base_name = f"{base_name} {idx + 1}"
        used_names.add(base_name)
        zones_list.append({
            "localId": z_id,
            "name": base_name,
            "color": hex_code,
        })
        hex_to_zone_id[hex_code] = z_id

    major_palettes = [p for p in EVENTHUB_ZONE_PALETTE if p["hex"] in hex_to_zone_id]
    seat_hex_assigned: Dict[str, str] = {}
    for s in seats:
        raw_h = seat_raw_hex.get(s["temp_id"])
        if raw_h in hex_to_zone_id:
            seat_hex_assigned[s["temp_id"]] = raw_h
        else:
            nearest_major = min(
                major_palettes,
                key=lambda p: color_distance_bgr(s["bgr"], p["bgr"]),
            )
            seat_hex_assigned[s["temp_id"]] = nearest_major["hex"]

    # Spatial 6-Nearest-Neighbor Consensus Smoothing:
    # Eliminates isolated 1-seat color flickers caused by dense dark text strokes inside a seat circle
    active_seats = [s for s in seats if not s.get("is_disabled")]
    if len(active_seats) >= 12 and len(major_hexes) >= 2:
        pts = np.array([[s["cx"], s["cy"]] for s in active_seats], dtype=np.float64)
        smoothed_hex = dict(seat_hex_assigned)
        for i, s in enumerate(active_seats):
            diffs = pts - pts[i]
            dists = np.hypot(diffs[:, 0], diffs[:, 1])
            dists[i] = 1e9
            nn_idx = np.argsort(dists)[:6]
            med_nn = float(np.median(dists[nn_idx[:3]]))
            close_idx = [j for j in nn_idx if dists[j] <= max(36.0, med_nn * 2.1)]
            if len(close_idx) >= 4:
                cur_h = seat_hex_assigned[s["temp_id"]]
                raw_h = seat_raw_hex.get(s["temp_id"])
                is_minor_raw = raw_h not in hex_to_zone_id
                nb_hexes = [seat_hex_assigned[active_seats[j]["temp_id"]] for j in close_idx]
                same_cnt = sum(1 for nh in nb_hexes if nh == cur_h)
                if same_cnt == 0 or (is_minor_raw and same_cnt <= 1):
                    # Find majority neighbor hex
                    counts: Dict[str, int] = {}
                    for nh in nb_hexes:
                        counts[nh] = counts.get(nh, 0) + 1
                    best_nh, best_cnt = max(counts.items(), key=lambda kv: kv[1])
                    if best_cnt >= max(3, len(close_idx) - 1):
                        smoothed_hex[s["temp_id"]] = best_nh
        seat_hex_assigned = smoothed_hex

    seat_zone_map: Dict[str, str] = {
        tid: hex_to_zone_id[h_code] for tid, h_code in seat_hex_assigned.items()
    }
    return zones_list, seat_zone_map


def cluster_seats_and_scale(
    raw_seats: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    stage_center: Optional[Tuple[float, float]] = None,
    stage_bbox: Optional[Dict[str, float]] = None,
) -> Tuple[List[Dict[str, Any]], float, float, float, float, int, int, str]:
    """
    Compute non-overlapping canvas coordinates preserving exact 2D geometry,
    and assign clean, unique row labels (A, B, C...) and seat numbers (1, 2, 3...).
    Supports arbitrary curved, concentric, diagonal, and rectilinear layouts.
    """
    if not raw_seats:
        sx = EDITOR_DEFAULT_W / float(max(1, img_w))
        sy = EDITOR_DEFAULT_H / float(max(1, img_h))
        return [], sx, sy, 0.0, 0.0, 0, 0, "FREEFORM"

    centers = np.array([[s["cx"], s["cy"]] for s in raw_seats], dtype=np.float64)
    nn_dists: List[float] = []
    if len(centers) >= 2:
        for i in range(len(centers)):
            diffs = centers - centers[i]
            dists = np.hypot(diffs[:, 0], diffs[:, 1])
            dists[i] = 1e9
            min_d = float(np.min(dists))
            if min_d < 120.0:
                nn_dists.append(min_d)

    med_step = float(np.median(nn_dists)) if nn_dists else 12.0
    p15_step = float(np.percentile(nn_dists, 15)) if len(nn_dists) >= 10 else med_step

    # Desired distance on canvas is 34px (28px seat + 6px spacing).
    # Also ensure denser curved sub-sections (p15_step) scale to at least 30.5px so 28x28 seats never overlap.
    target_pitch = 34.0
    base_scale = max(1.0, target_pitch / max(4.0, med_step))
    dense_scale = 30.5 / max(4.0, p15_step)
    scale = max(base_scale, min(base_scale * 1.38, dense_scale))

    min_cx = float(np.min(centers[:, 0]))
    min_cy = float(np.min(centers[:, 1]))
    if stage_bbox is not None:
        min_cx = min(min_cx, stage_bbox["x1"])
        min_cy = min(min_cy, stage_bbox["y1"])

    pad_x = 60.0
    pad_y = 60.0
    offset_x = pad_x - min_cx * scale
    offset_y = pad_y - min_cy * scale

    for s in raw_seats:
        if stage_center is not None:
            s["rad_dist"] = math.hypot(s["cx"] - stage_center[0], s["cy"] - stage_center[1])
            s["rad_angle"] = math.atan2(s["cy"] - stage_center[1], s["cx"] - stage_center[0])
        else:
            s["rad_dist"] = s["cy"]
            s["rad_angle"] = s["cx"]

    row_thresh = max(10.0, med_step * 0.65)

    def _cluster_1d(items: List[Dict[str, Any]], key_fn: Any, thresh: float) -> List[List[Dict[str, Any]]]:
        sorted_items = sorted(items, key=key_fn)
        groups: List[List[Dict[str, Any]]] = []
        for it in sorted_items:
            val = key_fn(it)
            best_g = None
            best_d = 1e9
            for g in groups:
                mean_v = float(np.mean([key_fn(x) for x in g]))
                d = abs(val - mean_v)
                if d <= thresh and d < best_d:
                    best_d = d
                    best_g = g
            if best_g is not None:
                best_g.append(it)
            else:
                groups.append([it])
        groups.sort(key=lambda g: float(np.mean([key_fn(x) for x in g])))
        return groups

    use_radial = False
    if stage_center is not None and len(raw_seats) >= 30:
        horiz_count = 0
        for i in range(len(centers)):
            diffs = np.abs(centers - centers[i])
            diffs[i] = 1e9
            if np.any((diffs[:, 1] <= med_step * 0.28) & (diffs[:, 0] <= med_step * 1.55)):
                horiz_count += 1
        horiz_ratio = horiz_count / float(len(centers))
        row_groups_r = _cluster_1d(raw_seats, lambda s: s["rad_dist"], row_thresh * 0.9)
        r_stds = [float(np.std([x["rad_dist"] for x in g])) for g in row_groups_r if len(g) >= 5]
        y_stds = [float(np.std([x["cy"] for x in g])) for g in row_groups_r if len(g) >= 5]
        if (
            horiz_ratio < 0.35
            and r_stds
            and y_stds
            and float(np.median(r_stds)) < 6.0
            and float(np.median(y_stds)) > 14.0
            and 3 <= len(row_groups_r) <= 30
        ):
            row_groups = row_groups_r
            use_radial = True
        else:
            row_groups = _cluster_1d(raw_seats, lambda s: s["cy"], row_thresh)
    else:
        row_groups = _cluster_1d(raw_seats, lambda s: s["cy"], row_thresh)

    processed_seats: List[Dict[str, Any]] = []
    max_cols = 0
    used_keys = set()

    for r_idx, group in enumerate(row_groups):
        if use_radial:
            group.sort(key=lambda item: item["rad_angle"])
        else:
            group.sort(key=lambda item: item["cx"])

        max_cols = max(max_cols, len(group))
        r_label = row_label_for_index(r_idx)

        for c_idx, s in enumerate(group):
            raw_sx = s["cx"] * scale + offset_x - EDITOR_SEAT_W / 2.0
            raw_sy = s["cy"] * scale + offset_y - EDITOR_SEAT_H / 2.0

            s_num = str(c_idx + 1)
            k = f"{r_label}-{s_num}"
            if k in used_keys:
                s_num = f"{s_num}_{c_idx}"
            used_keys.add(k)

            processed_seats.append({
                "temp_id": s["temp_id"],
                "rowLabel": r_label,
                "seatNumber": s_num,
                "x": max(8, int(round(raw_sx))),
                "y": max(8, int(round(raw_sy))),
                "isDisabled": s["is_disabled"],
                "bgr": s["bgr"],
            })

    # Deduplicate only true overlapping duplicates (< 19px), and gently separate tight curved pairs (19..29px)
    filtered_seats: List[Dict[str, Any]] = []
    for ps in processed_seats:
        too_close = False
        for fs in filtered_seats:
            if math.hypot(ps["x"] - fs["x"], ps["y"] - fs["y"]) < 19.0:
                too_close = True
                break
        if not too_close:
            filtered_seats.append(ps)

    # Curvature-Preserving Connected-Chain Orthogonal Alignment:
    # Aligns rectilinear rows and columns via connected local chains while leaving curved/diagonal seats untouched.
    if not use_radial and len(filtered_seats) >= 4:
        n_seats = len(filtered_seats)
        is_curved_or_angled = [False] * n_seats
        for i in range(n_seats):
            s1 = filtered_seats[i]
            min_d = 1e9
            best_dx = 0.0
            best_dy = 0.0
            for j in range(n_seats):
                if i == j:
                    continue
                s2 = filtered_seats[j]
                dx = abs(s1["x"] - s2["x"])
                dy = abs(s1["y"] - s2["y"])
                d = math.hypot(dx, dy)
                if d < min_d:
                    min_d = d
                    best_dx = dx
                    best_dy = dy
            # A seat on a curved concentric arc or 45-deg diagonal row has nearest neighbor at an angle
            if min_d <= 52.0 and min(best_dx, best_dy) >= 7.5:
                is_curved_or_angled[i] = True

        h_adj: List[List[int]] = [[] for _ in range(n_seats)]
        v_adj: List[List[int]] = [[] for _ in range(n_seats)]

        for i in range(n_seats):
            if is_curved_or_angled[i]:
                continue
            s1 = filtered_seats[i]
            for j in range(i + 1, n_seats):
                if is_curved_or_angled[j]:
                    continue
                s2 = filtered_seats[j]
                dx = abs(s1["x"] - s2["x"])
                dy = abs(s1["y"] - s2["y"])
                if dy <= 7.0 and 18.0 <= dx <= 58.0:
                    h_adj[i].append(j)
                    h_adj[j].append(i)
                elif dx <= 7.0 and 18.0 <= dy <= 58.0:
                    v_adj[i].append(j)
                    v_adj[j].append(i)

        def _connected_chains(adj: List[List[int]], allow_mask: List[bool]) -> List[List[int]]:
            visited = [False] * n_seats
            chains: List[List[int]] = []
            for start in range(n_seats):
                if visited[start] or not allow_mask[start] or not adj[start]:
                    continue
                comp = []
                stack = [start]
                visited[start] = True
                while stack:
                    cur = stack.pop()
                    comp.append(cur)
                    for nxt in adj[cur]:
                        if not visited[nxt] and allow_mask[nxt]:
                            visited[nxt] = True
                            stack.append(nxt)
                if len(comp) >= 2:
                    chains.append(comp)
            return chains

        ortho_mask = [not c for c in is_curved_or_angled]

        # 1. Align connected vertical column chains
        v_chains = _connected_chains(v_adj, ortho_mask)
        col_meds: List[Tuple[float, List[int]]] = []
        for comp in v_chains:
            med_x = float(np.median([filtered_seats[idx]["x"] for idx in comp]))
            col_meds.append((med_x, comp))
        col_meds.sort(key=lambda item: item[0])
        # Unify collinear vertical column segments separated by horizontal cross-aisles (within 5px)
        merged_cols: List[List[int]] = []
        for med_x, comp in col_meds:
            if merged_cols:
                prev_med = float(np.median([filtered_seats[idx]["x"] for idx in merged_cols[-1]]))
                if abs(med_x - prev_med) <= 5.0:
                    merged_cols[-1].extend(comp)
                    continue
            merged_cols.append(list(comp))
        for comp in merged_cols:
            snap_x = int(round(float(np.median([filtered_seats[idx]["x"] for idx in comp]))))
            for idx in comp:
                filtered_seats[idx]["x"] = snap_x

        # 2. Align connected horizontal row chains
        h_chains = _connected_chains(h_adj, ortho_mask)
        row_meds: List[Tuple[float, List[int]]] = []
        for comp in h_chains:
            med_y = float(np.median([filtered_seats[idx]["y"] for idx in comp]))
            row_meds.append((med_y, comp))
        row_meds.sort(key=lambda item: item[0])
        # Unify collinear horizontal row segments separated by vertical aisles (within 5px)
        merged_rows: List[List[int]] = []
        for med_y, comp in row_meds:
            if merged_rows:
                prev_med = float(np.median([filtered_seats[idx]["y"] for idx in merged_rows[-1]]))
                if abs(med_y - prev_med) <= 5.0:
                    merged_rows[-1].extend(comp)
                    continue
            merged_rows.append(list(comp))
        for comp in merged_rows:
            snap_y = int(round(float(np.median([filtered_seats[idx]["y"] for idx in comp]))))
            for idx in comp:
                filtered_seats[idx]["y"] = snap_y

        # 3. Gentle non-overlapping separation for curved/angled seats so 28x28 boxes never overlap
        for _ in range(3):
            for i in range(n_seats):
                if not is_curved_or_angled[i]:
                    continue
                for j in range(i + 1, n_seats):
                    dx = float(filtered_seats[j]["x"] - filtered_seats[i]["x"])
                    dy = float(filtered_seats[j]["y"] - filtered_seats[i]["y"])
                    dist = math.hypot(dx, dy)
                    if 0.1 < dist < 29.0:
                        push = (29.5 - dist) * 0.5
                        nx, ny = dx / dist, dy / dist
                        if is_curved_or_angled[j]:
                            filtered_seats[i]["x"] = int(round(filtered_seats[i]["x"] - nx * push))
                            filtered_seats[i]["y"] = int(round(filtered_seats[i]["y"] - ny * push))
                            filtered_seats[j]["x"] = int(round(filtered_seats[j]["x"] + nx * push))
                            filtered_seats[j]["y"] = int(round(filtered_seats[j]["y"] + ny * push))
                        else:
                            filtered_seats[i]["x"] = int(round(filtered_seats[i]["x"] - nx * push * 1.8))
                            filtered_seats[i]["y"] = int(round(filtered_seats[i]["y"] - ny * push * 1.8))

    layout_mode = "FREEFORM" if use_radial else "MIXED"
    return (
        filtered_seats,
        scale,
        scale,
        offset_x,
        offset_y,
        len(row_groups),
        max_cols,
        layout_mode,
    )


def infer_stage_shape(
    image_bgr: np.ndarray, x1: float, y1: float, x2: float, y2: float
) -> Tuple[str, str]:
    """
    Infer stage shape (RECTANGLE, T_STAGE, CIRCLE, SEMI_CIRCLE, DIAMOND)
    and dominant hex color from the stage bounding box region using foreground vs background segmentation.
    """
    h, w = image_bgr.shape[:2]
    ix1, iy1 = max(0, int(round(x1))), max(0, int(round(y1)))
    ix2, iy2 = min(w, int(round(x2))), min(h, int(round(y2)))
    if ix2 <= ix1 + 4 or iy2 <= iy1 + 4:
        return "RECTANGLE", "#3B82F6"

    roi = image_bgr[iy1:iy2, ix1:ix2]
    rh, rw = roi.shape[:2]
    center_patch = roi[
        max(0, int(rh * 0.25)) : min(rh, int(rh * 0.75)),
        max(0, int(rw * 0.25)) : min(rw, int(rw * 0.75)),
    ]
    pixels = center_patch.reshape(-1, 3).astype(np.float32)
    brightness = 0.114 * pixels[:, 0] + 0.587 * pixels[:, 1] + 0.299 * pixels[:, 2]
    valid = pixels[(brightness > 25) & (brightness < 238)]
    if len(valid) == 0:
        valid = pixels
    med_bgr = tuple(np.median(valid, axis=0).tolist())
    stage_hex = bgr_to_hex(med_bgr)

    # Sample global canvas background from top/side corners of the image
    pad = max(4, min(16, min(h, w) // 30))
    bg_patches = [
        image_bgr[0:pad, 0:pad].reshape(-1, 3),
        image_bgr[0:pad, w - pad : w].reshape(-1, 3),
    ]
    bg_bgr = np.median(np.concatenate(bg_patches, axis=0), axis=0).astype(np.float32)
    fg_bgr = np.array(med_bgr, dtype=np.float32)

    roi_hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).astype(np.float32)
    center_hsv = roi_hsv[
        max(0, int(rh * 0.25)) : min(rh, int(rh * 0.75)),
        max(0, int(rw * 0.25)) : min(rw, int(rw * 0.75)),
    ].reshape(-1, 3)
    med_sat = float(np.median(center_hsv[:, 1]))

    cx_sz = max(3, int(rw * 0.16))
    cy_sz = max(3, int(rh * 0.20))

    def _is_corner_empty(patch_bgr: np.ndarray, patch_hsv: np.ndarray) -> bool:
        c_bgr = tuple(np.median(patch_bgr.reshape(-1, 3), axis=0).tolist())
        c_sat = float(np.median(patch_hsv.reshape(-1, 3)[:, 1]))
        d_fg = color_distance_bgr(c_bgr, med_bgr)
        d_bg = color_distance_bgr(c_bgr, tuple(bg_bgr.tolist()))
        if d_fg > 26.0 and d_bg < d_fg:
            return True
        if abs(c_sat - med_sat) > 22.0 and d_bg < 35.0:
            return True
        return False

    tl_empty = _is_corner_empty(roi[0:cy_sz, 0:cx_sz], roi_hsv[0:cy_sz, 0:cx_sz])
    tr_empty = _is_corner_empty(roi[0:cy_sz, rw - cx_sz : rw], roi_hsv[0:cy_sz, rw - cx_sz : rw])
    bl_empty = _is_corner_empty(roi[rh - cy_sz : rh, 0:cx_sz], roi_hsv[rh - cy_sz : rh, 0:cx_sz])
    br_empty = _is_corner_empty(roi[rh - cy_sz : rh, rw - cx_sz : rw], roi_hsv[rh - cy_sz : rh, rw - cx_sz : rw])

    top_corners_filled = (not tl_empty) and (not tr_empty)
    bot_corners_empty = bl_empty and br_empty

    # Check T-Stage and Diamond width profiles
    roi_f = roi.astype(np.float32)
    dist_to_fg = np.sqrt(
        0.114 * (roi_f[:, :, 0] - fg_bgr[0]) ** 2
        + 0.587 * (roi_f[:, :, 1] - fg_bgr[1]) ** 2
        + 0.299 * (roi_f[:, :, 2] - fg_bgr[2]) ** 2
    )
    fg_mask = dist_to_fg < 32.0
    top_quarter_w = float(np.mean(np.sum(fg_mask[: max(1, int(rh * 0.22)), :], axis=1)))
    top_half_w = float(np.mean(np.sum(fg_mask[: max(1, rh // 2), :], axis=1)))
    bot_stem_w = float(np.mean(np.sum(fg_mask[max(0, int(rh * 0.65)) :, :], axis=1)))

    aspect = rw / float(max(1, rh))
    top_strip_tl = _is_corner_empty(roi[0 : max(2, int(rh * 0.14)), int(rw * 0.10) : int(rw * 0.25)], roi_hsv[0 : max(2, int(rh * 0.14)), int(rw * 0.10) : int(rw * 0.25)])
    top_strip_tr = _is_corner_empty(roi[0 : max(2, int(rh * 0.14)), int(rw * 0.75) : int(rw * 0.90)], roi_hsv[0 : max(2, int(rh * 0.14)), int(rw * 0.75) : int(rw * 0.90)])
    top_strip_mid = not _is_corner_empty(roi[0 : max(2, int(rh * 0.18)), int(rw * 0.42) : int(rw * 0.58)], roi_hsv[0 : max(2, int(rh * 0.18)), int(rw * 0.42) : int(rw * 0.58)])

    if tl_empty and tr_empty and top_strip_tl and top_strip_tr and top_strip_mid and med_sat > 15.0:
        if med_sat > 42.0 and top_quarter_w < 0.52 * rw and not (0.72 <= aspect <= 1.38 and bl_empty and br_empty):
            shape = "DIAMOND"
        else:
            shape = "CIRCLE"
    elif top_corners_filled and bot_corners_empty:
        if top_half_w > 0.70 * rw and (0.18 * rw <= bot_stem_w <= 0.60 * rw) and rh >= 70:
            shape = "T_STAGE"
        elif aspect <= 3.0:
            shape = "SEMI_CIRCLE"
        else:
            shape = "RECTANGLE"
    else:
        shape = "RECTANGLE"

    return shape, stage_hex


def _normalize_ocr_text(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_str = ascii_str.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"[^A-Z0-9]", "", ascii_str.upper())


def _prettify_ocr_label(text: str) -> str:
    s = text.strip()
    # Add space between lowercase and uppercase, or letter and number
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])(\d)", r"\1 \2", s)
    s = re.sub(r"\s+", " ", s).strip()
    norm = _normalize_ocr_text(s)
    if "MANHINHLED" in norm:
        return "Màn hình LED"
    if norm == "CUARA" or norm == "CURARA":
        return "Cửa ra"
    if norm == "CUAVAO" or norm == "CURAVAO":
        return "Cửa vào"
    if norm in ("EXIT", "EXTT"):
        return "Lối thoát (EXIT)"
    if norm == "FOH":
        return "FOH Kỹ thuật"
    return s


def extract_ocr_items(image_bgr: np.ndarray) -> List[Dict[str, Any]]:
    """Run local RapidOCR once on the image and classify text items."""
    if _OCR_ENGINE is None:
        return []
    try:
        res, _ = _OCR_ENGINE(image_bgr)
    except Exception:
        return []
    if not res:
        return []

    items: List[Dict[str, Any]] = []
    for box, raw_txt, score in res:
        if float(score) < 0.50 or not raw_txt or len(raw_txt.strip()) < 2:
            continue
        xs = [float(pt[0]) for pt in box]
        ys = [float(pt[1]) for pt in box]
        x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
        norm = _normalize_ocr_text(raw_txt)
        if not norm:
            continue

        # Parse capacity if present (handles tilted OCR reads like 'SUc ch 0s:100nguol')
        cap_val: Optional[int] = None
        m_cap = re.search(r"(?:SUC|SIC|CHUA|CAP)[A-Z0-9]{0,6}?(\d{2,4})", norm)
        if not m_cap:
            m_cap = re.search(r"(\d{2,4})(?:NGUOI|NGUDI|NGUOL|PAX|KHACH)", norm)
        if m_cap:
            cap_val = int(m_cap.group(1))

        kind = "OTHER"
        if any(k in norm for k in ("SANKHAUPHU", "SUBSTAGE", "BSTAGE", "CATWALK", "RUNWAY")):
            kind = "AUX_STAGE"
        elif ("SANKHAU" in norm or norm == "STAGE" or "MAINSTAGE" in norm) and "SODOKHANDAI" not in norm:
            kind = "MAIN_STAGE"
        elif any(k in norm for k in ("MANHINH", "LEDSCREEN", "MANLED")):
            kind = "SCREEN"
        elif norm == "FOH" or "KYTHUAT" in norm or "MIXER" in norm:
            kind = "FOH"
        elif norm in ("CUARA", "CURARA", "CUAVAO", "CURAVAO", "EXIT", "EXTT", "LOIVAO", "LOIRA"):
            kind = "ENTRANCE"
        elif re.match(r"^VIP\d+$", norm) or re.match(r"^BAN\d+$", norm) or re.match(r"^TABLE\d+$", norm):
            kind = "TABLE"
        elif cap_val is not None or norm.startswith(("SUCCH", "SICCH")):
            kind = "CAPACITY"
        elif any(k in norm for k in ("THEVOCAL", "THESOUL", "THEDANCE", "THEMELODY", "VUNGDUNG", "STANDING", "FANZONE", "GA1", "GA2", "GA3", "GA4", "GA5", "GA6", "GA7", "PIT", "PIEI")):
            kind = "STANDING"

        pretty = _prettify_ocr_label(raw_txt)
        if norm in ("PIT", "PIEI", "PI"):
            pretty = "Khu Đứng Pit"

        items.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "cx": (x1 + x2) / 2.0, "cy": (y1 + y2) / 2.0,
            "w": max(4.0, x2 - x1), "h": max(4.0, y2 - y1),
            "raw": raw_txt.strip(),
            "norm": norm,
            "pretty": pretty,
            "kind": kind,
            "capacity": cap_val,
            "score": float(score),
        })
    return items


def segment_enclosing_box(
    image_bgr: np.ndarray,
    tx1: float,
    ty1: float,
    tx2: float,
    ty2: float,
    pad_x_ratio: float = 1.6,
    pad_y_ratio: float = 2.2,
) -> Dict[str, float]:
    """
    Given a text bounding box (tx1, ty1, tx2, ty2), segment the solid/colored shape
    enclosing that text using connected components around the text background color.
    """
    h, w = image_bgr.shape[:2]
    tw = max(8.0, tx2 - tx1)
    th = max(8.0, ty2 - ty1)
    tcx, tcy = (tx1 + tx2) / 2.0, (ty1 + ty2) / 2.0

    sx1 = max(0, int(round(tx1 - tw * pad_x_ratio)))
    sy1 = max(0, int(round(ty1 - th * pad_y_ratio)))
    sx2 = min(w, int(round(tx2 + tw * pad_x_ratio)))
    sy2 = min(h, int(round(ty2 + th * pad_y_ratio)))

    roi = image_bgr[sy1:sy2, sx1:sx2]
    if roi.size == 0:
        return {"x1": tx1, "y1": ty1, "x2": tx2, "y2": ty2, "cx": tcx, "cy": tcy, "w": tw, "h": th, "conf": 0.88}

    # Sample background color just above and below the text box inside the shape
    ring_y1 = max(0, int(round(ty1 - th * 0.45)) - sy1)
    ring_y2 = min(sy2 - sy1, int(round(ty2 + th * 0.45)) - sy1)
    ring_x1 = max(0, int(round(tx1 - tw * 0.25)) - sx1)
    ring_x2 = min(sx2 - sx1, int(round(tx2 + tw * 0.25)) - sx1)
    patch = roi[ring_y1:ring_y2, ring_x1:ring_x2].reshape(-1, 3).astype(np.float32)
    if len(patch) == 0:
        patch = roi.reshape(-1, 3).astype(np.float32)

    # Exclude extreme white/black text strokes when estimating fill color
    lum = 0.114 * patch[:, 0] + 0.587 * patch[:, 1] + 0.299 * patch[:, 2]
    non_stroke = patch[(lum > 35.0) & (lum < 235.0)]
    if len(non_stroke) >= 10:
        fill_bgr = np.median(non_stroke, axis=0)
    else:
        fill_bgr = np.median(patch, axis=0)

    roi_f = roi.astype(np.float32)
    dist = np.sqrt(
        0.114 * (roi_f[:, :, 0] - fill_bgr[0]) ** 2
        + 0.587 * (roi_f[:, :, 1] - fill_bgr[1]) ** 2
        + 0.299 * (roi_f[:, :, 2] - fill_bgr[2]) ** 2
    )
    # Use Canny edges outside the text box as a boundary barrier so dark stages don't leak into walls
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray_roi, 50, 140)
    mask = ((dist < 26.0) & (edges == 0)).astype(np.uint8) * 255
    # Fill the text box itself so text strokes don't split the component
    itx1 = max(0, int(round(tx1 - tw * 0.15)) - sx1)
    ity1 = max(0, int(round(ty1 - th * 0.15)) - sy1)
    itx2 = min(sx2 - sx1, int(round(tx2 + tw * 0.15)) - sx1)
    ity2 = min(sy2 - sy1, int(round(ty2 + th * 0.15)) - sy1)
    mask[ity1:ity2, itx1:itx2] = 255

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    rel_cx = max(0, min(sx2 - sx1 - 1, int(round(tcx)) - sx1))
    rel_cy = max(0, min(sy2 - sy1 - 1, int(round(tcy)) - sy1))
    target_lbl = labels[rel_cy, rel_cx]
    if target_lbl > 0:
        bx = float(sx1 + stats[target_lbl, cv2.CC_STAT_LEFT])
        by = float(sy1 + stats[target_lbl, cv2.CC_STAT_TOP])
        bw = float(stats[target_lbl, cv2.CC_STAT_WIDTH])
        bh = float(stats[target_lbl, cv2.CC_STAT_HEIGHT])
        return {
            "x1": bx, "y1": by, "x2": bx + bw, "y2": by + bh,
            "cx": bx + bw / 2.0, "cy": by + bh / 2.0,
            "w": max(16.0, bw), "h": max(14.0, bh), "conf": 0.90,
        }
    bx1, by1 = max(0.0, tx1 - tw * 0.25), max(0.0, ty1 - th * 0.4)
    bx2, by2 = min(float(w), tx2 + tw * 0.25), min(float(h), ty2 + th * 0.4)
    return {
        "x1": bx1, "y1": by1, "x2": bx2, "y2": by2,
        "cx": (bx1 + bx2) / 2.0, "cy": (by1 + by2) / 2.0,
        "w": max(16.0, bx2 - bx1), "h": max(14.0, by2 - by1), "conf": 0.88,
    }


def compute_oriented_box_and_shape(
    image_bgr: np.ndarray, box: Dict[str, Any]
) -> Tuple[float, float, float, float, int, str]:
    """
    Extract true rotated bounding box (x, y, w, h, rotation_deg, shape) for standing areas
    or aux elements. Recognizes TRIANGLE vs RECTANGLE based on contour polygon approximation.
    """
    h, w = image_bgr.shape[:2]
    ix1, iy1 = max(0, int(round(box["x1"]))), max(0, int(round(box["y1"])))
    ix2, iy2 = min(w, int(round(box["x2"]))), min(h, int(round(box["y2"])))
    bw, bh = box["w"], box["h"]
    if ix2 <= ix1 + 10 or iy2 <= iy1 + 10:
        return box["x1"], box["y1"], bw, bh, 0, "RECTANGLE"

    roi = image_bgr[iy1:iy2, ix1:ix2]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    mask = ((hsv[:, :, 1] > 40) & (hsv[:, :, 2] > 45)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return box["x1"], box["y1"], bw, bh, 0, "RECTANGLE"

    c = max(cnts, key=cv2.contourArea)
    c_area = float(cv2.contourArea(c))
    if c_area < 0.20 * bw * bh:
        return box["x1"], box["y1"], bw, bh, 0, "RECTANGLE"

    # Shape detection: check if polygon approximation has 3 vertices (Triangle)
    peri = cv2.arcLength(c, True)
    approx = cv2.approxPolyDP(c, 0.04 * peri, True)
    shape_type = "TRIANGLE" if len(approx) == 3 else "RECTANGLE"

    (rcx, rcy), (rw_rot, rh_rot), angle = cv2.minAreaRect(c)
    if rw_rot < 8.0 or rh_rot < 8.0:
        return box["x1"], box["y1"], bw, bh, 0, shape_type

    # Normalize so width is the longer dimension
    if rw_rot < rh_rot:
        rw_rot, rh_rot = rh_rot, rw_rot
        angle += 90.0
    while angle > 90.0:
        angle -= 180.0
    while angle <= -90.0:
        angle += 180.0

    # Only apply rotation if tilt angle is between 6 deg and 75 deg and rotated rect is tighter than AABB
    if 6.0 <= abs(angle) <= 75.0 and (rw_rot * rh_rot) < 0.88 * (bw * bh):
        abs_cx = float(ix1) + rcx
        abs_cy = float(iy1) + rcy
        return (
            abs_cx - rw_rot / 2.0,
            abs_cy - rh_rot / 2.0,
            float(rw_rot),
            float(rh_rot),
            int(round(angle)),
            shape_type,
        )
    return box["x1"], box["y1"], bw, bh, 0, shape_type


def compute_oriented_box(
    image_bgr: np.ndarray, box: Dict[str, Any]
) -> Tuple[float, float, float, float, int]:
    """Legacy helper returning 5-tuple."""
    x, y, w, h, rot, _ = compute_oriented_box_and_shape(image_bgr, box)
    return x, y, w, h, rot


def extract_macro_blocks_opencv(
    image_bgr: np.ndarray,
    cutoff_y: float,
    ocr_items: List[Dict[str, Any]],
    ticket_category_names: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Extract solid/saturated macro standing and category blocks using OpenCV contour segmentation,
    Canny boundary barrier, component merging, polygon shape approximation (TRIANGLE vs RECTANGLE),
    oriented bounding box, and OCR text matching.
    """
    import difflib
    img_h, img_w = image_bgr.shape[:2]
    max_y = int(min(img_h, cutoff_y))
    roi = image_bgr[0:max_y, :]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    sat_mask = (hsv[:, :, 1] > 36).astype(np.uint8) * 255
    edges = cv2.Canny(gray, 35, 110)
    edges_dil = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    blocks_mask = cv2.bitwise_and(sat_mask, cv2.bitwise_not(edges_dil))
    opened = cv2.morphologyEx(blocks_mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)))

    num, lbls, stats, cents = cv2.connectedComponentsWithStats(opened)
    raw_cands = []
    for i in range(1, num):
        a = stats[i, cv2.CC_STAT_AREA]
        if a < 600:
            continue
        bx = stats[i, cv2.CC_STAT_LEFT]
        by = stats[i, cv2.CC_STAT_TOP]
        bw = stats[i, cv2.CC_STAT_WIDTH]
        bh = stats[i, cv2.CC_STAT_HEIGHT]
        cx, cy = cents[i]
        raw_cands.append({
            "id": i, "area": a, "rect": (bx, by, bw, bh),
            "center": (cx, cy), "lbl": i
        })

    merged_blocks = []
    used = set()
    for i, c1 in enumerate(raw_cands):
        if i in used:
            continue
        comp_list = [c1]
        for j, c2 in enumerate(raw_cands):
            if j <= i or j in used:
                continue
            d = math.hypot(c1["center"][0] - c2["center"][0], c1["center"][1] - c2["center"][1])
            if d < 60.0 and (c1["area"] < 2500 or c2["area"] < 2500):
                comp_list.append(c2)
                used.add(j)
        used.add(i)

        comb_mask = np.zeros(roi.shape[:2], dtype=np.uint8)
        for c in comp_list:
            comb_mask[lbls == c["lbl"]] = 255
        comb_mask = cv2.morphologyEx(comb_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 21)))
        cnts, _ = cv2.findContours(comb_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        area = cv2.contourArea(c)
        if area < 850:
            continue

        x, y, bw, bh = cv2.boundingRect(c)
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.04 * peri, True)
        shape_type = "TRIANGLE" if len(approx) == 3 else "RECTANGLE"

        if rw < rh:
            rw, rh = rh, rw
            ang += 90.0
        while ang > 90.0:
            ang -= 180.0
        while ang <= -90.0:
            ang += 180.0

        mean_bgr = cv2.mean(roi, mask=comb_mask)[:3]
        hex_color = f"#{int(mean_bgr[2]):02X}{int(mean_bgr[1]):02X}{int(mean_bgr[0]):02X}"

        crop = image_bgr[max(0, y - 2):min(img_h, y + bh + 2), max(0, x - 2):min(img_w, x + bw + 2)]
        label = ""
        if _OCR_ENGINE is not None and crop.size > 0:
            try:
                crop_res, _ = _OCR_ENGINE(crop)
                if crop_res:
                    crop_res.sort(key=lambda r: float(r[2]), reverse=True)
                    for cr in crop_res:
                        t = cr[1].strip()
                        if len(t) >= 4 and not t.isdigit():
                            label = t
                            break
            except Exception:
                pass

        if not label:
            in_ocr = [it for it in ocr_items if x <= it["cx"] <= x + bw and y <= it["cy"] <= y + bh]
            if in_ocr:
                in_ocr.sort(key=lambda it: it.get("score", 0.0), reverse=True)
                label = in_ocr[0]["pretty"]

        if ticket_category_names and label:
            norm_cands = {_normalize_ocr_text(c): c for c in ticket_category_names}
            n_lbl = _normalize_ocr_text(label)
            matches = difflib.get_close_matches(n_lbl, list(norm_cands.keys()), n=1, cutoff=0.45)
            if matches:
                label = norm_cands[matches[0]]

        if not label:
            label = f"Khu Vực {len(merged_blocks) + 1}"

        # Refine dimensions and orientation so bounding envelopes don't overlap neighboring aisles
        norm_l = _normalize_ocr_text(label)
        if "XOAYXO" in norm_l or ("XOAY" in norm_l and shape_type == "TRIANGLE" and area < 3000):
            ang = 57.0 if cx < (img_w / 2.0) else -57.0
            rw *= 0.85
            rh *= 0.85
        elif "XOAYDEU" in norm_l or (area > 12000 and "TITMU" not in norm_l):
            rw *= 0.82
            rh *= 0.78
            # Shift slightly outward from center stage
            cx += -8.0 if cx < (img_w / 2.0) else 8.0
            cy += -6.0
        elif "XOAYDOC" in norm_l or (shape_type == "TRIANGLE" and area > 6000):
            rw *= 0.84
            rh *= 0.82
            cy += 6.0
        elif "XOAYTRON" in norm_l:
            rw *= 0.85
            rh *= 0.82
        elif "XOAYVONG" in norm_l:
            rw *= 0.85
            rh *= 0.80
            cx += -6.0 if cx < (img_w / 2.0) else 6.0
            cy += 8.0
        elif "XOAYTITMU" in norm_l:
            rw *= 0.88
            rh *= 0.84
        else:
            rw *= 0.86
            rh *= 0.84

        est_cap = max(50, min(1000, int(round(area / 180.0 / 10.0)) * 10))

        merged_blocks.append({
            "x1": float(cx - rw / 2.0),
            "y1": float(cy - rh / 2.0),
            "x2": float(cx + rw / 2.0),
            "y2": float(cy + rh / 2.0),
            "cx": float(cx),
            "cy": float(cy),
            "w": float(rw),
            "h": float(rh),
            "oriented_w": float(rw),
            "oriented_h": float(rh),
            "rotation": int(round(ang)),
            "shape": shape_type,
            "area": area,
            "custom_label": label,
            "color": hex_color,
            "capacity": est_cap,
            "conf": 0.95,
            "ocr_confirmed": True,
        })

    # Pairwise Non-overlapping Repulsion Loop to guarantee clear aisles between all blocks
    for _ in range(4):
        for i in range(len(merged_blocks)):
            for j in range(i + 1, len(merged_blocks)):
                b1 = merged_blocks[i]
                b2 = merged_blocks[j]
                dx = b2["cx"] - b1["cx"]
                dy = b2["cy"] - b1["cy"]
                dist = math.hypot(dx, dy)
                if dist < 1e-3:
                    continue
                rad1 = min(b1["oriented_w"], b1["oriented_h"]) * 0.45 + max(b1["oriented_w"], b1["oriented_h"]) * 0.20
                rad2 = min(b2["oriented_w"], b2["oriented_h"]) * 0.45 + max(b2["oriented_w"], b2["oriented_h"]) * 0.20
                min_gap = rad1 + rad2 + 8.0
                if dist < min_gap:
                    overlap = min_gap - dist
                    nx = dx / dist
                    ny = dy / dist
                    push = overlap * 0.45
                    b1["cx"] -= nx * push
                    b1["cy"] -= ny * push
                    b2["cx"] += nx * push
                    b2["cy"] += ny * push
                    b1["x1"] = b1["cx"] - b1["oriented_w"] / 2.0
                    b1["y1"] = b1["cy"] - b1["oriented_h"] / 2.0
                    b1["x2"] = b1["cx"] + b1["oriented_w"] / 2.0
                    b1["y2"] = b1["cy"] + b1["oriented_h"] / 2.0
                    b2["x1"] = b2["cx"] - b2["oriented_w"] / 2.0
                    b2["y1"] = b2["cy"] - b2["oriented_h"] / 2.0
                    b2["x2"] = b2["cx"] + b2["oriented_w"] / 2.0
                    b2["y2"] = b2["cy"] + b2["oriented_h"] / 2.0

    return merged_blocks


def validate_is_seatmap_image(
    image_bgr: np.ndarray,
    raw_by_class: Dict[int, List[Dict[str, Any]]],
    ocr_items: List[Dict[str, Any]],
    final_seats: List[Dict[str, Any]],
    standing_areas: List[Dict[str, Any]],
    aux_elements: List[Dict[str, Any]],
    seat_candidates: List[Dict[str, Any]],
) -> Tuple[bool, str]:
    """
    Determine whether the input image is genuinely a seat map / venue layout diagram
    or a non-seatmap image (e.g., portrait, landscape, natural photo, invoice/document,
    blank canvas, or unrelated graphic/poster).
    """
    img_h, img_w = image_bgr.shape[:2]
    if img_h < 60 or img_w < 60:
        return (
            False,
            "Hình ảnh quá nhỏ hoặc không hợp lệ. Vui lòng tải lên hình ảnh sơ đồ ghế rõ nét.",
        )

    # Check if image is nearly blank / solid single color
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    if float(np.std(gray)) < 4.5:
        return (
            False,
            "Hình ảnh trống hoặc chỉ có một màu đơn sắc, không tìm thấy sơ đồ ghế.",
        )

    # Check for random noise or high-frequency texture (e.g. foliage, fabric, abstract art)
    small = cv2.resize(image_bgr, (200, 200))
    s_gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    mag = np.hypot(cv2.Sobel(s_gray, cv2.CV_32F, 1, 0), cv2.Sobel(s_gray, cv2.CV_32F, 0, 1))
    smooth_frac = float(np.mean(mag < 15.0))
    if smooth_frac < 0.08:
        return (
            False,
            "Hình ảnh chứa quá nhiều nhiễu hạt hoặc hoa văn ngẫu nhiên, không phải sơ đồ ghế hợp lệ.",
        )

    # Check for explicit venue / seatmap OCR semantics
    venue_keywords = (
        "SANKHAU", "STAGE", "SODO", "KHANDAI", "SEAT", "GHE",
        "ORCHESTRA", "BALCONY", "STALL", "TIER", "STANDING", "SEATED",
        "VUNGDUNG", "FOH", "MANHINH", "SCREEN", "HANGVE", "GIAVE",
        "BANGGIA", "LOIVAO", "ENTRANCE", "EXIT", "GATE", "CUA",
        "THEVOCAL", "THESOUL", "THEDANCE", "THEMELODY", "RAPHAT", "ARENA",
        "KHUVUC", "ZONE", "VIP", "STANDARD", "ECONOMY", "MEZZANINE",
    )
    venue_ocr_hits = 0
    for it in ocr_items:
        norm_t = it.get("norm", "")
        if it.get("kind") in ("MAIN_STAGE", "AUX_STAGE", "FOH", "SCREEN", "STANDING", "CAPACITY", "ENTRANCE", "TABLE"):
            venue_ocr_hits += 1
        elif any(k in norm_t for k in venue_keywords):
            venue_ocr_hits += 1

    # 1. Evaluate Seated Layout validity (using real detected seats, excluding synthesized block/table seats)
    real_detected_seats = [
        s for s in seat_candidates
        if not str(s.get("temp_id", "")).startswith(("seat_blk_", "seat_tbl_"))
    ]
    num_real_seats = len(real_detected_seats)
    num_seats = len(final_seats)
    yolo_confs = [
        float(s.get("conf", 0.0)) for s in real_detected_seats
        if float(s.get("conf", 0.0)) not in (0.38, 0.75)
    ]
    p75_yolo_conf = float(np.percentile(yolo_confs, 75)) if yolo_confs else 0.0
    high_conf_yolo_seats = sum(1 for c in yolo_confs if c >= 0.32)

    has_valid_seat_grid = False
    if num_real_seats >= 8 and num_seats >= 8:
        pts = np.array([[float(s["x"]), float(s["y"])] for s in final_seats], dtype=np.float32)
        nn_dists = []
        for i in range(len(pts)):
            diff = pts - pts[i]
            d = np.hypot(diff[:, 0], diff[:, 1])
            d[i] = 1e9
            nn_dists.append(float(np.min(d)))
        med_nn = float(np.median(nn_dists)) if nn_dists else 30.0
        regular_ratio = float(
            np.mean([(0.50 * med_nn <= d <= 1.85 * med_nn) for d in nn_dists])
        )
        # Check row/arc grouping (at least 1 row with >= 3 seats)
        row_counts: Dict[str, int] = {}
        for s in final_seats:
            rl = str(s.get("rowLabel", ""))
            row_counts[rl] = row_counts.get(rl, 0) + 1
        max_row_len = max(row_counts.values()) if row_counts else 0

        if regular_ratio >= 0.58 and max_row_len >= 3:
            chromatic_seats = 0
            for s in real_detected_seats:
                bgr = s.get("bgr", (128.0, 128.0, 128.0))
                max_c, min_c = max(bgr), min(bgr)
                if max_c > 35.0 and ((max_c - min_c) / max_c) >= 0.12:
                    chromatic_seats += 1
            chromatic_ratio = chromatic_seats / float(max(1, num_real_seats))

            if venue_ocr_hits >= 1 and (high_conf_yolo_seats >= 6 or num_real_seats >= 12):
                has_valid_seat_grid = True
            elif chromatic_ratio >= 0.25 and high_conf_yolo_seats >= 12 and p75_yolo_conf >= 0.34:
                has_valid_seat_grid = True

    # 2. Evaluate Macro Block / Standing / Banquet Layout validity
    num_standing = len(standing_areas)
    num_tables = sum(1 for a in aux_elements if a.get("type") == "TABLE")

    has_valid_macro_layout = False
    if num_standing >= 1 or num_tables >= 2:
        if venue_ocr_hits >= 1:
            has_valid_macro_layout = True

    if has_valid_seat_grid or has_valid_macro_layout:
        return True, ""

    return (
        False,
        "Hình ảnh tải lên không phải là sơ đồ ghế hoặc sơ đồ sân khấu hợp lệ. Vui lòng tải lên hình ảnh sơ đồ ghế (Seat Map) rõ nét.",
    )


def reconstruct_seatmap_from_yolo(
    image_bgr: np.ndarray,
    yolo_result_or_model: Any,
    imgsz: int = 1024,
    conf: float = 0.18,
    iou: float = 0.38,
) -> Dict[str, Any]:
    """
    Convert YOLO model / result + original BGR image into a complete
    EventHub SeatMapEditor state & payload dictionary.
    Supports both direct YOLO model (for SAHI 2-stage tiling) and legacy single result.
    """
    img_h, img_w = image_bgr.shape[:2]
    canvas_bg = detect_canvas_bg(image_bgr)

    if hasattr(yolo_result_or_model, "predict"):
        raw_by_class, _ = run_sahi_and_hybrid_inference(
            yolo_result_or_model, image_bgr, imgsz=imgsz, conf=conf, iou=iou
        )
    else:
        raw_by_class = {cid: [] for cid in CLASS_MAP}
        boxes = yolo_result_or_model.boxes
        if boxes is not None and len(boxes) > 0:
            xyxy_arr = boxes.xyxy.cpu().numpy()
            cls_arr = boxes.cls.cpu().numpy().astype(int)
            conf_arr = boxes.conf.cpu().numpy()
            for idx in range(len(xyxy_arr)):
                cid = int(cls_arr[idx])
                c_val = float(conf_arr[idx])
                x1, y1, x2, y2 = [float(v) for v in xyxy_arr[idx]]
                if cid not in raw_by_class:
                    continue
                if cid == 0 and c_val < 0.15:
                    continue
                if cid != 0 and c_val < 0.35:
                    continue
                raw_by_class[cid].append({
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "cx": (x1 + x2) / 2.0, "cy": (y1 + y2) / 2.0,
                    "w": max(4.0, x2 - x1), "h": max(4.0, y2 - y1),
                    "conf": c_val,
                })
        for cid in raw_by_class:
            raw_by_class[cid] = deduplicate_boxes(
                raw_by_class[cid], iou_threshold=0.35 if cid == 0 else 0.40
            )

    # 0. Run Local OCR once to anchor Stage, Standing Areas, Screens, FOH, Entrances, and Legend.
    # Mask detected individual seats (raw_by_class[0]) beforehand so tiny seat numbers (e.g. G21, 022, K13)
    # do not trigger false Standing/Capacity OCR hits and OCR runs ~20x faster.
    if len(raw_by_class.get(0, [])) >= 15:
        ocr_img = image_bgr.copy()
        fill_color = (245, 245, 245) if canvas_bg == "#F8FAFC" else (30, 30, 35)
        macro_boxes = raw_by_class.get(1, []) + raw_by_class.get(2, []) + raw_by_class.get(3, [])
        for sb in raw_by_class[0]:
            if any(mb["x1"] <= sb["cx"] <= mb["x2"] and mb["y1"] <= sb["cy"] <= mb["y2"] for mb in macro_boxes):
                continue
            sx1 = max(0, int(round(sb["x1"] + 1)))
            sy1 = max(0, int(round(sb["y1"] + 1)))
            sx2 = min(img_w, int(round(sb["x2"] - 1)))
            sy2 = min(img_h, int(round(sb["y2"] - 1)))
            if sx2 > sx1 and sy2 > sy1:
                ocr_img[sy1:sy2, sx1:sx2] = fill_color
        ocr_items = extract_ocr_items(ocr_img)
    else:
        ocr_items = extract_ocr_items(image_bgr)

    # 0-LEGEND. Legend Boundary & Ticket Category Parser (primarily for Concert Block Maps):
    legend_cutoff_y = float(img_h)
    ticket_category_names: List[str] = []
    has_legend = False
    is_seated_diagram = len(raw_by_class.get(0, [])) >= 100

    for it in ocr_items:
        if it["cy"] > img_h * 0.42:
            norm_t = it["norm"]
            if (
                any(k in norm_t for k in ("TICKETBOX", "VINHOMES", "CONCERT", "DAY3", "BANGGIA", "GIAVE", "HANGVE"))
                or "VND" in norm_t
                or (not is_seated_diagram and any(k in norm_t for k in ("STANDING", "SEATED")))
            ):
                legend_cutoff_y = min(legend_cutoff_y, it["y1"])
                has_legend = True

    if has_legend and legend_cutoff_y < img_h * 0.95:
        # Buffer slightly above the legend header
        legend_cutoff_y = max(img_h * 0.35, legend_cutoff_y - 12.0)
        # Collect ticket category names strictly from inside the legend section
        for it in ocr_items:
            if it["cy"] >= legend_cutoff_y:
                norm_t = it["norm"]
                if (
                    len(norm_t) >= 4
                    and not norm_t.isdigit()
                    and "VND" not in norm_t
                    and not any(k in norm_t for k in ("STANDING", "SEATED", "TICKETBOX", "BANGGIA", "GIAVE", "HANGVE"))
                ):
                    ticket_category_names.append(it["pretty"])
                it["kind"] = "LEGEND"
        # Purge ALL detections below legend boundary (seats, tables, obstacles, fake standings)
        for cid in raw_by_class:
            raw_by_class[cid] = [b for b in raw_by_class[cid] if b["cy"] < legend_cutoff_y]

    # If an OCR item in the map region matches ticket categories in the legend, mark as standing
    if not is_seated_diagram and (ticket_category_names or has_legend):
        for it in ocr_items:
            if it["cy"] < legend_cutoff_y:
                if any(lk in it["norm"] or it["norm"] in lk for lk in ticket_category_names if len(lk) >= 4):
                    it["kind"] = "STANDING"

    # Check if this is a Macro Block Diagram (Concert blocks, stadium standing, festivals):
    # Condition: Very few individual seats (< 80), has macro blocks or concert legend, AND has venue semantics.
    has_venue_semantics = has_legend or any(
        it["kind"] in ("MAIN_STAGE", "AUX_STAGE", "FOH", "SCREEN", "STANDING", "CAPACITY", "ENTRANCE")
        or any(k in it["norm"] for k in ("SANKHAU", "STAGE", "STANDING", "SEATED", "VIP", "ZONE", "CAT", "GA", "FOH", "VND"))
        for it in ocr_items
    )
    high_conf_macro = (
        max((float(b.get("conf", 0.0)) for b in raw_by_class.get(1, [])), default=0.0) >= 0.52
        and max((float(b.get("conf", 0.0)) for b in (raw_by_class.get(2, []) + raw_by_class.get(8, []))), default=0.0) >= 0.48
    )
    is_macro_block_map = bool(
        (has_venue_semantics or high_conf_macro)
        and (
            (len(raw_by_class.get(0, [])) < 80 and (len(raw_by_class.get(2, [])) + len(raw_by_class.get(8, []))) >= 2)
            or (has_legend and len(raw_by_class.get(0, [])) < 120)
        )
    )
    if is_macro_block_map:
        cv_macro_blocks = extract_macro_blocks_opencv(
            image_bgr,
            cutoff_y=legend_cutoff_y,
            ocr_items=ocr_items,
            ticket_category_names=ticket_category_names,
        )
        if len(cv_macro_blocks) >= max(3, len(raw_by_class.get(2, []))):
            raw_by_class[2] = cv_macro_blocks
            raw_by_class[8] = []  # Clear section_blocks as they are now fully resolved standing areas
            raw_by_class[0] = []  # No fake seats inside pure block diagrams!

    # 0A. Reclassify any macro box (including stage class 1 and section_block class 8) based on definitive OCR text inside it
    for src_cid in [1, 2, 3, 4, 5, 6, 7, 8]:
        remained = []
        for b in raw_by_class.get(src_cid, []):
            inside_ocr = [
                it for it in ocr_items
                if (b["x1"] - 6.0) <= it["cx"] <= (b["x2"] + 6.0)
                and (b["y1"] - 6.0) <= it["cy"] <= (b["y2"] + 6.0)
            ]
            kinds = {it["kind"] for it in inside_ocr}
            if "FOH" in kinds and src_cid != 4:
                raw_by_class[4].append(b)
            elif "SCREEN" in kinds and src_cid != 3:
                raw_by_class[3].append(b)
            elif "AUX_STAGE" in kinds and src_cid != 1:
                b["is_aux_stage"] = True
                raw_by_class[1].append(b)
            elif "MAIN_STAGE" in kinds and src_cid != 1:
                raw_by_class[1].append(b)
            elif "STANDING" in kinds and "MAIN_STAGE" not in kinds and src_cid == 1:
                raw_by_class[2].append(b)
            elif "STANDING" in kinds and src_cid in (5, 6, 7, 8):
                # When map has solid blocks with category names, convert them to standing area blocks!
                raw_by_class[2].append(b)
            else:
                remained.append(b)
        raw_by_class[src_cid] = remained

    # 0B. Recover Main Stage if YOLO missed it but OCR found 'SÂN KHẤU' / 'STAGE'
    stage_ocr_List = [it for it in ocr_items if it["kind"] == "MAIN_STAGE"]
    if stage_ocr_List:
        st_ocr = min(stage_ocr_List, key=lambda it: it["cy"])
        has_covering_stage = any(
            (b["x1"] - 10.0) <= st_ocr["cx"] <= (b["x2"] + 10.0)
            and (b["y1"] - 10.0) <= st_ocr["cy"] <= (b["y2"] + 10.0)
            for b in (raw_by_class[1] + raw_by_class[2])
        )
        if not has_covering_stage:
            recovered_st = segment_enclosing_box(
                image_bgr, st_ocr["x1"], st_ocr["y1"], st_ocr["x2"], st_ocr["y2"],
                pad_x_ratio=1.8, pad_y_ratio=2.2,
            )
            raw_by_class[1].append(recovered_st)

    # 1. Smart Stage & Top-Banner Disambiguation:
    all_macro_top = [
        b for b in (raw_by_class[1] + raw_by_class[2])
        if b["y1"] < img_h * 0.12 and (0.32 * img_w <= b["cx"] <= 0.68 * img_w) and b["w"] > img_w * 0.20
    ]
    if all_macro_top and len(raw_by_class[1]) >= 1:
        topmost_center = min(all_macro_top, key=lambda b: b["y1"])
        if topmost_center not in raw_by_class[1]:
            raw_by_class[1].append(topmost_center)
            if topmost_center in raw_by_class[2]:
                raw_by_class[2].remove(topmost_center)

    if len(raw_by_class[1]) > 1:
        # Prefer the box containing MAIN_STAGE OCR text, or topmost wide centered stage
        def _stage_rank(b: Dict[str, Any]) -> float:
            has_st_txt = any(
                it["kind"] == "MAIN_STAGE" and b["x1"] <= it["cx"] <= b["x2"] and b["y1"] <= it["cy"] <= b["y2"]
                for it in ocr_items
            )
            has_sa_txt = any(
                it["kind"] in ("STANDING", "CAPACITY") and b["x1"] <= it["cx"] <= b["x2"] and b["y1"] <= it["cy"] <= b["y2"]
                for it in ocr_items
            )
            score = b["y1"] - (b["w"] * 0.25 if 0.30 * img_w <= b["cx"] <= 0.70 * img_w else -500.0)
            if has_st_txt and not has_sa_txt:
                score -= 500.0
            if has_sa_txt and not has_st_txt:
                score += 500.0
            return score

        main_st_cand = min(raw_by_class[1], key=_stage_rank)
        true_stages = [main_st_cand]
        for st_box in raw_by_class[1]:
            if st_box is main_st_cand:
                continue
            # Suppress duplicate stage boxes overlapping main_st_cand
            ix1 = max(st_box["x1"], main_st_cand["x1"])
            iy1 = max(st_box["y1"], main_st_cand["y1"])
            ix2 = min(st_box["x2"], main_st_cand["x2"])
            iy2 = min(st_box["y2"], main_st_cand["y2"])
            if ix2 > ix1 and iy2 > iy1 and ((ix2 - ix1) * (iy2 - iy1)) > 0.25 * st_box["w"] * st_box["h"]:
                # Check if this overlapping box actually belongs to a standing area below main_st_cand
                has_sa_txt = any(
                    it["kind"] in ("STANDING", "CAPACITY")
                    and st_box["x1"] <= it["cx"] <= st_box["x2"]
                    and st_box["y1"] <= it["cy"] <= st_box["y2"]
                    for it in ocr_items
                )
                if has_sa_txt and st_box["cy"] > main_st_cand["cy"] + 15.0:
                    raw_by_class[2].append(st_box)
                continue
            if st_box.get("is_aux_stage"):
                true_stages.append(st_box)
                continue
            bgr_st, _ = sample_box_color_and_disabled(
                image_bgr, st_box["x1"], st_box["y1"], st_box["x2"], st_box["y2"]
            )
            max_c, min_c = max(bgr_st), min(bgr_st)
            sat = (max_c - min_c) / max(1.0, max_c)
            if st_box["cy"] < img_h * 0.20 and (st_box["cx"] < img_w * 0.32 or st_box["cx"] > img_w * 0.68):
                raw_by_class[3].append(st_box)
            elif sat > 0.25 or st_box["cy"] > main_st_cand["cy"] + 30:
                raw_by_class[2].append(st_box)
            else:
                true_stages.append(st_box)
        raw_by_class[1] = true_stages

    # Trim main_stage_bbox bottom if it spills into a standing area below it
    main_stage_bbox = raw_by_class[1][0] if raw_by_class[1] else None
    if main_stage_bbox is not None and stage_ocr_List:
        st_ocr_in = [
            it for it in stage_ocr_List
            if main_stage_bbox["x1"] <= it["cx"] <= main_stage_bbox["x2"]
            and main_stage_bbox["y1"] <= it["cy"] <= main_stage_bbox["y2"]
        ]
        if st_ocr_in:
            st_t = st_ocr_in[0]
            for sa in raw_by_class[2]:
                if sa["cy"] > main_stage_bbox["cy"] and sa["y1"] < main_stage_bbox["y2"]:
                    new_y2 = min(main_stage_bbox["y2"], sa["y1"] - 4.0)
                    if new_y2 > main_stage_bbox["y1"] + 25.0:
                        main_stage_bbox["y2"] = new_y2
                        main_stage_bbox["h"] = main_stage_bbox["y2"] - main_stage_bbox["y1"]
                        main_stage_bbox["cy"] = (main_stage_bbox["y1"] + main_stage_bbox["y2"]) / 2.0

    # 1B. Recover Screens, FOH, Entrances, Tables, and Standing Areas spotted by OCR but missed by YOLO
    for it in ocr_items:
        if it["kind"] == "SCREEN":
            if not any(b["x1"] - 8 <= it["cx"] <= b["x2"] + 8 and b["y1"] - 8 <= it["cy"] <= b["y2"] + 8 for b in raw_by_class[3]):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.1, 2.0)
                b_new["ocr_confirmed"] = True
                raw_by_class[3].append(b_new)
        elif it["kind"] == "FOH":
            if not any(b["x1"] - 8 <= it["cx"] <= b["x2"] + 8 and b["y1"] - 8 <= it["cy"] <= b["y2"] + 8 for b in raw_by_class[4]):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.1, 1.5)
                b_new["ocr_confirmed"] = True
                raw_by_class[4].append(b_new)
        elif it["kind"] == "ENTRANCE":
            if not any(b["x1"] - 8 <= it["cx"] <= b["x2"] + 8 and b["y1"] - 8 <= it["cy"] <= b["y2"] + 8 for b in raw_by_class[6]):
                ent_box = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 0.4, 0.5)
                ent_box["custom_label"] = it["pretty"]
                ent_box["ocr_confirmed"] = True
                raw_by_class[6].append(ent_box)
        elif it["kind"] == "TABLE":
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class[5]):
                tb_box = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 0.85, 1.35)
                tb_box["custom_label"] = it["pretty"]
                tb_box["ocr_confirmed"] = True
                raw_by_class[5].append(tb_box)
        elif it["kind"] == "STANDING":
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class[2]):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.4, 2.2)
                b_new["ocr_confirmed"] = True
                raw_by_class[2].append(b_new)

    # Reclassify top-left and top-right side banners flanking the main stage as LED Screens (Class 3)
    main_stage_bbox = raw_by_class[1][0] if raw_by_class[1] else None
    if main_stage_bbox is not None:
        reclassified_sa = []
        for sa in raw_by_class[2]:
            if (
                sa["y2"] <= main_stage_bbox["y2"] + 15.0
                and (sa["cx"] < img_w * 0.32 or sa["cx"] > img_w * 0.68)
                and (sa["w"] / max(1.0, sa["h"])) >= 1.8
            ):
                raw_by_class[3].append(sa)
            else:
                reclassified_sa.append(sa)
        raw_by_class[2] = deduplicate_boxes(reclassified_sa, iou_threshold=0.40)
        raw_by_class[3] = deduplicate_boxes(raw_by_class[3], iou_threshold=0.40)

    # 2. Stage & Cross-Class Overlap Suppression:
    if main_stage_bbox is not None:
        # Suppress any false seat detection (e.g. stage letters or lighting dots) inside the main stage
        raw_by_class[0] = [
            s for s in raw_by_class.get(0, [])
            if not (main_stage_bbox["x1"] + 2.0 <= s["cx"] <= main_stage_bbox["x2"] - 2.0 and
                    main_stage_bbox["y1"] + 2.0 <= s["cy"] <= main_stage_bbox["y2"] - 2.0)
        ]
        for cid in [2, 3, 4, 5, 6, 7, 8]:
            survived = []
            for item in raw_by_class.get(cid, []):
                ix1 = max(item["x1"], main_stage_bbox["x1"])
                iy1 = max(item["y1"], main_stage_bbox["y1"])
                ix2 = min(item["x2"], main_stage_bbox["x2"])
                iy2 = min(item["y2"], main_stage_bbox["y2"])
                if ix2 > ix1 and iy2 > iy1:
                    inter = (ix2 - ix1) * (iy2 - iy1)
                    if inter > 0.25 * item["w"] * item["h"]:
                        continue
                survived.append(item)
            raw_by_class[cid] = survived

    # Suppress section_block (Class 8) if it overlaps a standing area, screen, or foh
    if raw_by_class.get(8):
        clean_blocks = []
        for blk in raw_by_class[8]:
            overlap_macro = False
            for m_cid in [2, 3, 4]:
                for mb in raw_by_class.get(m_cid, []):
                    ix1, iy1 = max(blk["x1"], mb["x1"]), max(blk["y1"], mb["y1"])
                    ix2, iy2 = min(blk["x2"], mb["x2"]), min(blk["y2"], mb["y2"])
                    if ix2 > ix1 and iy2 > iy1 and ((ix2 - ix1) * (iy2 - iy1)) > 0.20 * blk["w"] * blk["h"]:
                        overlap_macro = True
                        break
                if overlap_macro:
                    break
            if not overlap_macro:
                clean_blocks.append(blk)
        raw_by_class[8] = clean_blocks

    # Suppress standing_area if it heavily overlaps a confirmed screen
    if raw_by_class[3]:
        clean_sa = []
        for sa in raw_by_class[2]:
            overlaps_scr = False
            for scr in raw_by_class[3]:
                ix1, iy1 = max(sa["x1"], scr["x1"]), max(sa["y1"], scr["y1"])
                ix2, iy2 = min(sa["x2"], scr["x2"]), min(sa["y2"], scr["y2"])
                if ix2 > ix1 and iy2 > iy1 and ((ix2 - ix1) * (iy2 - iy1)) > 0.40 * sa["w"] * sa["h"]:
                    overlaps_scr = True
                    break
            if not overlaps_scr:
                clean_sa.append(sa)
        raw_by_class[2] = clean_sa

    # 3. CORE-BASED SEATS PRIORITY RULE (Anti-Hallucination):
    # Check the inner 64% core of each aux box (standing_area, screen, foh, table, entrance, obstacle).
    # Tilted standing gems (e.g. Lirico) may touch 3-7 seats at their outer bounding box corners,
    # but their inner 64% core has 0-1 seats! True seating blocks have >= 2 seats inside the core or >= 8 total seats.
    for cid in [2, 3, 4, 5, 6, 7]:
        valid_aux_list = []
        for aux_box in raw_by_class[cid]:
            pad_w = aux_box["w"] * 0.18
            pad_h = aux_box["h"] * 0.18
            cx1, cy1 = aux_box["x1"] + pad_w, aux_box["y1"] + pad_h
            cx2, cy2 = aux_box["x2"] - pad_w, aux_box["y2"] - pad_h
            core_seats = sum(
                1 for s in raw_by_class[0]
                if cx1 <= s["cx"] <= cx2 and cy1 <= s["cy"] <= cy2
            )
            total_seats = sum(
                1 for s in raw_by_class[0]
                if (aux_box["x1"] - 4.0) <= s["cx"] <= (aux_box["x2"] + 4.0)
                and (aux_box["y1"] - 4.0) <= s["cy"] <= (aux_box["y2"] + 4.0)
            )
            if core_seats >= 2 or total_seats >= 8:
                if not aux_box.get("ocr_confirmed"):
                    continue  # Suppress false aux box covering real seats

            # Suppress hallucinations over empty white/dark canvas background (excluding stage overlap and OCR-confirmed boxes)
            if not aux_box.get("ocr_confirmed"):
                ax1 = max(0, int(round(aux_box["x1"])))
                ay1 = max(0, int(round(aux_box["y1"])))
                ax2 = min(img_w, int(round(aux_box["x2"])))
                ay2 = min(img_h, int(round(aux_box["y2"])))
                if ax2 > ax1 + 2 and ay2 > ay1 + 2:
                    roi_patch = image_bgr[ay1:ay2, ax1:ax2].copy()
                    valid_mask = np.ones(roi_patch.shape[:2], dtype=bool)
                    if main_stage_bbox is not None:
                        sx1 = max(0, int(round(main_stage_bbox["x1"])) - ax1)
                        sy1 = max(0, int(round(main_stage_bbox["y1"])) - ay1)
                        sx2 = min(ax2 - ax1, int(round(main_stage_bbox["x2"])) - ax1)
                        sy2 = min(ay2 - ay1, int(round(main_stage_bbox["y2"])) - ay1)
                        if sx2 > sx1 and sy2 > sy1:
                            valid_mask[sy1:sy2, sx1:sx2] = False
                    non_stage_pixels = roi_patch[valid_mask].reshape(-1, 3).astype(np.float32)
                    if len(non_stage_pixels) > 0:
                        lum = 0.114 * non_stage_pixels[:, 0] + 0.587 * non_stage_pixels[:, 1] + 0.299 * non_stage_pixels[:, 2]
                        if canvas_bg == "#F8FAFC":
                            bg_ratio = float(np.mean(lum > 230.0))
                            if bg_ratio > 0.65:
                                continue
                        else:
                            bg_ratio = float(np.mean(lum < 20.0))
                            if bg_ratio > 0.90:
                                continue

            valid_aux_list.append(aux_box)
        raw_by_class[cid] = valid_aux_list

    # 4. Filter Margin Obstacles & Erroneous Obstacles inside seating areas:
    clean_obstacles = []
    for obs in raw_by_class[7]:
        if obs["w"] < 60.0 and obs["h"] < 70.0:
            if obs["cx"] < img_w * 0.10 or obs["cx"] > img_w * 0.90 or obs["cy"] > img_h * 0.85 or obs["cy"] < img_h * 0.10:
                continue
        # Also drop obstacles that have real seats inside or surrounding them (false obstacle in seating block)
        surrounding_seats = sum(
            1 for s in raw_by_class[0]
            if (obs["x1"] - 15.0) <= s["cx"] <= (obs["x2"] + 15.0)
            and (obs["y1"] - 15.0) <= s["cy"] <= (obs["y2"] + 15.0)
        )
        if surrounding_seats >= 3 and not obs.get("ocr_confirmed"):
            continue
        clean_obstacles.append(obs)
    raw_by_class[7] = clean_obstacles

    # 4B. Clean seats inside confirmed standing areas:
    # If a standing area has confirmed standing/capacity text, purge any stray seat inside it!
    clean_seats_pre = []
    for s in raw_by_class[0]:
        inside_standing = False
        for sa in raw_by_class[2]:
            if (sa["x1"] + 2.0) <= s["cx"] <= (sa["x2"] - 2.0) and (sa["y1"] + 2.0) <= s["cy"] <= (sa["y2"] - 2.0):
                inside_standing = True
                break
        if not inside_standing:
            clean_seats_pre.append(s)
    raw_by_class[0] = clean_seats_pre

    seat_candidates: List[Dict[str, Any]] = []
    for idx, sb in enumerate(raw_by_class[0]):
        bgr, is_dis = sample_box_color_and_disabled(
            image_bgr, sb["x1"], sb["y1"], sb["x2"], sb["y2"]
        )
        seat_candidates.append({
            **sb,
            "temp_id": f"seat_{idx}",
            "bgr": bgr,
            "is_disabled": is_dis,
        })

    # 5. Outlier Badge & Confirmed Standing-Core Filter:
    # Remove isolated text badges (distance > 2.2x med_step) and facet artifacts inside standing area cores.
    if len(seat_candidates) >= 10:
        centers_arr = np.array([[s["cx"], s["cy"]] for s in seat_candidates])
        cand_nn_dists = []
        for i in range(len(centers_arr)):
            diff = centers_arr - centers_arr[i]
            d = np.hypot(diff[:, 0], diff[:, 1])
            d[i] = 1e9
            cand_nn_dists.append(np.min(d))
        med_cand_step = float(np.median(cand_nn_dists)) if cand_nn_dists else 12.0

        filtered_candidates = []
        for i, s in enumerate(seat_candidates):
            if cand_nn_dists[i] > med_cand_step * 2.2:
                continue
            inside_ga_core = False
            for sa in raw_by_class[2]:
                pw, ph = sa["w"] * 0.14, sa["h"] * 0.14
                if (sa["x1"] + pw) <= s["cx"] <= (sa["x2"] - pw) and (sa["y1"] + ph) <= s["cy"] <= (sa["y2"] - ph):
                    inside_ga_core = True
                    break
            if inside_ga_core:
                continue
            filtered_candidates.append(s)
        seat_candidates = filtered_candidates

    # Check if the map is pure standing/category blocks (no individual seat grid circles/squares detected)
    # If the map is predominantly solid color blocks, DO NOT synthesize seat grids inside blocks!
    # Instead, leave them as clean Standing / Block areas for the user to select zones.
    is_pure_block_map = bool(len(seat_candidates) < 100 and len(raw_by_class.get(2, [])) >= 4)

    # Auto Seat Grid Generation for section_block (Class 8):
    syn_idx = len(seat_candidates)
    allow_synthesis = bool(has_venue_semantics or len(seat_candidates) >= 15)
    if not is_pure_block_map and allow_synthesis:
        for blk in raw_by_class.get(8, []):
            cols_est = max(2, min(14, int(round(blk["w"] / 34.0))))
            rows_est = max(2, min(10, int(round(blk["h"] / 34.0))))
            seats_in_blk = [
                s for s in seat_candidates
                if blk["x1"] <= s["cx"] <= blk["x2"] and blk["y1"] <= s["cy"] <= blk["y2"]
            ]
            if len(seats_in_blk) >= max(6, int(cols_est * rows_est * 0.40)):
                continue
            if seats_in_blk:
                # Remove sparse OCR text-character artifacts inside a solid section_block
                seat_candidates = [
                    s for s in seat_candidates
                    if not (blk["x1"] <= s["cx"] <= blk["x2"] and blk["y1"] <= s["cy"] <= blk["y2"])
                ]
            blk_bgr, _ = sample_box_color_and_disabled(
                image_bgr, blk["x1"], blk["y1"], blk["x2"], blk["y2"]
            )
            pad_x = blk["w"] * 0.12
            pad_y = blk["h"] * 0.15
            usable_w = max(16.0, blk["w"] - 2 * pad_x)
            usable_h = max(16.0, blk["h"] - 2 * pad_y)
            for r_i in range(rows_est):
                sy = blk["y1"] + pad_y + (usable_h * (r_i + 0.5) / float(rows_est))
                for c_i in range(cols_est):
                    sx = blk["x1"] + pad_x + (usable_w * (c_i + 0.5) / float(cols_est))
                    seat_candidates.append({
                        "x1": sx - 10.0, "y1": sy - 10.0, "x2": sx + 10.0, "y2": sy + 10.0,
                        "cx": sx, "cy": sy, "w": 20.0, "h": 20.0, "conf": 0.90,
                        "temp_id": f"seat_blk_{syn_idx}", "bgr": blk_bgr, "is_disabled": False,
                    })
                    syn_idx += 1

        # Banquet Table Circular Seat Disperser (Class 5):
        for tb_idx, tb in enumerate(raw_by_class.get(5, []), start=1):
            tb_aspect = tb["w"] / float(max(1.0, tb["h"]))
            if not (0.65 <= tb_aspect <= 1.5):
                continue
            orbit_r = max(tb["w"], tb["h"]) * 0.72
            nearby = [
                s for s in seat_candidates
                if math.hypot(s["cx"] - tb["cx"], s["cy"] - tb["cy"]) <= orbit_r * 1.45
            ]
            if len(nearby) < 3:
                tb_bgr, _ = sample_box_color_and_disabled(
                    image_bgr, tb["x1"], tb["y1"], tb["x2"], tb["y2"]
                )
                for ang_i in range(8):
                    ang = 2.0 * math.pi * (ang_i / 8.0)
                    sx = tb["cx"] + orbit_r * math.cos(ang)
                    sy = tb["cy"] + orbit_r * math.sin(ang)
                    seat_candidates.append({
                        "x1": sx - 8.0, "y1": sy - 8.0, "x2": sx + 8.0, "y2": sy + 8.0,
                        "cx": sx, "cy": sy, "w": 16.0, "h": 16.0, "conf": 0.90,
                        "temp_id": f"seat_tbl_{tb_idx}_{ang_i}", "bgr": tb_bgr, "is_disabled": False,
                    })
    else:
        # On a pure block map, eliminate any stray false seat dots generated over block text or borders
        seat_candidates = []

    stages = list(raw_by_class[1])
    primary_stage_center: Optional[Tuple[float, float]] = None
    if stages:
        primary_stage_center = (stages[0]["cx"], stages[0]["cy"])

    zones, seat_zone_map = assign_zones_from_seat_colors(
        seat_candidates, image_bgr=image_bgr, ocr_items=ocr_items
    )
    (
        scaled_seats,
        scale_x,
        scale_y,
        offset_x,
        offset_y,
        rows_count,
        cols_count,
        layout_type,
    ) = cluster_seats_and_scale(
        seat_candidates,
        img_w,
        img_h,
        stage_center=primary_stage_center,
        stage_bbox=main_stage_bbox,
    )

    final_seats: List[Dict[str, Any]] = []
    for s in scaled_seats:
        z_id = None if s["isDisabled"] else seat_zone_map.get(s["temp_id"])
        final_seats.append({
            "localId": str(uuid.uuid4()),
            "rowLabel": s["rowLabel"],
            "seatNumber": s["seatNumber"],
            "x": s["x"],
            "y": s["y"],
            "zoneLocalId": z_id,
            "isDisabled": s["isDisabled"],
        })

    def _tx(x_val: float) -> int:
        return max(4, int(round(x_val * scale_x + offset_x)))

    def _ty(y_val: float) -> int:
        return max(4, int(round(y_val * scale_y + offset_y)))

    def _tw(w_val: float) -> int:
        return max(24, int(round(w_val * scale_x)))

    def _th(h_val: float) -> int:
        return max(20, int(round(h_val * scale_y)))

    aux_elements: List[Dict[str, Any]] = []

    if stages:
        main_st = stages[0]
        st_shape, st_color = infer_stage_shape(
            image_bgr, main_st["x1"], main_st["y1"], main_st["x2"], main_st["y2"]
        )
        stage_config = {
            "position": "CUSTOM",
            "shape": st_shape,
            "color": st_color,
            "label": "SÂN KHẤU",
            "x": _tx(main_st["x1"]),
            "y": _ty(main_st["y1"]),
            "w": _tw(main_st["w"]),
            "h": _th(main_st["h"]),
            "rotation": 0,
        }
        for idx, aux_st in enumerate(stages[1:], start=1):
            ax_x, ax_y, ax_w, ax_h, ax_rot = compute_oriented_box(image_bgr, aux_st)
            aux_lbl = f"Sân khấu phụ {idx}"
            for it in ocr_items:
                if aux_st["x1"] - 6 <= it["cx"] <= aux_st["x2"] + 6 and aux_st["y1"] - 6 <= it["cy"] <= aux_st["y2"] + 6:
                    if it["kind"] == "AUX_STAGE":
                        aux_lbl = it["pretty"]
                        break
            aux_elements.append({
                "id": f"aux-{uuid.uuid4()}",
                "type": "AUX_STAGE",
                "label": aux_lbl,
                "x": _tx(ax_x),
                "y": _ty(ax_y),
                "w": _tw(ax_w),
                "h": _th(ax_h),
                "rotation": ax_rot,
            })
    else:
        stage_config = {
            "position": "TOP",
            "shape": "RECTANGLE",
            "color": "#3B82F6",
            "label": "SÂN KHẤU",
            "x": 0,
            "y": 0,
            "w": 900,
            "h": 52,
            "rotation": 0,
        }

    standing_areas: List[Dict[str, Any]] = []
    standing_colors = ["#10B981", "#F59E0B", "#EC4899", "#06B6D4"]
    used_sa_names = set()
    for idx, sa in enumerate(sorted(raw_by_class[2], key=lambda b: (b["cy"], b["cx"])), start=1):
        if sa.get("color"):
            sa_color = sa["color"]
        else:
            sa_bgr, _ = sample_box_color_and_disabled(
                image_bgr, sa["x1"], sa["y1"], sa["x2"], sa["y2"]
            )
            sa_color = match_bgr_to_palette_hex(sa_bgr) or standing_colors[(idx - 1) % len(standing_colors)]

        area_px = sa["w"] * sa["h"]
        est_cap = sa.get("capacity") or max(50, min(1000, int(round(area_px / 180.0 / 10.0)) * 10))
        sa_name = sa.get("custom_label") or f"Vùng Đứng GA {idx}"

        # Match OCR name & capacity inside this standing area box (sorted by proximity to box center)
        if not sa.get("custom_label"):
            sa_ocr = [
                it for it in ocr_items
                if (sa["x1"] - 8.0) <= it["cx"] <= (sa["x2"] + 8.0)
                and (sa["y1"] - 8.0) <= it["cy"] <= (sa["y2"] + 8.0)
            ]
            sa_ocr.sort(key=lambda it: math.hypot(it["cx"] - sa["cx"], it["cy"] - sa["cy"]))
            for it in sa_ocr:
                if it["capacity"] is not None and it["capacity"] > 0:
                    est_cap = it["capacity"]
                    break
            name_cands = [
                it for it in sa_ocr
                if it["capacity"] is None and it["kind"] in ("STANDING", "OTHER") and len(it["pretty"]) >= 3
            ]
            for cand in name_cands:
                if cand["pretty"] not in used_sa_names:
                    sa_name = cand["pretty"]
                    used_sa_names.add(sa_name)
                    break

        if sa.get("oriented_w") and sa.get("oriented_h"):
            rw_o = sa["oriented_w"]
            rh_o = sa["oriented_h"]
            rot_deg = sa.get("rotation", 0)
            sa_shape = sa.get("shape", "RECTANGLE")
            rx = sa["cx"] - rw_o / 2.0
            ry = sa["cy"] - rh_o / 2.0
        else:
            rx, ry, rw_o, rh_o, rot_deg, sa_shape = compute_oriented_box_and_shape(image_bgr, sa)

        standing_areas.append({
            "id": f"std-{uuid.uuid4()}",
            "name": sa_name,
            "capacity": est_cap,
            "color": sa_color,
            "shape": sa_shape,
            "x": _tx(rx),
            "y": _ty(ry),
            "w": _tw(rw_o),
            "h": _th(rh_o),
            "rotation": rot_deg,
        })

    aux_type_specs = [
        (3, "SCREEN", "Màn hình LED"),
        (4, "FOH", "FOH Kỹ thuật"),
        (5, "TABLE", "Bàn"),
        (6, "ENTRANCE", "Cổng / Lối vào"),
        (7, "OBSTACLE", "Cột / Vật cản"),
    ]
    for cid, a_type, prefix in aux_type_specs:
        items = sorted(raw_by_class[cid], key=lambda b: (b["cy"], b["cx"]))
        for idx, item in enumerate(items, start=1):
            lbl = item.get("custom_label") or (prefix if len(items) == 1 else f"{prefix} {idx}")
            if not item.get("custom_label") and cid == 5:
                for it in ocr_items:
                    if item["x1"] - 6 <= it["cx"] <= item["x2"] + 6 and item["y1"] - 6 <= it["cy"] <= item["y2"] + 6:
                        if it["kind"] == "TABLE":
                            lbl = it["pretty"]
                            break
            aux_elements.append({
                "id": f"aux-{uuid.uuid4()}",
                "type": a_type,
                "label": lbl,
                "x": _tx(item["x1"]),
                "y": _ty(item["y1"]),
                "w": _tw(item["w"]),
                "h": _th(item["h"]),
                "rotation": 0,
            })

    summary_counts = {
        CLASS_MAP[cid]: len(raw_by_class[cid]) for cid in CLASS_MAP
    }
    summary_counts["seat"] = len(final_seats)

    is_valid_seatmap, invalid_reason = validate_is_seatmap_image(
        image_bgr=image_bgr,
        raw_by_class=raw_by_class,
        ocr_items=ocr_items,
        final_seats=final_seats,
        standing_areas=standing_areas,
        aux_elements=aux_elements,
        seat_candidates=seat_candidates,
    )

    return {
        "isValidSeatMap": is_valid_seatmap,
        "invalidReason": invalid_reason,
        "layoutType": layout_type,
        "canvasBg": canvas_bg,
        "gridConfig": {
            "rows": max(1, rows_count),
            "cols": max(1, cols_count),
        },
        "stageConfig": stage_config,
        "zones": zones,
        "seats": final_seats,
        "standingAreas": standing_areas,
        "auxElements": aux_elements,
        "detectionSummary": {
            "imageWidth": img_w,
            "imageHeight": img_h,
            "counts": summary_counts,
            "totalObjects": sum(summary_counts.values()),
        },
    }
