# 🪑 Hướng Dẫn Cài Đặt & Chạy AI Seat Map Service (EventHub)

Dịch vụ **Seat Map AI** sử dụng **FastAPI + YOLO11 (Object Detection) + SAHI + OpenCV** giúp tự động phân tích ảnh sơ đồ chỗ ngồi (rạp chiếu phim, nhà hát, hội trường...) và tái tạo thành sơ đồ ghế tương tác hoàn chỉnh trên **SeatMapEditor** của EventHub.

```text
Frontend (React :5173)  ──►  Backend (Node.js :3000)  ──►  Seat Map AI (FastAPI :8001)
  Nút "✨ Tạo từ ảnh (AI)"      POST /api/organizer/            POST /api/seatmap/predict
                                 seat-maps/ai-generate          (YOLO11 + SAHI + OpenCV)
```

---

## 🚀 1. Khởi Động Nhanh (Khi Đã Cài Môi Trường)

Nếu bạn hoặc máy của bạn đã cài đặt xong môi trường ảo `.venv`:

### Cách 1: Double-click file (Khuyên dùng trên Windows)
- Vào thư mục `EventHub/ai`
- Nhấp đúp chuột vào file: **`start_seatmap_ai.bat`**

### Cách 2: Bằng PowerShell
Mở PowerShell tại thư mục `EventHub/ai` và chạy:
```powershell
.\start_seatmap_ai.ps1
```

### Cách 3: Bằng lệnh Terminal thủ công
```bash
# Kích hoạt môi trường ảo
.\.venv\Scripts\activate

# Khởi chạy server
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

> [!NOTE]
> Khi cửa sổ terminal hiển thị:
> `INFO: Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)`
> Tức là dịch vụ AI đã sẵn sàng hoạt động!

---

## 📦 2. Cài Đặt Lần Đầu Từ A - Z (Dành Cho Máy Mới)

### Yêu cầu hệ thống:
- **Hệ điều hành:** Windows 10/11 (hoặc macOS / Linux).
- **Python:** Phiên bản **3.10 – 3.12** *(khuyên dùng Python 3.11)*.
- **Phần cứng:** Chạy mượt mà trên CPU thông thường, RAM trống tối thiểu 2GB (model YOLO chỉ nhẹ ~5.6 MB, không bắt buộc card GPU rời).
- **Trọng số AI:** File `models/seatmap_yolo_best.pt` đã có sẵn trong repo.

---

### Bước 1: Mở Terminal tại thư mục `EventHub/ai`
```powershell
cd "đường_dẫn_tới_dự_án\EventHub\ai"
```

---

### Bước 2: Tạo môi trường ảo Python (`.venv`)

**Trên PowerShell:**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Trên CMD:**
```cmd
python -m venv .venv
.\.venv\Scripts\activate.bat
```

> [!WARNING]
> Nếu PowerShell báo lỗi: *"running scripts is disabled on this system"*, hãy chạy lệnh này một lần duy nhất với quyền quản trị hoặc User:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
> Sau đó kích hoạt lại: `.\.venv\Scripts\Activate.ps1`.

---

### Bước 3: Cài đặt thư viện phụ thuộc

Chạy 2 lệnh sau để cài đặt các gói cần thiết:

```bash
# 1. Cài đặt PyTorch bản CPU (tải nhanh, chỉ ~200MB thay vì ~2.5GB bản GPU)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 2. Cài các thư viện xử lý ảnh và API cho Seat Map
pip install -r requirements-seatmap.txt
```

> [!TIP]
> File `requirements-seatmap.txt` chỉ chứa các gói tối thiểu cho Seat Map (`fastapi`, `uvicorn`, `ultralytics`, `opencv-python`, `numpy`, `Pillow`...). Không cần cài file `requirements.txt` đầy đủ (file đó dành cho việc huấn luyện LLM nặng hơn).

---

## 🔍 3. Kiểm Tra Dịch Vụ Sau Khi Bật

Sau khi khởi chạy server ở Port **8001**, bạn có thể kiểm tra trực tiếp trên trình duyệt:

| Mục | Địa chỉ URL | Mục đích |
| :--- | :--- | :--- |
| **Kiểm tra trạng thái** | [http://localhost:8001/health](http://localhost:8001/health) | Trả về `{"status": "ok", "model_loaded": true}` |
| **Giao diện Swagger UI** | [http://localhost:8001/docs](http://localhost:8001/docs) | Test trực quan upload ảnh và xem JSON trả về |

### Cách thử nghiệm nhanh qua Swagger UI:
1. Truy cập `http://localhost:8001/docs`.
2. Mở rộng endpoint `POST /api/seatmap/predict`.
3. Bấm **Try it out**.
4. Chọn file ảnh sơ đồ ghế từ máy tính của bạn ở mục `file`.
5. Bấm **Execute** và xem kết quả JSON trả về các toạ độ ghế, sân khấu, hàng ghế và khu vực.

---

## 🌐 4. Kết Nối & Sử Dụng Trên Hệ Thống EventHub

Để sử dụng tính năng tạo sơ đồ ghế bằng AI trên giao diện Web, bạn cần chạy song song 3 dịch vụ:

### Thứ tự khởi động các dịch vụ:
1. **AI Seat Map Service (Port 8001):**
   ```cmd
   cd EventHub/ai
   start_seatmap_ai.bat
   ```
2. **Backend API (Port 3000):**
   ```bash
   cd EventHub/backend
   npm run dev
   ```
   *(Đảm bảo trong `backend/.env` đã có cấu hình: `AI_SERVICE_URL=http://localhost:8001`)*
3. **Frontend Client (Port 5173):**
   ```bash
   cd EventHub/frontend
   npm run dev
   ```

---

### Các bước tạo sơ đồ ghế trên Web UI:
1. Đăng nhập vào EventHub bằng tài khoản **Ban tổ chức (Organizer)** hoặc **Admin**.
2. Điều hướng tới **Quản lý địa điểm (Venues)** → chọn Địa điểm → mở **Sơ đồ chỗ ngồi (Seat Map Editor)**.
3. Ở thanh công cụ trên cùng, nhấn nút **"✨ Tạo từ ảnh (AI)"**.
4. Chọn một file ảnh sơ đồ ghế (định dạng `.png`, `.jpg`, hoặc `.webp`).
5. Chờ AI xử lý (khoảng 1 - 3 giây). Toàn bộ ghế, hàng ghế, số ghế, sân khấu và các khu vực VIP/Thường sẽ được tự động vẽ lên canvas!
6. Organizer có thể thoải mái kéo thả, chỉnh sửa tên hàng, đổi màu phân khu hoặc thêm bớt ghế trước khi nhấn **Lưu sơ đồ**.

---

## 💡 5. Cơ Chế Nhận Diện & Tiêu Chuẩn Ảnh Đầu Vào

### Câu hỏi: AI có nhận diện được một sơ đồ ghế HOÀN TOÀN MỚI không?
👉 **CÓ, HOÀN TOÀN ĐƯỢC!**
- Mô hình YOLO11 được huấn luyện để nhận dạng các **đặc trưng hình học** (chấm tròn ghế, ô vuông ghế, khoảng cách giữa các hàng, khối sân khấu, mã màu phân khu).
- AI **không hề học vẹt** hay tra cứu ảnh cũ trong kho, do đó bạn đưa một sơ đồ ghế mới bất kỳ trên mạng vào, AI vẫn sẽ bóc tách và tái tạo chính xác toạ độ 2D của từng ghế.

---

### Tiêu chuẩn để ảnh đạt độ chính xác cao nhất:

| Loại ảnh | Khả năng xử lý | Lưu ý |
| :--- | :---: | :--- |
| **Sơ đồ rạp chiếu phim, hội trường, nhà hát** | 🟢 **Rất tốt (90% - 98%)** | Ảnh vẽ rõ từng chấm ghế/ô ghế xếp thẳng hàng hoặc cong đều. |
| **Ảnh 2D nhìn thẳng từ trên xuống (Top-down)** | 🟢 **Rất tốt** | Tỷ lệ khoảng cách chuẩn xác, không bị méo hình học. |
| **Ảnh sơ đồ phân khu lớn / Poster Concert** *(chỉ có khối màu CAT 1, CAT 2, Standing mà không vẽ chấm ghế con)* | 🔴 **Không phù hợp** | AI không thể tự bịa ra từng chiếc ghế nếu trên ảnh không có chấm ghế. Nên dùng tính năng vẽ tay hoặc Preset có sẵn. |
| **Ảnh chụp góc nghiêng 3D, phối cảnh nghệ thuật** | 🟡 **Kém** | Phối cảnh 3D làm méo khoảng cách hàng ghế, AI có thể bỏ sót. |
| **Ảnh mờ nhòe, độ phân giải quá thấp** | 🟡 **Kém** | Các chấm ghế bị dính chùm vào nhau. |

---

## 🛠️ 6. Xử Lý Các Sự Cố Thường Gặp (Troubleshooting)

### 1. Lỗi cổng 8001 bị chiếm (`[Errno 10048] Address already in use`)
Một tiến trình Python hoặc server cũ đang ngầm giữ cổng 8001.

**Cách xử lý trên PowerShell:**
```powershell
# Tìm và giải phóng cổng 8001
Get-Process -Id (Get-NetTCPConnection -LocalPort 8001).OwningProcess | Stop-Process -Force
```
**Cách xử lý trên CMD:**
```cmd
netstat -ano | findstr :8001
taskkill /PID <MÃ_PID_TÌM_THẤY> /F
```

---

### 2. Backend báo lỗi: *"Không thể kết nối tới Seatmap AI Service"*
- **Nguyên nhân:** Dịch vụ FastAPI ở port 8001 chưa được bật hoặc gặp lỗi crash lúc khởi động.
- **Khắc phục:** Mở terminal chạy `start_seatmap_ai.bat` và kiểm tra xem cửa sổ có báo lỗi gì không. Đảm bảo truy cập được `http://localhost:8001/health`.

---

### 3. Lỗi `No module named 'uvicorn'` hoặc `No module named 'ultralytics'`
- **Nguyên nhân:** Bạn đang chạy lệnh bằng Python toàn cục của máy thay vì Python trong môi trường ảo `.venv`.
- **Khắc phục:** Chạy file `.bat` (script này tự động tìm `.venv`), hoặc kích hoạt `.venv` trước khi chạy lệnh:
  ```powershell
  .\.venv\Scripts\activate
  pip install -r requirements-seatmap.txt
  ```

---

### 4. Lỗi: `& was unexpected at this time.`
- **Nguyên nhân:** Bạn đang gõ cú pháp chạy lệnh của PowerShell (`& "path\python.exe"`) bên trong cửa sổ Command Prompt (CMD).
- **Khắc phục:** Bỏ ký tự `&` ở đầu dòng, hoặc mở đúng cửa sổ PowerShell để chạy.

---

### 5. Lỗi thiếu file model (`Model file not found`)
- Kiểm tra xem file trọng số `seatmap_yolo_best.pt` có nằm trong thư mục `EventHub/ai/models/` hay không.
- Nếu bạn để model ở vị trí khác, có thể chỉ định đường dẫn qua biến môi trường:
  ```powershell
  $env:SEATMAP_MODEL_PATH="đường_dẫn_tới_file_model.pt"
  ```
