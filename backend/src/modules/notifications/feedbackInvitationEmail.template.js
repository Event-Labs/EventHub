const env = require('../../config/env');
const {
  formatReminderDate,
  formatReminderTime,
  formatVenueAddress,
} = require('./eventReminderEmail.template');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const EVENTHUB_LOGO_URL = 'https://res.cloudinary.com/dookztwec/image/upload/v1793597424/eventhub/brand/eventhub_logo.png';

function getLogoUrl() {
  if (process.env.EVENTHUB_LOGO_URL) return process.env.EVENTHUB_LOGO_URL;
  if (env.CLIENT_URL && !env.CLIENT_URL.includes('localhost') && !env.CLIENT_URL.includes('127.0.0.1')) {
    return `${String(env.CLIENT_URL).replace(/\/$/, '')}/images/LogoEH.png`;
  }
  return EVENTHUB_LOGO_URL;
}

function buildFeedbackInvitationHtml(data) {
  const {
    attendeeName = 'bạn',
    eventTitle = 'Sự kiện EventHub',
    sessionName,
    bannerUrl,
    startTime,
    endTime,
    venueName = 'Địa điểm tổ chức',
    addressLine = '',
    ward = '',
    district = '',
    city = '',
    isOnline = false,
    feedbackLink,
  } = data;

  const formattedDate = formatReminderDate(startTime);
  const formattedTime = formatReminderTime(startTime, endTime);
  const formattedAddress = formatVenueAddress({ venueName, addressLine, ward, district, city, isOnline });
  const finalVenueName = isOnline ? 'Sự kiện Trực tuyến' : venueName;

  const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
  const finalFeedbackLink = feedbackLink || `${clientUrl}/feedback`;
  const logoSrc = getLogoUrl();

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khảo sát ý kiến: ${escapeHtml(eventTitle)}</title>
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
        <span style="display: inline-block; background-color: #78350f; color: #fde68a; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">
          Ý KIẾN CỦA BẠN RẤT QUAN TRỌNG
        </span>
        <h1 style="margin: 12px 0 8px; font-size: 24px; font-weight: 800; color: #ffffff; line-height: 1.25; letter-spacing: -0.5px;">
          Bạn cảm thấy sự kiện thế nào?
        </h1>
        <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #cbd5e1;">
          ${
            sessionName
              ? `Phiên &ldquo;${escapeHtml(sessionName)}&rdquo; của sự kiện &ldquo;${escapeHtml(eventTitle)}&rdquo; đã đi qua 2/3 thời gian. Ban tổ chức rất mong nhận được những chia sẻ, đánh giá thực tế của bạn để hoàn thiện hơn nữa!`
              : `Sự kiện &ldquo;${escapeHtml(eventTitle)}&rdquo; đã đi qua 2/3 thời gian. Ban tổ chức rất mong nhận được những chia sẻ, đánh giá thực tế của bạn để hoàn thiện hơn nữa!`
          }
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
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.35;">
          ${escapeHtml(eventTitle)}
        </h2>
      </div>

      <!-- Event Banner Image if present -->
      ${
        bannerUrl
          ? `<div style="margin-bottom: 18px; border-radius: 14px; overflow: hidden; background-color: #0f172a;">
               <img src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(eventTitle)}" style="display: block; width: 100%; max-height: 260px; object-fit: cover;" />
             </div>`
          : ''
      }

      <!-- Interactive Star Rating Teaser Box -->
      <div style="margin-bottom: 22px; background: linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%); border: 1px solid #fde68a; border-radius: 14px; padding: 18px 20px; text-align: center;">
        <div style="font-size: 26px; line-height: 1; margin-bottom: 8px;">
          ⭐ ⭐ ⭐ ⭐ ⭐
        </div>
        <div style="font-size: 14px; font-weight: 700; color: #92400e;">
          Hãy chấm điểm và cho ban tổ chức biết cảm nhận của bạn
        </div>
        <div style="font-size: 12px; color: #b45309; margin-top: 4px;">
          Chỉ mất khoảng 1 phút nhưng đóng góp của bạn vô cùng ý nghĩa!
        </div>
      </div>

      <!-- Event Details Card -->
      <div style="border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff; padding: 4px 18px; margin-bottom: 22px;">
        
        <!-- Row: PHIÊN THAM GIA (nếu có) -->
        ${
          sessionName
            ? `<table width="100%" cellpadding="12" cellspacing="0" border="0" style="border-bottom: 1px solid #f1f5f9;">
                 <tr>
                   <td width="36" style="vertical-align: top; padding-left: 0;">
                     <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #fef3c7; text-align: center; line-height: 36px; font-size: 18px;">
                       🎟️
                     </div>
                   </td>
                   <td style="vertical-align: middle; padding-right: 0;">
                     <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                       PHIÊN THAM GIA
                     </div>
                     <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">
                       ${escapeHtml(sessionName)}
                     </div>
                   </td>
                 </tr>
               </table>`
            : ''
        }

        <!-- Row: NGÀY & THỜI GIAN -->
        <table width="100%" cellpadding="12" cellspacing="0" border="0" style="border-bottom: 1px solid #f1f5f9;">
          <tr>
            <td width="36" style="vertical-align: top; padding-left: 0;">
              <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #fef3c7; text-align: center; line-height: 36px; font-size: 18px;">
                ⏰
              </div>
            </td>
            <td style="vertical-align: middle; padding-right: 0;">
              <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                THỜI GIAN SỰ KIỆN
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">
                ${escapeHtml(formattedTime)}, ${escapeHtml(formattedDate)}
              </div>
            </td>
          </tr>
        </table>

        <!-- Row 2: ĐỊA ĐIỂM -->
        <table width="100%" cellpadding="12" cellspacing="0" border="0">
          <tr>
            <td width="36" style="vertical-align: top; padding-left: 0;">
              <div style="width: 36px; height: 36px; border-radius: 9px; background-color: #fef3c7; text-align: center; line-height: 36px; font-size: 18px;">
                📍
              </div>
            </td>
            <td style="vertical-align: middle; padding-right: 0;">
              <div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                ĐỊA ĐIỂM
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">
                ${escapeHtml(finalVenueName)}
              </div>
              ${
                !isOnline && formattedAddress
                  ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px; line-height: 1.4;">
                       ${escapeHtml(formattedAddress)}
                     </div>`
                  : ''
              }
            </td>
          </tr>
        </table>

      </div>

      <!-- Primary CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(finalFeedbackLink)}" target="_blank" style="display: inline-block; background-color: #f59e0b; background-image: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; padding: 14px 28px; border-radius: 12px; text-align: center; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);">
              ⭐ Gửi đánh giá &amp; phản hồi ngay
            </a>
          </td>
        </tr>
      </table>

      <!-- Note -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; font-size: 12px; color: #64748b; line-height: 1.5;">
        <strong>Lưu ý:</strong> Đánh giá của bạn sẽ được gửi bảo mật đến Ban tổ chức nhằm ghi nhận góp ý và cải tiến khâu tổ chức cho các sự kiện tiếp theo. Nếu bạn đã gửi phản hồi trước đó, xin vui lòng bỏ qua email này.
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #0f172a; padding: 20px 24px; color: #94a3b8; font-size: 12px; text-align: center; border-top: 1px solid #1e293b;">
      <p style="margin: 0 0 6px;">
        Đây là email tự động từ hệ thống quản lý sự kiện <strong>EventHub</strong>.
      </p>
      <p style="margin: 0; color: #64748b;">
        &copy; ${new Date().getFullYear()} EventHub. Bảo lưu mọi quyền.
      </p>
    </div>

  </div>
</body>
</html>`;
}

function buildFeedbackInvitationText(data) {
  const {
    attendeeName = 'bạn',
    eventTitle = 'Sự kiện EventHub',
    sessionName,
    feedbackLink,
  } = data;

  const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
  const finalFeedbackLink = feedbackLink || `${clientUrl}/feedback`;

  return `
Xin chào ${attendeeName},

${sessionName ? `Phiên "${sessionName}" của sự kiện "${eventTitle}"` : `Sự kiện "${eventTitle}"`} đã trôi qua 2/3 thời gian diễn ra.
Ban tổ chức rất mong nhận được những chia sẻ, đánh giá thực tế của bạn để nâng cao chất lượng trải nghiệm!

Bạn có thể gửi đánh giá và nhận xét của mình ngay tại:
${finalFeedbackLink}

Chỉ mất khoảng 1 phút nhưng đóng góp của bạn có ý nghĩa vô cùng to lớn đối với Ban tổ chức và cộng đồng EventHub.

Cảm ơn bạn đã tham gia sự kiện!
EventHub Team
`;
}

module.exports = {
  buildFeedbackInvitationHtml,
  buildFeedbackInvitationText,
};

