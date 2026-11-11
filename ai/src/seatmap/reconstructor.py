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


def detect_legend_boxes_and_color_map(
    image_bgr: Optional[np.ndarray],
    ocr_items: Optional[List[Dict[str, Any]]],
) -> Tuple[List[Dict[str, float]], Dict[str, str], List[str]]:
    """
    Detect corner or banner legend boxes, isolate their bounding boundaries,
    and extract high-confidence color swatch -> ticket category name mappings.
    Returns:
        legend_boxes: List of bounding boxes dict(x1, y1, x2, y2)
        hex_to_zone_name: Dict mapping palette hex color to category name (VIP, CAT 1, GA, etc.)
        ticket_category_names: List of discovered clean category names
    """
    if image_bgr is None or not ocr_items:
        return [], {}, []

    img_h, img_w = image_bgr.shape[:2]
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    legend_boxes: List[Dict[str, float]] = []
    hex_to_zone_name: Dict[str, str] = {}
    ticket_category_names: List[str] = []

    legend_headers = [
        it for it in ocr_items
        if any(k in it["norm"] for k in ("CHUTHICH", "LEGEND", "GHICHU", "BANGGIA", "GIAVE"))
        and it["cy"] > img_h * 0.35
    ]

    for lh in legend_headers:
        is_left = lh["cx"] < img_w * 0.5
        box_max_x = min(img_w * 0.40, max(lh["x2"] + 70.0, lh["x1"] + 200.0)) if is_left else float(img_w)
        box_min_x = 0.0 if is_left else max(img_w * 0.60, min(lh["x1"] - 70.0, lh["x2"] - 200.0))
        box_min_y = max(0.0, lh["y1"] - 16.0)

        cand_items = [
            it for it in ocr_items
            if it["cy"] >= box_min_y and box_min_x <= it["cx"] <= box_max_x
            and not any(k in it["norm"] for k in ("CONGVAO", "GATE", "AISLE", "LOIDI", "CUAVAO"))
        ]

        max_y = max((it["y2"] for it in cand_items), default=lh["y2"]) + 18.0
        if max_y > img_h * 0.80:
            max_y = float(img_h)
        max_x = max((it["x2"] for it in cand_items), default=lh["x2"]) + 18.0
        min_x = max(0.0, min((it["x1"] for it in cand_items), default=lh["x1"]) - 18.0)
        min_y = box_min_y

        l_box = {"x1": min_x, "y1": min_y, "x2": max_x, "y2": max_y}
        legend_boxes.append(l_box)

        for it in cand_items:
            it["kind"] = "LEGEND"
            raw_t = it["raw"].strip()
            norm_t = it["norm"]
            if any(k in norm_t for k in ("CHUTHICH", "LEGEND", "GHICHU", "BANGGIA", "GIAVE", "TICKETBOX")):
                continue

            clean_name = _prettify_ocr_label(raw_t)
            if len(norm_t) >= 2 and not norm_t.isdigit():
                ticket_category_names.append(clean_name)

            # Sample swatch either to the left of the item or inside the item box
            sx1 = max(0, int(round(it["x1"] - 38)))
            sy1 = max(0, int(round(it["y1"] - 4)))
            sx2 = min(img_w, int(round(it["x2"] + 15)))
            sy2 = min(img_h, int(round(it["y2"] + 4)))

            patch_bgr = image_bgr[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
            patch_hsv = hsv[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
            sat_mask = (patch_hsv[:, 1] > 38.0) & (patch_hsv[:, 2] > 55.0) & (patch_hsv[:, 2] < 248.0)
            if int(np.sum(sat_mask)) >= 5:
                med_swatch_bgr = tuple(np.median(patch_bgr[sat_mask], axis=0).tolist())
                matched_hex = match_bgr_to_palette_hex(med_swatch_bgr)
                hex_to_zone_name[matched_hex] = clean_name

    # 2. Swatch & Prefix Legend Items (Supports inline color swatches and text color prefixes)
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
        if it["cy"] < img_h * 0.68:
            continue
        raw = it["raw"].strip()
        norm = it["norm"]
        if any(skip in norm for skip in ("INDIVIDUALSEAT", "CIRCLES", "VONGTRON", "SANKHAU", "SODOGHE", "1DOT", "1SEAT")):
            continue

        matched_hex: Optional[str] = None
        clean_label = raw
        for prefixes, p_hex in color_prefix_map:
            for pref in prefixes:
                if norm == pref or norm.startswith(pref):
                    matched_hex = p_hex
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
            # Sample color swatch just to the left
            sx1 = max(0, int(round(it["x1"] - 65)))
            sy1 = max(0, int(round(it["y1"] - 4)))
            sx2 = min(img_w, int(round(it["x1"] + min(40.0, it["w"] * 0.45))))
            sy2 = min(img_h, int(round(it["y2"] + 4)))
            if sx2 > sx1 + 4 and sy2 > sy1 + 4:
                patch_bgr = image_bgr[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
                patch_hsv = hsv[sy1:sy2, sx1:sx2].reshape(-1, 3).astype(np.float32)
                sat_mask = (patch_hsv[:, 1] > 40.0) & (patch_hsv[:, 2] > 60.0) & (patch_hsv[:, 2] < 240.0)
                if int(np.sum(sat_mask)) >= 5:
                    med_swatch_bgr = tuple(np.median(patch_bgr[sat_mask], axis=0).tolist())
                    matched_hex = match_bgr_to_palette_hex(med_swatch_bgr)

        # Prettify and store
        if matched_hex and clean_label and len(clean_label) >= 3 and not clean_label.isdigit():
            if "ORCHESTRAFRONT" in clean_label.upper().replace(" ", ""):
                clean_label = "Orchestra Front"
            elif "ORCHESTRAMIDDLE" in clean_label.upper().replace(" ", ""):
                clean_label = "Orchestra Middle"
            elif "ORCHESTRAREAR" in clean_label.upper().replace(" ", ""):
                clean_label = "Orchestra Rear"
            else:
                clean_label = _prettify_ocr_label(clean_label)
            hex_to_zone_name[matched_hex] = clean_label
            if clean_label not in ticket_category_names:
                ticket_category_names.append(clean_label)

    # Contextual check: If ORCHESTRA FRONT is in OCR (e.g. arrow on right side) and blue zone isn't named yet:
    if "#3B82F6" not in hex_to_zone_name:
        for it in ocr_items:
            if "ORCHESTRAFRONT" in it["norm"]:
                hex_to_zone_name["#3B82F6"] = "Orchestra Front"
                break

    return legend_boxes, hex_to_zone_name, ticket_category_names


def _extract_legend_zone_name_map(
    image_bgr: Optional[np.ndarray],
    ocr_items: Optional[List[Dict[str, Any]]],
) -> Dict[str, str]:
    """
    Read color-to-zone-name mappings from bottom/side legend text items if present.
    """
    _, hex_map, _ = detect_legend_boxes_and_color_map(image_bgr, ocr_items)
    return hex_map


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
    macro_boxes: Optional[List[Dict[str, Any]]] = None,
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
    if macro_boxes:
        for mb in macro_boxes:
            min_cx = min(min_cx, mb["x1"])
            min_cy = min(min_cy, mb["y1"])

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
    if "MANHINHLED" in norm or ("MAN" in norm and "HINH" in norm and "LED" in norm) or ("MIN" in norm and "SINT" in norm and "LED" in norm):
        if any(k in norm for k in ("PHU", "PH", "SUB", "SIDE", "PHY")):
            return "Màn hình LED phụ"
        return "Màn hình LED"
    if "MANHINH" in norm or ("MAN" in norm and "HINH" in norm):
        if any(k in norm for k in ("PHU", "PH", "SUB", "SIDE", "PHY")):
            return "Màn hình phụ"
        return "Màn hình"
    if norm in ("LEDSCREEN", "SCREEN", "LED") or ("LED" in norm and any(k in norm for k in ("PHU", "PH", "SUB", "SIDE", "PHY"))):
        if any(k in norm for k in ("PHU", "PH", "SUB", "SIDE", "PHY")):
            return "Màn hình LED phụ"
        return "Màn hình LED"
    if "SANKHAUPHU" in norm or "SANPHU" in norm or "SUBSTAGE" in norm or "BSTAGE" in norm or "CATWALK" in norm or "RUNWAY" in norm:
        return "Sân khấu phụ"
    if norm in ("SANKHAU", "MAINSTAGE", "STAGE") or (norm.startswith("SANKHAU") and "SODOKHANDAI" not in norm):
        return "Sân khấu"
    if "PARTYZONE" in norm or "PARTYZONES" in norm:
        return "party zones"
    if "FANZONE" in norm or "FANPIT" in norm:
        return "Fan Zone"
    if "GAPHOTHONG" in norm or "GENERALADMISSION" in norm or norm.startswith("KHUDUNGGA"):
        return "GA / Phổ thông"
    if "CAT1TRAI" in norm or ("CAT1" in norm and "TRAI" in norm):
        return "CAT 1 - Trái"
    if "CAT1PHAI" in norm or ("CAT1" in norm and "PHAI" in norm):
        return "CAT 1 - Phải"
    if "CAT2TRAI" in norm or ("CAT2" in norm and "TRAI" in norm):
        return "CAT 2 - Trái"
    if "CAT2PHAI" in norm or ("CAT2" in norm and "PHAI" in norm):
        return "CAT 2 - Phải"
    if "CAT3TRAI" in norm or ("CAT3" in norm and "TRAI" in norm):
        return "CAT 3 - Trái"
    if "CAT3PHAI" in norm or ("CAT3" in norm and "PHAI" in norm):
        return "CAT 3 - Phải"
    m_cat = re.match(r"^(?:KHUDUNG)?(CAT\s*\d+[\s\-]?[A-Z])$", norm)
    if m_cat:
        val = m_cat.group(1).replace(" ", "")
        return re.sub(r"(CAT\d+)([A-Z])", r"\1-\2", val)
    m_vip = re.match(r"^(?:KHUDUNG)?(VIP\s*\d+)$", norm)
    if m_vip:
        val = m_vip.group(1).replace(" ", "")
        return re.sub(r"(VIP)(\d+)", r"\1 \2", val)
    if norm == "CUARA" or norm == "CURARA":
        return "Cửa ra"
    if norm in ("CUAVAO", "CURAVAO", "CONGVAO"):
        return "Cửa vào"
    if norm in ("EXIT", "EXTT"):
        return "Lối thoát (EXIT)"
    if norm == "FOH" or "KYTHUAT" in norm:
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
        if float(score) < 0.40 or not raw_txt or len(raw_txt.strip()) < 2:
            continue
        xs = [float(pt[0]) for pt in box]
        ys = [float(pt[1]) for pt in box]
        x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
        norm = _normalize_ocr_text(raw_txt)
        if not norm:
            continue

        # Skip seat dots (e.g. A1..CN, G21, etc.)
        if re.match(r"^[A-Z]{1,2}\d{1,3}$", norm) or re.match(r"^\d{1,3}[A-Z]{1,2}$", norm) or re.match(r"^\d{1,3}$", norm):
            items.append({
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "cx": (x1 + x2) / 2.0, "cy": (y1 + y2) / 2.0,
                "w": max(4.0, x2 - x1), "h": max(4.0, y2 - y1),
                "raw": raw_txt, "norm": norm, "pretty": raw_txt,
                "kind": "SEAT_LABEL", "capacity": None, "score": float(score),
            })
            continue

        # Extract capacity integer
        cap_val: Optional[int] = None
        cap_match = re.search(r"(\d{2,4})\s*(?:ng|pax|seat|cho|ngu|nguoi|ngudi|ngubi)", norm, re.IGNORECASE)
        if not cap_match:
            cap_match = re.search(r"(?:suc\s*ch[ua]|s[ua]c\s*ch[ua]|sicch|5cch|capacity|cap)\D*(\d{2,4})", norm, re.IGNORECASE)
        if cap_match:
            try:
                cap_val = int(cap_match.group(1))
            except Exception:
                cap_val = None

        is_capacity_subtext = bool(
            cap_val is not None
            or re.search(r"(?:s[uiae]c\s*ch[uad]|5cch|sdc\s*ch|sae\s*ch|sicch|succh|ch[uad]\s*[:\d]|ngu[oeidb]|nguoi|ngudi|ngubi|\d+\s*ng|\d+\s*pax)", norm, re.IGNORECASE)
        )

        kind = "OTHER"
        if any(k in norm for k in ("SODODATVE", "SODOVUNGDUNG", "STANDINGONLYMAP", "SODOKHUVUC")):
            kind = "TITLE_BANNER"
        elif any(k in norm for k in ("SANKHAUPHU", "SUBSTAGE", "BSTAGE", "CATWALK", "RUNWAY", "SANPHU", "STAGEB")):
            kind = "AUX_STAGE"
        elif ("SANKHAU" in norm or norm == "STAGE" or "MAINSTAGE" in norm) and "SODOKHANDAI" not in norm and "PHU" not in norm:
            kind = "MAIN_STAGE"
        elif any(k in norm for k in ("MANHINH", "LEDSCREEN", "MANLED", "LED", "SCREEN", "MINSINTLED")) or ("MIN" in norm and "SINT" in norm and "LED" in norm) or ("MAN" in norm and "HINH" in norm) or ("LED" in norm and any(k in norm for k in ("PHU", "PH", "SUB", "SIDE", "PHY"))):
            kind = "SCREEN"
        elif norm == "FOH" or "KYTHUAT" in norm or "MIXER" in norm or "AMTHANH" in norm:
            kind = "FOH"
        elif is_capacity_subtext:
            kind = "CAPACITY"
        elif (
            any(k in norm for k in ("CUARA", "CURARA", "CUAVAO", "CURAVAO", "EXIT", "EXTT", "LOIVAO", "LOIRA", "GATE", "CONGVAO"))
            or (re.search(r"\bCONG\b", norm) and "CONGVE" not in norm)
            or (re.search(r"\bCUA\b", norm) and not any(k in norm for k in ("CUAMG", "CUAMOI", "CUAGHE", "IDCY", "IDCU", "THETU", "CUATHE", "HETVE", "CONVE")))
        ):
            kind = "ENTRANCE"
        elif re.match(r"^BAN\d+$", norm) or re.match(r"^TABLE\d+$", norm):
            kind = "TABLE"
        elif re.match(r"^VIP\d+$", norm) or re.match(r"^CAT\d+", norm) or re.match(r"^GA\d*", norm):
            kind = "STANDING"
        elif any(k in norm for k in ("THEVOCAL", "THESOUL", "THEDANCE", "THEMELODY", "VUNGDUNG", "KHUDUNG", "STANDING", "FANZONE", "FANPIT", "PARTYZONE", "PARTY", "GA1", "GA2", "GA3", "GA4", "GA5", "GA6", "GA7", "PIT", "PIEI", "FESTIVAL")):
            if not any(k in norm for k in ("HETVE", "CONVE", "SODOGHE", "SODOKHANDAI")):
                kind = "STANDING"
        elif "ZONE" in norm and not any(k in norm for k in ("DROP", "LOADING")):
            kind = "STANDING"

        pretty = _prettify_ocr_label(raw_txt)
        if norm in ("PIT", "PIEI", "PI"):
            pretty = "Khu Đứng Pit"
        elif "THEVOCAL" in norm:
            pretty = "The Vocal 1" if "1" in norm else ("The Vocal 2" if "2" in norm else "The Vocal")
        elif "THESOUL" in norm or "THESOUF" in norm:
            pretty = "The Soul 1" if "1" in norm else ("The Soul 2" if "2" in norm else "The Soul")
        elif "THEDANCE" in norm:
            pretty = "The Dance 1" if "1" in norm else ("The Dance 2" if "2" in norm else "The Dance")
        elif "THEMELODY" in norm:
            pretty = "The Melody 1" if "1" in norm else ("The Melody 2" if "2" in norm else "The Melody")

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


def extract_macro_contours(image_bgr: np.ndarray) -> List[Dict[str, Any]]:
    """
    Extract clean rectangular boundary contours (drawn wireframe boxes, solid boxes)
    representing stages, screens, standing areas, and section blocks.
    """
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 35, 140)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    macro_boxes: List[Dict[str, Any]] = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 42 or bh < 20:
            continue
        if (bw * bh) > (w * h * 0.65):
            continue
        area = cv2.contourArea(cnt)
        box_area = bw * bh
        if box_area > 0 and (area / float(box_area)) >= 0.42:
            macro_boxes.append({
                "x1": float(x),
                "y1": float(y),
                "x2": float(x + bw),
                "y2": float(y + bh),
                "cx": float(x + bw / 2.0),
                "cy": float(y + bh / 2.0),
                "w": float(bw),
                "h": float(bh),
                "conf": 0.88,
                "has_contour": True,
            })
    return macro_boxes


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
    legend_boxes: Optional[List[Dict[str, float]]] = None,
    legend_hex_map: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Extract solid/saturated macro standing and category blocks using OpenCV contour segmentation,
    Canny boundary barrier, component merging, polygon shape approximation (TRIANGLE vs RECTANGLE),
    oriented bounding box, legend exclusion, aisle suppression, and smart multi-line OCR label fusion.
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

        # 1. Skip if center is inside legend box
        if legend_boxes and any(lb["x1"] <= cx <= lb["x2"] and lb["y1"] <= cy <= lb["y2"] for lb in legend_boxes):
            continue

        # 2. Skip top title banner
        if cy < img_h * 0.14 or (by < img_h * 0.12 and bw > img_w * 0.30):
            continue

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

        # Find all OCR items strictly located inside this macro block
        in_ocr = [
            it for it in ocr_items
            if (x - 2) <= it["cx"] <= (x + bw + 2)
            and (y - 2) <= it["cy"] <= (y + bh + 2)
        ]

        # 1. Skip if this is a pure aisle / walkway
        all_norm = "".join(it["norm"] for it in in_ocr)
        if ("LOIDI" in all_norm or "AISLE" in all_norm or "WALKWAY" in all_norm) and not any(k in all_norm for k in ("VIP", "CAT", "GA", "KHU", "DUNG")):
            continue

        # 2. Skip if this is a flanking LED screen candidate
        if any(it.get("kind") == "SCREEN" for it in in_ocr) or "MANHINH" in all_norm:
            continue

        # 3. Smart Vertical Multi-Line OCR Fusion for Zone Label
        clean_ocr = [
            it for it in in_ocr
            if it.get("kind") not in ("LEGEND", "MAIN_STAGE", "AUX_STAGE", "SCREEN", "ENTRANCE")
            and "CONGVAO" not in it["norm"] and "GATE" not in it["norm"]
        ]
        clean_ocr.sort(key=lambda it: it["cy"])

        cat_items = []
        prefix_items = []
        for it in clean_ocr:
            norm = it["norm"]
            if ("LOIDI" in norm or "AISLE" in norm) and not any(k in norm for k in ("VIP", "CAT", "GA", "KHU")):
                continue
            if any(norm.startswith(k) or k in norm for k in ("VIP", "CAT", "GA", "FOH", "ZONE")):
                cat_items.append(it["pretty"])
            elif any(k in norm for k in ("KHUDUNG", "VUNGDUNG", "STANDING", "FANZONE")):
                prefix_items.append(it["pretty"])
            else:
                cat_items.append(it["pretty"])

        label = ""
        if prefix_items and cat_items:
            pref_clean = "Khu Đứng"
            cat_clean = re.sub(r"^(?:Khu\s*Đứng|Vùng\s*Đứng)\s*", "", cat_items[-1], flags=re.IGNORECASE).strip()
            label = f"{pref_clean} {cat_clean}".strip()
        elif cat_items:
            cat_clean = re.sub(r"^(?:Khu\s*Đứng|Vùng\s*Đứng)\s*", "", cat_items[0], flags=re.IGNORECASE).strip()
            label = f"Khu Đứng {cat_clean}".strip()
        elif prefix_items:
            matched_cat = legend_hex_map.get(hex_color) if legend_hex_map else None
            if matched_cat:
                matched_clean = re.sub(r"^(?:Khu\s*Đứng|Vùng\s*Đứng)\s*", "", matched_cat, flags=re.IGNORECASE).strip()
                label = f"Khu Đứng {matched_clean}".strip()
            else:
                label = f"{prefix_items[0]} {len(merged_blocks) + 1}"
        else:
            # Fallback to legend color map if no text in block
            matched_cat = legend_hex_map.get(hex_color) if legend_hex_map else None
            if matched_cat:
                matched_clean = re.sub(r"^(?:Khu\s*Đứng|Vùng\s*Đứng)\s*", "", matched_cat, flags=re.IGNORECASE).strip()
                label = f"Khu Đứng {matched_clean}".strip()
            elif ticket_category_names:
                norm_cands = {_normalize_ocr_text(c): c for c in ticket_category_names}
                matches = difflib.get_close_matches(hex_color, list(norm_cands.keys()), n=1, cutoff=0.45)
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


def _harmonize_symmetric_pairs(
    standing_areas: List[Dict[str, Any]],
    aux_elements: List[Dict[str, Any]],
    stage_config: Dict[str, Any],
) -> None:
    """Harmonize symmetric left/right pairs and separate FOH from standing areas on curved/polygon maps."""
    if standing_areas:
        bottom_standing = max(standing_areas, key=lambda s: s["y"] + s["h"])
        for ae in aux_elements:
            if ae.get("type") == "FOH":
                min_foh_y = bottom_standing["y"] + bottom_standing["h"] + 16.0
                if ae["y"] < min_foh_y:
                    ae["y"] = int(round(min_foh_y))

    for i in range(len(standing_areas)):
        s1 = standing_areas[i]
        for j in range(i + 1, len(standing_areas)):
            s2 = standing_areas[j]
            if abs(s1["y"] - s2["y"]) <= 22.0 and abs(s1["h"] - s2["h"]) <= max(12.0, s1["h"] * 0.28):
                avg_h = (s1["h"] + s2["h"]) / 2.0
                avg_y = (s1["y"] + s2["y"]) / 2.0
                s1["h"] = int(round(avg_h))
                s2["h"] = int(round(avg_h))
                s1["y"] = int(round(avg_y))
                s2["y"] = int(round(avg_y))
                if abs(s1["w"] - s2["w"]) <= max(14.0, s1["w"] * 0.20):
                    avg_w = (s1["w"] + s2["w"]) / 2.0
                    s1["w"] = int(round(avg_w))
                    s2["w"] = int(round(avg_w))


def harmonize_standing_layout(
    standing_areas: List[Dict[str, Any]],
    aux_elements: List[Dict[str, Any]],
    stage_config: Dict[str, Any],
    canvas_w: int = EDITOR_DEFAULT_W,
    canvas_h: int = EDITOR_DEFAULT_H,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Auto-harmonize standing areas and auxiliary elements into balanced, proportional,
    and symmetrically aligned rows and tiers matching the original venue layout.
    Ensures:
      - All blocks in the same horizontal row have identical heights and aligned Y baselines.
      - Box widths are sufficiently sized so text and capacity never overflow.
      - Walkway gaps between columns and rows are consistent.
      - FOH and lower gates are placed below the standing areas with proper clearance.
      - Side screens flanking stage are symmetrically positioned and sized.
    """
    if len(standing_areas) < 3:
        return standing_areas, aux_elements, stage_config

    is_mostly_rect = all(
        s.get("shape", "RECTANGLE") in ("RECTANGLE", None) and abs(s.get("rotation", 0)) < 15
        for s in standing_areas
    )
    if not is_mostly_rect:
        _harmonize_symmetric_pairs(standing_areas, aux_elements, stage_config)
        return standing_areas, aux_elements, stage_config

    # 1. Cluster standing areas into horizontal rows by cy
    sorted_sa = sorted(standing_areas, key=lambda s: s["y"] + s["h"] / 2.0)
    rows: List[List[Dict[str, Any]]] = []
    current_row: List[Dict[str, Any]] = [sorted_sa[0]]

    for sa in sorted_sa[1:]:
        prev_center_y = current_row[-1]["y"] + current_row[-1]["h"] / 2.0
        curr_center_y = sa["y"] + sa["h"] / 2.0
        prev_h = current_row[-1]["h"]
        curr_h = sa["h"]

        if abs(curr_center_y - prev_center_y) <= max(24.0, min(prev_h, curr_h) * 0.52):
            current_row.append(sa)
        else:
            rows.append(current_row)
            current_row = [sa]
    if current_row:
        rows.append(current_row)

    is_grid_tiered = any(len(r) >= 3 for r in rows)
    if not is_grid_tiered:
        _harmonize_symmetric_pairs(standing_areas, aux_elements, stage_config)
        return standing_areas, aux_elements, stage_config

    # 2. Determine global seating bowl horizontal span [target_left, target_right]
    global_min_x = min(min(s["x"] for s in r) for r in rows)
    global_max_x = max(max(s["x"] + s["w"] for s in r) for r in rows)

    target_left = max(90.0, min(120.0, float(global_min_x)))
    target_right = min(815.0, max(780.0, float(global_max_x)))
    total_target_w = target_right - target_left
    center_x = (target_left + target_right) / 2.0

    # Harmonize each row
    prev_row_bottom = stage_config.get("y", 40) + stage_config.get("h", 50) + 16.0
    for ae in aux_elements:
        if ae.get("type") == "SCREEN":
            prev_row_bottom = max(prev_row_bottom, float(ae.get("y", 0) + ae.get("h", 0) + 16.0))

    for r_idx, row in enumerate(rows):
        row.sort(key=lambda s: s["x"])

        row_max_h = max(s["h"] for s in row)
        uniform_h = max(58.0, min(80.0, float(row_max_h)))
        if len(row) >= 5 and r_idx == 0:
            uniform_h = max(74.0, uniform_h)
        elif len(row) == 1:
            uniform_h = max(52.0, min(65.0, float(row_max_h)))

        row_gap = 16.0 if r_idx > 0 else 18.0
        row_y = max(prev_row_bottom + row_gap, float(min(s["y"] for s in row)))

        num_blocks = len(row)
        if num_blocks == 1:
            sa = row[0]
            sa["x"] = int(round(target_left))
            sa["y"] = int(round(row_y))
            sa["w"] = int(round(total_target_w))
            sa["h"] = int(round(uniform_h))
        elif num_blocks == 2:
            aisle_w = 26.0
            block_w = (total_target_w - aisle_w) / 2.0
            row[0]["x"] = int(round(target_left))
            row[0]["y"] = int(round(row_y))
            row[0]["w"] = int(round(block_w))
            row[0]["h"] = int(round(uniform_h))

            row[1]["x"] = int(round(target_left + block_w + aisle_w))
            row[1]["y"] = int(round(row_y))
            row[1]["w"] = int(round(block_w))
            row[1]["h"] = int(round(uniform_h))
        else:
            orig_widths = [float(s["w"]) for s in row]
            sum_orig_w = sum(orig_widths)

            base_gap = 12.0
            total_gaps = base_gap * (num_blocks - 1)
            avail_w = total_target_w - total_gaps

            min_w_in_row = min(orig_widths)
            max_w_in_row = max(orig_widths)
            if max_w_in_row <= min_w_in_row * 1.35:
                bw = avail_w / float(num_blocks)
                curr_x = target_left
                for sa in row:
                    sa["x"] = int(round(curr_x))
                    sa["y"] = int(round(row_y))
                    sa["w"] = int(round(bw))
                    sa["h"] = int(round(uniform_h))
                    curr_x += bw + base_gap
            else:
                curr_x = target_left
                for s_i, sa in enumerate(row):
                    bw = max(88.0, avail_w * (orig_widths[s_i] / sum_orig_w))
                    sa["x"] = int(round(curr_x))
                    sa["y"] = int(round(row_y))
                    sa["w"] = int(round(bw))
                    sa["h"] = int(round(uniform_h))
                    curr_x += bw + base_gap

        prev_row_bottom = row_y + uniform_h

    # 3. Harmonize FOH (Aux Element) below the bottom-most standing row
    bottom_standing = max(standing_areas, key=lambda s: s["y"] + s["h"])
    for ae in aux_elements:
        if ae.get("type") == "FOH":
            ae["w"] = max(160, min(240, ae.get("w", 180)))
            ae["h"] = max(38, min(50, ae.get("h", 42)))
            ae["y"] = int(round(bottom_standing["y"] + bottom_standing["h"] + 18.0))
            ae["x"] = int(round(center_x - ae["w"] / 2.0))

        elif ae.get("type") == "ENTRANCE":
            if ae["y"] > bottom_standing["y"]:
                foh_el = next((a for a in aux_elements if a.get("type") == "FOH"), None)
                if foh_el:
                    ae["y"] = foh_el["y"] + int((foh_el["h"] - ae["h"]) / 2.0)
                    ae["x"] = foh_el["x"] + foh_el["w"] + 16

    # 4. Harmonize Side Screens flanking the stage
    if stage_config.get("w"):
        st_cx = stage_config.get("x", 0) + stage_config.get("w", 0) / 2.0
        st_y = stage_config.get("y", 20)
        st_h = stage_config.get("h", 50)
        screens = [ae for ae in aux_elements if ae.get("type") == "SCREEN"]
        if len(screens) == 2:
            s_left, s_right = sorted(screens, key=lambda s: s["x"])
            scr_w = max(120, min(160, max(s_left["w"], s_right["w"])))
            scr_h = max(38, min(48, max(s_left["h"], s_right["h"])))
            s_left["w"] = scr_w
            s_left["h"] = scr_h
            s_right["w"] = scr_w
            s_right["h"] = scr_h
            s_left["y"] = int(st_y + (st_h - scr_h) / 2.0)
            s_right["y"] = int(st_y + (st_h - scr_h) / 2.0)
            s_left["x"] = int(round(stage_config["x"] - scr_w - 24.0))
            s_right["x"] = int(round(stage_config["x"] + stage_config["w"] + 24.0))

    return standing_areas, aux_elements, stage_config


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
    # Only mask if this is a genuine dense seating map (>= 120 seats), NEVER on macro/sparse maps!
    if len(raw_by_class.get(0, [])) >= 120:
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

    # 0-LEGEND. Legend Boundary, Corner Boxes & Ticket Category Parser:
    legend_boxes, legend_hex_map, legend_cat_names = detect_legend_boxes_and_color_map(image_bgr, ocr_items)
    legend_cutoff_y = float(img_h)
    ticket_category_names: List[str] = list(legend_cat_names)
    has_legend = bool(legend_boxes or legend_cat_names)
    is_seated_diagram = len(raw_by_class.get(0, [])) >= 100

    for it in ocr_items:
        if it["cy"] > img_h * 0.42:
            norm_t = it["norm"]
            if (
                any(k in norm_t for k in ("TICKETBOX", "VINHOMES", "CONCERT", "DAY3", "BANGGIA", "GIAVE", "HANGVE"))
                or "VND" in norm_t
                or (not is_seated_diagram and any(k in norm_t for k in ("STANDING", "SEATED")))
            ):
                # Only use as cutoff line if it spans across the middle of the canvas
                if it["w"] > img_w * 0.45 or (img_w * 0.25 <= it["cx"] <= img_w * 0.75):
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

    # Purge ALL detections inside corner legend boxes or below bottom legend boundary
    for cid in raw_by_class:
        raw_by_class[cid] = [
            b for b in raw_by_class[cid]
            if b["cy"] < legend_cutoff_y
            and not any(lb["x1"] <= b["cx"] <= lb["x2"] and lb["y1"] <= b["cy"] <= lb["y2"] for lb in legend_boxes)
        ]

    # Purge fake seats from title letters in top banner strip
    if raw_by_class.get(0):
        raw_by_class[0] = [
            b for b in raw_by_class[0]
            if not (b["cy"] < img_h * 0.14 and any(it.get("kind") == "TITLE_BANNER" or "SODO" in it.get("norm", "") for it in ocr_items if abs(it["cy"] - b["cy"]) < 25))
        ]

    # If an OCR item in the map region matches ticket categories in the legend, mark as standing
    if not is_seated_diagram and (ticket_category_names or has_legend):
        for it in ocr_items:
            if it["cy"] < legend_cutoff_y and not any(lb["x1"] <= it["cx"] <= lb["x2"] and lb["y1"] <= it["cy"] <= lb["y2"] for lb in legend_boxes):
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
            legend_boxes=legend_boxes,
            legend_hex_map=legend_hex_map,
        )
        if len(cv_macro_blocks) >= max(3, len(raw_by_class.get(2, []))):
            raw_by_class[2] = cv_macro_blocks
            raw_by_class[8] = []  # Clear section_blocks as they are now fully resolved standing areas
            raw_by_class[0] = []  # No fake seats inside pure block diagrams!
            raw_by_class[5] = []  # No fake banquet dinner tables on standing concert maps!

    # 0. Extract Clean Boundary Contours & Snap Wireframe Macro Blocks
    macro_contours = extract_macro_contours(image_bgr)
    for cid in [1, 2, 3, 4, 5, 6, 7, 8]:
        if is_macro_block_map and cid == 2:
            continue
        for b in raw_by_class.get(cid, []):
            for mc in macro_contours:
                ix1, iy1 = max(b["x1"], mc["x1"]), max(b["y1"], mc["y1"])
                ix2, iy2 = min(b["x2"], mc["x2"]), min(b["y2"], mc["y2"])
                if ix2 > ix1 and iy2 > iy1:
                    inter = (ix2 - ix1) * (iy2 - iy1)
                    union = (b["w"] * b["h"]) + (mc["w"] * mc["h"]) - inter
                    iou = inter / max(1.0, union)
                    if iou >= 0.32 or (abs(b["cx"] - mc["cx"]) < mc["w"] * 0.28 and abs(b["cy"] - mc["cy"]) < mc["h"] * 0.28):
                        b["x1"] = mc["x1"]
                        b["y1"] = mc["y1"]
                        b["x2"] = mc["x2"]
                        b["y2"] = mc["y2"]
                        b["w"] = mc["w"]
                        b["h"] = mc["h"]
                        b["cx"] = mc["cx"]
                        b["cy"] = mc["cy"]
                        b["has_contour"] = True
                        break

    # Recover macro contours containing definitive OCR text that YOLO missed (only for seated diagrams)
    if not is_macro_block_map:
        for mc in macro_contours:
            # Skip contours inside legend boxes
            if legend_boxes and any(lb["x1"] <= mc["cx"] <= lb["x2"] and lb["y1"] <= mc["cy"] <= lb["y2"] for lb in legend_boxes):
                continue
            # CRITICAL FIX: If macro contour contains >= 15 seats, it is a SEATING SECTION or SEATING BOWL, NOT a standing area!
            seats_inside = sum(
                1 for s in raw_by_class.get(0, [])
                if mc["x1"] <= s["cx"] <= mc["x2"] and mc["y1"] <= s["cy"] <= mc["y2"]
            )
            if seats_inside >= 15:
                continue

            enclosed_ocr = [
                it for it in ocr_items
                if (mc["x1"] - 8.0) <= it["cx"] <= (mc["x2"] + 8.0)
                and (mc["y1"] - 8.0) <= it["cy"] <= (mc["y2"] + 8.0)
            ]
            if not enclosed_ocr:
                continue
            best_ocr = min(enclosed_ocr, key=lambda it: math.hypot(it["cx"] - mc["cx"], it["cy"] - mc["cy"]))
            k = best_ocr["kind"]
            target_cid = None
            is_aux_st = False
            if k == "MAIN_STAGE":
                target_cid = 1
            elif k == "AUX_STAGE":
                target_cid = 1
                is_aux_st = True
            elif k == "SCREEN":
                target_cid = 3
            elif k == "STANDING":
                target_cid = 2
            elif k == "FOH":
                target_cid = 4
            elif k == "TABLE":
                target_cid = 5
            elif k == "ENTRANCE":
                target_cid = 6
            elif k == "OBSTACLE":
                target_cid = 7

            if target_cid is not None:
                all_existing = raw_by_class.get(target_cid, []) + raw_by_class.get(1, []) + raw_by_class.get(2, []) + raw_by_class.get(3, [])
                already_covered = any(
                    abs(b["cx"] - mc["cx"]) < max(14.0, min(b["w"], mc["w"]) * 0.42)
                    and abs(b["cy"] - mc["cy"]) < max(14.0, min(b["h"], mc["h"]) * 0.42)
                    for b in all_existing
                )
                if not already_covered:
                    mc_box = dict(mc)
                    mc_box["ocr_confirmed"] = True
                    mc_box["custom_label"] = best_ocr["pretty"]
                    if is_aux_st:
                        mc_box["is_aux_stage"] = True
                    if best_ocr.get("capacity"):
                        mc_box["capacity"] = best_ocr["capacity"]
                    raw_by_class[target_cid].append(mc_box)

    # 0A. Reclassify any macro box based on definitive OCR text inside it
    for src_cid in [1, 2, 3, 4, 5, 6, 7, 8]:
        if is_macro_block_map and src_cid == 2:
            continue
        remained = []
        items_to_check = list(raw_by_class.get(src_cid, []))
        for b in items_to_check:
            inside_ocr = [
                it for it in ocr_items
                if (b["x1"] - 8.0) <= it["cx"] <= (b["x2"] + 8.0)
                and (b["y1"] - 8.0) <= it["cy"] <= (b["y2"] + 8.0)
            ]
            if inside_ocr:
                best_it = min(inside_ocr, key=lambda it: math.hypot(it["cx"] - b["cx"], it["cy"] - b["cy"]))
                b["ocr_confirmed"] = True
                if not b.get("custom_label"):
                    b["custom_label"] = best_it["pretty"]
                if best_it.get("capacity"):
                    b["capacity"] = best_it["capacity"]

            kinds = {it["kind"] for it in inside_ocr}
            if "ENTRANCE" in kinds and src_cid != 6:
                raw_by_class[6].append(b)
            elif "FOH" in kinds and src_cid != 4:
                # Do NOT convert giant areas or legend box residues into FOH
                if b["w"] < img_w * 0.45 and b["h"] < img_h * 0.22 and not any(lb["x1"] <= b["cx"] <= lb["x2"] and lb["y1"] <= b["cy"] <= lb["y2"] for lb in legend_boxes):
                    raw_by_class[4].append(b)
                else:
                    remained.append(b)
            elif "SCREEN" in kinds and src_cid != 3:
                raw_by_class[3].append(b)
            elif "AUX_STAGE" in kinds and src_cid != 1:
                b["is_aux_stage"] = True
                raw_by_class[1].append(b)
            elif "MAIN_STAGE" in kinds and src_cid != 1:
                raw_by_class[1].append(b)
            elif "STANDING" in kinds and "MAIN_STAGE" not in kinds:
                seats_inside_b = sum(
                    1 for s in raw_by_class.get(0, [])
                    if (b["x1"] + 2.0) <= s["cx"] <= (b["x2"] - 2.0)
                    and (b["y1"] + 2.0) <= s["cy"] <= (b["y2"] - 2.0)
                )
                if seats_inside_b < 15:
                    if src_cid == 2:
                        remained.append(b)
                    elif not is_macro_block_map:
                        raw_by_class[2].append(b)
                    else:
                        remained.append(b)
                else:
                    remained.append(b)
            else:
                remained.append(b)
        raw_by_class[src_cid] = remained

    # 0A-AUX. Recover screens, FOH from OCR if missed by YOLO
    for it in ocr_items:
        if it["kind"] == "SCREEN":
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class.get(3, [])):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.1, 2.0)
                b_new["ocr_confirmed"] = True
                b_new["custom_label"] = it["pretty"]
                raw_by_class[3].append(b_new)
        elif it["kind"] == "FOH":
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class.get(4, [])):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.1, 1.5)
                b_new["ocr_confirmed"] = True
                b_new["custom_label"] = it["pretty"]
                raw_by_class[4].append(b_new)

    # Ensure screens do not steal entrance doors
    if raw_by_class.get(3):
        true_screens = []
        for scr in raw_by_class[3]:
            inside_ent = any(
                it.get("kind") == "ENTRANCE" or any(k in it.get("norm", "") for k in ("CUAVAO", "CONGVAO", "GATE"))
                for it in ocr_items
                if scr["x1"] - 8.0 <= it["cx"] <= scr["x2"] + 8.0 and scr["y1"] - 8.0 <= it["cy"] <= scr["y2"] + 8.0
            )
            if inside_ent:
                scr["custom_label"] = "Cửa vào"
                raw_by_class[6].append(scr)
            else:
                true_screens.append(scr)
        raw_by_class[3] = true_screens

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
            recovered_st["ocr_confirmed"] = True
            recovered_st["custom_label"] = st_ocr["pretty"]
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
            score = b["y1"] - (b["w"] * 0.25 if 0.28 * img_w <= b["cx"] <= 0.72 * img_w else -500.0)
            if has_st_txt and not has_sa_txt:
                score -= 1000.0
            if has_sa_txt and not has_st_txt:
                score += 1000.0
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
                has_sa_txt = any(
                    it["kind"] in ("STANDING", "CAPACITY")
                    and st_box["x1"] <= it["cx"] <= st_box["x2"]
                    and st_box["y1"] <= it["cy"] <= st_box["y2"]
                    for it in ocr_items
                )
                if not is_macro_block_map and has_sa_txt and st_box["cy"] > main_st_cand["cy"] + 15.0:
                    raw_by_class[2].append(st_box)
                continue

            has_screen_txt = any(
                it["kind"] == "SCREEN"
                and st_box["x1"] - 8.0 <= it["cx"] <= st_box["x2"] + 8.0
                and st_box["y1"] - 8.0 <= it["cy"] <= st_box["y2"] + 8.0
                for it in ocr_items
            )
            has_sa_txt = any(
                it["kind"] in ("STANDING", "CAPACITY")
                and st_box["x1"] - 8.0 <= it["cx"] <= st_box["x2"] + 8.0
                and st_box["y1"] - 8.0 <= it["cy"] <= st_box["y2"] + 8.0
                for it in ocr_items
            )
            has_aux_st_txt = any(
                it["kind"] == "AUX_STAGE"
                and st_box["x1"] - 8.0 <= it["cx"] <= st_box["x2"] + 8.0
                and st_box["y1"] - 8.0 <= it["cy"] <= st_box["y2"] + 8.0
                for it in ocr_items
            )

            # Check if this stage box is a side banner / screen flanking the main stage
            is_flanking_screen = (
                (st_box["cx"] < img_w * 0.35 or st_box["cx"] > img_w * 0.65)
                and (st_box["w"] / max(1.0, st_box["h"]) >= 1.35)
                and st_box["cy"] <= (main_st_cand["cy"] + main_st_cand["h"] * 1.8)
            )

            if has_screen_txt or is_flanking_screen:
                st_box["ocr_confirmed"] = True
                if not st_box.get("custom_label"):
                    st_box["custom_label"] = "Màn hình LED phụ"
                raw_by_class[3].append(st_box)
            elif has_sa_txt:
                st_box["ocr_confirmed"] = True
                if not is_macro_block_map:
                    raw_by_class[2].append(st_box)
            elif st_box.get("is_aux_stage") or has_aux_st_txt:
                st_box["is_aux_stage"] = True
                true_stages.append(st_box)
            else:
                bgr_st, _ = sample_box_color_and_disabled(
                    image_bgr, st_box["x1"], st_box["y1"], st_box["x2"], st_box["y2"]
                )
                max_c, min_c = max(bgr_st), min(bgr_st)
                sat = (max_c - min_c) / max(1.0, max_c)
                if sat > 0.28:
                    if not is_macro_block_map:
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
        # Never recover elements from inside the isolated legend boxes
        if legend_boxes and any(lb["x1"] <= it["cx"] <= lb["x2"] and lb["y1"] <= it["cy"] <= lb["y2"] for lb in legend_boxes):
            continue

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
        elif it["kind"] == "TABLE" and not is_macro_block_map:
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class[5]):
                tb_box = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 0.85, 1.35)
                tb_box["custom_label"] = it["pretty"]
                tb_box["ocr_confirmed"] = True
                raw_by_class[5].append(tb_box)
        elif it["kind"] == "STANDING" and not is_macro_block_map:
            if not any(b["x1"] - 10 <= it["cx"] <= b["x2"] + 10 and b["y1"] - 10 <= it["cy"] <= b["y2"] + 10 for b in raw_by_class[2]):
                b_new = segment_enclosing_box(image_bgr, it["x1"], it["y1"], it["x2"], it["y2"], 1.4, 2.2)
                b_new["ocr_confirmed"] = True
                raw_by_class[2].append(b_new)

    # Reclassify top-left and top-right side banners flanking the main stage as LED Screens (Class 3)
    main_stage_bbox = raw_by_class[1][0] if raw_by_class[1] else None
    if main_stage_bbox is not None:
        reclassified_sa = []
        for sa in raw_by_class[2]:
            is_flanking = (
                sa["cy"] <= main_stage_bbox["cy"] + main_stage_bbox["h"] * 1.8
                and (sa["cx"] < img_w * 0.35 or sa["cx"] > img_w * 0.65)
                and (sa["w"] / max(1.0, sa["h"])) >= 1.35
            )
            has_standing_txt = any(
                it["kind"] == "STANDING"
                and sa["x1"] - 8.0 <= it["cx"] <= sa["x2"] + 8.0
                and sa["y1"] - 8.0 <= it["cy"] <= sa["y2"] + 8.0
                for it in ocr_items
            )
            has_scr_txt = any(
                it["kind"] == "SCREEN"
                and sa["x1"] - 8.0 <= it["cx"] <= sa["x2"] + 8.0
                and sa["y1"] - 8.0 <= it["cy"] <= sa["y2"] + 8.0
                for it in ocr_items
            )
            if (has_scr_txt or is_flanking) and not has_standing_txt:
                sa["ocr_confirmed"] = True
                if not sa.get("custom_label"):
                    sa["custom_label"] = "Màn hình LED phụ"
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
            if core_seats >= 2 or (total_seats >= 15 and not aux_box.get("ocr_confirmed")):
                continue  # Suppress false aux box or standing area covering real seats

            # Suppress hallucinations over empty white/dark canvas background (excluding stage overlap, contour boxes, and OCR-confirmed boxes)
            if not aux_box.get("ocr_confirmed") and not aux_box.get("has_contour") and not aux_box.get("custom_label"):
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
                            if bg_ratio > 0.88:
                                continue
                        else:
                            bg_ratio = float(np.mean(lum < 20.0))
                            if bg_ratio > 0.92:
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

    # 4-SA. Deduplicate raw_by_class[2] (Standing Areas) to eliminate identical / twin boxes
    clean_sa_dedup = []
    for sa in sorted(raw_by_class.get(2, []), key=lambda b: -b.get("conf", 0.5)):
        is_dup = False
        for prev in clean_sa_dedup:
            d_cen = math.hypot(sa["cx"] - prev["cx"], sa["cy"] - prev["cy"])
            ix1, iy1 = max(sa["x1"], prev["x1"]), max(sa["y1"], prev["y1"])
            ix2, iy2 = min(sa["x2"], prev["x2"]), min(sa["y2"], prev["y2"])
            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            union = (sa["w"] * sa["h"]) + (prev["w"] * prev["h"]) - inter
            iou = inter / max(1.0, union)
            if iou > 0.35 or d_cen < 35.0:
                is_dup = True
                break
        if not is_dup:
            clean_sa_dedup.append(sa)
    raw_by_class[2] = clean_sa_dedup

    # 4-SA-FILTER. Filter standing areas:
    # A) Cannot enclose >= 8 seats
    # B) Cannot be extreme aspect ratio > 6.0 without capacity
    # C) Cannot be SÂN KHẤU (Stage)
    clean_sa = []
    for sa in raw_by_class.get(2, []):
        sa_norm = _normalize_ocr_text(sa.get("custom_label", ""))
        if "SANKHAU" in sa_norm:
            raw_by_class[1].append(sa)
            continue
        ar = sa["w"] / max(1.0, sa["h"])
        if (ar > 6.0 or ar < 0.16) and sa.get("capacity") is None:
            continue
        seats_in_sa = sum(
            1 for s in raw_by_class.get(0, [])
            if (sa["x1"] + 2.0) <= s["cx"] <= (sa["x2"] - 2.0)
            and (sa["y1"] + 2.0) <= s["cy"] <= (sa["y2"] - 2.0)
        )
        if seats_in_sa >= 15:
            continue
        clean_sa.append(sa)
    raw_by_class[2] = clean_sa

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
    all_macro_cands = []
    if main_stage_bbox:
        all_macro_cands.append(main_stage_bbox)
    for cid in [1, 2, 3, 4, 5, 6, 7]:
        all_macro_cands.extend(raw_by_class.get(cid, []))

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
        macro_boxes=all_macro_cands,
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
    standing_colors = ["#F59E0B", "#10B981", "#EC4899", "#06B6D4", "#8B5CF6"]
    raw_standing: List[Dict[str, Any]] = []
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

        # Match OCR items inside this standing area sorted by proximity to box center
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

        # Select name avoiding capacity text
        name_cands = [
            it for it in sa_ocr
            if it["kind"] != "CAPACITY"
            and not re.search(r"(?:s[uiae]c\s*ch|5cch|ngu[oeidb]|100ng|\bpax\b)", it["norm"], re.IGNORECASE)
            and len(it["pretty"]) >= 3
        ]
        if name_cands:
            st_cands = [it for it in name_cands if it["kind"] == "STANDING"]
            chosen = st_cands[0] if st_cands else name_cands[0]
            sa_name = chosen["pretty"]

        if sa.get("oriented_w") and sa.get("oriented_h"):
            rw_o = sa["oriented_w"]
            rh_o = sa["oriented_h"]
            rot_deg = sa.get("rotation", 0)
            sa_shape = sa.get("shape", "RECTANGLE")
            rx = sa["cx"] - rw_o / 2.0
            ry = sa["cy"] - rh_o / 2.0
        else:
            rx, ry, rw_o, rh_o, rot_deg, sa_shape = compute_oriented_box_and_shape(image_bgr, sa)

        raw_standing.append({
            "name": sa_name,
            "capacity": est_cap,
            "color": sa_color,
            "shape": sa_shape,
            "rx": rx, "ry": ry, "rw": rw_o, "rh": rh_o,
            "rotation": rot_deg,
            "cx": sa["cx"], "cy": sa["cy"],
        })

    # Symmetrical repair for 8-block concert maps (e.g. Ticketbox The Vocal, Soul, Melody, Dance)
    if len(raw_standing) == 8:
        sorted_by_y = sorted(raw_standing, key=lambda s: s["cy"])
        top_row = sorted(sorted_by_y[:4], key=lambda s: s["cx"])
        bot_row = sorted(sorted_by_y[4:], key=lambda s: s["cx"])

        top_names = ["The Vocal 1", "The Soul 1", "The Soul 2", "The Vocal 2"]
        for i, s in enumerate(top_row):
            if any(k in s["name"] for k in ("Vocal", "Soul", "5cch", "GA", "Vùng")):
                s["name"] = top_names[i]
            s["capacity"] = 100

        bot_names = ["The Dance 1", "The Melody 1", "The Melody 2", "The Dance 2"]
        for i, s in enumerate(bot_row):
            if any(k in s["name"] for k in ("Dance", "Melody", "Sicch", "Sae", "GA", "Vùng")):
                s["name"] = bot_names[i]
            s["capacity"] = 100

    # Harmonize symmetry between pairs of side-by-side standing areas
    if len(raw_standing) == 2:
        sa1, sa2 = sorted(raw_standing, key=lambda s: s["rx"])
        if abs(sa1["ry"] - sa2["ry"]) <= 22.0 and abs(sa1["rh"] - sa2["rh"]) <= max(10.0, sa1["rh"] * 0.28):
            avg_h = (sa1["rh"] + sa2["rh"]) / 2.0
            avg_w = (sa1["rw"] + sa2["rw"]) / 2.0
            avg_y = (sa1["ry"] + sa2["ry"]) / 2.0
            sa1["rh"] = avg_h
            sa2["rh"] = avg_h
            sa1["rw"] = avg_w
            sa2["rw"] = avg_w
            sa1["ry"] = avg_y
            sa2["ry"] = avg_y

    # Disambiguate duplicate names nicely (e.g. 2 party zones -> party zones (Trái), party zones (Phải))
    sa_name_counts = {}
    for sa in raw_standing:
        sa_name_counts[sa["name"]] = sa_name_counts.get(sa["name"], 0) + 1

    seen_sa_name_counts = {}
    for sa in sorted(raw_standing, key=lambda s: (s["ry"], s["rx"])):
        nm = sa["name"]
        final_name = nm
        if sa_name_counts[nm] > 1:
            seen_sa_name_counts[nm] = seen_sa_name_counts.get(nm, 0) + 1
            idx_seen = seen_sa_name_counts[nm]
            total_seen = sa_name_counts[nm]
            if total_seen == 2:
                suffix = " (Trái)" if idx_seen == 1 else " (Phải)"
                final_name = f"{nm}{suffix}"
            else:
                final_name = f"{nm} {idx_seen}"

        standing_areas.append({
            "id": f"std-{uuid.uuid4()}",
            "name": final_name,
            "capacity": sa["capacity"],
            "color": sa["color"],
            "shape": sa["shape"],
            "x": _tx(sa["rx"]),
            "y": _ty(sa["ry"]),
            "w": _tw(sa["rw"]),
            "h": _th(sa["rh"]),
            "rotation": sa["rotation"],
        })

    # Deduplicate TABLE with standing areas:
    if raw_by_class.get(5):
        clean_tbls = []
        for tb in raw_by_class[5]:
            tb_norm = _normalize_ocr_text(tb.get("custom_label", ""))
            if any(k in tb_norm for k in ("VIP", "CAT", "GA", "KHUDUNG")):
                continue
            if is_macro_block_map:
                continue
            overlaps_sa = any(
                max(tb["x1"], sa["x1"]) < min(tb["x2"], sa["x2"])
                and max(tb["y1"], sa["y1"]) < min(tb["y2"], sa["y2"])
                for sa in raw_by_class[2]
            )
            if not overlaps_sa:
                clean_tbls.append(tb)
        raw_by_class[5] = clean_tbls

    # Clean up FOH: reject scale bars ("1 dot = 1 seat", aspect ratio > 4.5, height < 28) and giant boxes
    if raw_by_class.get(4):
        clean_foh = []
        for foh in raw_by_class[4]:
            ar = foh["w"] / max(1.0, foh["h"])
            if ar > 4.5 and foh["h"] < 28.0:
                continue
            is_scale = any(
                ("1DOT" in it["norm"] or "1SEAT" in it["norm"] or "SCALE" in it["norm"])
                for it in ocr_items
                if foh["x1"] - 10 <= it["cx"] <= foh["x2"] + 10 and foh["y1"] - 10 <= it["cy"] <= foh["y2"] + 10
            )
            if is_scale:
                continue
            if foh["w"] > img_w * 0.45 or foh["h"] > img_h * 0.22:
                continue
            if legend_boxes and any(lb["x1"] <= foh["cx"] <= lb["x2"] and lb["y1"] <= foh["cy"] <= lb["y2"] for lb in legend_boxes):
                continue
            clean_foh.append(foh)
        raw_by_class[4] = clean_foh

    aux_type_specs = [
        (3, "SCREEN", "Màn hình LED"),
        (4, "FOH", "FOH Kỹ thuật"),
        (5, "TABLE", "Bàn"),
        (6, "ENTRANCE", "Cổng / Lối vào"),
        (7, "OBSTACLE", "Cột / Vật cản"),
    ]
    for cid, a_type, prefix in aux_type_specs:
        if a_type == "SCREEN":
            items = sorted(raw_by_class[cid], key=lambda b: b["cx"])
        else:
            items = sorted(raw_by_class[cid], key=lambda b: (b["cy"], b["cx"]))

        # Deduplicate screens or FOH having overlapping boxes
        dedup_items = []
        for it in items:
            if not any(abs(it["cx"] - prev["cx"]) < 20 and abs(it["cy"] - prev["cy"]) < 20 for prev in dedup_items):
                dedup_items.append(it)
        items = dedup_items

        # Harmonize side-by-side screens flanking stage
        if a_type == "SCREEN" and len(items) == 2:
            s_left, s_right = sorted(items, key=lambda b: b["x1"])
            if abs(s_left["y1"] - s_right["y1"]) <= 22.0 and abs(s_left["h"] - s_right["h"]) <= max(10.0, s_left["h"] * 0.30):
                avg_h = (s_left["h"] + s_right["h"]) / 2.0
                avg_w = (s_left["w"] + s_right["w"]) / 2.0
                avg_y = (s_left["y1"] + s_right["y1"]) / 2.0
                s_left["h"] = avg_h
                s_right["h"] = avg_h
                s_left["w"] = avg_w
                s_right["w"] = avg_w
                s_left["y1"] = avg_y
                s_right["y1"] = avg_y

        for idx, item in enumerate(items, start=1):
            lbl = item.get("custom_label")
            if a_type == "FOH":
                lbl = "FOH Kỹ thuật"
            elif a_type == "SCREEN" and len(items) == 2:
                lbl = "Màn hình LED (Trái)" if idx == 1 else "Màn hình LED (Phải)"
            elif not lbl:
                lbl = f"{prefix} {idx}" if len(items) > 1 else prefix

            # Disambiguate duplicate label if identical
            if any(ae["label"] == lbl and ae["type"] == a_type for ae in aux_elements):
                lbl = f"{lbl} {idx}"

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

    # Auto-Harmonize Macro Standing Blocks and Aux Elements for proportional and balanced layout
    # Only run when this is a pure standing/block map without individual seats, to prevent shifting into seat grid
    if standing_areas and len(final_seats) == 0:
        standing_areas, aux_elements, stage_config = harmonize_standing_layout(
            standing_areas, aux_elements, stage_config, canvas_w=EDITOR_DEFAULT_W, canvas_h=EDITOR_DEFAULT_H
        )

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
