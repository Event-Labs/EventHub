# Kế Hoạch Triển Khai & Bàn Giao: Vé Miễn Phí & Đơn Hàng 0đ (EventHub)

Tài liệu này cung cấp toàn bộ hướng dẫn triển khai, cấu hình, kiểm thử sau phát hành và kế hoạch rollback cho tính năng **Vé miễn phí, Đơn hàng 0đ, Hủy vé 0đ và Vé mời nhân sự**.

---

## 1. Thứ Tự Triển Khai (Deployment Order)

Để đảm bảo không gián đoạn dịch vụ (Zero-Downtime) và tính toàn vẹn dữ liệu:

```
[Bước 1: Chạy Migration DB] 
           │
           ▼
[Bước 2: Deploy Backend] (Feature Flags mặc định = false)
           │
           ▼
[Bước 3: Deploy Frontend] (Giao diện nhận diện CONFIRMED và 0đ)
           │
           ▼
[Bước 4: Bật Feature Flags trên Staging -> Kiểm thử nghiệm thu]
           │
           ▼
[Bước 5: Bật Feature Flags trên Production]
```

---

## 2. Hướng Dẫn Chạy Migration & Script Dữ Liệu

### 2.1. Migration Cấu Trúc (Idempotent & An Toàn)
Migration runner đã được thiết kế hoàn toàn an toàn:
- Giá trị `CONFIRMED` được thêm vào `order_status_enum` độc lập ngoài transaction block (tránh lỗi Postgres `ALTER TYPE ... ADD VALUE cannot run inside a multi-statement transaction`).
- Các cột mới (`complimentary_reason`, `audit_trail`, `staff_user_id`, `ticket_source`, `original_price`, `discount_allocated`, `payable_price`) sử dụng `ADD COLUMN IF NOT EXISTS`.
- Check constraints không âm (`chk_orders_amounts_non_negative`, `chk_tickets_amounts_non_negative`) được thêm với cú pháp `NOT VALID` rồi chạy `VALIDATE CONSTRAINT` riêng biệt, không khóa bảng lâu.
- Unique index `uq_orders_user_idempotency` sử dụng `CREATE UNIQUE INDEX IF NOT EXISTS`.

**Lệnh chạy Migration UP:**
```bash
cd backend
node scripts/run-zero-amount-and-free-tickets-migration.js
```

**Lệnh Rollback Migration DOWN (nếu cần):**
```bash
# Thực thi file SQL down trực tiếp qua psql hoặc client Supabase
psql "$DATABASE_URL" -f backend/scripts/20261028_zero_amount_and_free_tickets_down.sql
```
*(Lưu ý: PostgreSQL không cho phép xóa giá trị enum đã tạo, nên giá trị enum `CONFIRMED` được giữ lại vô hại).*

### 2.2. Script Backfill Dữ Liệu Vé Cũ (Tùy Chọn)
File script: `backend/scripts/backfill_ticket_pricing_and_source.js`.
- Mặc định chạy chế độ `--dry-run` an toàn, chỉ in thống kê, không ghi DB.
- Khi chạy thật (`--execute`), script tự động tạo bảng sao lưu dữ liệu `tickets_pricing_backup_<timestamp>` trước khi cập nhật.
- Hỗ trợ cờ `--rollback` để phục hồi nguyên trạng nếu có bất kỳ sai lệch nào.

**Chạy kiểm tra (Dry-run):**
```bash
cd backend
node scripts/backfill_ticket_pricing_and_source.js --dry-run
```

**Chạy thực thi thật (chỉ chạy sau khi có xác nhận):**
```bash
cd backend
node scripts/backfill_ticket_pricing_and_source.js --execute
```

---

## 3. Cấu Hình Biến Môi Trường (Environment Variables & Feature Flags)

Hệ thống được bảo vệ bởi 2 Feature Flags trong `backend/src/config/features.js`:

| Tên biến môi trường | Giá trị mặc định | Giải thích nghiệp vụ |
|---|---|---|
| `ZERO_AMOUNT_CHECKOUT_ENABLED` | `false` | Bật/tắt luồng checkout đơn hàng 0đ (vé miễn phí hoặc giảm 100%). Khi tắt (`false`), luồng cũ giữ nguyên (gọi PayOS). |
| `STAFF_COMPLIMENTARY_BOOKING_ENABLED` | `false` | Bật/tắt API cấp vé mời nhân sự / ban tổ chức (`POST /api/orders/staff/complimentary`). Khi tắt (`false`), từ chối cấp vé mời với mã 403. |

### Cấu hình trong file `.env`
```env
# Feature flags cho vé miễn phí và đơn 0đ
ZERO_AMOUNT_CHECKOUT_ENABLED=true
STAFF_COMPLIMENTARY_BOOKING_ENABLED=true
```

---

## 4. Kế Hoạch Chuyển Giao: Staging -> Production

### Giai đoạn Staging
1. Chạy migration trên Database Staging.
2. Deploy backend và frontend lên môi trường Staging.
3. Thiết lập `.env` trên Staging:
   ```env
   ZERO_AMOUNT_CHECKOUT_ENABLED=true
   STAFF_COMPLIMENTARY_BOOKING_ENABLED=true
   ```
4. Thực hiện kiểm thử nghiệm thu kịch bản:
   - Đặt vé miễn phí (giá 0đ): Xác nhận đơn thành công ngay (`CONFIRMED`), không chuyển sang cổng PayOS, mã đơn và mã QR hiển thị đúng, nhận email vé.
   - Thử đặt vé miễn phí thứ 3 trên cùng tài khoản: Hệ thống báo lỗi vượt hạn mức (tối đa 2 vé/tài khoản).
   - Khách tự hủy vé 0đ trước giờ diễn ra > 2 giờ: Vé chuyển `CANCELLED`, ghế được giải phóng, đơn chuyển `CANCELLED`.
   - Cấp vé mời Staff: Cấp 1-20 vé kèm lý do >= 5 ký tự thành công; thử cấp > 20 vé hoặc lý do < 5 ký tự bị chặn.
   - Sự kiện hủy: Đơn 0đ được hủy tự động, không tạo `refund_requests`, hoàn lại voucher (nếu có).

### Giai đoạn Production
1. Chạy migration trên Database Production (an toàn không khóa bảng).
2. Deploy backend và frontend Production với cờ `false` (đảm bảo hệ thống vận hành ổn định với code mới).
3. Đổi biến môi trường sang `true` trên cấu hình container / app service.
4. Restart nhẹ backend service để nạp cờ mới.

---

## 5. Kế Hoạch Rollback (Phục Hồi Sự Cố)

Trong trường hợp phát sinh sự cố nghiêm trọng trên Production:

1. **Rollback Nhanh (Thời gian xử lý < 1 phút, không cần build lại code):**
   - Đặt lại biến môi trường:
     ```env
     ZERO_AMOUNT_CHECKOUT_ENABLED=false
     STAFF_COMPLIMENTARY_BOOKING_ENABLED=false
     ```
   - Khởi động lại backend app service.
   - Hệ thống lập tức quay về hành vi thanh toán cũ, toàn bộ các đơn hàng đã tạo trước đó ở trạng thái `CONFIRMED` vẫn hiển thị và check-in bình thường.

2. **Rollback Mã Nguồn (Code Revert):**
   - Tạo pull request revert các commit của branch `update/feat-payment-promo`.
   - Re-deploy backend và frontend.

3. **Rollback Dữ Liệu:**
   - Nếu có nhu cầu hạ migration, chạy script `backend/scripts/20261028_zero_amount_and_free_tickets_down.sql`.
   - Nếu đã chạy backfill vé cũ, chạy `node scripts/backfill_ticket_pricing_and_source.js --rollback`.

---

## 6. Truy Vấn Xác Minh Sau Phát Hành (Post-Release Verification Queries)

Các truy vấn chỉ đọc (read-only) dành cho đội ngũ vận hành và QA:

### 6.1. Kiểm tra đơn hàng 0đ mới tạo
```sql
SELECT
  o.id,
  o.order_code,
  o.status,
  o.payment_method,
  o.total_amount,
  o.idempotency_key,
  o.created_at,
  COUNT(t.id) AS ticket_count
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN tickets t ON t.order_item_id = oi.id
WHERE o.status = 'CONFIRMED'
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 10;
```

### 6.2. Kiểm tra tính toàn vẹn: Không có payment_orders rác cho đơn 0đ
```sql
SELECT
  o.id,
  o.order_code,
  o.status,
  po.id AS unexpected_payment_order_id
FROM orders o
JOIN payment_orders po ON po.order_id = o.id
WHERE o.status = 'CONFIRMED' AND o.total_amount = 0;
-- Kết quả mong đợi: 0 dòng.
```

### 6.3. Kiểm tra phân loại nguồn vé (ticket_source)
```sql
SELECT
  t.ticket_source,
  t.status,
  COUNT(*) AS quantity,
  MIN(t.payable_price) AS min_payable,
  MAX(t.payable_price) AS max_payable
FROM tickets t
GROUP BY t.ticket_source, t.status
ORDER BY t.ticket_source, t.status;
```

### 6.4. Kiểm tra vé mời nhân sự (Complimentary)
```sql
SELECT
  o.id,
  o.order_code,
  o.complimentary_reason,
  u.full_name AS staff_name,
  u.email AS staff_email,
  o.created_at,
  COUNT(t.id) AS tickets_issued
FROM orders o
JOIN users u ON u.id = o.staff_user_id
JOIN order_items oi ON oi.order_id = o.id
JOIN tickets t ON t.order_item_id = oi.id
WHERE o.complimentary_reason IS NOT NULL
GROUP BY o.id, u.full_name, u.email
ORDER BY o.created_at DESC
LIMIT 10;
```

### 6.5. Kiểm tra tính toàn vẹn của refund requests: Đảm bảo không tạo hoàn tiền cho đơn 0đ
```sql
SELECT
  rr.id,
  rr.order_id,
  rr.refund_amount,
  o.status AS order_status,
  o.total_amount
FROM refund_requests rr
JOIN orders o ON o.id = rr.order_id
WHERE o.status = 'CONFIRMED' OR o.total_amount = 0;
-- Kết quả mong đợi: 0 dòng.
```

---

## 7. Rủi Ro Kỹ Thuật & Khuyến Nghị Dành Cho Product Owner (PO)

1. **Chính sách hoàn lượt Voucher khi khách tự hủy vé 0đ:**
   - *Hiện tại:* Khách tự hủy vé của đơn 0đ thì voucher **không** được hoàn lượt dùng lại (Decision 2.6) để tránh gian lận lạm dụng mã giảm giá.
   - *Khuyến nghị:* Hiển thị rõ cảnh báo này trong modal xác nhận hủy vé của khách hàng (đã được bổ sung vào UI).
2. **Cấu hình `complimentary_quota` cho Ban tổ chức:**
   - *Hiện tại:* Hạn mức vé mời được đọc linh hoạt từ `events.seating_rules.complimentary_quota`. Nếu không khai báo, hệ thống mặc định cho phép cấp theo dung lượng còn trống của hạng vé.
   - *Khuyến nghị:* Trong tương lai, xem xét bổ sung thêm ô nhập liệu "Hạn mức vé mời" trên giao diện Tạo / Sửa sự kiện của Organizer.
3. **Vé mời Staff không tính vào hạn mức mua vé của khách:**
   - *Hiện tại:* Đơn cấp vé mời có `ticket_source = 'COMPLIMENTARY'` nên không bị ràng buộc bởi hạn mức 2 vé miễn phí của tài khoản khách hàng. Điều này giúp nhân sự linh hoạt cấp vé VIP/khách mời theo đúng chủ trương của Ban tổ chức.
