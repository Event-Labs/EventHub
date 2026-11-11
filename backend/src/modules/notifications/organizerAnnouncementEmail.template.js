const env = require('../../config/env');
const {
  formatReminderDate,
  formatReminderTime,
  formatVenueAddress,
} = require('./eventReminderEmail.template');

const DEFAULT_CLIENT_URL = 'https://www.eventhub.id.vn';
const SUPPORT_EMAIL = 'eventhub.coop@gmail.com';
const TAGLINE = 'Together for a better event experience';

const EVENTHUB_LOGO_URL =
  'https://res.cloudinary.com/dookztwec/image/upload/v1793597424/eventhub/brand/eventhub_logo.png';

const EMAIL_ICONS = {
  logo: EVENTHUB_LOGO_URL,
  calendar:
    'https://res.cloudinary.com/dookztwec/image/upload/v1793597621/eventhub/icons/icon_calendar.png',
  clock:
    'https://res.cloudinary.com/dookztwec/image/upload/v1793597622/eventhub/icons/icon_clock.png',
  mapPin:
    'https://res.cloudinary.com/dookztwec/image/upload/v1793597624/eventhub/icons/icon_map_pin.png',
};

const DROP_WITH_BODY_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'head',
  'meta',
  'link',
  'base',
]);

const ALLOWED_HTML_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'strike',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
]);

const VOID_HTML_TAGS = new Set(['br', 'hr', 'img']);
const BLOCK_HTML_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
]);

const DEFAULT_TAG_STYLES = {
  p: 'margin: 0 0 12px 0; font-size: 15px; line-height: 1.7; color: #1E293B;',
  h1: 'margin: 16px 0 10px 0; font-size: 21px; font-weight: 800; line-height: 1.3; color: #081126;',
  h2: 'margin: 14px 0 8px 0; font-size: 18px; font-weight: 700; line-height: 1.35; color: #081126;',
  h3: 'margin: 12px 0 6px 0; font-size: 16px; font-weight: 700; line-height: 1.4; color: #122155;',
  h4: 'margin: 10px 0 6px 0; font-size: 15px; font-weight: 700; line-height: 1.4; color: #122155;',
  ul: 'margin: 8px 0 14px 0; padding-left: 22px; font-size: 15px; line-height: 1.68; color: #1E293B;',
  ol: 'margin: 8px 0 14px 0; padding-left: 22px; font-size: 15px; line-height: 1.68; color: #1E293B;',
  li: 'margin: 0 0 6px 0; line-height: 1.65; color: #1E293B;',
  blockquote:
    'margin: 12px 0; padding: 10px 14px; border-left: 3px solid #38BDF8; background-color: #F0F7FF; color: #1E293B; border-radius: 0 8px 8px 0;',
  pre: 'margin: 12px 0; padding: 12px 14px; background-color: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 8px; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: #0F172A;',
  code: 'background-color: #F1F5F9; padding: 2px 5px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #0F172A;',
  hr: 'border: 0; border-top: 1px solid #D8E6F5; margin: 16px 0;',
  a: 'color: #0284C7; text-decoration: underline; font-weight: 600; word-break: break-word;',
  img: 'display: block; max-width: 100%; height: auto; border-radius: 10px; margin: 12px 0; border: 1px solid #D8E6F5;',
  table: 'width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px;',
  th: 'border: 1px solid #CBD5E1; background-color: #F8FAFC; padding: 8px 10px; text-align: left; font-weight: 700; color: #081126; vertical-align: top;',
  td: 'border: 1px solid #CBD5E1; padding: 8px 10px; text-align: left; color: #1E293B; vertical-align: top;',
};

const ALLOWED_CSS_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'text-decoration',
  'text-align',
  'line-height',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'border-radius',
  'width',
  'max-width',
]);

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

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
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
  return EMAIL_ICONS.logo;
}

function sanitizeSafeUrl(rawUrl, clientBaseUrl, { allowCid = false } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const decoded = decodeHtmlEntities(rawUrl).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!decoded) return '';

  // Reject scheme confusion like "javascript:...", "vbscript:...", "data:..."
  const collapsed = decoded.replace(/\s+/g, '');
  const lower = collapsed.toLowerCase();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return decoded;
  }
  if (lower.startsWith('mailto:') || lower.startsWith('tel:')) {
    return allowCid ? '' : decoded;
  }
  if (allowCid && lower.startsWith('cid:')) {
    return decoded;
  }
  if (lower.startsWith('//')) {
    return `https:${decoded}`;
  }
  if (decoded.startsWith('/')) {
    return `${getClientBaseUrl(clientBaseUrl)}${decoded}`;
  }
  if (/^www\./i.test(decoded)) {
    return `https://${decoded}`;
  }

  // Explicitly block any unknown or executable URI scheme (javascript:, data:, file:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(collapsed)) {
    return '';
  }

  // Safe relative path without leading slash (must look like an actual subpath or file with extension)
  if (
    /^[a-zA-Z0-9._~/-]+(?:\?[^\s]*)?(?:#[^\s]*)?$/.test(decoded) &&
    (decoded.includes('/') || /\.(?:jpe?g|png|gif|webp|bmp|avif|pdf|docx?|xlsx?|pptx?|zip|rar|txt|html?)(?:\?|$)/i.test(decoded))
  ) {
    return `${getClientBaseUrl(clientBaseUrl)}/${decoded.replace(/^\/+/, '')}`;
  }

  return '';
}

function extractInlineDataImages(rawContent) {
  const input = String(rawContent ?? '');
  if (!input || !input.toLowerCase().includes('data:image/')) {
    return { html: input, inlineAttachments: [] };
  }

  const inlineAttachments = [];
  let counter = 0;
  const maxInlineImages = 15;

  const html = input.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)\2/gi,
    (fullMatch, prefix, quote, mimeSubtype, base64Data) => {
      if (inlineAttachments.length >= maxInlineImages) return fullMatch;
      const cleanBase64 = base64Data.replace(/\s+/g, '');
      if (!cleanBase64) return fullMatch;

      counter += 1;
      const normalizedExt = mimeSubtype.toLowerCase() === 'jpeg' ? 'jpg' : mimeSubtype.toLowerCase();
      const cid = `eh-inline-${counter}@eventhub`;
      inlineAttachments.push({
        filename: `announcement-image-${counter}.${normalizedExt}`,
        content: Buffer.from(cleanBase64, 'base64'),
        contentType: `image/${mimeSubtype.toLowerCase() === 'jpg' ? 'jpeg' : mimeSubtype.toLowerCase()}`,
        cid,
        contentDisposition: 'inline',
      });
      return `${prefix}${quote}cid:${cid}${quote}`;
    },
  );

  return { html, inlineAttachments };
}

function buildEventUrl({ clientUrl, eventUrl, eventSlug, eventId } = {}) {
  const base = getClientBaseUrl(clientUrl);
  if (eventUrl) {
    const safeExplicit = sanitizeSafeUrl(String(eventUrl), base);
    if (safeExplicit) return safeExplicit;
  }
  const slug = String(eventSlug ?? '').trim();
  const id = String(eventId ?? '').trim();
  const identifier = slug || id;
  if (identifier) {
    return `${base}/events/${encodeURIComponent(identifier)}`;
  }
  return `${base}/events`;
}

function detectNotificationLocale({ locale, notificationTitle, notificationMessage } = {}) {
  if (locale === 'en' || locale === 'vi') return locale;
  const sample = `${notificationTitle || ''} ${notificationMessage || ''}`;
  if (VIETNAMESE_DIACRITIC_REGEX.test(sample)) {
    return 'vi';
  }
  return sample.trim().length > 0 ? 'en' : 'vi';
}

function getLocaleCopy(locale) {
  if (locale === 'en') {
    return {
      htmlLang: 'en',
      heroBadge: 'ORGANIZER NOTIFICATION',
      heroHeadline: 'You have a new notification!',
      heroSubtitle: "Here's the latest update from the event organizer.",
      defaultCustomerName: 'Valued Guest',
      greetingPrefix: 'Hello',
      introWithOrganizer: (org, ev) =>
        `<strong>${escapeHtml(org)}</strong> has sent you a new update regarding <strong>${escapeHtml(ev)}</strong>. Please review the details below.`,
      introGeneric: (ev) =>
        `The event organizer has sent you a new update regarding <strong>${escapeHtml(ev)}</strong>. Please review the details below.`,
      eventCardEyebrow: 'EVENT INFORMATION',
      organizedByLabel: 'Organized by',
      dateLabel: 'EVENT DATE',
      timeLabel: 'EVENT TIME',
      locationLabel: 'LOCATION',
      onlineVenueTitle: 'Online Event',
      onlineVenueDetail: 'Access details are available in your EventHub tickets.',
      tbdText: 'To be updated',
      tbdAddressText: 'Detailed address will be updated by the organizer.',
      messageEyebrow: 'NOTIFICATION MESSAGE',
      fromLabel: 'From',
      emptyMessage: 'No additional message content was provided.',
      attachedImagesLabel: (count) => `Attached Images (${count})`,
      attachedFilesLabel: (count) => `Attached Files (${count})`,
      openImageLabel: 'View full image',
      downloadFileLabel: 'Open / Download',
      ctaLabel: 'View Event',
      ctaFallbackPrefix: 'Or open this link in your browser:',
      supportPrompt: 'Need assistance? Contact EventHub Support at',
      disclaimer:
        'This is an automated notification email sent on behalf of the event organizer via EventHub. Please do not reply directly if your mailbox does not accept replies.',
      textGreeting: 'Hello',
      textIntroWithOrganizer: (org, ev) =>
        `${org} has sent a new notification for "${ev}":`,
      textIntroGeneric: (ev) =>
        `You have a new notification from the organizer for "${ev}":`,
      textEventHeader: 'EVENT DETAILS',
      textEventLabel: 'Event',
      textDateLabel: 'Date',
      textTimeLabel: 'Time',
      textLocationLabel: 'Location',
      textContentHeader: 'MESSAGE',
      textAttachmentsHeader: 'ATTACHMENTS',
      textViewEventLabel: 'View Event',
    };
  }

  return {
    htmlLang: 'vi',
    heroBadge: 'THÔNG BÁO TỪ BAN TỔ CHỨC',
    heroHeadline: 'Bạn có thông báo mới!',
    heroSubtitle: 'Đây là cập nhật mới nhất từ Ban tổ chức sự kiện.',
    defaultCustomerName: 'Quý khách',
    greetingPrefix: 'Xin chào',
    introWithOrganizer: (org, ev) =>
      `Ban tổ chức <strong>${escapeHtml(org)}</strong> vừa gửi đến bạn một thông báo mới liên quan đến sự kiện <strong>${escapeHtml(ev)}</strong>. Vui lòng xem chi tiết bên dưới.`,
    introGeneric: (ev) =>
      `Ban tổ chức vừa gửi đến bạn một thông báo mới liên quan đến sự kiện <strong>${escapeHtml(ev)}</strong>. Vui lòng xem chi tiết bên dưới.`,
    eventCardEyebrow: 'THÔNG TIN SỰ KIỆN',
    organizedByLabel: 'Tổ chức bởi',
    dateLabel: 'NGÀY DIỄN RA',
    timeLabel: 'THỜI GIAN',
    locationLabel: 'ĐỊA ĐIỂM',
    onlineVenueTitle: 'Sự kiện trực tuyến (Online)',
    onlineVenueDetail: 'Kiểm tra liên kết tham dự trong mục Vé của tôi trên EventHub.',
    tbdText: 'Đang cập nhật',
    tbdAddressText: 'Địa chỉ chi tiết sẽ được Ban tổ chức cập nhật.',
    messageEyebrow: 'NỘI DUNG THÔNG BÁO',
    fromLabel: 'Người gửi',
    emptyMessage: 'Không có nội dung chi tiết đính kèm.',
    attachedImagesLabel: (count) => `Hình ảnh đính kèm (${count})`,
    attachedFilesLabel: (count) => `Tệp đính kèm (${count})`,
    openImageLabel: 'Xem ảnh gốc',
    downloadFileLabel: 'Xem / Tải tệp',
    ctaLabel: 'Xem chi tiết sự kiện',
    ctaFallbackPrefix: 'Hoặc mở trực tiếp đường dẫn sau:',
    supportPrompt: 'Nếu cần hỗ trợ, vui lòng liên hệ đội ngũ EventHub qua email',
    disclaimer:
      'Đây là email thông báo tự động được gửi qua hệ thống EventHub. Vui lòng không trả lời trực tiếp email này nếu hộp thư không hỗ trợ tiếp nhận phản hồi.',
    textGreeting: 'Xin chào',
    textIntroWithOrganizer: (org, ev) =>
      `Ban tổ chức ${org} vừa gửi đến bạn thông báo mới về sự kiện "${ev}":`,
    textIntroGeneric: (ev) =>
      `Ban tổ chức vừa gửi đến bạn thông báo mới về sự kiện "${ev}":`,
    textEventHeader: 'THÔNG TIN SỰ KIỆN',
    textEventLabel: 'Sự kiện',
    textDateLabel: 'Ngày diễn ra',
    textTimeLabel: 'Thời gian',
    textLocationLabel: 'Địa điểm',
    textContentHeader: 'NỘI DUNG THÔNG BÁO',
    textAttachmentsHeader: 'TỆP ĐÍNH KÈM',
    textViewEventLabel: 'Xem chi tiết sự kiện',
  };
}

function formatEventDateLocalized(dateValue, locale, tbdText) {
  if (!dateValue) return tbdText;
  const dateObj = new Date(dateValue);
  if (Number.isNaN(dateObj.getTime())) return tbdText;

  if (locale === 'en') {
    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(dateObj);
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(dateObj);
    return `${weekday}, ${datePart}`;
  }

  return formatReminderDate(dateObj);
}

function formatEventTimeLocalized(startTime, endTime, tbdText) {
  if (!startTime) return tbdText;
  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) return tbdText;

  const validEnd = endTime && !Number.isNaN(new Date(endTime).getTime()) ? new Date(endTime) : null;
  const formatted = formatReminderTime(startDate, validEnd);
  return formatted && formatted !== 'Chưa cập nhật' ? `${formatted} (GMT+7)` : tbdText;
}

function formatEventLocationData(input = {}, locale, copy) {
  const eventFormat = String(input.eventFormat ?? input.event_format ?? '').trim().toUpperCase();
  const isOnline = Boolean(input.isOnline ?? input.is_online) || eventFormat === 'ONLINE';

  if (isOnline) {
    return {
      title: copy.onlineVenueTitle,
      detail: copy.onlineVenueDetail,
    };
  }

  const venueName = String(input.venueName ?? input.venue_name ?? '').trim();
  const addressLine = String(input.addressLine ?? input.address_line ?? '').trim();
  const ward = String(input.ward ?? '').trim();
  const district = String(input.district ?? '').trim();
  const city = String(input.city ?? '').trim();

  const hasAddress = Boolean(addressLine || ward || district || city);

  if (!venueName && !hasAddress) {
    return {
      title: copy.tbdText,
      detail: copy.tbdAddressText,
    };
  }

  const formattedAddress = hasAddress
    ? formatVenueAddress({
        address_line: addressLine,
        ward,
        district,
        city,
        isOnline: false,
      })
    : copy.tbdAddressText;

  return {
    title: venueName || (locale === 'en' ? 'Event Venue' : 'Địa điểm tổ chức'),
    detail: formattedAddress,
  };
}

function parseAttributes(rawAttrs) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = val;
  }
  return attrs;
}

function sanitizeInlineStyle(rawStyle) {
  if (!rawStyle || typeof rawStyle !== 'string') return '';
  const declarations = rawStyle.split(';');
  const safeParts = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) continue;

    // Normalize Quill background highlight shorthand if needed
    const normalizedProp = prop === 'background' ? 'background-color' : prop;
    if (!ALLOWED_CSS_PROPERTIES.has(normalizedProp)) continue;

    const lowerVal = val.toLowerCase();
    if (
      lowerVal.includes('url(') ||
      lowerVal.includes('expression') ||
      lowerVal.includes('javascript:') ||
      lowerVal.includes('vbscript:') ||
      lowerVal.includes('@import') ||
      lowerVal.includes('<') ||
      lowerVal.includes('>') ||
      lowerVal.includes('{') ||
      lowerVal.includes('}')
    ) {
      continue;
    }

    // Only allow safe color/gradient-free values for background-color
    if (
      normalizedProp === 'background-color' &&
      !/^(#[0-9a-f]{3,8}|rgba?\([^()]+\)|hsla?\([^()]+\)|[a-z]{3,20}|transparent)$/i.test(val)
    ) {
      continue;
    }

    safeParts.push(`${normalizedProp}: ${val}`);
  }

  return safeParts.join('; ');
}

function quillClassesToStyle(classAttr) {
  if (!classAttr || typeof classAttr !== 'string') return '';
  const classes = classAttr.split(/\s+/).filter(Boolean);
  const styles = [];

  for (const cls of classes) {
    if (cls === 'ql-align-center') styles.push('text-align: center');
    else if (cls === 'ql-align-right') styles.push('text-align: right');
    else if (cls === 'ql-align-justify') styles.push('text-align: justify');
    else if (cls === 'ql-size-small') styles.push('font-size: 12.5px');
    else if (cls === 'ql-size-large') styles.push('font-size: 18px');
    else if (cls === 'ql-size-huge') styles.push('font-size: 22px');
    else {
      const indentMatch = /^ql-indent-([1-8])$/.exec(cls);
      if (indentMatch) {
        styles.push(`padding-left: ${Number(indentMatch[1]) * 24}px`);
      }
    }
  }

  return styles.join('; ');
}

function mergeStyles(...styleStrings) {
  const map = new Map();
  for (const raw of styleStrings) {
    if (!raw) continue;
    for (const part of raw.split(';')) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      if (key && val) {
        map.set(key, val);
      }
    }
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function linkifyPlainTextSegment(segment, preserveNewlines) {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(segment)) !== null) {
    const start = match.index;
    let url = match[1];
    let trailing = '';

    // Strip common sentence-ending punctuation from matched bare URL
    while (/[.,;:!?)]$/.test(url)) {
      if (url.endsWith(')') && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) {
        break;
      }
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }

    const before = segment.slice(lastIndex, start);
    result += escapeAndFormatText(before, preserveNewlines);

    if (url) {
      const safeHref = escapeHtml(url);
      result += `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="${DEFAULT_TAG_STYLES.a}">${safeHref}</a>`;
    }
    if (trailing) {
      result += escapeAndFormatText(trailing, preserveNewlines);
    }

    lastIndex = urlRegex.lastIndex;
  }

  result += escapeAndFormatText(segment.slice(lastIndex), preserveNewlines);
  return result;
}

function escapeAndFormatText(text, preserveNewlines) {
  if (!text) return '';
  // Decode already-encoded entities once before escaping cleanly so pre-encoded text won't double-escape
  const cleanText = escapeHtml(decodeHtmlEntities(text));
  if (!preserveNewlines) return cleanText;
  return cleanText.replace(/\r\n|\r|\n/g, '<br />');
}

function formatNotificationMessageHtml(rawContent, { clientUrl } = {}) {
  const input = String(rawContent ?? '').trim();
  if (!input) return '';

  const baseUrl = getClientBaseUrl(clientUrl);
  const hasBlockMarkup = /<(p|div|h[1-4]|ul|ol|li|blockquote|pre|table)\b/i.test(input);

  // Tokenize HTML comments, HTML tags starting with `<letter` or `</letter`, and plain text
  const tokenRegex = /(<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*)?>)/g;
  let output = '';
  let lastIndex = 0;
  let dropDepthTag = null;
  let dropDepth = 0;
  let anchorDepth = 0;
  let preDepth = 0;
  let prevWasBlockBoundary = true;
  let match;

  while ((match = tokenRegex.exec(input)) !== null) {
    const textChunk = input.slice(lastIndex, match.index);
    if (textChunk && dropDepth === 0) {
      if (hasBlockMarkup && prevWasBlockBoundary && /^[\r\n\s]+$/.test(textChunk)) {
        // Ignore formatting whitespace directly between block tags so HTML layout stays crisp
      } else {
        const shouldConvertNewlines = preDepth === 0;
        output +=
          anchorDepth > 0 || preDepth > 0
            ? escapeAndFormatText(textChunk, shouldConvertNewlines)
            : linkifyPlainTextSegment(textChunk, shouldConvertNewlines);
      }
    }

    const token = match[0];
    lastIndex = tokenRegex.lastIndex;

    if (token.startsWith('<!--')) {
      continue;
    }

    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)(\/?)>$/.exec(token);
    if (!tagMatch) continue;

    const isClosing = tagMatch[1] === '/';
    const tagName = tagMatch[2].toLowerCase();
    const rawAttrs = tagMatch[3] || '';
    const isSelfClosing = tagMatch[4] === '/' || VOID_HTML_TAGS.has(tagName);

    // Handle dropped dangerous container blocks (script, style, iframe, svg, etc.)
    if (dropDepth > 0) {
      if (tagName === dropDepthTag) {
        if (isClosing) {
          dropDepth -= 1;
          if (dropDepth === 0) dropDepthTag = null;
        } else if (!isSelfClosing) {
          dropDepth += 1;
        }
      }
      continue;
    }

    if (DROP_WITH_BODY_TAGS.has(tagName)) {
      if (!isClosing && !isSelfClosing) {
        dropDepth = 1;
        dropDepthTag = tagName;
      }
      continue;
    }

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      continue;
    }

    if (isClosing) {
      if (tagName === 'a' && anchorDepth > 0) anchorDepth -= 1;
      if (tagName === 'pre' && preDepth > 0) preDepth -= 1;
      prevWasBlockBoundary = BLOCK_HTML_TAGS.has(tagName);
      if (!VOID_HTML_TAGS.has(tagName)) {
        output += `</${tagName}>`;
      }
      continue;
    }

    prevWasBlockBoundary = BLOCK_HTML_TAGS.has(tagName);
    const attrs = parseAttributes(rawAttrs);
    const mergedStyle = mergeStyles(
      DEFAULT_TAG_STYLES[tagName],
      quillClassesToStyle(attrs.class),
      sanitizeInlineStyle(attrs.style),
    );

    if (tagName === 'a') {
      const safeHref = sanitizeSafeUrl(attrs.href, baseUrl);
      if (!safeHref) {
        // Keep matching </a> balanced while rendering rejected URI schemes as inert text
        anchorDepth += 1;
        output += '<a style="color: #1E293B; text-decoration: none;">';
        continue;
      }
      anchorDepth += 1;
      output += `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer"${mergedStyle ? ` style="${escapeHtml(mergedStyle)}"` : ''}>`;
      continue;
    }

    if (tagName === 'img') {
      const safeSrc = sanitizeSafeUrl(attrs.src, baseUrl, { allowCid: true });
      if (!safeSrc) continue;
      // Do not render SVG files as <img> inside emails
      if (/\.svg(\?|$)/i.test(safeSrc) || /^data:image\/svg/i.test(safeSrc)) continue;
      const safeAlt = escapeHtml(decodeHtmlEntities(attrs.alt || 'Hình ảnh đính kèm'));
      output += `<img src="${escapeHtml(safeSrc)}" alt="${safeAlt}" style="${escapeHtml(mergedStyle)}" />`;
      continue;
    }

    if (tagName === 'pre') {
      preDepth += 1;
    }

    if (VOID_HTML_TAGS.has(tagName)) {
      output += `<${tagName}${mergedStyle ? ` style="${escapeHtml(mergedStyle)}"` : ''} />`;
    } else {
      const extraAttrs = [];
      if (tagName === 'table') {
        extraAttrs.push('cellpadding="0"', 'cellspacing="0"', 'border="0"');
      }
      if ((tagName === 'td' || tagName === 'th') && /^\d+$/.test(attrs.colspan || '')) {
        extraAttrs.push(`colspan="${attrs.colspan}"`);
      }
      if ((tagName === 'td' || tagName === 'th') && /^\d+$/.test(attrs.rowspan || '')) {
        extraAttrs.push(`rowspan="${attrs.rowspan}"`);
      }
      const attrSuffix = extraAttrs.length ? ` ${extraAttrs.join(' ')}` : '';
      output += `<${tagName}${attrSuffix}${mergedStyle ? ` style="${escapeHtml(mergedStyle)}"` : ''}>`;
    }
  }

  // Remaining tail chunk after the final tag
  const tail = input.slice(lastIndex);
  if (tail && dropDepth === 0) {
    const shouldConvertNewlines = preDepth === 0;
    output +=
      anchorDepth > 0 || preDepth > 0
        ? escapeAndFormatText(tail, shouldConvertNewlines)
        : linkifyPlainTextSegment(tail, shouldConvertNewlines);
  }

  return output.trim();
}

function htmlToPlainText(rawContent, { clientUrl } = {}) {
  const input = String(rawContent ?? '').trim();
  if (!input) return '';

  const baseUrl = getClientBaseUrl(clientUrl);

  // Strip dangerous container blocks completely before text extraction
  let text = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Preserve embedded links in readable plain-text format
  text = text.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, rawAttrs, innerHtml) => {
    const attrs = parseAttributes(rawAttrs);
    const safeHref = sanitizeSafeUrl(attrs.href, baseUrl);
    const innerText = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, '')).trim();
    if (!safeHref) return innerText;
    if (!innerText || innerText === safeHref) return safeHref;
    return `${innerText} (${safeHref})`;
  });

  // Preserve embedded images in plain-text view
  text = text.replace(/<img\b([^>]*)>/gi, (_, rawAttrs) => {
    const attrs = parseAttributes(rawAttrs);
    const safeSrc = sanitizeSafeUrl(attrs.src, baseUrl, { allowCid: true });
    if (!safeSrc) return '';
    return `\n[Image: ${safeSrc}]\n`;
  });

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|blockquote|tr|table|ul|ol|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text)
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const value = num / Math.pow(1024, index);
  return `${index === 0 ? value : parseFloat(value.toFixed(1))} ${units[index]}`;
}

function getFileExtension(filename = '', contentType = '') {
  const cleaned = String(filename).split('?')[0].trim();
  const dotIdx = cleaned.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < cleaned.length - 1) {
    return cleaned.slice(dotIdx + 1).toUpperCase().slice(0, 6);
  }
  const type = String(contentType).toLowerCase();
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('wordprocessingml') || type.includes('msword')) return 'DOC';
  if (type.includes('spreadsheetml') || type.includes('excel')) return 'XLS';
  if (type.includes('presentationml') || type.includes('powerpoint')) return 'PPT';
  if (type.includes('zip') || type.includes('rar')) return 'ZIP';
  if (type.startsWith('image/')) return 'IMG';
  return 'FILE';
}

function isPreviewableImageAttachment(att) {
  const contentType = String(att.contentType || '').toLowerCase();
  const filename = String(att.filename || '').toLowerCase();
  const url = String(att.url || '').toLowerCase().split('?')[0];

  if (contentType === 'image/svg+xml' || filename.endsWith('.svg') || url.endsWith('.svg')) {
    return false;
  }
  if (contentType.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(filename) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(url);
}

function normalizeAttachments(attachments, clientBaseUrl) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { images: [], files: [], all: [] };
  }

  const all = [];
  const images = [];
  const files = [];

  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue;
    const rawPath = item.path || item.url || item.secure_url;
    const safeUrl = sanitizeSafeUrl(String(rawPath || ''), clientBaseUrl);
    const rawName = String(item.filename || item.name || 'attachment').trim() || 'attachment';
    if (!safeUrl) continue;

    const normalized = {
      filename: rawName,
      url: safeUrl,
      contentType: item.contentType || item.mimeType || '',
      sizeLabel: formatFileSize(item.size),
      extension: getFileExtension(rawName, item.contentType || item.mimeType),
    };

    all.push(normalized);
    if (isPreviewableImageAttachment(normalized)) {
      images.push(normalized);
    } else {
      files.push(normalized);
    }
  }

  return { images, files, all };
}

function getFileBadgePalette(ext) {
  const upper = String(ext || '').toUpperCase();
  if (upper === 'PDF') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C' };
  if (['DOC', 'DOCX'].includes(upper)) return { bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8' };
  if (['XLS', 'XLSX', 'CSV'].includes(upper)) return { bg: '#DCFCE7', border: '#86EFAC', text: '#15803D' };
  if (['PPT', 'PPTX'].includes(upper)) return { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309' };
  if (['ZIP', 'RAR', '7Z'].includes(upper)) return { bg: '#F3E8FF', border: '#D8B4FE', text: '#7E22CE' };
  return { bg: '#E0F2FE', border: '#7DD3FC', text: '#0369A1' };
}

function renderAttachmentsSection({ images, files }, copy) {
  if (images.length === 0 && files.length === 0) return '';

  const imageBlocks = images
    .map(
      (img) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px; border: 1px solid #D8E6F5; border-radius: 12px; background-color: #FFFFFF; overflow: hidden;">
        <tr>
          <td style="padding: 10px 10px 0 10px; line-height: 0;">
            <a href="${escapeHtml(img.url)}" target="_blank" rel="noopener noreferrer" style="display: block; text-decoration: none;">
              <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.filename)}" style="display: block; width: 100%; max-width: 100%; height: auto; max-height: 360px; object-fit: contain; border-radius: 8px; border: 0; background-color: #F8FAFC;" />
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align: middle; font-size: 13px; font-weight: 600; color: #081126; word-break: break-word;">
                  ${escapeHtml(img.filename)}${img.sizeLabel ? ` <span style="font-weight: 400; color: #64748B;">(${escapeHtml(img.sizeLabel)})</span>` : ''}
                </td>
                <td align="right" style="vertical-align: middle; white-space: nowrap; padding-left: 10px;">
                  <a href="${escapeHtml(img.url)}" target="_blank" rel="noopener noreferrer" style="font-size: 12.5px; font-weight: 700; color: #2B5C92; text-decoration: underline;">
                    ${escapeHtml(copy.openImageLabel)} &rsaquo;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`,
    )
    .join('');

  const fileRows = files
    .map((file, idx) => {
      const badge = getFileBadgePalette(file.extension);
      const divider = idx < files.length - 1 ? 'border-bottom: 1px solid #E2E8F0;' : '';
      return `
      <tr>
        <td style="padding: 10px 0; ${divider}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="48" style="vertical-align: middle; padding-right: 12px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 44px; height: 32px; background-color: ${badge.bg}; border: 1px solid ${badge.border}; border-radius: 8px;">
                  <tr>
                    <td align="center" valign="middle" style="font-size: 10px; font-weight: 800; color: ${badge.text}; letter-spacing: 0.4px;">
                      ${escapeHtml(file.extension)}
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align: middle; word-break: break-word;">
                <a href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer" style="font-size: 13.5px; font-weight: 700; color: #081126; text-decoration: none; word-break: break-word;">
                  ${escapeHtml(file.filename)}
                </a>
                ${
                  file.sizeLabel
                    ? `<div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">${escapeHtml(file.sizeLabel)}</div>`
                    : ''
                }
              </td>
              <td align="right" style="vertical-align: middle; white-space: nowrap; padding-left: 12px;">
                <a href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 6px 12px; background-color: #EFF6FF; border: 1px solid #B3CDE0; border-radius: 8px; font-size: 12px; font-weight: 700; color: #122155; text-decoration: none;">
                  ${escapeHtml(copy.downloadFileLabel)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  return `
    ${
      images.length > 0
        ? `<div style="margin-top: 18px;">
             <div style="font-size: 11px; font-weight: 800; color: #2B5C92; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">
               &#128247; &nbsp;${escapeHtml(copy.attachedImagesLabel(images.length))}
             </div>
             ${imageBlocks}
           </div>`
        : ''
    }
    ${
      files.length > 0
        ? `<div style="margin-top: 18px; background-color: #F8FBFF; border: 1px solid #D8E6F5; border-radius: 12px; padding: 14px 16px;">
             <div style="font-size: 11px; font-weight: 800; color: #2B5C92; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">
               &#128206; &nbsp;${escapeHtml(copy.attachedFilesLabel(files.length))}
             </div>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
               ${fileRows}
             </table>
           </div>`
        : ''
    }
  `;
}

function buildOrganizerAnnouncementHtml(data = {}) {
  const clientBaseUrl = getClientBaseUrl(data.clientUrl);
  const logoSrc = getLogoUrl(clientBaseUrl);

  const locale = detectNotificationLocale({
    locale: data.locale,
    notificationTitle: data.notificationTitle,
    notificationMessage: data.notificationMessage,
  });
  const copy = getLocaleCopy(locale);

  const customerName = String(data.customerName || '').trim() || copy.defaultCustomerName;
  const organizerName = String(data.organizerName || '').trim();
  const eventName =
    String(data.eventName || data.eventTitle || '').trim() ||
    (locale === 'en' ? 'EventHub Event' : 'Sự kiện EventHub');
  const notificationTitle = String(data.notificationTitle || '').trim() || eventName;

  const safeBannerUrl = sanitizeSafeUrl(String(data.eventImage || data.bannerUrl || ''), clientBaseUrl);
  const formattedDate = formatEventDateLocalized(data.eventDate || data.startTime, locale, copy.tbdText);
  const formattedTime =
    data.eventTime && typeof data.eventTime === 'string' && !data.startTime
      ? String(data.eventTime).trim()
      : formatEventTimeLocalized(data.startTime || data.eventDate, data.endTime, copy.tbdText);

  const locationData = data.eventLocation
    ? { title: String(data.eventLocation).trim(), detail: '' }
    : formatEventLocationData(
        {
          venueName: data.venueName,
          addressLine: data.addressLine,
          ward: data.ward,
          district: data.district,
          city: data.city,
          eventFormat: data.eventFormat,
          isOnline: data.isOnline,
        },
        locale,
        copy,
      );

  const formattedMessageHtml =
    formatNotificationMessageHtml(data.notificationMessage, { clientUrl: clientBaseUrl }) ||
    `<p style="${DEFAULT_TAG_STYLES.p}">${escapeHtml(copy.emptyMessage)}</p>`;

  const normalizedAttachments = normalizeAttachments(data.attachments, clientBaseUrl);
  const attachmentsHtml = renderAttachmentsSection(normalizedAttachments, copy);

  const preheaderPlain = htmlToPlainText(data.notificationMessage, { clientUrl: clientBaseUrl })
    .replace(/\s+/g, ' ')
    .slice(0, 140);
  const preheaderText = `${eventName} — ${notificationTitle}${preheaderPlain ? `: ${preheaderPlain}` : ''}`;

  const introHtml = organizerName
    ? copy.introWithOrganizer(organizerName, eventName)
    : copy.introGeneric(eventName);

  const supportHref = `mailto:${SUPPORT_EMAIL}`;
  const currentYear = new Date().getFullYear();

  return `<!doctype html>
<html lang="${copy.htmlLang}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(notificationTitle)} - ${escapeHtml(eventName)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    @media only screen and (max-width: 720px) {
      .eh-wrapper { padding: 10px 6px !important; }
      .eh-card-pad { padding: 20px 16px !important; }
      .eh-hero-pad { padding: 22px 18px 20px !important; }
      .eh-footer-pad { padding: 22px 16px !important; }
      .eh-h1 { font-size: 21px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #EAF1F8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <!-- Preheader -->
  <div style="display: none; font-size: 1px; color: #EAF1F8; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(preheaderText)}
  </div>

  <!-- Outer Canvas -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAF1F8" class="eh-wrapper" style="background-color: #EAF1F8; padding: 22px 10px;">
    <tr>
      <td align="center" valign="top">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="720">
        <tr>
        <td>
        <![endif]-->

        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width: 720px; width: 100%; margin: 0 auto; background-color: #FFFFFF; border-radius: 18px; overflow: hidden; border: 1px solid #D4E3F3; box-shadow: 0 12px 32px rgba(8, 17, 38, 0.10); border-collapse: separate;">

          <!-- A & B. Header + Hero Section (Navy -> Dark Blue -> Secondary Blue) -->
          <tr>
            <td align="center" bgcolor="#081126" class="eh-hero-pad" style="background-color: #081126; background-image: linear-gradient(135deg, #081126 0%, #122155 58%, #2B5C92 100%); padding: 24px 30px 22px; color: #FFFFFF; border-bottom: 3px solid #38BDF8;">
              <!-- Header Brand Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(logoSrc)}" width="142" alt="EventHub" style="display: block; width: 142px; max-width: 100%; height: auto; margin: 0 auto; border: 0;" />
                  </td>
                </tr>
              </table>

              <!-- Hero Generic Headline & Subtitle -->
              <h1 class="eh-h1" style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #FFFFFF; line-height: 1.28; letter-spacing: -0.3px;">
                ${escapeHtml(copy.heroHeadline)}
              </h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #B3CDE0;">
                ${escapeHtml(copy.heroSubtitle)}
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td bgcolor="#FFFFFF" class="eh-card-pad" style="background-color: #FFFFFF; padding: 28px 30px 26px;">

              <!-- C. Greeting Section -->
              <div style="margin-bottom: 22px;">
                <p style="margin: 0 0 8px 0; font-size: 17px; font-weight: 800; color: #081126; line-height: 1.4;">
                  ${escapeHtml(copy.greetingPrefix)} ${escapeHtml(customerName)},
                </p>
                <p style="margin: 0; font-size: 14.5px; line-height: 1.65; color: #334155;">
                  ${introHtml}
                </p>
              </div>

              <!-- D. Notification Content Section (Primary Focus) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="margin-bottom: 24px; background-color: #FFFFFF; border: 1px solid #C8DCF0; border-left: 4px solid #2B5C92; border-radius: 12px; box-shadow: 0 4px 16px rgba(18, 33, 85, 0.05);">
                <tr>
                  <td style="padding: 20px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 8px;">
                      <tr>
                        <td style="font-size: 11px; font-weight: 800; letter-spacing: 0.9px; color: #2B5C92; text-transform: uppercase;">
                          ${escapeHtml(copy.messageEyebrow)}
                        </td>
                        ${
                          organizerName
                            ? `<td align="right" style="font-size: 12px; color: #64748B;">
                                 ${escapeHtml(copy.fromLabel)}: <strong style="color: #122155;">${escapeHtml(organizerName)}</strong>
                               </td>`
                            : ''
                        }
                      </tr>
                    </table>

                    <h3 style="margin: 0 0 12px 0; font-size: 19px; font-weight: 800; color: #081126; line-height: 1.38; overflow-wrap: anywhere; word-break: break-word;">
                      ${escapeHtml(notificationTitle)}
                    </h3>

                    <div style="height: 1px; background-color: #E2E8F0; margin-bottom: 14px; line-height: 1px; font-size: 1px;">&nbsp;</div>

                    <div style="font-size: 15px; line-height: 1.7; color: #1E293B; overflow-wrap: anywhere; word-break: break-word;">
                      ${formattedMessageHtml}
                    </div>

                    ${attachmentsHtml}
                  </td>
                </tr>
              </table>

              <!-- E. Event Information Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F9FF" style="margin-bottom: 4px; background-color: #F5F9FF; background-image: linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%); border: 1px solid #C8DCF0; border-radius: 14px; overflow: hidden;">
                ${
                  safeBannerUrl
                    ? `<tr>
                         <td style="padding: 0; line-height: 0; background-color: #081126;">
                           <img src="${escapeHtml(safeBannerUrl)}" alt="${escapeHtml(eventName)}" width="658" style="display: block; width: 100%; max-width: 100%; max-height: 240px; object-fit: cover; border: 0;" />
                         </td>
                       </tr>`
                    : ''
                }
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 10.5px; font-weight: 800; letter-spacing: 1px; color: #2B5C92; text-transform: uppercase; margin-bottom: 6px;">
                      ${escapeHtml(copy.eventCardEyebrow)}
                    </div>
                    <h2 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: #081126; line-height: 1.35; word-break: break-word;">
                      ${escapeHtml(eventName)}
                    </h2>
                    ${
                      organizerName
                        ? `<div style="margin-bottom: 14px; font-size: 13px; color: #475569;">
                             ${escapeHtml(copy.organizedByLabel)}: <strong style="color: #122155;">${escapeHtml(organizerName)}</strong>
                           </div>`
                        : '<div style="margin-bottom: 12px;"></div>'
                    }

                    <!-- Event Details Table -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #DCEAF7;">
                      <!-- Event Date -->
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E8F0F8;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="38" style="vertical-align: top; padding-right: 12px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="34" height="34" bgcolor="#E0F2FE" style="width: 34px; height: 34px; border-radius: 9px; background-color: #E0F2FE; border: 1px solid #B3CDE0;">
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="${EMAIL_ICONS.calendar}" width="18" height="18" alt="" style="display: block; width: 18px; height: 18px; border: 0;" />
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-size: 10.5px; font-weight: 800; color: #2B5C92; letter-spacing: 0.6px; text-transform: uppercase;">
                                  ${escapeHtml(copy.dateLabel)}
                                </div>
                                <div style="font-size: 14px; font-weight: 700; color: #081126; margin-top: 2px;">
                                  ${escapeHtml(formattedDate)}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Event Time -->
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E8F0F8;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="38" style="vertical-align: top; padding-right: 12px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="34" height="34" bgcolor="#E0F2FE" style="width: 34px; height: 34px; border-radius: 9px; background-color: #E0F2FE; border: 1px solid #B3CDE0;">
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="${EMAIL_ICONS.clock}" width="18" height="18" alt="" style="display: block; width: 18px; height: 18px; border: 0;" />
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-size: 10.5px; font-weight: 800; color: #2B5C92; letter-spacing: 0.6px; text-transform: uppercase;">
                                  ${escapeHtml(copy.timeLabel)}
                                </div>
                                <div style="font-size: 14px; font-weight: 700; color: #081126; margin-top: 2px;">
                                  ${escapeHtml(formattedTime)}
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Event Location -->
                      <tr>
                        <td style="padding: 10px 0 2px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="38" style="vertical-align: top; padding-right: 12px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="34" height="34" bgcolor="#E0F2FE" style="width: 34px; height: 34px; border-radius: 9px; background-color: #E0F2FE; border: 1px solid #B3CDE0;">
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="${EMAIL_ICONS.mapPin}" width="18" height="18" alt="" style="display: block; width: 18px; height: 18px; border: 0;" />
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td style="vertical-align: middle;">
                                <div style="font-size: 10.5px; font-weight: 800; color: #2B5C92; letter-spacing: 0.6px; text-transform: uppercase;">
                                  ${escapeHtml(copy.locationLabel)}
                                </div>
                                <div style="font-size: 14px; font-weight: 700; color: #081126; margin-top: 2px; word-break: break-word;">
                                  ${escapeHtml(locationData.title)}
                                </div>
                                ${
                                  locationData.detail
                                    ? `<div style="font-size: 13px; color: #475569; margin-top: 2px; line-height: 1.45; word-break: break-word;">
                                         ${escapeHtml(locationData.detail)}
                                       </div>`
                                    : ''
                                }
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="#081126" class="eh-footer-pad" style="background-color: #081126; background-image: linear-gradient(180deg, #081126 0%, #122155 100%); padding: 26px 30px; color: #B3CDE0; text-align: center; border-top: 2px solid #2B5C92;">
              <img src="${escapeHtml(logoSrc)}" width="112" alt="EventHub" style="display: block; width: 112px; max-width: 100%; height: auto; margin: 0 auto 12px; border: 0;" />
              <p style="margin: 0 0 8px 0; font-size: 12.5px; color: #B3CDE0; line-height: 1.55;">
                ${escapeHtml(copy.supportPrompt)}
                <a href="${supportHref}" style="color: #38BDF8; text-decoration: underline; font-weight: 600;">${SUPPORT_EMAIL}</a>
              </p>
              <p style="margin: 0 0 10px 0; font-size: 11.5px; color: #94A3B8; line-height: 1.5;">
                ${escapeHtml(copy.disclaimer)}
              </p>
              <div style="font-size: 11.5px; color: #B3CDE0;">
                <a href="${escapeHtml(clientBaseUrl)}" target="_blank" rel="noopener noreferrer" style="color: #B3CDE0; text-decoration: none;">www.eventhub.id.vn</a>
                &nbsp;&bull;&nbsp;
                &copy; ${currentYear} EventHub. All rights reserved.
              </div>
            </td>
          </tr>

        </table>

        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOrganizerAnnouncementText(data = {}) {
  const clientBaseUrl = getClientBaseUrl(data.clientUrl);
  const locale = detectNotificationLocale({
    locale: data.locale,
    notificationTitle: data.notificationTitle,
    notificationMessage: data.notificationMessage,
  });
  const copy = getLocaleCopy(locale);

  const customerName = String(data.customerName || '').trim() || copy.defaultCustomerName;
  const organizerName = String(data.organizerName || '').trim();
  const eventName =
    String(data.eventName || data.eventTitle || '').trim() ||
    (locale === 'en' ? 'EventHub Event' : 'Sự kiện EventHub');
  const notificationTitle = String(data.notificationTitle || '').trim() || eventName;

  const formattedDate = formatEventDateLocalized(data.eventDate || data.startTime, locale, copy.tbdText);
  const formattedTime =
    data.eventTime && typeof data.eventTime === 'string' && !data.startTime
      ? String(data.eventTime).trim()
      : formatEventTimeLocalized(data.startTime || data.eventDate, data.endTime, copy.tbdText);

  const locationData = data.eventLocation
    ? { title: String(data.eventLocation).trim(), detail: '' }
    : formatEventLocationData(
        {
          venueName: data.venueName,
          addressLine: data.addressLine,
          ward: data.ward,
          district: data.district,
          city: data.city,
          eventFormat: data.eventFormat,
          isOnline: data.isOnline,
        },
        locale,
        copy,
      );

  const plainMessage =
    htmlToPlainText(data.notificationMessage, { clientUrl: clientBaseUrl }) || copy.emptyMessage;

  const { all: attachments } = normalizeAttachments(data.attachments, clientBaseUrl);
  const attachmentsBlock =
    attachments.length > 0
      ? `\n\n${copy.textAttachmentsHeader}:\n${attachments
          .map((att) => `- ${att.filename}${att.sizeLabel ? ` (${att.sizeLabel})` : ''}: ${att.url}`)
          .join('\n')}`
      : '';

  const introLine = organizerName
    ? copy.textIntroWithOrganizer(organizerName, eventName)
    : copy.textIntroGeneric(eventName);

  const locationLine = locationData.detail
    ? `${locationData.title} — ${locationData.detail}`
    : locationData.title;

  return `[EventHub] ${notificationTitle}

${copy.textGreeting} ${customerName},

${introLine}

--- ${copy.textContentHeader} ---
${notificationTitle}

${plainMessage}${attachmentsBlock}

--- ${copy.textEventHeader} ---
${copy.textEventLabel}: ${eventName}
${copy.textDateLabel}: ${formattedDate}
${copy.textTimeLabel}: ${formattedTime}
${copy.textLocationLabel}: ${locationLine}

--
EventHub
Support: ${SUPPORT_EMAIL}
${copy.disclaimer}
`;
}

module.exports = {
  TAGLINE,
  SUPPORT_EMAIL,
  escapeHtml,
  sanitizeSafeUrl,
  buildEventUrl,
  detectNotificationLocale,
  extractInlineDataImages,
  formatNotificationMessageHtml,
  htmlToPlainText,
  normalizeAttachments,
  buildOrganizerAnnouncementHtml,
  buildOrganizerAnnouncementText,
};
