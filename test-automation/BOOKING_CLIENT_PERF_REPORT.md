# Báo Cáo Kiểm Thử Hiệu Năng Client Chức Năng Đặt Vé (500 / 1,000 / 2,000 / 5,000 CCU)

- **Thời gian thực thi**: `2026-11-18T12:47:23+07:00`
- **Sự kiện kiểm thử**: **NGÔI NHÀ KHÔNG CÓ ĐÀN ÔNG** (`1fa5ca41-e7fd-49f0-93bf-aadd60bdcfa8`)
- **Suất diễn (Session ID)**: `170452ee-3193-4c23-b4e3-06c636128a24`
- **Tổng số ghế trống ban đầu**: **353 ghế** (4 hạng vé: Vé HSSV, Vé Đồng, Vé Bạc, Vé Vàng)
- **Các mốc tải đồng thời (CCU)**: **500, 1,000, 2,000, 5,000 người dùng truy cập cùng lúc**

---

## 1. Tổng Quan Throughput & Độ Trễ Toàn Luồng Đặt Vé (End-to-End Client Flow)

| Mốc Tải (CCU) | Tổng Requests | Thời Gian Xử Lý (s) | Throughput (req/s) | E2E Avg (ms) | E2E P50 (ms) | E2E P95 (ms) | E2E P99 (ms) | Vào Phòng Mua / Xếp Hàng | Giữ Ghế Thành Công | Chặn Tranh Chấp (400/409) | Chống Bán Lố (Zero-Oversell) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **500 Users** | 2,117 | 54.81s | **38.62 req/s** | 23,055.04 | 19,966.88 | 40,590.31 | 52,582.59 | 100 / 400 | 51 | 2 | ✅ PASS (`51/353` ghế) |
| **1,000 Users** | 5,012 | 86.94s | **57.65 req/s** | 31,461.92 | 35,450.68 | 42,745.28 | 48,979.69 | 100 / 900 | 104 | 93 | ✅ PASS (`113/353` ghế) |
| **2,000 Users** | 8,101 | 102.34s | **79.16 req/s** | 24,714.41 | 23,764.10 | 41,776.14 | 42,149.40 | 100 / 1,900 | 2 | 0 | ✅ PASS (`2/353` ghế) |
| **5,000 Users** | 20,112 | 215.76s | **93.22 req/s** | 21,146.70 | 18,566.84 | 40,449.51 | 47,515.61 | 100 / 4,900 | 32 | 1 | ✅ PASS (`38/353` ghế) |

---

## 2. Chi Tiết Độ Trễ P50 / P95 Theo Từng Bước Trên Client (ms)

| Mốc Tải (CCU) | B1: Tải Chi Tiết Sự Kiện (P50 / P95) | B2: Phòng Chờ Ảo Queue Join (P50 / P95) | B3: Tải Sơ Đồ Ghế 353 Ghế (P50 / P95) | B4: Check Tình Trạng Vé (P50 / P95) | B5: Khoá Giữ Ghế Atomic Hold (P50 / P95) | B6: Tạo Đơn Checkout (P50 / P95) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **500 Users** | 2,352.1 / 4,991.7 ms | 3,664.1 / 6,001.6 ms | 7,719.4 / 9,816.5 ms | 7,933.7 / 7,992.7 ms | 6,741.9 / 19,869.5 ms | 20,758.8 / 24,249.8 ms |
| **1,000 Users** | 1,911.6 / 7,934.8 ms | 1,903.3 / 7,415.2 ms | 6,241.0 / 21,578.1 ms | 6,934.5 / 11,574.3 ms | 8,353.1 / 17,609.2 ms | 12,410.5 / 18,920.4 ms |
| **2,000 Users** | 2,977.1 / 13,545.9 ms | 4,850.6 / 15,387.4 ms | 4,740.8 / 10,238.6 ms | 6,207.3 / 6,323.0 ms | 11,495.8 / 11,698.6 ms | 5,752.1 / 5,752.1 ms |
| **5,000 Users** | 2,499.0 / 13,366.4 ms | 2,783.5 / 16,967.0 ms | 6,165.5 / 15,460.7 ms | 4,078.5 / 4,226.2 ms | 7,867.0 / 25,004.8 ms | 25,002.6 / 25,013.5 ms |

---

## 3. Hiệu Năng Trình Duyệt Client Thực Tế (Real Chrome Web Vitals & UI Under Load)

> Đo bằng **Puppeteer + Chrome DevTools Protocol (CDP)** ngay trong lúc hệ thống đang chịu tải đồng thời 500, 1,000, 2,000 và 5,000 người dùng truy cập trang `/events/:id` và `/booking/seats?eventId=:id`.

| Mốc Tải (CCU) | TTFB (ms) | FCP (ms) | LCP (ms) | TBT (ms) | CLS | Tốc Độ Khung Hình (FPS) | Độ Trễ Click Chọn Ghế INP (ms) | DOM Nodes | Bộ Nhớ JS Heap (MB) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **500 Users** | 7 ms | 1,020 ms | 1,716 ms | 447 ms | 0.3423 | **82 FPS** | 29.30 ms (max 46.8 ms) | 3,239 | 55.32 MB |
| **1,000 Users** | 4 ms | 1,092 ms | 1,336 ms | 92 ms | 0.3149 | **83 FPS** | 14.42 ms (max 21.9 ms) | 3,122 | 47.93 MB |
| **2,000 Users** | 8 ms | 1,288 ms | 1,564 ms | 336 ms | 0.3145 | **78 FPS** | 29.04 ms (max 58.1 ms) | 3,122 | 48.27 MB |
| **5,000 Users** | 8 ms | 872 ms | 1,476 ms | 310 ms | 0.3423 | **94 FPS** | 10.90 ms (max 20.3 ms) | 3,245 | 48.99 MB |

---

## 4. Hướng Dẫn Sử Dụng Bộ Script Kiểm Thử

Tại thư mục `test-automation/`:

### Cách 1: Chạy bằng Node.js + Puppeteer CDP (Hybrid Client UI + Concurrent Load)
```bash
cd test-automation

# 1. Chuẩn bị dữ liệu sự kiện & sinh 5,000 phiên JWT Client
npm run perf:setup

# 2. Chạy toàn bộ 4 mốc (500 -> 1000 -> 2000 -> 5000 người dùng)
npm run perf:booking:all

# Hoặc chạy riêng từng mốc tải:
npm run perf:booking:500
npm run perf:booking:1000
npm run perf:booking:2000
npm run perf:booking:5000

# 3. Dọn dẹp các ghế giữ tạm (HELD) & đơn PENDING sau khi test
npm run perf:cleanup
```

### Cách 2: Chạy bằng Grafana k6 (`k6-booking-client-perf.js`)
```bash
cd test-automation

# Chạy kịch bản Stepped Ramping qua đủ 4 mốc (500 -> 1000 -> 2000 -> 5000 VUs)
npm run perf:k6:all

# Hoặc chạy Spike Test cho từng mốc cụ thể:
npm run perf:k6:500
npm run perf:k6:1000
npm run perf:k6:2000
npm run perf:k6:5000
```
