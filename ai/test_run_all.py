import sys
from pathlib import Path
sys.path.insert(0, str(Path("ai").resolve()))
import cv2
from ultralytics import YOLO
from src.seatmap.reconstructor import reconstruct_seatmap_from_yolo

imgs = [
    ("Image 1 (Theater)", "C:/Users/ACER/.gemini/antigravity/brain/6002963a-d06c-4127-a35e-a056db2ca9c8/.user_uploaded/media_1794315715283_ecd1a38a.webp"),
    ("Image 2 (Polygon Gem)", "C:/Users/ACER/.gemini/antigravity/brain/6002963a-d06c-4127-a35e-a056db2ca9c8/.user_uploaded/media_1794315725957_ac10eaba.jpg"),
    ("Image 3 (Light Ticketbox)", "C:/Users/ACER/.gemini/antigravity/brain/6002963a-d06c-4127-a35e-a056db2ca9c8/.user_uploaded/media_1794315749220_0102fa44.jpg"),
    ("Image 4 (Dark Ticketbox)", "C:/Users/ACER/.gemini/antigravity/brain/6002963a-d06c-4127-a35e-a056db2ca9c8/.user_uploaded/media_1794315766212_a4f1359a.jpg")
]

model = YOLO("ai/models/seatmap_yolo11s.pt")

for label, p in imgs:
    print(f"\n==================== {label} ====================")
    img = cv2.imread(p)
    if img is None:
        print("FAILED to read image:", p)
        continue
    try:
        res = reconstruct_seatmap_from_yolo(img, model, conf=0.18, imgsz=1024)
        print("Valid:", res.get("isValidSeatMap"))
        print("Stage:", res.get("stageConfig"))
        print(f"Zones ({len(res.get('zones', []))}):")
        total_seats = len(res.get("seats", []))
        print(f"Total Seats in res['seats']: {total_seats}")
        for z in res.get("zones", []):
            z_seats = [s for s in res.get("seats", []) if s.get("zoneId") == z.get("id")]
            print(f"  Zone: {z.get('name')} | color: {z.get('color')} | seats: {len(z_seats)}")
        print(f"StandingAreas ({len(res.get('standingAreas', []))}):")
        for sa in res.get("standingAreas", []):
            print(f"  SA: {sa.get('name')} | shape: {sa.get('shape')} | cap: {sa.get('capacity')} | x={sa.get('x')}, y={sa.get('y')}, w={sa.get('w')}, h={sa.get('h')}, rot={sa.get('rotation')}")
        print(f"AuxElements ({len(res.get('auxElements', []))}):")
        for ae in res.get("auxElements", []):
            print(f"  AE: type={ae.get('type')} | label={ae.get('label')} | x={ae.get('x')}, y={ae.get('y')}, w={ae.get('w')}, h={ae.get('h')}")
    except Exception as e:
        import traceback
        traceback.print_exc()

