/**
 * Service to build rich, professional refund confirmation emails
 * matching EventHub's visual and branding standards.
 */

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function formatRefundAmount(amount) {
  const num = Number(amount || 0);
  return `${num.toLocaleString('vi-VN')} VND`;
}

function formatRefundDate(value) {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function resolveRefundMethod(method, bankName) {
  if (method === 'PAYOS') {
    return 'Phương thức thanh toán ban đầu';
  }
  if (method === 'MANUAL_BANK_TRANSFER') {
    return bankName ? `Chuyển khoản ngân hàng (${bankName})` : 'Chuyển khoản ngân hàng';
  }
  if (bankName) {
    return `Chuyển khoản ngân hàng (${bankName})`;
  }
  return 'Phương thức thanh toán ban đầu';
}

function resolveRequestCode(refund) {
  if (!refund) return 'EH-RF-00000000';
  const rawId = String(refund.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `EH-RF-${rawId || '00000000'}`;
}

/**
 * Builds email subject, text, and responsive HTML for a successful refund notification.
 *
 * @param {Object} refund - Original refund_requests entity with joins (from refundsRepository.findByIdForUpdate)
 * @param {Object} updated - Updated row data from refundsRepository.updateStatus
 * @param {Object} [options] - Optional overrides
 * @returns {{ subject: string, text: string, html: string, requestCode: string }}
 */
function buildRefundConfirmationEmail(refund = {}, updated = {}, options = {}) {
  const customerName = options.customerName || refund.customer_name || 'Quý khách';
  const requestCode = options.requestCode || resolveRequestCode(refund);
  const ticketCode = refund.ticket_code || (refund.order_code ? `Đơn hàng ${refund.order_code}` : 'N/A');
  const eventTitle = refund.event_title || 'Sự kiện EventHub';
  const refundAmount = formatRefundAmount(updated.refund_amount !== undefined ? updated.refund_amount : refund.refund_amount);
  const refundDate = formatRefundDate(updated.refunded_at || refund.refunded_at);
  const refundMethod = resolveRefundMethod(options.refundMethod || updated.refund_method || refund.refund_method, refund.bank_name);

  const subject = `[EventHub] Hoàn tiền thành công – Mã yêu cầu ${requestCode}`;

  // Plain-text alternative
  const text = `[EventHub] Hoàn tiền thành công – Mã yêu cầu ${requestCode}

Xin chào ${customerName},

EventHub xác nhận yêu cầu hoàn tiền của bạn đã hoàn tất. Thông tin giao dịch được ghi nhận như sau:

- Số tiền hoàn lại: ${refundAmount}
- Mã yêu cầu hoàn tiền: ${requestCode}
- Mã vé: ${ticketCode}
- Sự kiện: ${eventTitle}
- Ngày hoàn tiền: ${refundDate}
- Phương thức hoàn tiền: ${refundMethod}
- Trạng thái hoàn tiền: Thành công
- Trạng thái vé sau hoàn tiền: Đã vô hiệu hóa

Bạn cần lưu ý:
• Số tiền hoàn sẽ được chuyển về phương thức thanh toán theo quy trình của hệ thống.
• Thời gian tiền thực tế xuất hiện trong tài khoản có thể phụ thuộc vào ngân hàng hoặc đơn vị thanh toán.
• Vé đã được hoàn tiền có thể bị vô hiệu hóa và không còn được sử dụng để tham dự sự kiện, theo chính sách hoàn tiền của EventHub.

Nếu bạn cần hỗ trợ về giao dịch này, vui lòng liên hệ đội ngũ hỗ trợ EventHub và cung cấp mã yêu cầu hoàn tiền để được kiểm tra nhanh chóng.

Cảm ơn bạn đã sử dụng EventHub!

Trân trọng,
Đội ngũ EventHub

---
Email tự động từ hệ thống EventHub. Vui lòng không trả lời email này nếu hộp thư không hỗ trợ tiếp nhận phản hồi.`;

  // Visual HTML Template matching mock
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -2px rgba(0,0,0,0.05);margin:0 auto;">
          <!-- Header / Status Banner -->
          <tr>
            <td style="padding:36px 32px 24px;text-align:center;">
              <!-- Green checkmark circle icon -->
              <div style="display:inline-block;width:60px;height:60px;line-height:60px;border-radius:50%;background-color:#dcfce7;text-align:center;margin-bottom:14px;vertical-align:middle;">
                <span style="display:inline-block;font-size:30px;line-height:60px;color:#16a34a;font-weight:bold;">&#10003;</span>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#16a34a;line-height:1.3;">Hoàn tiền thành công!</h1>
              <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">Yêu cầu hoàn tiền của bạn đã được xử lý thành công trên hệ thống EventHub.</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 10px;font-size:15px;color:#1e293b;line-height:1.5;">Xin chào <strong>${escapeHtml(customerName)}</strong>,</p>
              <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">EventHub xác nhận yêu cầu hoàn tiền của bạn đã hoàn tất. Thông tin giao dịch được ghi nhận như sau:</p>

              <!-- Transaction Summary Box -->
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
                <!-- Refund Amount Highlight -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:14px;">
                  <tr>
                    <td style="font-size:14px;color:#64748b;vertical-align:middle;">Số tiền hoàn lại</td>
                    <td align="right" style="font-size:22px;font-weight:700;color:#16a34a;vertical-align:middle;">${escapeHtml(refundAmount)}</td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#e2e8f0;margin:12px 0 14px;"></div>

                <!-- Transaction Key-Value Pairs -->
                <table width="100%" border="0" cellpadding="6" cellspacing="0" role="presentation" style="font-size:13px;">
                  <tr>
                    <td style="color:#64748b;padding:6px 0;width:42%;">Mã yêu cầu hoàn tiền</td>
                    <td align="right" style="color:#0f172a;font-weight:600;font-family:Consolas,monaco,monospace;padding:6px 0;">${escapeHtml(requestCode)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Mã vé</td>
                    <td align="right" style="color:#0f172a;font-weight:600;font-family:Consolas,monaco,monospace;padding:6px 0;">${escapeHtml(ticketCode)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Sự kiện</td>
                    <td align="right" style="color:#0f172a;font-weight:600;padding:6px 0;max-width:260px;">${escapeHtml(eventTitle)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Ngày hoàn tiền</td>
                    <td align="right" style="color:#0f172a;font-weight:600;padding:6px 0;">${escapeHtml(refundDate)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Phương thức hoàn tiền</td>
                    <td align="right" style="color:#0f172a;font-weight:600;padding:6px 0;">${escapeHtml(refundMethod)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Trạng thái vé sau hoàn</td>
                    <td align="right" style="padding:6px 0;">
                      <span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:#fee2e2;color:#b91c1c;font-size:12px;font-weight:600;">Đã vô hiệu hóa</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:6px 0;">Trạng thái</td>
                    <td align="right" style="padding:6px 0;">
                      <span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:#dcfce7;color:#15803d;font-size:12px;font-weight:700;">Thành công</span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Important Notes -->
              <div style="margin-bottom:20px;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e293b;">Bạn cần lưu ý</p>
                <ul style="margin:0;padding-left:20px;font-size:13px;color:#475569;line-height:1.65;">
                  <li style="margin-bottom:4px;">Số tiền hoàn sẽ được chuyển về phương thức thanh toán theo quy trình của hệ thống.</li>
                  <li style="margin-bottom:4px;">Thời gian tiền thực tế xuất hiện trong tài khoản có thể phụ thuộc vào ngân hàng hoặc đơn vị thanh toán.</li>
                  <li style="margin-bottom:4px;">Vé đã được hoàn tiền có thể bị vô hiệu hóa và không còn được sử dụng để tham dự sự kiện, theo chính sách hoàn tiền của EventHub.</li>
                </ul>
              </div>

              <!-- Support Section -->
              <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.6;">Nếu bạn cần hỗ trợ về giao dịch này, vui lòng liên hệ đội ngũ hỗ trợ EventHub và cung cấp mã yêu cầu hoàn tiền để được kiểm tra nhanh chóng.</p>
              <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.6;">Cảm ơn bạn đã sử dụng EventHub!</p>
              <p style="margin:0 0 2px;font-size:13px;color:#475569;">Trân trọng,</p>
              <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a;">Đội ngũ EventHub</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Email tự động từ hệ thống EventHub. Vui lòng không trả lời email này nếu hộp thư không hỗ trợ tiếp nhận phản hồi.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    requestCode,
  };
}

module.exports = {
  buildRefundConfirmationEmail,
  formatRefundAmount,
  formatRefundDate,
  resolveRefundMethod,
  resolveRequestCode,
};
