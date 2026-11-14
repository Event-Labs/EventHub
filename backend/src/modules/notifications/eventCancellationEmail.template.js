const env = require('../../config/env');

const DEFAULT_CLIENT_URL = 'https://www.eventhub.id.vn';
const SUPPORT_EMAIL = 'eventhub.coop@gmail.com';
const TAGLINE = 'Together for a better event experience';

const EVENTHUB_LOGO_URL =
  'https://res.cloudinary.com/dookztwec/image/upload/v1793597424/eventhub/brand/eventhub_logo.png';

const VIETNAMESE_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getClientBaseUrl(overrideBaseUrl) {
  const candidate = String(overrideBaseUrl || env.CLIENT_URL || DEFAULT_CLIENT_URL).trim();
  if (!candidate) return DEFAULT_CLIENT_URL;
  return candidate.replace(/\/+$/, '');
}

function getLogoUrl(clientBaseUrl) {
  if (process.env.EVENTHUB_LOGO_URL) return process.env.EVENTHUB_LOGO_URL;
  const base = getClientBaseUrl(clientBaseUrl);
  if (base && !base.includes('localhost') && !base.includes('127.0.0.1')) {
    return `${base}/images/LogoEH.png`;
  }
  return EVENTHUB_LOGO_URL;
}

function detectCancellationLocale({ locale, textHint } = {}) {
  const normalized = String(locale || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized === 'en_us') return 'en';
  if (normalized === 'vi' || normalized.startsWith('vi-') || normalized === 'vi_vn') return 'vi';

  if (textHint && typeof textHint === 'string' && VIETNAMESE_DIACRITIC_REGEX.test(textHint)) {
    return 'vi';
  }

  return 'vi';
}

function formatCancellationCurrency(amount, locale = 'vi') {
  const num = Number(amount || 0);
  if (locale === 'en') {
    return `${new Intl.NumberFormat('en-US').format(num)} VND`;
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} VND`;
}

function formatCancellationDate(dateValue, locale = 'vi') {
  if (!dateValue) return null;
  const dateObj = new Date(dateValue);
  if (Number.isNaN(dateObj.getTime())) return null;

  if (locale === 'en') {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(dateObj);
  }

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

function getCancellationCopy(locale = 'vi') {
  if (locale === 'en') {
    return {
      subjectPrefix: '[EventHub] Event Cancelled & 100% Refund Notice',
      refundNoticeBadge: 'REFUND NOTICE',
      heroTitle: 'Event Cancelled',
      heroSubtitle: 'Important notice regarding your ticket order.',
      statusCancelledBadge: 'CANCELLED',
      statusPendingRefundBadge: 'Pending Refund',
      greeting: (name) => `Dear ${name},`,
      announcement: (eventName) =>
        `EventHub regrets to inform you that the event <strong>${escapeHtml(eventName)}</strong> has been officially cancelled.`,
      cancellationReasonLabel: 'Cancellation reason:',
      policyNotice:
        'In accordance with our refund policy, our system has automatically created a refund request for <strong>100% of the amount</strong> you paid for tickets to this event.',
      eventCardHeader: 'EVENT INFORMATION',
      eventNameLabel: 'Event:',
      eventDateLabel: 'Event date:',
      orderCodeLabel: 'Order code:',
      cancellationReasonCardLabel: 'Cancellation reason:',
      eventStatusLabel: 'Status:',
      refundCardHeader: 'REFUND INFORMATION',
      refundAmountLabel: 'Estimated Refund Amount',
      refundRateLabel: 'Refund rate: 100%',
      refundStatusLabel: 'Refund status:',
      organizerTransferNotice:
        'The Organizer will verify the details and execute a 100% refund bank transfer to you in accordance with policy.',
      instructionsHeader: 'REFUND INSTRUCTIONS',
      instructionsIntro:
        'To ensure your refund is processed smoothly and accurately, please follow these steps:',
      step1Title: 'Step 1. Access My Tickets',
      step1Desc:
        'Log in to your EventHub account, select <strong>My Tickets</strong> and navigate to <strong>Pending Refund</strong>.',
      step2Title: 'Step 2. Verify Receiving Account Details',
      step2Desc:
        'Select the cancelled event order and carefully check the bank account information provided, including: Bank name, Account number, Account holder name.',
      step3Title: 'Step 3. Update Information if Needed',
      step3Desc:
        'If you notice any inaccurate details, you can update your bank account information and re-submit the request so the Organizer has accurate details when executing the refund transfer.',
      step4Title: 'Step 4. Track Refund Status',
      step4Desc:
        'After submitting your information, you can continue tracking the refund processing status directly in the <strong>Pending Refund</strong> section on EventHub.',
      apologyNotice:
        'We sincerely apologize for this inconvenience and appreciate your kind understanding.',
      regards: 'Warm regards,',
      teamSignature: 'EventHub Team',
      ctaButton: 'Go to My Tickets',
      ctaFallbackText: 'Or open this link directly in your browser:',
      supportPrompt: 'If you need assistance, please contact the EventHub team via email',
      disclaimer:
        'This is an automated notification email sent by the EventHub system. Please do not reply directly to this email if your mail client does not support responses.',
      defaultReason: 'Organizer Request / Force Majeure',
      defaultCustomerName: 'Valued Customer',
      defaultEventName: 'EventHub Event',
    };
  }

  return {
    subjectPrefix: '[EventHub] Thông báo hủy sự kiện & Hoàn tiền 100%',
    refundNoticeBadge: 'THÔNG BÁO HOÀN TIỀN',
    heroTitle: 'Sự kiện đã bị hủy',
    heroSubtitle: 'Thông báo quan trọng về đơn vé của bạn.',
    statusCancelledBadge: 'ĐÃ HỦY',
    statusPendingRefundBadge: 'Chờ hoàn tiền',
    greeting: (name) => `Kính gửi Quý khách ${name},`,
    announcement: (eventName) =>
      `EventHub rất tiếc phải thông báo rằng sự kiện <strong>${escapeHtml(eventName)}</strong> đã chính thức bị hủy.`,
    cancellationReasonLabel: 'Lý do hủy:',
    policyNotice:
      'Theo chính sách hoàn tiền, hệ thống đã tự động tạo yêu cầu hoàn trả <strong>100% số tiền</strong> mà Quý khách đã thanh toán cho đơn vé của sự kiện này.',
    eventCardHeader: 'THÔNG TIN SỰ KIỆN',
    eventNameLabel: 'Sự kiện:',
    eventDateLabel: 'Ngày diễn ra:',
    orderCodeLabel: 'Mã đơn hàng:',
    cancellationReasonCardLabel: 'Lý do hủy:',
    eventStatusLabel: 'Trạng thái:',
    refundCardHeader: 'THÔNG TIN HOÀN TIỀN',
    refundAmountLabel: 'Số tiền dự kiến hoàn',
    refundRateLabel: 'Tỷ lệ hoàn: 100%',
    refundStatusLabel: 'Trạng thái:',
    organizerTransferNotice:
      'Ban tổ chức sẽ đối soát và thực hiện chuyển tiền hoàn 100% cho bạn theo quy định.',
    instructionsHeader: 'HƯỚNG DẪN NHẬN TIỀN HOÀN',
    instructionsIntro:
      'Để đảm bảo quá trình hoàn tiền được thực hiện chính xác, Quý khách vui lòng thực hiện các bước sau:',
    step1Title: 'Bước 1. Truy cập mục Vé của tôi',
    step1Desc:
      'Đăng nhập vào tài khoản EventHub, chọn <strong>Vé của tôi (My Tickets)</strong> và truy cập mục <strong>Chờ hoàn tiền (Pending Refund)</strong>.',
    step2Title: 'Bước 2. Kiểm tra thông tin nhận tiền',
    step2Desc:
      'Chọn đơn vé của sự kiện đã bị hủy và kiểm tra kỹ thông tin tài khoản ngân hàng đã cung cấp, bao gồm: Tên ngân hàng, Số tài khoản, Tên chủ tài khoản.',
    step3Title: 'Bước 3. Cập nhật thông tin nếu cần',
    step3Desc:
      'Nếu phát hiện thông tin chưa chính xác, Quý khách có thể chỉnh sửa thông tin tài khoản ngân hàng và gửi lại yêu cầu để Ban tổ chức có thông tin chính xác khi thực hiện chuyển khoản hoàn tiền.',
    step4Title: 'Bước 4. Theo dõi trạng thái hoàn tiền',
    step4Desc:
      'Sau khi gửi thông tin, Quý khách có thể tiếp tục theo dõi trạng thái xử lý hoàn tiền trực tiếp tại mục <strong>Chờ hoàn tiền</strong> trên EventHub.',
    apologyNotice:
      'Chúng tôi thành thật xin lỗi vì sự bất tiện này và rất mong nhận được sự thông cảm từ Quý khách.',
    regards: 'Trân trọng,',
    teamSignature: 'Đội ngũ EventHub',
    ctaButton: 'Truy cập Vé của tôi',
    ctaFallbackText: 'Hoặc mở trực tiếp đường dẫn sau trong trình duyệt:',
    supportPrompt: 'Nếu cần hỗ trợ, vui lòng liên hệ đội ngũ EventHub qua email',
    disclaimer:
      'Đây là email thông báo tự động được gửi qua hệ thống EventHub. Vui lòng không trả lời trực tiếp email này nếu hộp thư không hỗ trợ tiếp nhận phản hồi.',
    defaultReason: 'Theo yêu cầu từ Ban tổ chức / Sự kiện bất khả kháng',
    defaultCustomerName: 'Quý khách',
    defaultEventName: 'Sự kiện EventHub',
  };
}

/**
 * Builds email subject, text, and responsive HTML for Event Cancellation & Refund Notification
 *
 * @param {Object} data
 * @param {string} [data.customerName]
 * @param {string} [data.eventName]
 * @param {string|Date} [data.eventDate]
 * @param {string} [data.orderCode]
 * @param {string} [data.cancellationReason]
 * @param {number|string} [data.refundAmount]
 * @param {string} [data.clientUrl]
 * @param {string} [data.locale] - 'vi' | 'en'
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildEventCancellationEmail(data = {}) {
  const locale = detectCancellationLocale({
    locale: data.locale,
    textHint: data.cancellationReason || data.eventName,
  });

  const copy = getCancellationCopy(locale);

  const customerName = data.customerName?.trim() || copy.defaultCustomerName;
  const eventName = data.eventName?.trim() || copy.defaultEventName;
  const cancellationReason = data.cancellationReason?.trim() || copy.defaultReason;
  const formattedEventDate = formatCancellationDate(data.eventDate, locale);
  const orderCode = data.orderCode?.trim() || '—';
  const refundAmountFormatted = formatCancellationCurrency(data.refundAmount || 0, locale);

  const clientBaseUrl = getClientBaseUrl(data.clientUrl);
  const logoUrl = getLogoUrl(clientBaseUrl);
  const myTicketsUrl = `${clientBaseUrl}/my-tickets?status=REFUND_PENDING`;

  const subject = `${copy.subjectPrefix}: "${eventName}"`;

  // Clean Plain-Text Version
  const text = `${subject}

${copy.greeting(customerName)}

${locale === 'en'
  ? `EventHub regrets to inform you that the event "${eventName}" has been officially cancelled.`
  : `EventHub rất tiếc phải thông báo rằng sự kiện "${eventName}" đã chính thức bị hủy.`}

${copy.cancellationReasonLabel} ${cancellationReason}

${locale === 'en'
  ? 'In accordance with our refund policy, our system has automatically created a refund request for 100% of the amount you paid for tickets to this event.'
  : 'Theo chính sách hoàn tiền, hệ thống đã tự động tạo yêu cầu hoàn trả 100% số tiền mà Quý khách đã thanh toán cho đơn vé của sự kiện này.'}

--------------------------------------------------
${copy.instructionsHeader}
--------------------------------------------------
${copy.instructionsIntro}

${copy.step1Title}
${locale === 'en' ? 'Log in to your EventHub account, select My Tickets and navigate to Pending Refund.' : 'Đăng nhập vào tài khoản EventHub, chọn Vé của tôi (My Tickets) và truy cập mục Chờ hoàn tiền (Pending Refund).'}

${copy.step2Title}
${locale === 'en' ? 'Select the cancelled event order and carefully check bank name, account number and account holder name.' : 'Chọn đơn vé của sự kiện đã bị hủy và kiểm tra kỹ thông tin tài khoản ngân hàng đã cung cấp, bao gồm: Tên ngân hàng, Số tài khoản, Tên chủ tài khoản.'}

${copy.step3Title}
${locale === 'en' ? 'If you notice any inaccurate details, edit your bank account information and re-submit the request.' : 'Nếu phát hiện thông tin chưa chính xác, Quý khách có thể chỉnh sửa thông tin tài khoản ngân hàng và gửi lại yêu cầu để Ban tổ chức có thông tin chính xác khi thực hiện chuyển khoản hoàn tiền.'}

${copy.step4Title}
${locale === 'en' ? 'Track your refund status directly in the Pending Refund section on EventHub.' : 'Sau khi gửi thông tin, Quý khách có thể tiếp tục theo dõi trạng thái xử lý hoàn tiền trực tiếp tại mục Chờ hoàn tiền trên EventHub.'}

--------------------------------------------------
${copy.eventCardHeader}
--------------------------------------------------
- ${copy.eventNameLabel} ${eventName}
${formattedEventDate ? `- ${copy.eventDateLabel} ${formattedEventDate}\n` : ''}- ${copy.orderCodeLabel} ${orderCode}
- ${copy.cancellationReasonCardLabel} ${cancellationReason}
- ${copy.refundAmountLabel}: ${refundAmountFormatted}
- ${copy.eventStatusLabel} ${copy.statusPendingRefundBadge}

${copy.apologyNotice}

${copy.regards}
${copy.teamSignature}

${copy.ctaButton}: ${myTicketsUrl}

---
${copy.supportPrompt} ${SUPPORT_EMAIL}
${copy.disclaimer}
www.eventhub.id.vn • © 2026 EventHub. All rights reserved.`;

  // Rich, Responsive HTML Template
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    td, th {
      vertical-align: top;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    a {
      text-decoration: none;
    }
    @media only screen and (max-width: 640px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .content-padding {
        padding: 24px 18px !important;
      }
      .header-padding {
        padding: 24px 18px !important;
      }
      .hero-title {
        font-size: 22px !important;
        line-height: 1.3 !important;
      }
      .refund-amount-text {
        font-size: 24px !important;
      }
      .stack-column {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .timeline-step-text {
        padding-left: 12px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FFFFFF;">
  <!-- Preheader text (hidden preview) -->
  <div style="display: none; font-size: 1px; color: #FFFFFF; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(eventName)}: ${locale === 'en' ? 'Event has been cancelled. 100% refund request created.' : 'Sự kiện đã bị hủy. Yêu cầu hoàn tiền 100% đã được tự động tạo.'}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FFFFFF; width: 100%; min-height: 100%;">
    <tr>
      <td align="center" style="padding: 28px 12px 40px 12px; background-color: #FFFFFF;">
        <!-- Centered Container Max Width 600px -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #E2E8F0; border-collapse: collapse;">

          <!-- SECTION A: DARK NAVY BRAND HEADER -->
          <tr>
            <td class="header-padding" style="background-color: #081126; padding: 28px 36px 24px 36px; border-bottom: 2px solid rgba(239, 68, 68, 0.35);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Logo -->
                  <td align="left" style="vertical-align: middle;">
                    <a href="${clientBaseUrl}" target="_blank" style="display: inline-block;">
                      <img src="${logoUrl}" alt="EventHub" width="138" style="display: block; width: 138px; height: auto; max-height: 42px;" />
                    </a>
                  </td>
                  <!-- REFUND NOTICE BADGE -->
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(239, 68, 68, 0.15); border: 1px solid #EF4444; color: #FCA5A5; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 6px 12px; border-radius: 20px;">
                      ${copy.refundNoticeBadge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SECTION B: HERO NOTIFICATION BANNER -->
          <tr>
            <td style="background-color: #FEF2F2; border-bottom: 1px solid #FCA5A5; padding: 24px 36px;">
              <div style="display: inline-block; background-color: #EF4444; color: #FFFFFF; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 10px;">
                &#x25CF; ${copy.statusCancelledBadge}
              </div>
              <h1 class="hero-title" style="margin: 0 0 6px 0; font-size: 25px; font-weight: 800; color: #991B1B; line-height: 1.35; letter-spacing: -0.3px;">
                ${copy.heroTitle}
              </h1>
              <p style="margin: 0; font-size: 14px; font-weight: 500; color: #7F1D1D; line-height: 1.5;">
                ${copy.heroSubtitle}
              </p>
            </td>
          </tr>

          <!-- MAIN CONTENT BODY (WHITE BACKGROUND) -->
          <tr>
            <td class="content-padding" style="background-color: #FFFFFF; padding: 32px 36px 36px 36px;">

              <!-- SECTION C: GREETING & ANNOUNCEMENT -->
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #081126; line-height: 1.5;">
                ${copy.greeting(escapeHtml(customerName))}
              </p>

              <p style="margin: 0 0 14px 0; font-size: 15px; color: #1E293B; line-height: 1.65;">
                ${copy.announcement(eventName)}
              </p>

              <div style="margin: 0 0 20px 0; padding: 14px 18px; background-color: #F8FAFC; border-left: 4px solid #EF4444; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6;">
                  <strong style="color: #081126;">${copy.cancellationReasonLabel}</strong> ${escapeHtml(cancellationReason)}
                </p>
              </div>

              <p style="margin: 0 0 26px 0; font-size: 15px; color: #1E293B; line-height: 1.65;">
                ${copy.policyNotice}
              </p>

              <!-- SECTION D: EVENT INFORMATION CARD -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border: 1px solid #E2E8F0; background-color: #F8FAFC; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 14px 20px; background-color: #F1F5F9; border-bottom: 1px solid #E2E8F0;">
                    <span style="font-size: 12px; font-weight: 800; color: #122155; letter-spacing: 0.6px; text-transform: uppercase;">
                      ${copy.eventCardHeader}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="38%" style="padding: 6px 0; font-size: 13.5px; color: #64748B; font-weight: 600;">
                          ${copy.eventNameLabel}
                        </td>
                        <td width="62%" style="padding: 6px 0; font-size: 14px; color: #081126; font-weight: 700; text-align: right;">
                          ${escapeHtml(eventName)}
                        </td>
                      </tr>
                      ${
                        formattedEventDate
                          ? `<tr>
                        <td style="padding: 6px 0; font-size: 13.5px; color: #64748B; font-weight: 600; border-top: 1px solid #EDF2F7;">
                          ${copy.eventDateLabel}
                        </td>
                        <td style="padding: 6px 0; font-size: 14px; color: #081126; font-weight: 600; text-align: right; border-top: 1px solid #EDF2F7;">
                          ${escapeHtml(formattedEventDate)}
                        </td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding: 6px 0; font-size: 13.5px; color: #64748B; font-weight: 600; border-top: 1px solid #EDF2F7;">
                          ${copy.orderCodeLabel}
                        </td>
                        <td style="padding: 6px 0; font-size: 13.5px; font-family: Consolas, monospace; color: #1E293B; font-weight: 700; text-align: right; border-top: 1px solid #EDF2F7;">
                          ${escapeHtml(orderCode)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; font-size: 13.5px; color: #64748B; font-weight: 600; border-top: 1px solid #EDF2F7;">
                          ${copy.eventStatusLabel}
                        </td>
                        <td style="padding: 6px 0; text-align: right; border-top: 1px solid #EDF2F7;">
                          <span style="display: inline-block; background-color: #FEF2F2; border: 1px solid #FCA5A5; color: #DC2626; font-size: 11.5px; font-weight: 800; padding: 2px 8px; border-radius: 6px;">
                            ${copy.statusCancelledBadge}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION E: REFUND INFORMATION CARD (PROMINENT GREEN HIGHLIGHT) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px; border: 1.5px solid #86EFAC; background-color: #F0FDF4; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.08);">
                <tr>
                  <td style="padding: 14px 20px; background-color: #DCFCE7; border-bottom: 1px solid #86EFAC;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left">
                          <span style="font-size: 12px; font-weight: 800; color: #166534; letter-spacing: 0.6px; text-transform: uppercase;">
                            ${copy.refundCardHeader}
                          </span>
                        </td>
                        <td align="right">
                          <span style="display: inline-block; background-color: #FEF3C7; border: 1px solid #FCD34D; color: #92400E; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px;">
                            ${copy.statusPendingRefundBadge}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 22px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 8px;">
                          <div style="font-size: 12.5px; font-weight: 600; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${copy.refundAmountLabel}
                          </div>
                          <div class="refund-amount-text" style="font-size: 28px; font-weight: 800; color: #16A34A; line-height: 1.25; margin: 4px 0 6px 0;">
                            ${escapeHtml(refundAmountFormatted)}
                          </div>
                          <div style="display: inline-block; background-color: rgba(22, 163, 74, 0.15); color: #15803D; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px;">
                            &#x2713; ${copy.refundRateLabel}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 14px; border-top: 1px dashed #86EFAC;">
                          <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.55;">
                            &#x2139; ${copy.organizerTransferNotice}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION F: 4-STEP REFUND INSTRUCTIONS (VERTICAL TIMELINE) -->
              <div style="margin-bottom: 30px;">
                <div style="margin-bottom: 8px;">
                  <span style="font-size: 15px; font-weight: 800; color: #081126; letter-spacing: 0.4px; text-transform: uppercase;">
                    ${copy.instructionsHeader}
                  </span>
                </div>
                <p style="margin: 0 0 18px 0; font-size: 14px; color: #475569; line-height: 1.55;">
                  ${copy.instructionsIntro}
                </p>

                <!-- Vertical Step List -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <!-- Step 1 -->
                  <tr>
                    <td width="36" align="center" style="vertical-align: top; padding-bottom: 16px;">
                      <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #122155; color: #FFFFFF; font-size: 13px; font-weight: 800; text-align: center; line-height: 28px;">
                        1
                      </div>
                    </td>
                    <td class="timeline-step-text" style="vertical-align: top; padding-left: 14px; padding-bottom: 16px;">
                      <div style="font-size: 14.5px; font-weight: 700; color: #081126; margin-bottom: 3px;">
                        ${copy.step1Title}
                      </div>
                      <div style="font-size: 13.5px; color: #475569; line-height: 1.55;">
                        ${copy.step1Desc}
                      </div>
                    </td>
                  </tr>

                  <!-- Step 2 -->
                  <tr>
                    <td width="36" align="center" style="vertical-align: top; padding-bottom: 16px;">
                      <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #122155; color: #FFFFFF; font-size: 13px; font-weight: 800; text-align: center; line-height: 28px;">
                        2
                      </div>
                    </td>
                    <td class="timeline-step-text" style="vertical-align: top; padding-left: 14px; padding-bottom: 16px;">
                      <div style="font-size: 14.5px; font-weight: 700; color: #081126; margin-bottom: 3px;">
                        ${copy.step2Title}
                      </div>
                      <div style="font-size: 13.5px; color: #475569; line-height: 1.55;">
                        ${copy.step2Desc}
                      </div>
                    </td>
                  </tr>

                  <!-- Step 3 -->
                  <tr>
                    <td width="36" align="center" style="vertical-align: top; padding-bottom: 16px;">
                      <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #122155; color: #FFFFFF; font-size: 13px; font-weight: 800; text-align: center; line-height: 28px;">
                        3
                      </div>
                    </td>
                    <td class="timeline-step-text" style="vertical-align: top; padding-left: 14px; padding-bottom: 16px;">
                      <div style="font-size: 14.5px; font-weight: 700; color: #081126; margin-bottom: 3px;">
                        ${copy.step3Title}
                      </div>
                      <div style="font-size: 13.5px; color: #475569; line-height: 1.55;">
                        ${copy.step3Desc}
                      </div>
                    </td>
                  </tr>

                  <!-- Step 4 -->
                  <tr>
                    <td width="36" align="center" style="vertical-align: top; padding-bottom: 8px;">
                      <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #16A34A; color: #FFFFFF; font-size: 13px; font-weight: 800; text-align: center; line-height: 28px;">
                        4
                      </div>
                    </td>
                    <td class="timeline-step-text" style="vertical-align: top; padding-left: 14px; padding-bottom: 8px;">
                      <div style="font-size: 14.5px; font-weight: 700; color: #081126; margin-bottom: 3px;">
                        ${copy.step4Title}
                      </div>
                      <div style="font-size: 13.5px; color: #475569; line-height: 1.55;">
                        ${copy.step4Desc}
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- SECTION G: PRIMARY CALL TO ACTION BUTTON -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 32px 0;">
                <tr>
                  <td align="center">
                    <!-- CTA Button -->
                    <a href="${myTicketsUrl}" target="_blank" style="display: inline-block; background-color: #081126; color: #FFFFFF; font-size: 15px; font-weight: 700; text-align: center; padding: 15px 36px; border-radius: 12px; text-decoration: none; border: 1px solid #1E293B; box-shadow: 0 4px 14px rgba(8, 17, 38, 0.35);">
                      ${copy.ctaButton} &rarr;
                    </a>
                    <div style="margin-top: 10px; font-size: 11.5px; color: #64748B;">
                      ${copy.ctaFallbackText} <a href="${myTicketsUrl}" target="_blank" style="color: #2B5C92; text-decoration: underline; font-family: Consolas, monospace;">${clientBaseUrl}/my-tickets</a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- SECTION H: APOLOGY & CLOSING -->
              <div style="padding-top: 16px; border-top: 1px solid #E2E8F0;">
                <p style="margin: 0 0 14px 0; font-size: 14px; color: #334155; line-height: 1.6;">
                  ${copy.apologyNotice}
                </p>
                <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6;">
                  ${copy.regards}<br>
                  <strong style="color: #081126;">${copy.teamSignature}</strong>
                </p>
              </div>

            </td>
          </tr>

          <!-- SECTION I: FOOTER -->
          <tr>
            <td style="background-color: #081126; padding: 28px 36px; border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <a href="${clientBaseUrl}" target="_blank" style="display: inline-block;">
                      <img src="${logoUrl}" alt="EventHub" width="115" style="display: block; width: 115px; height: auto; max-height: 36px; margin: 0 auto;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 14px;">
                    <p style="margin: 0; font-size: 12px; color: #94A3B8; font-weight: 500; letter-spacing: 0.3px;">
                      ${TAGLINE}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <p style="margin: 0; font-size: 12px; color: #64748B; line-height: 1.6;">
                      ${copy.supportPrompt} <a href="mailto:${SUPPORT_EMAIL}" style="color: #38BDF8; text-decoration: underline;">${SUPPORT_EMAIL}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 14px;">
                    <p style="margin: 0; font-size: 11px; color: #475569; line-height: 1.5; max-width: 500px;">
                      ${copy.disclaimer}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 14px;">
                    <p style="margin: 0; font-size: 11.5px; color: #64748B;">
                      <a href="${clientBaseUrl}" target="_blank" style="color: #94A3B8; text-decoration: none;">www.eventhub.id.vn</a> &bull; &copy; 2026 EventHub. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
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
    locale,
  };
}

module.exports = {
  buildEventCancellationEmail,
  detectCancellationLocale,
  formatCancellationCurrency,
  formatCancellationDate,
  getCancellationCopy,
  DEFAULT_CLIENT_URL,
  SUPPORT_EMAIL,
  TAGLINE,
};

