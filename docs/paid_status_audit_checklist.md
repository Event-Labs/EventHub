# Bảng Kiểm Kê & Quyết Định Xử Lý 'PAID' (93 Vị Trí)

Tài liệu này ghi nhận toàn bộ 93 vị trí xuất hiện trạng thái `'PAID'` trong mã nguồn `backend/src/`, phân loại theo 2 nhóm quyết định:
1. **CHANGE -> COMPLETED_ORDER_STATUSES (`['PAID', 'CONFIRMED']`):** Áp dụng cho các nghiệp vụ xác định quyền sở hữu vé hợp lệ, tồn kho, chỗ ngồi, check-in, gửi email vé, và đếm số lượng vé/voucher.
2. **KEEP PAID (`FINANCIAL_PAID_STATUSES`):** Giữ nguyên cho các nghiệp vụ tài chính, đối soát, doanh thu, thanh toán PayOS, hoàn tiền và gói dịch vụ ban tổ chức.

---

## 1. Chi tiết theo từng Module

### Module: `src/modules/tickets/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `tickets.repository.js` | 138 | `AND o.status IN ('PAID', 'REFUND_REQUESTED', 'REFUNDED')` | **CHANGE** -> Thêm `'CONFIRMED'` | Màn hình "Vé của tôi": Hiển thị cả vé từ đơn 0đ/miễn phí. |
| `tickets.repository.js` | 233 | `AND po.status = 'PAID'` | **KEEP** | Thông tin giao dịch thanh toán (LEFT JOIN LATERAL, đơn 0đ không có po thì trả về NULL). |
| `tickets.repository.js` | 239 | `AND o.status IN ('PAID', 'REFUND_REQUESTED', 'REFUNDED')` | **CHANGE** -> Thêm `'CONFIRMED'` | Chi tiết vé: Người dùng xem vé miễn phí hợp lệ. |
| `tickets.repository.js` | 291 | `AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Nhân viên soát vé tìm kiếm vé của khách để check-in. |
| `tickets.repository.js` | 433 | `if (lockedTicket.order_status !== 'PAID')` | **CHANGE** -> `!COMPLETED_ORDER_STATUSES.includes(...)` | Cho phép quét QR và check-in vé miễn phí (đơn CONFIRMED). |

### Module: `src/modules/promotions/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `promotions.repository.js` | 33 | `... WHERE o.promo_code_id = pc.id AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Đếm lượt dùng voucher: Đơn giảm 100% (CONFIRMED) vẫn phải tính vào `usage_count`. |

### Module: `src/modules/notifications/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `notifications.repository.js` | 190 | `WHERE t.event_id = $1 AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Danh sách nhận thông báo cập nhật sự kiện: Gửi cho cả người nhận vé 0đ. |
| `notifications.repository.js` | 221 | `WHERE o.status = 'PAID' AND t.status = 'VALID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Danh sách nhắc lịch sự kiện sắp diễn ra. |

### Module: `src/modules/events/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `events.repository.js` | 310 | `COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Tính tồn kho vé bán ra (`sold_quantity`): Vé 0đ phải trừ tồn kho. |
| `events.repository.js` | 407 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Trạng thái ghế trên sơ đồ: Đơn 0đ đã giữ ghế thì ghế là `SOLD`. |
| `events.repository.js` | 537 | `COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Tồn kho vé không có số ghế (`unseated_usage`). |
| `events.repository.js` | 561 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Trạng thái ghế chi tiết (`selected_seats`). |
| `events.repository.js` | 659 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Trạng thái ghế khi lock ghế. |
| `events.repository.js` | 726 | `WHERE es.event_id = $1 AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Đếm số vé đã mua của khách để kiểm soát hạn mức mua vé của sự kiện. |
| `events.repository.js` | 866 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Kiểm tra ghế đã bán chưa (`has_paid_ticket`). |
| `eventBusinessRules.service.js` | 55 | `COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PAID')` | **KEEP** | Báo cáo tài chính `paid_orders_count`. |
| `eventBusinessRules.service.js` | 57 | `SUM(o.total_amount) FILTER (WHERE o.status = 'PAID')` | **KEEP** | Doanh thu tài chính `total_paid_amount`. |
| `eventBusinessRules.service.js` | 807 | `LEFT JOIN payment_orders po ... AND po.status = 'PAID'` | **KEEP** | Tạo hoàn tiền: Chỉ tạo refund request cho đơn có thu tiền. |
| `eventBusinessRules.service.js` | 808 | `WHERE es.event_id = $1 AND o.status = 'PAID'` | **KEEP** | Tạo hoàn tiền khi hủy sự kiện cho đơn có thu tiền. |
| `eventBusinessRules.service.js` | 1188 | `LEFT JOIN payment_orders po ... AND po.status = 'PAID'` | **KEEP** | Tương tự khi đổi lịch sự kiện. |
| `eventBusinessRules.service.js` | 1189 | `WHERE es.event_id = $1 AND o.status = 'PAID'` | **KEEP** | Tương tự khi đổi lịch sự kiện. |

### Module: `src/modules/orders/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `orders.repository.js` | 420 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Ghế đã bán trong transaction checkout. |
| `orders.repository.js` | 456 | `AND o_sold.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Trạng thái ghế khi check eligibility checkout. |
| `orders.repository.js` | 579 | `SUM(oi.quantity) FILTER (WHERE o.status = 'PAID')` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Kiểm tra tồn kho trước khi đặt vé (`sold_quantity`). |
| `orders.repository.js` | 705 | `SUM(oi.quantity) FILTER (WHERE o.status = 'PAID')` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Kiểm tra số lượng vé còn lại của hạng vé. |
| `orders.repository.js` | 963 | `INSERT INTO orders ... 'PAID' ...` | **KEEP** | Đơn đặt trực tiếp tiền mặt của Staff (`staff_direct`). |
| `orders.repository.js` | 1016 | `SUM(oi.quantity) FILTER (WHERE o.status = 'PAID')` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Tồn kho khi Staff đặt vé tại quầy. |
| `orders.repository.js` | 1117 | `INSERT INTO payment_orders ... 'PAID' ...` | **KEEP** | Ghi nhận thanh toán tiền mặt thành công. |
| `orders.repository.js` | 1490 | `status = 'PAID'` | **KEEP** | Staff xác nhận đã thu tiền mặt đơn offline. |
| `orders.repository.js` | 1510 | `SET status = 'PAID'` | **KEEP** | Chuyển đơn staff direct sang PAID sau khi nhận tiền. |
| `orders.repository.js` | 1761 | `if (paymentOrder.status === 'PAID')` | **KEEP** | Kiểm tra trạng thái đơn PayOS. |
| `orders.repository.js` | 1816 | `SET status = 'PAID'` | **KEEP** | Webhook PayOS đánh dấu đơn đã thanh toán. |
| `orders.repository.js` | 1839 | `SET status = 'PAID'` | **KEEP** | Cập nhật đơn hàng thành công qua cổng thanh toán. |
| `orders.repository.js` | 1891 | `status_reason: 'PAID_AFTER_EVENT_CANCELLED'` | **KEEP** | Log trạng thái thanh toán muộn từ PayOS. |
| `orders.repository.js` | 1939 | `SET status = 'PAID'` | **KEEP** | Xác nhận thanh toán từ PayOS. |
| `orders.repository.js` | 1961 | `SET status = 'PAID'` | **KEEP** | Cập nhật đơn hàng thanh toán thành công. |
| `orders.repository.js` | 2099-2100 | `JOIN payment_orders po ... WHERE o.status = 'PAID'` | **CHANGE** -> `LEFT JOIN payment_orders ... WHERE o.status IN ('PAID', 'CONFIRMED')` | Gửi email xác nhận vé: Đơn 0đ không có payment_orders vẫn lấy được thông tin gửi email. |

### Module: `src/modules/admin/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `analytics.repository.js` | 50 | `COUNT(*) FILTER (WHERE status = 'PAID')` | **KEEP** | Thống kê số đơn trả phí. |
| `analytics.repository.js` | 53 | `SUM(total_amount) FILTER (WHERE status = 'PAID')` | **KEEP** | Doanh thu gộp (`gross_revenue`). |
| `analytics.repository.js` | 55 | `SUM(total_amount) FILTER (WHERE status = 'PAID')` | **KEEP** | Doanh thu thuần (`net_revenue`). |
| `analytics.repository.js` | 63 | `const conditions = ["status = 'PAID'"]` | **KEEP** | Lọc đơn có phát sinh dòng tiền. |
| `analytics.repository.js` | 118 | `WHERE status = 'PAID'` | **KEEP** | Báo cáo doanh thu theo thời gian. |
| `analytics.repository.js` | 183 | `LEFT JOIN orders ord ... AND ord.status = 'PAID'` | **KEEP** | Báo cáo doanh thu Organizer. |
| `events.list.repository.js` | 150 | `WHERE oi.ticket_type_id = tt.id AND ord.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Admin Event List: Hiển thị đúng số lượng vé đã phát hành/bán ra (`sold_quantity`). |
| `organizers.repository.js` | 78, 178, 254 | `COUNT(*) FILTER (WHERE status = 'PAID')` | **KEEP** | Số đơn hàng phát sinh doanh thu. |
| `organizers.repository.js` | 79, 179, 255 | `SUM(total_amount) FILTER (WHERE status = 'PAID')` | **KEEP** | Tổng doanh thu của Organizer. |
| `organizers.repository.js` | 80, 180 | `SUM(discount_amount) FILTER (WHERE status = 'PAID')` | **KEEP** | Tổng tiền chiết khấu tài chính. |
| `users.repository.js` | 114 | `SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Số vé/đơn người dùng đã nhận (`tickets_bought`). |
| `users.repository.js` | 115 | `SELECT SUM(total_amount) FROM orders WHERE user_id = u.id AND status = 'PAID'` | **KEEP** | Tổng số tiền người dùng đã chi tiêu (`total_spent`). |

### Module: `src/modules/organizer/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `organizerEvents.repository.js` | 259 | `WHERE es.event_id = e.id AND o.status IN ('PAID', ...)` | **CHANGE** -> Thêm `'CONFIRMED'` | Đếm số đơn đã đặt thành công của sự kiện. |
| `organizerEvents.repository.js` | 502 | `WHERE es.event_id = $1 AND o.status = 'PAID'` | **KEEP** | `countPaidOrders` dùng để chặn hủy sự kiện khi đã có đơn thu tiền thật. |
| `organizerEvents.repository.js` | 519, 525 | `WHERE es.event_id = e.id AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Ngăn chặn Organizer giảm số lượng vé thấp hơn số lượng đã phát hành (kể cả vé 0đ). |
| `organizerEvents.repository.js` | 858, 860 | `paid_orders_count`, `total_paid_amount` | **KEEP** | Báo cáo doanh thu sự kiện. |
| `organizerOrders.repository.js` | 278, 293 | `WHERE ... AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Danh sách người tham gia (`findAttendeeTickets`): Phải hiển thị cả khách nhận vé miễn phí. |
| `organizerOrders.repository.js` | 384 | `WHERE ... AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Xuất danh sách người tham gia (`exportAttendees` CSV/Excel). |
| `organizerOrders.repository.js` | 420, 444, 469, 498 | `WHERE ... AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Thống kê Check-in (Tổng quan, theo phiên, theo hạng vé, check-in gần đây). |
| `organizerOrders.repository.js` | 539, 561, 581, 677, 712, 877 | `o.status = 'PAID'` | **KEEP** | Báo cáo tài chính, biểu đồ doanh thu theo ngày (`getRevenueStats`). |
| `organizerOrders.repository.js` | 778 | `WHERE oi.id = t.order_item_id AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Đếm số vé hợp lệ đã check-in. |
| `organizerOrders.repository.js` | 806 | `AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Đếm `tickets_sold` trong sự kiện sắp tới. |
| `organizerOrders.repository.js` | 958, 1028, 1073, 1110 | `AND o.status = 'PAID'` | **CHANGE** -> `IN ('PAID', 'CONFIRMED')` | Phân tích sản lượng vé bán ra (`getTicketSalesAnalytics`, `occupancy_rate`, `sales_trend`). |
| `organizerOrders.validation.js` | 9 | `enum(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'])` | **CHANGE** -> Thêm `'CONFIRMED'` | Cho phép lọc đơn hàng theo trạng thái `CONFIRMED`. |

### Module: `src/modules/organizer-subscriptions/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `organizerSubscriptions.payment.repository.js` | 110 | `SET status = 'PAID'` | **KEEP** | Thanh toán gói thuê bao của Organizer. |
| `organizerSubscriptions.service.js` | 150, 152, 170, 220, 222, 235 | `status === 'PAID'` | **KEEP** | Xử lý gói dịch vụ trả phí của Organizer. |

### Module: `src/modules/payments/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `payments.service.js` | 14 | `const paidStatuses = new Set(['PAID', ...])` | **KEEP** | Trạng thái phản hồi từ cổng PayOS. |

### Module: `src/modules/refunds/`
| File | Dòng | Đoạn mã gốc | Quyết định | Giải thích nghiệp vụ |
|---|---|---|---|---|
| `refundRuleEngine.js` | 78, 79 | `validPaidStatuses = ['PAID', 'REFUND_REQUESTED']` | **KEEP** + Thêm chặn 0đ | Chặn đơn 0đ/CONFIRMED không được vào luồng hoàn tiền. |
| `refunds.repository.js` | 234 | `po.status = 'PAID'` | **KEEP** | Ưu tiên giao dịch PayOS thực thu để hoàn tiền. |
| `refunds.service.js` | 287 | `UPDATE orders SET status = 'PAID'` | **CHANGE** -> Khôi phục `CONFIRMED` nếu `order_total_amount == 0` | Không biến đơn 0đ thành PAID khi từ chối hoàn. |

---

## 2. Thống kê tổng hợp
- **Tổng số vị trí kiểm kê:** 93
- **Số vị trí chuyển sang `COMPLETED_ORDER_STATUSES` (hoặc xử lý `CONFIRMED`):** 33
- **Số vị trí giữ nguyên `PAID` (nghiệp vụ tài chính / PayOS / Subscription):** 60
- **Số vị trí chưa xử lý:** 0
