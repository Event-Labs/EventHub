const env = require('../../config/env');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function formatReminderDate(dateValue) {
  if (!dateValue) return 'Chưa cập nhật';
  const dateObj = new Date(dateValue);
  const weekday = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(dateObj);
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

  const day = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(dateObj);

  const month = new Intl.DateTimeFormat('vi-VN', {
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(dateObj);

  const year = new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(dateObj);

  return `${capitalizedWeekday}, ${day}/${month}/${year}`;
}

function formatReminderTime(startTime, endTime) {
  if (!startTime) return 'Chưa cập nhật';
  const start = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(startTime));

  if (!endTime) return start;

  const end = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(endTime));

  return `${start} - ${end}`;
}

function formatVenueAddress(input = {}) {
  const isOnline = input.isOnline ?? input.is_online;
  if (isOnline) {
    return 'Sự kiện trực tuyến (Online). Kiểm tra liên kết tham dự trong mục Vé của tôi.';
  }

  const rawAddress = input.addressLine || input.address_line || '';
  const ward = input.ward || '';
  const district = input.district || '';
  const city = input.city || '';

  if (!rawAddress) {
    const fallbackParts = [ward, district, city].filter(Boolean);
    return fallbackParts.length > 0 ? fallbackParts.join(', ') : 'Địa chỉ chi tiết sẽ được ban tổ chức thông báo.';
  }

  let result = rawAddress.trim();
  const lower = result.toLowerCase();

  // Deduplicate: only append if not already mentioned in addressLine
  if (ward && !lower.includes(ward.toLowerCase().trim())) {
    result += `, ${ward.trim()}`;
  }
  if (district && !lower.includes(district.toLowerCase().trim())) {
    result += `, ${district.trim()}`;
  }
  if (city && !lower.includes(city.toLowerCase().trim())) {
    result += `, ${city.trim()}`;
  }

  return result;
}

function getLogoUrl() {
  const clientUrl = String(env.CLIENT_URL || 'https://eventhub.com').replace(/\/$/, '');
  return `${clientUrl}/images/LogoEH.png`;
}

function buildEventReminderHtml(data) {
  const {
    attendeeName = 'bạn',
    eventTitle = 'Sự kiện EventHub',
    bannerUrl,
    startTime,
    endTime,
    venueName = 'Địa điểm tổ chức',
    addressLine = '',
    ward = '',
    district = '',
    city = '',
    isOnline = false,
    ticketLink,
    milestone = '24h', // '24h' or '2h'
  } = data;

  const formattedDate = formatReminderDate(startTime);
  const formattedTime = formatReminderTime(startTime, endTime);
  const formattedAddress = formatVenueAddress({ venueName, addressLine, ward, district, city, isOnline });
  const finalVenueName = isOnline ? 'Sự kiện Trực tuyến' : venueName;

  const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
  const finalTicketLink = ticketLink || `${clientUrl}/my-tickets`;
  const logoSrc = getLogoUrl();

  const milestoneBadgeText = milestone === '2h' ? 'SỰ KIỆN SẮP DIỄN RA (CÒN 2 GIỜ)' : 'EVENT REMINDER';
  const milestoneSubhead =
    milestone === '2h'
      ? 'Chỉ còn khoảng 2 giờ nữa sự kiện của bạn sẽ chính thức bắt đầu. Hãy sẵn sàng vé điện tử và di chuyển sớm để check-in thuận lợi.'
      : 'Đừng bỏ lỡ trải nghiệm đặc biệt của bạn. EventHub gửi bạn thông tin để chuẩn bị cho buổi tham dự sắp tới.';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nhắc nhở sự kiện: ${escapeHtml(eventTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <div style="max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);">
    
    <!-- Header Block (Navy/Slate #0F172A) -->
    <div style="background-color: #0f172a; padding: 28px 24px 24px; color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align: middle;">
                  <img src="${escapeHtml(logoSrc)}" width="140" alt="EventHub" style="display: block; width: 140px; max-width: 100%; height: auto;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="margin-top: 20px;">
        <span style="display: inline-block; background-color: #064e3b; color: #34d399; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">
          ${escapeHtml(milestoneBadgeText)}
        </span>
        <h1 style="margin: 12px 0 8px; font-size: 26px; font-weight: 800; color: #ffffff; line-height: 1.25; letter-spacing: -0.5px;">
          Sự kiện sắp bắt đầu!
        </h1>
        <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #cbd5e1;">
          ${escapeHtml(milestoneSubhead)}
        </p>
      </div>
    </div>

    <!-- Body Content -->
    <div style="padding: 24px 24px 20px;">
      
      <!-- Greeting & Event Title -->
      <div style="margin-bottom: 16px;">
        <p style="margin: 0 0 6px; font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 1px; text-transform: uppercase;">
          XIN CHÀO, ${escapeHtml(attendeeName).toUpperCase()}!
        </p>
        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.35;">
          ${escapeHtml(eventTitle)}
        </h2>
      </div>

      <!-- Event Banner Image if present -->
      ${
        bannerUrl
          ? `<div style="margin-bottom: 18px; border-radius: 14px; overflow: hidden; background-color: #0f172a;">
               <img src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(eventTitle)}" style="display: block; width: 100%; max-height: 280px; object-fit: cover;" />
             </div>`
          : ''
      }

      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
        Sự kiện bạn đã đăng ký sắp diễn ra. Vui lòng kiểm tra thông tin bên dưới và chuẩn bị vé điện tử để quá trình check-in được thuận tiện.
      </p>

      <!-- Event Schedule & Location Card -->
      <div style="border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff; padding: 4px 18px; margin-bottom: 22px;">
        
        <!-- Row 1: NGÀY DIỄN RA -->
        <table width="100%" cellpadding="12" cellspacing="0" border="0" style="border-bottom: 1px solid #f1f5f9;">
          <tr>
            <td width="36" style="vertical-align: top; padding-left: 0;">
              <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #e0e7ff; text-align: center; line-height: 36px; font-size: 18px;">
                📅
              </div>
            </td>
            <td style="vertical-align: middle; padding-right: 0;">
              <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                NGÀY DIỄN RA
              </div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                ${escapeHtml(formattedDate)}
              </div>
            </td>
          </tr>
        </table>

        <!-- Row 2: THỜI GIAN -->
        <table width="100%" cellpadding="12" cellspacing="0" border="0" style="border-bottom: 1px solid #f1f5f9;">
          <tr>
            <td width="36" style="vertical-align: top; padding-left: 0;">
              <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #e0e7ff; text-align: center; line-height: 36px; font-size: 18px;">
                ⏰
              </div>
            </td>
            <td style="vertical-align: middle; padding-right: 0;">
              <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                THỜI GIAN
              </div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                ${escapeHtml(formattedTime)}
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                Vui lòng đến sớm để check-in.
              </div>
            </td>
          </tr>
        </table>

        <!-- Row 3: ĐỊA ĐIỂM -->
        <table width="100%" cellpadding="12" cellspacing="0" border="0">
          <tr>
            <td width="36" style="vertical-align: top; padding-left: 0;">
              <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #e0e7ff; text-align: center; line-height: 36px; font-size: 18px;">
                📍
              </div>
            </td>
            <td style="vertical-align: middle; padding-right: 0;">
              <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                ĐỊA ĐIỂM
              </div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                ${escapeHtml(finalVenueName)}
              </div>
              <div style="font-size: 13px; color: #475569; margin-top: 2px; line-height: 1.45;">
                ${escapeHtml(formattedAddress)}
              </div>
            </td>
          </tr>
        </table>

      </div>

      <!-- Checklist Box (Trước khi tham dự) -->
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; padding: 16px 18px; margin-bottom: 24px;">
        <div style="font-size: 14px; font-weight: 800; color: #92400e; margin-bottom: 10px; display: flex; align-items: center;">
          📋 Trước khi tham dự
        </div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 13px; color: #78350f; line-height: 1.6;">
          <tr>
            <td width="20" style="vertical-align: top; padding-bottom: 6px;">✔</td>
            <td style="padding-bottom: 6px;">Mở vé điện tử và chuẩn bị mã QR để check-in.</td>
          </tr>
          <tr>
            <td width="20" style="vertical-align: top; padding-bottom: 6px;">✔</td>
            <td style="padding-bottom: 6px;">Kiểm tra thời gian và địa điểm trên vé của bạn.</td>
          </tr>
          <tr>
            <td width="20" style="vertical-align: top;">✔</td>
            <td>Đến sớm để có đủ thời gian hoàn tất thủ tục vào cửa.</td>
          </tr>
        </table>
      </div>

      <!-- Action Button (Mobile-friendly, large touch area) -->
      <div style="text-align: center; margin: 24px 0 10px;">
        <a href="${escapeHtml(finalTicketLink)}" target="_blank" rel="noopener noreferrer" style="display: block; width: 100%; box-sizing: border-box; background-color: #1e3a8a; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; padding: 14px 20px; border-radius: 10px; text-align: center; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.35);">
          🎟️ Xem vé điện tử của tôi &nbsp;›
        </a>
        <p style="margin: 8px 0 0; font-size: 11px; color: #94a3b8; text-align: center;">
          Nút này liên kết tới trang chi tiết vé của người nhận.
        </p>
      </div>

      <!-- Footer Divider & Sign-off -->
      <div style="border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 22px; text-align: center;">
        <h4 style="margin: 0 0 6px; font-size: 15px; font-weight: 800; color: #1e293b;">
          Hẹn gặp bạn tại sự kiện!
        </h4>
        <p style="margin: 0 0 10px; font-size: 13px; color: #64748b;">
          Cảm ơn bạn đã lựa chọn EventHub.
        </p>
        <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
          Đây là email tự động. Nếu cần hỗ trợ, vui lòng liên hệ bộ phận hỗ trợ EventHub qua kênh liên hệ chính thức.<br>
          &copy; ${new Date().getFullYear()} EventHub. All rights reserved.
        </p>
      </div>

    </div>

  </div>
</body>
</html>`;
}

function buildEventReminderText(data) {
  const {
    attendeeName = 'bạn',
    eventTitle = 'Sự kiện EventHub',
    startTime,
    endTime,
    venueName = 'Địa điểm tổ chức',
    addressLine = '',
    ward = '',
    district = '',
    city = '',
    isOnline = false,
    ticketLink,
    milestone = '24h',
  } = data;

  const formattedDate = formatReminderDate(startTime);
  const formattedTime = formatReminderTime(startTime, endTime);
  const formattedAddress = formatVenueAddress({ venueName, addressLine, ward, district, city, isOnline });
  const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
  const finalTicketLink = ticketLink || `${clientUrl}/my-tickets`;

  return `[EventHub] SỰ KIỆN SẮP BẮT ĐẦU!

Xin chào ${attendeeName},

Sự kiện bạn đã đăng ký sắp diễn ra. Vui lòng kiểm tra thông tin bên dưới và chuẩn bị vé điện tử để check-in:

TÊN SỰ KIỆN: ${eventTitle}
NGÀY DIỄN RA: ${formattedDate}
THỜI GIAN: ${formattedTime}
ĐỊA ĐIỂM: ${isOnline ? 'Sự kiện trực tuyến' : venueName} (${formattedAddress})

LƯU Ý TRƯỚC KHI THAM DỰ:
- Mở vé điện tử và chuẩn bị mã QR để check-in.
- Kiểm tra thời gian và địa điểm trên vé của bạn.
- Đến sớm để có đủ thời gian hoàn tất thủ tục vào cửa.

Xem vé điện tử của bạn tại: ${finalTicketLink}

Hẹn gặp bạn tại sự kiện!
EventHub Team
`;
}

module.exports = {
  formatReminderDate,
  formatReminderTime,
  formatVenueAddress,
  buildEventReminderHtml,
  buildEventReminderText,
};
