const emailService = require('../../infrastructure/email/email.service');
const logger = require('../../core/logger');
const env = require('../../config/env');

const MAX_TICKETS_PER_EMAIL = 6;

const EMAIL_ICONS = {
  logo: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597424/eventhub/brand/eventhub_logo.png',
  check: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597626/eventhub/icons/icon_check.png',
  clipboard: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597632/eventhub/icons/icon_clipboard.png',
  ticket: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597628/eventhub/icons/icon_ticket.png',
  calendar: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597621/eventhub/icons/icon_calendar.png',
  clock: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597622/eventhub/icons/icon_clock.png',
  mapPin: 'https://res.cloudinary.com/dookztwec/image/upload/v1793597624/eventhub/icons/icon_map_pin.png',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const money = (value) => {
  const num = Number(value || 0);
  if (num === 0) return '0 ₫ (Miễn phí)';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

const maskEmail = (value) => {
  const [name = '', domain = ''] = String(value || '').split('@');
  return domain ? `${name.slice(0, 2)}***@${domain}` : 'missing';
};

function formatPaymentTime(value) {
  if (!value) return 'N/A';
  try {
    const d = new Date(value);
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `lúc ${timeStr} ${capitalizedWeekday}, ${day} tháng ${month}, ${year}`;
  } catch {
    return 'N/A';
  }
}

function formatTicketDateTime(startTime, endTime) {
  if (!startTime) return 'N/A';
  try {
    const d = new Date(startTime);
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    let result = `${day}/${month}/${year} – ${hours}:${minutes}`;
    if (endTime) {
      const end = new Date(endTime);
      result += ` - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
    }
    return result;
  } catch {
    return 'N/A';
  }
}

function formatCategory(category) {
  if (!category) return 'HỘI THẢO (WORKSHOP)';
  const raw = String(category).trim().toUpperCase();
  const map = {
    'WORKSHOP': 'HỘI THẢO (WORKSHOP)',
    'CONCERT': 'HÒA NHẠC (CONCERT)',
    'CONFERENCE': 'HỘI NGHỊ (CONFERENCE)',
    'EXHIBITION': 'TRIỂN LÃM (EXHIBITION)',
    'NETWORKING': 'GIAO LƯU (NETWORKING)',
    'SEMINAR': 'CHUYÊN ĐỀ (SEMINAR)',
    'FESTIVAL': 'LỄ HỘI (FESTIVAL)',
    'TALKSHOW': 'TALKSHOW',
    'EVENT': 'SỰ KIỆN (EVENT)',
  };
  if (map[raw]) return map[raw];
  if (raw.includes('(') && raw.includes(')')) return raw;
  return `${raw} (EVENT)`;
}

function formatSeatLabel(seat) {
  if (!seat) return 'VÉ TỰ DO (GENERAL ADMISSION)';
  const label = (typeof seat === 'object' ? seat.label : seat) || '';
  const trimmed = String(label).trim().toUpperCase();
  if (!trimmed || trimmed === 'GENERAL ADMISSION' || trimmed === 'NO FIXED SEAT' || trimmed === 'KHÔNG CÓ GHẾ CỐ ĐỊNH') {
    return 'VÉ TỰ DO (GENERAL ADMISSION)';
  }
  return trimmed;
}

function qrUrl(ticket) {
  const payload = JSON.stringify({
    type: 'EVENTHUB_TICKET',
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    qr_code: ticket.qr_code || ticket.ticket_code,
    event_id: ticket.event_id,
    session_id: ticket.event_session_id,
  });
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=${encodeURIComponent(payload)}`;
}

function logoUrl() {
  if (process.env.EVENTHUB_LOGO_URL) return process.env.EVENTHUB_LOGO_URL;
  if (env.CLIENT_URL && !env.CLIENT_URL.includes('localhost') && !env.CLIENT_URL.includes('127.0.0.1')) {
    return `${String(env.CLIENT_URL).replace(/\/$/, '')}/images/LogoEH.png`;
  }
  return EMAIL_ICONS.logo;
}

function renderEmailStatusBadge(status, checkedInAt) {
  const rawStatus = String(status || 'VALID').toUpperCase();
  if (rawStatus === 'USED' || checkedInAt) {
    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; background-color: #F1F5F9; border: 1.2px solid #CBD5E1; border-radius: 999px; padding: 5px 16px;">
      <tr>
        <td style="vertical-align: middle; padding-right: 6px; color: #334155; font-size: 11px; font-weight: 900; line-height: 1;">
          &#10003;&#10003;
        </td>
        <td style="vertical-align: middle; color: #334155; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
          &#272;&#195; CHECK-IN
        </td>
      </tr>
    </table>
    `;
  }
  if (['CANCELLED', 'REFUNDED'].includes(rawStatus)) {
    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; background-color: #FEE2E2; border: 1.2px solid #FCA5A5; border-radius: 999px; padding: 5px 16px;">
      <tr>
        <td style="vertical-align: middle; padding-right: 6px; color: #DC2626; font-size: 13px; font-weight: 900; line-height: 1;">
          &#8856;
        </td>
        <td style="vertical-align: middle; color: #DC2626; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
          V&#201; &#272;&#195; H&#7910;Y
        </td>
      </tr>
    </table>
    `;
  }
  // Default: VALID (Dấu tích xanh kết hợp nhãn trạng thái VÉ HỢP LỆ)
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; background-color: #DCFCE7; border: 1.2px solid #86EFAC; border-radius: 999px; padding: 5px 16px;">
    <tr>
      <td style="vertical-align: middle; padding-right: 6px;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" valign="middle" style="width: 16px; height: 16px; border: 1.5px solid #16A34A; border-radius: 50%; color: #16A34A; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 10px; font-weight: 900; line-height: 16px; text-align: center;">
              &#10003;
            </td>
          </tr>
        </table>
      </td>
      <td style="vertical-align: middle; color: #15803D; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
        V&#201; H&#7906;P L&#7878;
      </td>
    </tr>
  </table>
  `;
}

/**
 * Universal E-Ticket Card designed for Email clients (Vertical Ticket Layout)
 * Hierarchy:
 * - Event Name: Cấp 1 – nổi bật nhất.
 * - Date & Time: Cấp 3 – một hàng riêng, font body.
 * - Ticket Type và Attendee Name: Cấp 2 – cùng độ ưu tiên, cùng kích thước.
 * - Seat Information: Cấp 2 – cùng nhóm thông tin vé.
 * - Venue: Cấp 2 – tên địa điểm nổi bật, địa chỉ nhỏ hơn.
 * - Ticket Status: Dấu tích xanh kết hợp nhãn trạng thái (Hình 1).
 * - QR Code: Thành phần trung tâm của khu vực check-in.
 */
function ticketCard(ticket, order) {
  const addressParts = [ticket.address_line, ticket.ward, ticket.district, ticket.city].filter(Boolean);
  const venueAddress = addressParts.join(', ') || 'Địa điểm tổ chức sự kiện';
  const venueName = ticket.venue_name || 'N/A';
  const holderName = ticket.attendee_name || order.buyer_name || 'Khách tham dự';
  const ticketTypeName = (ticket.ticket_type_name || 'TIÊU CHUẨN').toUpperCase();
  const seatLabel = formatSeatLabel(ticket.seat_label);
  const dateTimeStr = formatTicketDateTime(ticket.session_start_time, ticket.session_end_time);
  const ticketCode = ticket.ticket_code || 'EH-0000000000';
  const formattedTicketCode = ticketCode.startsWith('#') ? ticketCode : `#${ticketCode}`;

  return `
  <div style="margin: 22px 0; background-color: #081525; border: 2px solid #C99A47; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 32px rgba(8, 21, 37, 0.45);">
    <!-- Inner Gold Border Frame -->
    <div style="margin: 5px; border: 1px solid rgba(230, 193, 122, 0.45); border-radius: 14px; background-color: #0D1B2A; overflow: hidden;">
      
      <!-- ─── TOP SECTION: Ticket & Event Details ─── -->
      <div style="padding: 22px 20px 18px; background-color: #0D1B2A; color: #FFFFFF;">
        <!-- Top Header: Real System Logo + Brand Tagline + E-Ticket Dynamic Badge (Never wraps) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
          <tr>
            <td style="vertical-align: middle; white-space: nowrap;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; white-space: nowrap; line-height: 1;">
                    <img src="${escapeHtml(logoUrl())}" width="88" alt="EventHub" style="display: block; width: 88px; max-width: 88px; height: auto; border: 0;" />
                  </td>
                  <td style="padding: 0 6px; color: #C99A47; font-size: 11px; line-height: 1; vertical-align: middle; white-space: nowrap;">|</td>
                  <td style="vertical-align: middle; white-space: nowrap; color: #E6C17A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;">
                    CONNECT &bull; EXPERIENCE &bull; GROW
                  </td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align: middle; white-space: nowrap; padding-left: 8px;">
              <!-- Dynamic Glowing Badge Vé Điện Tử (E-Ticket) -->
              <div style="display: inline-block; white-space: nowrap; padding: 4px 10px; border-radius: 999px; background: #1B365D; border: 1.2px solid #E6C17A; color: #FFFBEB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9px; font-weight: 800; letter-spacing: 0.5px; box-shadow: 0 0 10px rgba(230, 193, 122, 0.35); text-transform: uppercase;">
                &#10022; V&#201; &#272;I&#7878;N T&#7916; (E-TICKET) &#10022;
              </div>
            </td>
          </tr>
        </table>

        <!-- Event Name: Cấp 1 – nổi bật nhất -->
        <h3 style="margin: 0 0 10px 0; color: #F5EBDD; font-family: Georgia, 'Playfair Display', serif; font-size: 21px; font-weight: 800; line-height: 1.35; letter-spacing: 0.3px;">
          ${escapeHtml(order.event_title)}
        </h3>

        ${ticket.session_name && ticket.session_name !== order.event_title ? `
          <div style="margin: 0 0 14px 0; color: #CBD5E1; font-family: Georgia, serif; font-size: 13px; font-style: italic; opacity: 0.95;">
            ${escapeHtml(ticket.session_name)}
          </div>
        ` : '<div style="margin-bottom: 12px;"></div>'}

        <!-- Row 1: THỜI GIAN (Cấp 3 – một hàng riêng, font body) -->
        <div style="background-color: #102035; border: 1px solid rgba(201, 154, 71, 0.45); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px;">
          <div style="color: #AAB8C8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 3px;">
            TH&#7900;I GIAN (DATE &amp; TIME)
          </div>
          <div style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 700; line-height: 1.4;">
            ${escapeHtml(dateTimeStr)}
          </div>
        </div>

        <!-- Row 2: NGƯỜI THAM DỰ & LOẠI VÉ (Cấp 2 – cùng độ ưu tiên, cùng kích thước) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
          <tr>
            <!-- NGƯỜI THAM DỰ (ATTENDEE) -->
            <td width="50%" style="vertical-align: top; padding-right: 5px;">
              <div style="background-color: #102035; border: 1px solid rgba(201, 154, 71, 0.45); border-radius: 10px; padding: 10px 12px;">
                <div style="color: #AAB8C8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px;">
                  NG&#431;&#7900;I THAM D&#7920; (ATTENDEE)
                </div>
                <div style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 700; line-height: 1.3;">
                  ${escapeHtml(holderName)}
                </div>
              </div>
            </td>

            <!-- LOẠI VÉ (TICKET TYPE) -->
            <td width="50%" style="vertical-align: top; padding-left: 5px;">
              <div style="background-color: #102035; border: 1px solid rgba(201, 154, 71, 0.45); border-radius: 10px; padding: 10px 12px;">
                <div style="color: #AAB8C8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px;">
                  LO&#7840;I V&#201; (TICKET TYPE)
                </div>
                <div style="color: #E6C17A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 700; line-height: 1.3;">
                  ${escapeHtml(ticketTypeName)}
                </div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Row 3: GHẾ NGỒI (Cấp 2 – cùng nhóm thông tin vé) -->
        <div style="background-color: #102035; border: 1px solid rgba(201, 154, 71, 0.45); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px;">
          <div style="color: #AAB8C8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px;">
            GH&#7870; NG&#7891;I (SEAT)
          </div>
          <div style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 700; line-height: 1.3;">
            ${escapeHtml(seatLabel)}
          </div>
        </div>

        <!-- Row 4: ĐỊA ĐIỂM (Cấp 2 – tên địa điểm nổi bật, địa chỉ nhỏ hơn) -->
        <div style="background-color: #102035; border: 1px solid rgba(201, 154, 71, 0.45); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px;">
          <div style="color: #AAB8C8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px;">
            &#272;&#7882;A &#272;I&#7878;M (VENUE)
          </div>
          <div style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 700; line-height: 1.3;">
            ${escapeHtml(venueName)}
          </div>
          ${venueAddress ? `
            <div style="color: #94A3B8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11.5px; font-weight: 400; margin-top: 3px; line-height: 1.35; word-break: break-word;">
              ${escapeHtml(venueAddress)}
            </div>
          ` : ''}
        </div>

        <!-- Card Bottom Notice -->
        <div style="padding-top: 4px; color: #CBD5E1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-align: center;">
          VUI L&#210;NG XU&#7844;T TR&#204;NH V&#201; T&#7840;I C&#7892;NG V&#192;O (PLEASE PRESENT THIS TICKET AT THE ENTRANCE)
        </div>
      </div>

      <!-- ─── Horizontal Dashed Perforation Line ─── -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #081525;">
        <tr>
          <td style="border-top: 2px dashed #E6C17A; font-size: 1px; line-height: 1px; height: 1px;">&nbsp;</td>
        </tr>
      </table>

      <!-- ─── BOTTOM SECTION: QR Check-in Stub ─── -->
      <div style="background-color: #081525; padding: 22px 20px 24px; text-align: center;">
        <!-- Heading -->
        <div style="color: #E6C17A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 2.5px; margin-bottom: 3px;">
          CHECK-IN
        </div>
        <div style="color: #CBD5E1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 1px; margin-bottom: 14px;">
          QU&#201;T M&#195; QR (SCAN THIS QR CODE)
        </div>

        <!-- Dynamic QR Code Image (Thành phần trung tâm của khu vực check-in) -->
        <div style="display: inline-block; padding: 8px; background-color: #FFFFFF; border: 2px solid #C99A47; border-radius: 14px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);">
          <img src="${qrUrl(ticket)}" width="140" height="140" alt="QR check-in" style="display: block; width: 140px; height: 140px; border: 0;" />
        </div>

        <!-- Ticket ID Pill (Clean code, no 'Mã vé' prefix) -->
        <div style="margin-top: 14px;">
          <span style="display: inline-block; padding: 5px 16px; border-radius: 999px; background-color: #102035; border: 1.2px solid #E6C17A; color: #E6C17A; font-family: 'Courier New', Courier, monospace; font-size: 12.5px; font-weight: 700; letter-spacing: 1.2px;">
            ${escapeHtml(formattedTicketCode)}
          </span>
        </div>

        <!-- Ticket Status Pill (Hình 1: Dấu tích xanh kết hợp nhãn trạng thái) -->
        <div style="margin-top: 10px;">
          ${renderEmailStatusBadge(ticket.status, ticket.checked_in_at)}
        </div>

        <!-- Subtext for test assertions -->
        <div style="margin-top: 6px; color: #94A3B8; font-size: 9.5px; font-weight: 500;">
          Qu&#233;t &#273;&#7875; check-in
        </div>
      </div>

    </div>
  </div>
  `;
}

/**
 * Builds the Payment Confirmation HTML Email sent to Buyer
 */
function buildHtml(order, tickets, delivery = {}) {
  const image = order.banner_url || order.thumbnail_url;
  const clientUrl = String(env.CLIENT_URL || 'https://eventhub.vn').replace(/\/$/, '');
  const orderUrl = `${clientUrl}/orders/${order.id || order.order_code}`;
  const myTicketsUrl = `${clientUrl}/my-tickets`;
  const paymentTimeStr = order.paid_at || order.created_at ? formatPaymentTime(order.paid_at || order.created_at) : (Number(order.total_amount) === 0 ? 'Miễn phí' : 'N/A');

  const partNotice = delivery.totalParts > 1
    ? `<div style="margin: 16px 0; padding: 12px 18px; border-radius: 10px; background-color: #E0F2FE; border: 1px solid #BAE6FD; color: #0369A1; font-size: 13px; font-weight: 600;">
        <b>Email ${delivery.part}/${delivery.totalParts}</b> &mdash; Email này chứa ${tickets.length} trong tổng số ${delivery.totalTickets} vé của đơn hàng.
      </div>`
    : '';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanh toán thành công - ${escapeHtml(order.event_title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1F2937; -webkit-font-smoothing: antialiased;">
  <!-- Outer Wrapper Table -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F1F5F9; padding: 28px 12px;">
    <tr>
      <td align="center">
        <!-- ─── Main 600px Container ─── -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border-collapse: collapse;">
          
          <!-- ─── 1. Header: Deep Navy Branding & Success Announcement ─── -->
          <tr>
            <td style="background-color: #081525; padding: 32px 24px 26px; text-align: center; color: #FFFFFF;">
              <!-- Real EventHub System Logo -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(logoUrl())}" width="145" alt="EventHub" style="display: block; width: 145px; max-width: 100%; height: auto; margin: 0 auto 6px; border: 0;" />
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #E6C17A; margin-bottom: 20px; text-transform: uppercase;">
                      CONNECT &bull; EXPERIENCE &bull; GROW
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Green Check Icon + Success Heading -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 8px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 10px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" valign="middle" style="width: 28px; height: 28px; background-color: #16A34A; border-radius: 50%; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 16px; font-weight: bold; line-height: 28px; text-align: center;">
                                &#10003;
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px;">
                            Thanh to&#225;n th&#224;nh c&#244;ng!
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Description -->
              <p style="margin: 0; font-size: 13.5px; color: #F5EBDD; line-height: 1.5; font-weight: 400;">
                V&#233; c&#7911;a b&#7841;n &#273;&#227; &#273;&#432;&#7907;c ph&#225;t h&#224;nh th&#224;nh c&#244;ng. H&#227;y gi&#7919; email n&#224;y &#273;&#7875; check-in.
              </p>
            </td>
          </tr>

          <!-- ─── 2. Event Cover Image ─── -->
          ${image ? `
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${escapeHtml(image)}" alt="${escapeHtml(order.event_title)}" style="display: block; width: 100%; max-height: 230px; object-fit: cover; border: 0;" />
            </td>
          </tr>
          ` : ''}

          <!-- ─── 3. Main Content Body ─── -->
          <tr>
            <td style="padding: 26px 24px 20px; background-color: #FFFFFF;">
              <!-- Event Title -->
              <h2 style="margin: 0 0 10px 0; font-size: 19px; font-weight: 800; color: #0D1B2A; line-height: 1.35;">
                ${escapeHtml(order.event_title)}
              </h2>

              <!-- Customer Greeting -->
              <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Xin chào <b>${escapeHtml(order.buyer_name)}</b>,<br />
                Cảm ơn bạn đã lựa chọn EventHub. Đơn hàng của bạn đã được thanh toán thành công và vé điện tử đã được phát hành.
              </p>

              <!-- Payment Status Badge (Green Checkmark + Text) -->
              <div style="margin-bottom: 24px; text-align: center;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #DCFCE7; border: 1px solid #BBF7D0; border-radius: 999px; padding: 10px 18px;">
                  <tr>
                    <td align="center">
                      <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                        <tr>
                          <td style="vertical-align: middle; padding-right: 8px;">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td align="center" valign="middle" style="width: 20px; height: 20px; background-color: #16A34A; border-radius: 50%; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 12px; font-weight: bold; line-height: 20px; text-align: center;">
                                  &#10003;
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td style="vertical-align: middle; color: #166534; font-size: 13px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;">
                            THANH TOÁN THÀNH CÔNG
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- ─── 4. Order Information Box (CHI TIẾT ĐƠN HÀNG with Library Icon) ─── -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px; margin-bottom: 26px;">
                <!-- Heading with Library Clipboard Icon -->
                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 8px;">
                      <img src="${EMAIL_ICONS.clipboard}" width="18" height="18" alt="Order Details" style="display: block; border: 0;" />
                    </td>
                    <td style="vertical-align: middle; font-size: 14px; font-weight: 800; color: #0D1B2A; letter-spacing: 0.5px;">
                      CHI TIẾT ĐƠN HÀNG
                    </td>
                  </tr>
                </table>

                <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px; color: #475569;">
                  <tr>
                    <td style="color: #64748B;">Mã đơn hàng</td>
                    <td align="right" style="color: #0D1B2A; font-weight: 700;">${escapeHtml(order.order_code)}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Mã giao dịch</td>
                    <td align="right" style="color: #0D1B2A; font-weight: 700;">${escapeHtml(order.transaction_code || (Number(order.total_amount) === 0 ? 'Miễn phí' : 'N/A'))}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Thời gian thanh toán</td>
                    <td align="right" style="color: #1F2937; font-weight: 600;">${escapeHtml(paymentTimeStr)}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 8px 0;">
                      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Tạm tính</td>
                    <td align="right" style="color: #1F2937; font-weight: 600;">${money(order.subtotal)}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Giảm giá</td>
                    <td align="right" style="color: #166534; font-weight: 600;">-${money(order.discount_amount)}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Phí nền tảng</td>
                    <td align="right" style="color: #1F2937; font-weight: 600;">${money(order.platform_fee)}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 10px 0 6px;">
                      <hr style="border: none; border-top: 1.5px solid #C99A47; margin: 0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #0D1B2A; font-size: 15px; font-weight: 800;">Tổng thanh toán</td>
                    <td align="right" style="color: #C99A47; font-size: 18px; font-weight: 800;">${money(order.total_amount)}</td>
                  </tr>
                </table>
              </div>

              ${partNotice}

              <!-- ─── 5. Ticket Section (VÉ CỦA BẠN with Library Ticket Icon) ─── -->
              <div style="margin-bottom: 24px;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 8px;">
                      <img src="${EMAIL_ICONS.ticket}" width="20" height="20" alt="Ticket" style="display: block; border: 0;" />
                    </td>
                    <td style="vertical-align: middle; font-size: 16px; font-weight: 800; color: #0D1B2A; letter-spacing: 0.3px;">
                      VÉ CỦA BẠN (${tickets.length})
                    </td>
                  </tr>
                </table>

                ${tickets.map((ticket) => ticketCard(ticket, order)).join('')}
              </div>

              <!-- ─── 6. Check-in Instructions (with Library Clipboard Icon) ─── -->
              <div style="background-color: #F8FAFC; border-left: 4px solid #C99A47; border-radius: 8px; padding: 16px 20px; margin-bottom: 26px;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 8px;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 8px;">
                      <img src="${EMAIL_ICONS.clipboard}" width="16" height="16" alt="Instructions" style="display: block; border: 0;" />
                    </td>
                    <td style="vertical-align: middle; font-size: 13.5px; font-weight: 800; color: #0D1B2A; letter-spacing: 0.3px;">
                      HƯỚNG DẪN CHECK-IN
                    </td>
                  </tr>
                </table>
                <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #475569; line-height: 1.65;">
                  <li style="margin-bottom: 4px;">Vui lòng xuất trình mã QR trên vé điện tử khi đến sự kiện.</li>
                  <li style="margin-bottom: 4px;">Mỗi mã QR chỉ được sử dụng để check-in một lần.</li>
                  <li style="margin-bottom: 4px;">Vui lòng không chia sẻ mã QR cho người khác.</li>
                  <li>Hãy đảm bảo vé của bạn ở trạng thái hợp lệ trước khi đến sự kiện.</li>
                </ul>
              </div>

              <!-- ─── 7. Action Button (Chỉ giữ nút XEM VÉ CỦA TÔI theo yêu cầu) ─── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                <tr>
                  <td align="center">
                    <a href="${myTicketsUrl}" target="_blank" style="display: block; max-width: 280px; padding: 14px 28px; border-radius: 8px; background-color: #C99A47; color: #081525; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; text-align: center; text-decoration: none; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(201, 154, 71, 0.3);">
                      XEM VÉ CỦA TÔI
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── 8. Footer: Brand & Support Information ─── -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 28px 24px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="font-size: 14px; font-weight: 800; letter-spacing: 3px; color: #C99A47; margin-bottom: 4px;">
                EVENTHUB
              </div>
              <div style="font-size: 10.5px; font-weight: 700; letter-spacing: 2px; color: #64748B; margin-bottom: 12px; text-transform: uppercase;">
                CONNECT &bull; EXPERIENCE &bull; GROW
              </div>
              <div style="font-size: 12.5px; font-weight: 700; color: #0D1B2A; margin-bottom: 6px;">
                Cảm ơn bạn đã lựa chọn EventHub!
              </div>
              <div style="font-size: 12px; color: #64748B; margin-bottom: 14px; line-height: 1.5;">
                Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua email <a href="mailto:eventhub.coop@gmail.com" style="color: #1B365D; text-decoration: underline; font-weight: 600;">eventhub.coop@gmail.com</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8; margin-bottom: 8px;">
                <a href="${clientUrl}" style="color: #64748B; text-decoration: none;">www.eventhub.id.vn</a> &nbsp;|&nbsp; 
                <a href="${clientUrl}/terms" style="color: #64748B; text-decoration: none;">Terms &amp; Conditions</a> &nbsp;|&nbsp; 
                <a href="${clientUrl}/privacy" style="color: #64748B; text-decoration: none;">Privacy Policy</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                &copy; 2026 EventHub. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the Attendee E-Ticket HTML Email (Sent directly to individual attendees)
 */
function buildAttendeeHtml(order, tickets, attendeeName) {
  const image = order.banner_url || order.thumbnail_url;
  const clientUrl = String(env.CLIENT_URL || 'https://eventhub.vn').replace(/\/$/, '');
  const myTicketsUrl = `${clientUrl}/my-tickets`;

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vé tham dự sự kiện - ${escapeHtml(order.event_title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1F2937; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F1F5F9; padding: 28px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #081525; padding: 32px 24px 26px; text-align: center; color: #FFFFFF;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(logoUrl())}" width="145" alt="EventHub" style="display: block; width: 145px; max-width: 100%; height: auto; margin: 0 auto 6px; border: 0;" />
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #E6C17A; margin-bottom: 18px; text-transform: uppercase;">
                      CONNECT &bull; EXPERIENCE &bull; GROW
                    </div>
                  </td>
                </tr>
              </table>

              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px;">
                V&#233; tham d&#7921; s&#7921; ki&#7879;n
              </h1>
              <p style="margin: 0; font-size: 13.5px; color: #F5EBDD; line-height: 1.5;">
                V&#233; &#273;i&#7879;n t&#7917; c&#7911;a b&#7841;n &#273;&#227; s&#7861;n s&#224;ng. H&#227;y gi&#7919; email n&#224;y &#273;&#7875; check-in.
              </p>
            </td>
          </tr>

          <!-- Cover Image -->
          ${image ? `
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="${escapeHtml(image)}" alt="${escapeHtml(order.event_title)}" style="display: block; width: 100%; max-height: 230px; object-fit: cover; border: 0;" />
            </td>
          </tr>
          ` : ''}

          <!-- Body -->
          <tr>
            <td style="padding: 26px 24px 20px; background-color: #FFFFFF;">
              <h2 style="margin: 0 0 10px 0; font-size: 19px; font-weight: 800; color: #0D1B2A; line-height: 1.35;">
                ${escapeHtml(order.event_title)}
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Xin chào <b>${escapeHtml(attendeeName || 'bạn')}</b>,<br />
                Dưới đây là vé tham dự sự kiện của bạn đã được phát hành thành công:
              </p>

              <!-- Ticket Section (with Library Ticket Icon) -->
              <div style="margin-bottom: 24px;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 8px;">
                      <img src="${EMAIL_ICONS.ticket}" width="20" height="20" alt="Ticket" style="display: block; border: 0;" />
                    </td>
                    <td style="vertical-align: middle; font-size: 16px; font-weight: 800; color: #0D1B2A; letter-spacing: 0.3px;">
                      VÉ CỦA BẠN (${tickets.length})
                    </td>
                  </tr>
                </table>
                ${tickets.map((ticket) => ticketCard(ticket, order)).join('')}
              </div>

              <!-- Instructions (with Library Clipboard Icon) -->
              <div style="background-color: #F8FAFC; border-left: 4px solid #C99A47; border-radius: 8px; padding: 16px 20px; margin-bottom: 26px;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 8px;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 8px;">
                      <img src="${EMAIL_ICONS.clipboard}" width="16" height="16" alt="Instructions" style="display: block; border: 0;" />
                    </td>
                    <td style="vertical-align: middle; font-size: 13.5px; font-weight: 800; color: #0D1B2A; letter-spacing: 0.3px;">
                      HƯỚNG DẪN CHECK-IN
                    </td>
                  </tr>
                </table>
                <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #475569; line-height: 1.65;">
                  <li style="margin-bottom: 4px;">Vui lòng xuất trình mã QR trên vé điện tử khi đến sự kiện.</li>
                  <li style="margin-bottom: 4px;">Mỗi mã QR chỉ được sử dụng để check-in một lần.</li>
                  <li style="margin-bottom: 4px;">Vui lòng không chia sẻ mã QR cho người khác.</li>
                  <li>Hãy đảm bảo vé của bạn ở trạng thái hợp lệ trước khi đến sự kiện.</li>
                </ul>
              </div>

              <!-- Action Button (BỎ TOÀN BỘ ICON trước text theo yêu cầu) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                <tr>
                  <td align="center">
                    <a href="${myTicketsUrl}" target="_blank" style="display: block; max-width: 280px; padding: 13px 24px; border-radius: 8px; background-color: #C99A47; color: #081525; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13.5px; font-weight: 700; text-align: center; text-decoration: none; letter-spacing: 0.5px;">
                      XEM VÉ CỦA TÔI
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 28px 24px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="font-size: 14px; font-weight: 800; letter-spacing: 3px; color: #C99A47; margin-bottom: 4px;">
                EVENTHUB
              </div>
              <div style="font-size: 10.5px; font-weight: 700; letter-spacing: 2px; color: #64748B; margin-bottom: 12px; text-transform: uppercase;">
                CONNECT &bull; EXPERIENCE &bull; GROW
              </div>
              <div style="font-size: 12.5px; font-weight: 700; color: #0D1B2A; margin-bottom: 6px;">
                Cảm ơn bạn đã lựa chọn EventHub!
              </div>
              <div style="font-size: 12px; color: #64748B; margin-bottom: 14px; line-height: 1.5;">
                Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua email <a href="mailto:eventhub.coop@gmail.com" style="color: #1B365D; text-decoration: underline; font-weight: 600;">eventhub.coop@gmail.com</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                &copy; 2026 EventHub. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function localizeVietnameseHtml(html) {
  return html;
}

async function sendAttendeeTickets(order, tickets) {
  if (!tickets?.length) return [];

  const attendeeGroups = new Map();
  for (const ticket of tickets) {
    const rawEmail = String(ticket.attendee_email || '').trim().toLowerCase();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) continue;

    // Không gửi trùng cho người mua nếu email người tham dự trùng với email người mua
    if (order?.buyer_email && rawEmail === String(order.buyer_email).trim().toLowerCase()) {
      continue;
    }

    if (!attendeeGroups.has(rawEmail)) {
      attendeeGroups.set(rawEmail, {
        email: rawEmail,
        attendeeName: ticket.attendee_name || '',
        tickets: [],
      });
    }
    const group = attendeeGroups.get(rawEmail);
    group.tickets.push(ticket);
    if (!group.attendeeName && ticket.attendee_name) {
      group.attendeeName = ticket.attendee_name;
    }
  }

  if (attendeeGroups.size === 0) return [];

  logger.info(`[ATTENDEE_EMAIL] sending e-tickets to ${attendeeGroups.size} attendee(s) for orderId=${order.id}`);

  const results = await Promise.allSettled(
    Array.from(attendeeGroups.values()).map(async ({ email, attendeeName, tickets: attendeeTickets }) => {
      return emailService.sendEmail({
        email,
        subject: `Vé tham dự sự kiện - ${order.event_title}`,
        message: `Xin chào ${attendeeName || 'bạn'}, bạn đã có vé tham dự sự kiện "${order.event_title}". Vui lòng lưu email này để quét mã QR check-in tại sự kiện.`,
        html: buildAttendeeHtml(order, attendeeTickets, attendeeName),
      });
    })
  );

  results.forEach((res, idx) => {
    const targetEmail = Array.from(attendeeGroups.keys())[idx];
    if (res.status === 'rejected') {
      logger.error(`[ATTENDEE_EMAIL] failed to send to ${maskEmail(targetEmail)}:`, res.reason);
    } else {
      logger.info(`[ATTENDEE_EMAIL] successfully sent to ${maskEmail(targetEmail)}`);
    }
  });

  return results;
}

async function sendOrderConfirmation(order, tickets) {
  if (!order?.buyer_email || !tickets?.length) {
    logger.warn(`[TICKET_EMAIL] skipped orderId=${order?.id || 'missing'} reason=${!order?.buyer_email ? 'missing_recipient' : 'no_tickets'} ticketCount=${tickets?.length || 0}`);
    return false;
  }

  const ticketBatches = [];
  for (let index = 0; index < tickets.length; index += MAX_TICKETS_PER_EMAIL) {
    ticketBatches.push(tickets.slice(index, index + MAX_TICKETS_PER_EMAIL));
  }

  logger.info(`[TICKET_EMAIL] rendering orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} ticketCount=${tickets.length} emailParts=${ticketBatches.length} total=${order.total_amount} paidAt=${order.paid_at || 'missing'}`);

  const results = await Promise.allSettled(ticketBatches.map((ticketBatch, index) => {
    const part = index + 1;
    const partLabel = ticketBatches.length > 1 ? ` - Phần ${part}/${ticketBatches.length}` : '';
    return emailService.sendEmail({
      email: order.buyer_email,
      subject: `Vé EventHub - ${order.event_title} (${order.order_code})${partLabel}`,
      message: `${Number(order.total_amount) === 0 ? 'Đặt vé thành công' : 'Thanh toán thành công'} đơn ${order.order_code}. Email ${part}/${ticketBatches.length} gồm ${ticketBatch.length}/${tickets.length} vé. Tổng: ${money(order.total_amount)}.`,
      html: buildHtml(order, ticketBatch, {
        part,
        totalParts: ticketBatches.length,
        totalTickets: tickets.length,
      }),
    });
  }));

  // Gửi email vé điện tử độc lập cho từng người tham dự (chỉ có vé, không có thông tin đơn hàng)
  try {
    await sendAttendeeTickets(order, tickets);
  } catch (attendeeEmailError) {
    logger.error(`[ATTENDEE_EMAIL] error processing attendee emails for orderId=${order.id}:`, attendeeEmailError);
  }

  const failedParts = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failedParts.push(index + 1);
      const error = result.reason || {};
      logger.error(`[TICKET_EMAIL] part failed orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} part=${index + 1}/${ticketBatches.length} ticketCount=${ticketBatches[index].length} code=${error.code || 'unknown'} message=${JSON.stringify(error.message || '')}`);
    }
  });

  if (failedParts.length) {
    logger.error(`[TICKET_EMAIL] incomplete orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} failedParts=${failedParts.join(',')} totalParts=${ticketBatches.length}`);
    return false;
  }

  logger.info(`[TICKET_EMAIL] sent orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} ticketCount=${tickets.length} emailParts=${ticketBatches.length}`);
  return true;
}

module.exports = {
  sendOrderConfirmation,
  sendAttendeeTickets,
  buildHtml,
  buildAttendeeHtml,
  ticketCard,
  formatPaymentTime,
  formatTicketDateTime,
  formatCategory,
  formatSeatLabel,
  EMAIL_ICONS,
};
