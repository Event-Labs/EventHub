const fs = require('fs');
const path = require('path');

let cachedLogoDataUrl = null;

function getBackendLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const logoPath = path.resolve(__dirname, '../../assets/eventhub-logo.png');
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      cachedLogoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      return cachedLogoDataUrl;
    }
  } catch {
    // fallback to empty if missing
  }
  return '';
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTicketDateTime(startTime, endTime) {
  if (!startTime) return 'N/A';
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
    const endHours = pad(end.getHours());
    const endMinutes = pad(end.getMinutes());
    result += ` - ${endHours}:${endMinutes}`;
  }
  return result;
}

function formatCategory(category, isEn = false) {
  if (!category) return isEn ? 'EVENT' : 'SỰ KIỆN';
  const raw = String(category).trim().toUpperCase();
  const mapEn = {
    'WORKSHOP': 'WORKSHOP',
    'CONCERT': 'CONCERT',
    'CONFERENCE': 'CONFERENCE',
    'EXHIBITION': 'EXHIBITION',
    'NETWORKING': 'NETWORKING',
    'SEMINAR': 'SEMINAR',
    'FESTIVAL': 'FESTIVAL',
    'TALKSHOW': 'TALKSHOW',
    'MUSIC': 'MUSIC',
    'SPORTS': 'SPORTS',
    'THEATER': 'THEATER',
    'EVENT': 'EVENT',
  };
  const mapVi = {
    'WORKSHOP': 'HỘI THẢO',
    'CONCERT': 'HÒA NHẠC',
    'CONFERENCE': 'HỘI NGHỊ',
    'EXHIBITION': 'TRIỂN LÃM',
    'NETWORKING': 'GIAO LƯU',
    'SEMINAR': 'CHUYÊN ĐỀ',
    'FESTIVAL': 'LỄ HỘI',
    'TALKSHOW': 'TALKSHOW',
    'MUSIC': 'ÂM NHẠC',
    'SPORTS': 'THỂ THAO',
    'THEATER': 'KỊCH NGHỆ',
    'EVENT': 'SỰ KIỆN',
  };
  if (isEn && mapEn[raw]) return mapEn[raw];
  if (!isEn && mapVi[raw]) return mapVi[raw];
  return raw;
}

function formatSeatLabel(seat, isEn = false) {
  if (!seat) return isEn ? 'GENERAL ADMISSION' : 'VÉ TỰ DO';
  const label = (typeof seat === 'object' ? seat.label : seat) || '';
  const trimmed = String(label).trim().toUpperCase();
  if (!trimmed || trimmed === 'GENERAL ADMISSION' || trimmed === 'NO FIXED SEAT' || trimmed === 'KHÔNG CÓ GHẾ CỐ ĐỊNH' || trimmed.includes('VÉ TỰ DO')) {
    return isEn ? 'GENERAL ADMISSION' : 'VÉ TỰ DO';
  }
  return trimmed;
}

function wrapEventTitle(title, maxCharsPerLine = 30) {
  const clean = String(title || 'EVENT TICKET').trim().replace(/\s+/g, ' ');
  if (clean.length <= maxCharsPerLine) {
    return { lines: [clean], fontSize: 42 };
  }
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxCharsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === 2) break;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  if (lines.length > 2) {
    lines.length = 2;
    if (!lines[1].endsWith('...')) lines[1] += '...';
  }
  return { lines, fontSize: 34 };
}

function wrapVenueAddress(address, maxChars = 125) {
  if (!address) return [''];
  const clean = String(address).trim().replace(/\s+/g, ' ');
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === 2) break;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  if (lines.length > 2) lines.length = 2;
  if (lines[1] && lines[1].length > maxChars) {
    lines[1] = lines[1].slice(0, maxChars - 3) + '...';
  }
  return lines;
}

function generateStars() {
  const coords = [
    [120, 80, 1.6, 0.45], [320, 125, 2.2, 0.65], [510, 70, 1.4, 0.50], [820, 110, 2.0, 0.55],
    [1040, 60, 2.4, 0.70], [220, 230, 1.4, 0.40], [440, 260, 1.6, 0.35], [750, 240, 2.2, 0.50],
    [980, 220, 1.5, 0.40], [1130, 160, 2.0, 0.60], [160, 360, 1.6, 0.35], [420, 440, 1.4, 0.40],
    [880, 420, 1.8, 0.45], [1090, 450, 2.2, 0.55], [200, 580, 1.5, 0.50], [380, 620, 2.0, 0.60],
    [760, 590, 1.6, 0.40], [940, 630, 2.4, 0.70], [1120, 610, 1.5, 0.50], [1280, 80, 1.6, 0.50],
    [1520, 70, 2.2, 0.60], [1250, 320, 1.4, 0.40], [1540, 310, 1.8, 0.50], [1260, 530, 2.2, 0.60],
    [1530, 540, 1.5, 0.40], [1330, 650, 1.8, 0.50], [1510, 660, 2.0, 0.60],
  ];
  return coords
    .map(([cx, cy, r, op]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" fill-opacity="${op}"/>`)
    .join('');
}

function buildUniversalTicketSvg(ticket, qrDataUrl = '', logoDataUrl = '', optionsOrLocale = {}) {
  const locale = (typeof optionsOrLocale === 'string' ? optionsOrLocale : optionsOrLocale?.locale) || ticket?.locale || ticket?.order?.locale || 'vi';
  const isEn = String(locale).toLowerCase() === 'en';

  const labels = {
    badge: isEn ? 'E-TICKET' : 'VÉ ĐIỆN TỬ',
    attendee: isEn ? 'ATTENDEE' : 'NGƯỜI THAM DỰ',
    ticketType: isEn ? 'TICKET TYPE' : 'LOẠI VÉ',
    seat: isEn ? 'SEAT' : 'GHẾ NGỒI',
    dateTime: isEn ? 'DATE & TIME' : 'THỜI GIAN',
    venue: isEn ? 'VENUE' : 'ĐỊA ĐIỂM',
    notice: isEn ? 'PLEASE PRESENT THIS TICKET AT THE ENTRANCE' : 'VUI LÒNG XUẤT TRÌNH VÉ TẠI CỔNG VÀO',
    scanQr: isEn ? 'SCAN THIS QR CODE' : 'QUÉT MÃ QR',
    defaultAttendee: isEn ? 'Attendee' : 'Khách tham dự',
    defaultTitle: isEn ? 'EVENTHUB TICKET' : 'SỰ KIỆN EVENTHUB',
    statusValid: isEn ? 'VALID TICKET' : 'VÉ HỢP LỆ',
    statusUsed: isEn ? 'CHECKED IN' : 'ĐÃ CHECK-IN',
    statusCancelled: isEn ? 'CANCELLED' : 'VÉ ĐÃ HỦY',
    statusPending: isEn ? 'REFUND PENDING' : 'CHỜ HOÀN TIỀN',
    statusExpired: isEn ? 'EXPIRED' : 'HẾT HẠN',
  };

  const event = ticket.event || {};
  const session = ticket.session || {};
  const venue = ticket.venue || {};
  const order = ticket.order || {};
  const ticketType = ticket.ticket_type || {};

  const resolvedLogoUrl = logoDataUrl || getBackendLogoDataUrl();
  const category = formatCategory(event.category?.name || event.category || event.category_name || event.event_type || 'EVENT', isEn);
  const title = event.title || labels.defaultTitle;
  const tagline = event.tagline || event.short_description || event.summary || '';
  const dateTimeStr = formatTicketDateTime(session.start_time, session.end_time);
  const ticketTypeName = (ticketType.name || 'STANDARD').toUpperCase();
  const attendeeName = (event.require_attendee_info ? ticket.attendee_name : null) || ticket.attendee_name || order.buyer_name || labels.defaultAttendee;
  const seatLabel = formatSeatLabel(ticket.seat, isEn);
  const venueName = venue.name || 'N/A';
  const addressParts = [venue.address_line, venue.ward, venue.district, venue.city].filter(Boolean);
  const venueAddress = addressParts.join(', ') || (isEn ? 'Event Venue' : 'Địa điểm tổ chức sự kiện');
  const ticketCode = ticket.ticket_code || 'EH-0000000000';
  const formattedTicketCode = ticketCode.startsWith('#') ? ticketCode : `#${ticketCode}`;
  const status = String(ticket.status || 'VALID').toUpperCase();

  const { lines: titleLines, fontSize: titleSize } = wrapEventTitle(title);
  const hasTwoTitleLines = titleLines.length > 1;
  const titleLineHeight = titleSize + 10;

  const addressLines = wrapVenueAddress(venueAddress, 125);
  const hasTwoAddressLines = addressLines.length > 1;

  let statusBg = '#DCFCE7';
  let statusBorder = '#86EFAC';
  let statusColor = '#15803D';
  let statusText = labels.statusValid;
  let statusType = 'VALID';

  if (status === 'USED' || ticket.checked_in_at) {
    statusBg = '#F1F5F9';
    statusBorder = '#CBD5E1';
    statusColor = '#334155';
    statusText = labels.statusUsed;
    statusType = 'USED';
  } else if (status === 'CANCELLED' || status === 'REFUNDED') {
    statusBg = '#FEE2E2';
    statusBorder = '#FCA5A5';
    statusColor = '#DC2626';
    statusText = labels.statusCancelled;
    statusType = 'CANCELLED';
  } else if (status === 'REFUND_PENDING' || status === 'REFUND_REQUESTED') {
    statusBg = '#FEF3C7';
    statusBorder = '#FCD34D';
    statusColor = '#B45309';
    statusText = labels.statusPending;
    statusType = 'PENDING';
  } else if (status === 'EXPIRED') {
    statusBg = '#F1F5F9';
    statusBorder = '#CBD5E1';
    statusColor = '#64748B';
    statusText = labels.statusExpired;
    statusType = 'EXPIRED';
  }

  const isInvalid = status !== 'VALID';

  // Outer ticket silhouette with corner notches and divider cutouts
  const outerPath = 'M 34 10 H 1180 A 20 20 0 0 0 1220 10 H 1566 A 24 24 0 0 0 1590 34 V 666 A 24 24 0 0 0 1566 690 H 1220 A 20 20 0 0 0 1180 690 H 34 A 24 24 0 0 0 10 666 V 34 A 24 24 0 0 0 34 10 Z';
  // Parallel inner border offset by 8px
  const innerPath = 'M 40 18 H 1186 A 14 14 0 0 0 1214 18 H 1560 A 18 18 0 0 0 1582 40 V 660 A 18 18 0 0 0 1560 682 H 1214 A 14 14 0 0 0 1186 682 H 40 A 18 18 0 0 0 18 660 V 40 A 18 18 0 0 0 40 18 Z';

  const titleStartY = hasTwoTitleLines ? 158 : 176;
  const taglineY = hasTwoTitleLines ? 240 : 218;
  const sepY = tagline ? (hasTwoTitleLines ? 258 : 246) : (hasTwoTitleLines ? 250 : 228);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid meet">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=Montserrat:wght@500;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;family=Lora:ital,wght@1,400;1,500;1,600&amp;display=swap');
      .font-display { font-family: 'Playfair Display', 'Be Vietnam Pro', Georgia, serif; }
      .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .font-heading { font-family: 'Montserrat', 'Inter', 'Segoe UI', Arial, sans-serif; }
      .font-tagline { font-family: 'Lora', 'Georgia', serif; font-style: italic; }
      .font-mono { font-family: 'Inter', Cascadia Mono, Consolas, monospace; }
    </style>
    <filter id="ticketShadow" x="-5%" y="-10%" width="110%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <filter id="badgeGlow" x="-25%" y="-35%" width="150%" height="170%">
      <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#E6C17A" flood-opacity="0.45"/>
    </filter>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#081525"/>
      <stop offset="35%" stop-color="#0D1B2A"/>
      <stop offset="70%" stop-color="#13263A"/>
      <stop offset="100%" stop-color="#1B365D"/>
    </linearGradient>
    <radialGradient id="nebulaBlue" cx="28%" cy="28%" r="48%">
      <stop offset="0%" stop-color="#1B365D" stop-opacity="0.45"/>
      <stop offset="55%" stop-color="#0D1B2A" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0D1B2A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebulaGold" cx="62%" cy="65%" r="45%">
      <stop offset="0%" stop-color="#C99A47" stop-opacity="0.10"/>
      <stop offset="60%" stop-color="#13263A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="stubGlow" cx="88%" cy="50%" r="45%">
      <stop offset="0%" stop-color="#1B365D" stop-opacity="0.40"/>
      <stop offset="100%" stop-color="#081525" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="35%" stop-color="#F5EBDD"/>
      <stop offset="75%" stop-color="#E6C17A"/>
      <stop offset="100%" stop-color="#C99A47"/>
    </linearGradient>
    <linearGradient id="badgeDynamicBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="25%" stop-color="#1B365D"/>
      <stop offset="50%" stop-color="#0D223F"/>
      <stop offset="75%" stop-color="#234E8A"/>
      <stop offset="100%" stop-color="#081525"/>
    </linearGradient>
    <radialGradient id="badgeRadialGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.40"/>
      <stop offset="45%" stop-color="#1D4ED8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#0D1B2A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="badgeLightSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.02"/>
      <stop offset="25%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="50%" stop-color="#FDE047" stop-opacity="0.32"/>
      <stop offset="75%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="badgeGoldBorder" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#C99A47"/>
      <stop offset="25%" stop-color="#FFF0B3"/>
      <stop offset="50%" stop-color="#E6C17A"/>
      <stop offset="75%" stop-color="#FFF0B3"/>
      <stop offset="100%" stop-color="#C99A47"/>
    </linearGradient>
    <clipPath id="ticketClip">
      <path d="${outerPath}"/>
    </clipPath>
  </defs>

  <!-- Ticket Body with Outer Path and Soft Drop Shadow -->
  <path d="${outerPath}" fill="url(#bgGradient)" filter="url(#ticketShadow)"/>

  <!-- Ticket Content Clipped to Ticket Shape -->
  <g clip-path="url(#ticketClip)">
    <!-- Nebula Ambient Glows -->
    <rect x="0" y="0" width="1600" height="700" fill="url(#nebulaBlue)"/>
    <rect x="0" y="0" width="1600" height="700" fill="url(#nebulaGold)"/>
    <rect x="0" y="0" width="1600" height="700" fill="url(#stubGlow)"/>

    <!-- Celestial Orbital Rings behind Title -->
    <ellipse cx="580" cy="205" rx="370" ry="54" transform="rotate(-6 580 205)" fill="none" stroke="#E6C17A" stroke-width="1.2" stroke-opacity="0.22" stroke-dasharray="8 6"/>
    <!-- Orbit Sparkle -->
    <g transform="translate(935, 185) scale(0.85)">
      <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A" fill-opacity="0.8"/>
    </g>

    <!-- Star Field -->
    ${generateStars()}

    <!-- Decorative Gold Corner Sparkles -->
    <g transform="translate(1120, 65) scale(0.75)">
      <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A" fill-opacity="0.6"/>
    </g>
    <g transform="translate(70, 595) scale(0.7)">
      <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A" fill-opacity="0.5"/>
    </g>

    <!-- Inner Gold Border -->
    <path d="${innerPath}" fill="none" stroke="#E6C17A" stroke-width="1.2" stroke-opacity="0.55"/>

    <!-- ==================== MAIN TICKET (LEFT 75%) ==================== -->

    <!-- Header Left: Real System Logo + Divider + Brand Tagline -->
    ${resolvedLogoUrl ? `<image href="${resolvedLogoUrl}" x="55" y="40" width="140" height="56" preserveAspectRatio="xMidYMid meet"/>` : `<text x="55" y="74" fill="#E6C17A" class="font-heading" font-size="26" font-weight="800" letter-spacing="3">EVENTHUB</text>`}
    <line x1="210" y1="46" x2="210" y2="90" stroke="#C99A47" stroke-width="1.6" stroke-opacity="0.55"/>
    <text x="230" y="73" fill="#E6C17A" class="font-heading" font-size="13" font-weight="700" letter-spacing="3">CONNECT &#183; EXPERIENCE &#183; GROW</text>

    <!-- Header Right: E-Ticket Badge with dynamic glow -->
    <g transform="translate(825, 42)">
      <!-- Dynamic glowing background -->
      <rect x="0" y="0" width="320" height="48" rx="24" fill="url(#badgeDynamicBg)" stroke="url(#badgeGoldBorder)" stroke-width="1.8" filter="url(#badgeGlow)"/>
      <rect x="2" y="2" width="316" height="44" rx="22" fill="url(#badgeRadialGlow)"/>
      <rect x="2" y="2" width="316" height="44" rx="22" fill="url(#badgeLightSheen)"/>
      <path d="M 24 5 H 296" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="1.2" stroke-linecap="round"/>
      <!-- Left Sparkle -->
      <g transform="translate(24, 24) scale(0.85)">
        <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A"/>
        <circle cx="0" cy="0" r="2.2" fill="#FFFFFF"/>
      </g>
      <!-- Luminous Badge Text -->
      <text x="160" y="30" fill="#FFFBEB" class="font-heading" font-size="14.5" font-weight="800" letter-spacing="1.8" text-anchor="middle">
        ${escapeXml(labels.badge)}
      </text>
      <!-- Right Sparkle -->
      <g transform="translate(296, 24) scale(0.85)">
        <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A"/>
        <circle cx="0" cy="0" r="2.2" fill="#FFFFFF"/>
      </g>
    </g>

    <!-- Event Name (Cấp 1 – nổi bật nhất, auto-scaled, max 2 lines) -->
    <text x="55" y="${titleStartY}" fill="url(#goldGradient)" class="font-display" font-size="${titleSize}" font-weight="800" letter-spacing="0.6">
      ${titleLines.map((line, i) => `<tspan x="55" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`).join('')}
    </text>

    <!-- Event Tagline -->
    ${tagline ? `<text x="55" y="${taglineY}" fill="#F5EBDD" class="font-tagline" font-size="17" font-weight="500" fill-opacity="0.95">${escapeXml(tagline)}</text>` : ''}

    <!-- Subtle Divider Line with Diamond -->
    <line x1="55" y1="${sepY}" x2="1145" y2="${sepY}" stroke="#C99A47" stroke-width="1.2" stroke-opacity="0.25"/>
    <circle cx="600" cy="${sepY}" r="3" fill="#E6C17A" fill-opacity="0.8"/>

    <!-- ==================== TICKET INFORMATION CARDS (HIERARCHY SPECIFICATION) ==================== -->

    <!-- Row 1: Attendee, Ticket Type & Seat -->
    <!-- Card 1: ATTENDEE -->
    <rect x="55" y="286" width="350" height="98" rx="14" fill="#102035" fill-opacity="0.8" stroke="#C99A47" stroke-opacity="0.45" stroke-width="1.3"/>
    <text x="75" y="313" fill="#AAB8C8" class="font-sans" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(labels.attendee)}</text>
    <text x="75" y="356" fill="#FFFFFF" class="font-sans" font-size="20" font-weight="700">${escapeXml(attendeeName)}</text>

    <!-- Card 2: TICKET TYPE -->
    <rect x="425" y="286" width="350" height="98" rx="14" fill="#102035" fill-opacity="0.8" stroke="#C99A47" stroke-opacity="0.45" stroke-width="1.3"/>
    <text x="445" y="313" fill="#AAB8C8" class="font-sans" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(labels.ticketType)}</text>
    <text x="445" y="356" fill="#E6C17A" class="font-sans" font-size="20" font-weight="800">${escapeXml(ticketTypeName)}</text>

    <!-- Card 3: SEAT -->
    <rect x="795" y="286" width="350" height="98" rx="14" fill="#102035" fill-opacity="0.8" stroke="#C99A47" stroke-opacity="0.45" stroke-width="1.3"/>
    <text x="815" y="313" fill="#AAB8C8" class="font-sans" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(labels.seat)}</text>
    <text x="815" y="356" fill="#FFFFFF" class="font-sans" font-size="18.5" font-weight="700">${escapeXml(seatLabel)}</text>

    <!-- Row 2: DATE & TIME -->
    <rect x="55" y="398" width="1090" height="74" rx="14" fill="#102035" fill-opacity="0.8" stroke="#C99A47" stroke-opacity="0.45" stroke-width="1.2"/>
    <text x="75" y="422" fill="#AAB8C8" class="font-sans" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(labels.dateTime)}</text>
    <text x="75" y="454" fill="#FFFFFF" class="font-sans" font-size="20" font-weight="700">${escapeXml(dateTimeStr)}</text>

    <!-- Row 3: VENUE -->
    <rect x="55" y="486" width="1090" height="102" rx="14" fill="#102035" fill-opacity="0.8" stroke="#C99A47" stroke-opacity="0.45" stroke-width="1.3"/>
    <text x="75" y="512" fill="#AAB8C8" class="font-sans" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(labels.venue)}</text>
    <text x="75" y="544" fill="#FFFFFF" class="font-sans" font-size="20" font-weight="700">${escapeXml(venueName)}</text>
    ${hasTwoAddressLines
      ? `<text x="75" y="564" fill="#CBD5E1" class="font-sans" font-size="13.5" font-weight="400">
          <tspan x="75" dy="0">${escapeXml(addressLines[0])}</tspan>
          <tspan x="75" dy="18">${escapeXml(addressLines[1])}</tspan>
        </text>`
      : `<text x="75" y="568" fill="#CBD5E1" class="font-sans" font-size="13.5" font-weight="400">${escapeXml(venueAddress)}</text>`}

    <!-- Footer: Please present this ticket at the entrance -->
    <g transform="translate(55, 626) scale(1.05)">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#AAB8C8" stroke-width="2"/>
      <line x1="12" y1="16" x2="12" y2="12" stroke="#AAB8C8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="8" r="1" fill="#AAB8C8"/>
    </g>
    <text x="86" y="642" fill="#CBD5E1" class="font-sans" font-size="14" font-weight="700" letter-spacing="1.2">
      ${escapeXml(labels.notice)}
    </text>

    <!-- ==================== TICKET DIVIDER ==================== -->
    <line x1="1200" y1="36" x2="1200" y2="664" stroke="#E6C17A" stroke-width="1.8" stroke-dasharray="7 9" stroke-opacity="0.65"/>

    <!-- ==================== TICKET STUB (RIGHT 25%) ==================== -->

    <!-- Check-in Heading -->
    <line x1="1260" y1="114" x2="1315" y2="114" stroke="#C99A47" stroke-width="1.6" stroke-opacity="0.6"/>
    <text x="1400" y="120" fill="#E6C17A" class="font-heading" font-size="19" font-weight="800" letter-spacing="3" text-anchor="middle">CHECK-IN</text>
    <line x1="1485" y1="114" x2="1540" y2="114" stroke="#C99A47" stroke-width="1.6" stroke-opacity="0.6"/>
    <text x="1400" y="148" fill="#CBD5E1" class="font-heading" font-size="13.5" font-weight="700" letter-spacing="1.6" text-anchor="middle">
      ${escapeXml(labels.scanQr)}
    </text>

    <!-- QR Code Container & Dynamic QR Image -->
    <rect x="1278" y="180" width="244" height="244" rx="18" fill="#FFFFFF" stroke="#C99A47" stroke-width="2"/>
    ${qrDataUrl ? `<image x="1290" y="192" width="220" height="220" href="${escapeXml(qrDataUrl)}" preserveAspectRatio="xMidYMid meet"/>` : ''}

    <!-- Ticket ID Pill -->
    <rect x="1275" y="446" width="250" height="48" rx="24" fill="#102035" fill-opacity="0.95" stroke="#E6C17A" stroke-width="1.5" stroke-opacity="0.85"/>
    <text x="1400" y="476" fill="#E6C17A" class="font-mono" font-size="16.5" font-weight="700" letter-spacing="1.8" text-anchor="middle">
      ${escapeXml(formattedTicketCode)}
    </text>

    <!-- Ticket Status Pill -->
    <rect x="1275" y="510" width="250" height="48" rx="24" fill="${statusBg}" stroke="${statusBorder}" stroke-width="1.5"/>
    ${statusType === 'VALID' ? `
      <g transform="translate(1336, 523)">
        <circle cx="11" cy="11" r="9" fill="none" stroke="#16A34A" stroke-width="2.2"/>
        <path d="M 6.5 11 L 9.5 14 L 15.5 8" fill="none" stroke="#16A34A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="1368" y="540" fill="${statusColor}" class="font-sans" font-size="16" font-weight="800" letter-spacing="1.2">${statusText}</text>
    ` : statusType === 'USED' ? `
      <g transform="translate(1332, 523)">
        <path d="M 4 11 L 7.5 14.5 L 14 7" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 9 11 L 12.5 14.5 L 19 7" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="1362" y="540" fill="${statusColor}" class="font-sans" font-size="16" font-weight="800" letter-spacing="1.2">${statusText}</text>
    ` : statusType === 'CANCELLED' ? `
      <g transform="translate(1338, 523)">
        <circle cx="11" cy="11" r="9" fill="none" stroke="#DC2626" stroke-width="2.2"/>
        <line x1="5" y1="5" x2="17" y2="17" stroke="#DC2626" stroke-width="2.2"/>
      </g>
      <text x="1370" y="540" fill="${statusColor}" class="font-sans" font-size="16" font-weight="800" letter-spacing="1.2">${statusText}</text>
    ` : `
      <text x="1400" y="540" fill="${statusColor}" class="font-sans" font-size="15" font-weight="800" letter-spacing="1.2" text-anchor="middle">${statusText}</text>
    `}

    <!-- EventHub Branding at Stub Bottom -->
    <line x1="1310" y1="616" x2="1375" y2="616" stroke="#C99A47" stroke-width="1.3" stroke-opacity="0.55"/>
    <g transform="translate(1400, 616) scale(0.9)">
      <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#E6C17A" fill-opacity="0.95"/>
    </g>
    <line x1="1425" y1="616" x2="1490" y2="616" stroke="#C99A47" stroke-width="1.3" stroke-opacity="0.55"/>
    <text x="1400" y="642" fill="#E6C17A" class="font-heading" font-size="17" font-weight="800" letter-spacing="5" text-anchor="middle">EVENTHUB</text>
    <text x="1400" y="660" fill="#AAB8C8" class="font-heading" font-size="10.5" font-weight="600" letter-spacing="2" text-anchor="middle">OFFICIAL TICKET</text>

    <!-- Invalid Watermark if not VALID -->
    ${isInvalid ? `<text x="800" y="380" fill="#dc2626" opacity="0.12" class="font-sans" font-size="96" font-weight="900" text-anchor="middle" transform="rotate(-12 800 380)">${escapeXml(status)}</text>` : ''}
  </g>

  <!-- Outer Gold Border (traces silhouette) -->
  <path d="${outerPath}" fill="none" stroke="#C99A47" stroke-width="2"/>
</svg>`;
}

module.exports = {
  buildUniversalTicketSvg,
  getBackendLogoDataUrl,
  escapeXml,
  formatTicketDateTime,
  formatCategory,
  formatSeatLabel,
  wrapEventTitle,
  wrapVenueAddress,
};
