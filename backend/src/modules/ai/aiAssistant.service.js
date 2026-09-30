const fs = require('fs');
const path = require('path');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventsService = require('../events/events.service');
const eventsRepository = require('../events/events.repository');
const ordersService = require('../orders/orders.service');
const ticketsService = require('../tickets/tickets.service');
const refundsService = require('../refunds/refunds.service');
const userService = require('../user/user.service');
const authRepository = require('../auth/auth.repository');
const logger = require('../../core/logger');

let cachedPublishedEvents = [];
let cacheTimestamp = 0;

async function getPublishedEventsCache() {
  const now = Date.now();
  if (cachedPublishedEvents.length > 0 && (now - cacheTimestamp < 30000)) {
    return cachedPublishedEvents;
  }
  try {
    const res = await eventsRepository.findPublicEvents({ limit: 100, offset: 0 });
    cachedPublishedEvents = (res.rows || []).map(r => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      category_name: r.category_name,
      min_price: r.min_price,
      start_time: r.start_time,
      require_attendee_info: Boolean(r.require_attendee_info)
    }));
    cacheTimestamp = now;
  } catch (err) {
    logger.warn(`[AiAssistant] Error updating published events cache: ${err.message}`);
  }
  return cachedPublishedEvents;
}

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim();
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function detectCategory(queryOrMessage) {
  if (!queryOrMessage) return null;
  const norm = normalizeText(queryOrMessage);
  if (/(am nhac|ca nhac|nhac|concert|live show|hat)/.test(norm)) {
    return { name: 'Âm nhạc & Biểu diễn', slug: 'am-nhac-bieu-dien' };
  }
  if (/(kich|hai kich|san khau|vo dien|tuong)/.test(norm)) {
    return { name: 'Âm nhạc & Biểu diễn', slug: 'am-nhac-bieu-dien' };
  }
  if (/(hoi thao|giao duc|workshop|toa dam|hoc thuat|lop hoc|lam gom|ve tranh)/.test(norm)) {
    return { name: 'Hội thảo & Giáo dục', slug: 'hoi-thao-giao-duc' };
  }
  if (/(le hoi|van hoa|trien lam|du lich|am thuc)/.test(norm)) {
    return { name: 'Lễ hội & Văn hóa', slug: 'le-hoi-van-hoa' };
  }
  if (/(kinh doanh|cong nghe|startup|tri tue nhan tao|tri tue)/.test(norm)) {
    return { name: 'Kinh doanh & Công nghệ', slug: 'kinh-doanh-cong-nghe' };
  }
  if (/(the thao|chay bo|marathon|giai dau|bong da)/.test(norm)) {
    return { name: 'Thể thao', slug: 'the-thao' };
  }
  return null;
}

function extractPhoneNumber(text) {
  if (!text) return '';
  const candidates = text.match(/(?:(?:\+84)|0)[0-9\.\-\s]{8,15}/g) || [];
  for (const cand of candidates) {
    const clean = cand.replace(/[\.\-\s]/g, '');
    if (/^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(clean)) {
      return clean.startsWith('+84') ? '0' + clean.slice(3) : clean;
    }
    if (/^0\d{9,10}$/.test(clean)) {
      return clean;
    }
  }
  return '';
}

function parseTicketsFromText(allUserText, ticketTypes) {
  if (!allUserText || !ticketTypes || ticketTypes.length === 0) return [];
  const detectedTickets = [];
  const normUserText = normalizeText(allUserText);

  for (const t of ticketTypes) {
    let cleanName = normalizeText(t.name).replace(/\([^)]*\)/g, '').replace(/hang\s+/g, '').trim();
    const tokens = cleanName.split(/\s+/).filter(w => w.length >= 2);
    let matchedQty = 0;

    const candidates = [cleanName, ...tokens].filter(kw => kw.length >= 3);
    for (const kw of candidates) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re1 = new RegExp('(\\d+)\\s*(?:ve\\s*)?(?:hang\\s*)?' + escaped, 'i');
      const m1 = normUserText.match(re1);
      if (m1) {
        matchedQty = parseInt(m1[1], 10);
        break;
      }
      const re2 = new RegExp(escaped + '\\s*(?:hang\\s*)?(\\d+)', 'i');
      const m2 = normUserText.match(re2);
      if (m2) {
        matchedQty = parseInt(m2[1], 10);
        break;
      }
      const re3 = new RegExp('(\\d+)\\s+' + escaped, 'i');
      const m3 = normUserText.match(re3);
      if (m3) {
        matchedQty = parseInt(m3[1], 10);
        break;
      }
    }

    if (matchedQty > 0) {
      detectedTickets.push({ ticket: t, quantity: matchedQty });
    }
  }

  return detectedTickets;
}

function extractAttendeesFromText(text, userProfile = null) {
  if (!text) return [];
  const attendees = [];
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

  // 1. Check if user explicitly asked to use their own profile info
  const normText = normalizeText(text);
  const hasUseMyInfo = /(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi/i.test(normText);
  if (hasUseMyInfo && userProfile?.email) {
    attendees.push({
      name: userProfile.full_name || 'Khách hàng',
      email: userProfile.email.trim()
    });
  }

  // 2. Detect any shared/common email declared for tickets:
  // e.g.: "Email ghi chung cho cả 6 người: datnt@gmail.com", "email chung: datnt@gmail.com"
  let sharedEmail = null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lNorm = normalizeText(line);
    const m = line.match(emailRegex);
    if (m && m.length === 1) {
      if (/(?:email|mail).*(?:chung|tat\s*ca|cho\s*ca|\d+\s*nguoi)/i.test(lNorm) ||
          /(?:chung|tat\s*ca|cho\s*ca|\d+\s*nguoi).*(?:email|mail)/i.test(lNorm) ||
          /^(?:email|mail)\s*[:\-]/i.test(lNorm)) {
        sharedEmail = m[0].trim();
        break;
      }
    }
  }

  // Helper to test if a string looks like a section header, ticket count, or meta line
  const isSectionOrMetaLine = (line) => {
    const lNorm = normalizeText(line);
    if (!lNorm) return true;
    if (/(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi/i.test(lNorm)) return true;
    if (/^(?:email|mail|sdt|so\s*dien\s*thoai|phone|suat|ve|hang|tong)\b/i.test(lNorm)) return true;
    if (/^\d+\s*ve\b/i.test(lNorm)) return true;
    if (/(?:gom|sau\s*day|danh\s*sach|cac\s*loai\s*ve|thong\s*tin)\s*[:\-]?$/i.test(lNorm)) return true;
    return false;
  };

  // Helper to clean a name candidate
  const cleanName = (str) => {
    return str
      .replace(emailRegex, '')
      .replace(/^(?:[\d\.\-\*\•\)\:]|v[eé]\s*\d*|ng[uư][oờ]i\s*\d*|\-|\:)+/gi, '')
      .replace(/(?:email|mail|sdt|s[oố]\s*đi[eệ]n\s*tho[aạ]i)\s*[:\-]?\s*.*$/gi, '')
      .replace(/[\(\)\[\],\-–:]+/g, ' ')
      .trim();
  };

  // Strict validator to ensure candidate is a real person name and not conversational chat text
  const isValidPersonName = (candidate) => {
    if (!candidate || candidate.length < 2 || candidate.length > 50) return false;
    const lNorm = normalizeText(candidate);
    if (!lNorm) return false;
    if (isSectionOrMetaLine(candidate)) return false;

    // Reject conversational, inquiry, and ticket booking words
    const chatWordsRegex = /\b(muon|dat|mua|ban|ve|suat|cho|ghe|tim|kiem|hoi|xem|co|khong|gi|nao|sao|bao\s*nhieu|the\s*nao|su\s*kien|show|kich|hat|nhac|ca\s*si|ca\s*nhac|rap|gia|tien|vnd|dong|alo|chao|xin\s*chao|eve|tro\s*ly|ad|admin|nhe|nha|da|vang|ok|duoc|cam\s*on|thank|thanks|lien\s*he|sdt|so\s*dien\s*thoai|email|mail|thong\s*tin|dia\s*chi|thoi\s*gian|ngay|gio|phut|thang|nam|linh\s*vuc|the\s*loai|danh\s*sach|chi\s*tiet|ngoai\s*truyen|san\s*khau|idecaf|theater|theatre|concert|festival|workshop)\b/i;
    if (chatWordsRegex.test(lNorm)) return false;

    // Names in VN or INT are 2 to 5 words
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    if (words.some(w => /^\d+$/.test(w))) return false;

    return true;
  };

  const pairedAttendees = [];
  const processedLineIndices = new Set();

  // Strategy A: Parse line by line for explicit Name + Email pairs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lNorm = normalizeText(line);

    // If this line is the shared email declaration, mark it processed so it's not treated as a person's name
    if (sharedEmail && line.toLowerCase().includes(sharedEmail.toLowerCase())) {
      if (/(?:chung|tat\s*ca|cho\s*ca|\d+\s*nguoi|ghi\s*chung)/i.test(lNorm) || /^(?:email|mail)\s*[:\-]/i.test(lNorm)) {
        processedLineIndices.add(i);
        continue;
      }
    }

    if (isSectionOrMetaLine(line) && !line.includes('@')) continue;

    const emailsInLine = line.match(emailRegex) || [];

    if (emailsInLine.length === 1) {
      const email = emailsInLine[0].trim();
      let nameCandidate = cleanName(line);

      // If name was not on the same line, check previous line
      if ((!nameCandidate || nameCandidate.length < 2) && i > 0 && !processedLineIndices.has(i - 1)) {
        const prevLine = lines[i - 1];
        if (!emailRegex.test(prevLine) && !isSectionOrMetaLine(prevLine)) {
          const prevNameCandidate = cleanName(prevLine);
          if (prevNameCandidate && isValidPersonName(prevNameCandidate)) {
            nameCandidate = prevNameCandidate;
            processedLineIndices.add(i - 1);
          }
        }
      }

      if (nameCandidate && isValidPersonName(nameCandidate)) {
        pairedAttendees.push({ name: nameCandidate, email });
        processedLineIndices.add(i);
      }
    } else if (emailsInLine.length > 1) {
      const parts = line.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const m = part.match(emailRegex);
        if (m) {
          const email = m[0].trim();
          const nameCandidate = cleanName(part);
          if (nameCandidate && isValidPersonName(nameCandidate)) {
            pairedAttendees.push({ name: nameCandidate, email });
          }
        }
      }
      processedLineIndices.add(i);
    }
  }

  // Strategy B: Extract standalone name lines (e.g. "- Nguyễn Văn A")
  const standaloneNames = [];
  for (let i = 0; i < lines.length; i++) {
    if (processedLineIndices.has(i)) continue;
    const line = lines[i];
    if (emailRegex.test(line)) continue;

    // Must look like a bullet item, numbered item, or person label, OR be sent in a message declaring a shared email
    const isBulletOrNumbered = /^[\-\*\•\+]\s+|\b(?:ng[uư][oờ]i|khach|v[eé])\s*\d*[\:\-]?|^\d+[\.\)]\s+/i.test(line);
    if (!isBulletOrNumbered && !sharedEmail) continue;

    const candidate = cleanName(line);
    if (candidate && isValidPersonName(candidate)) {
      standaloneNames.push(candidate);
    }
  }

  for (const pa of pairedAttendees) {
    attendees.push(pa);
  }

  // Pair standalone names with shared email ONLY
  if (standaloneNames.length > 0 && sharedEmail) {
    for (const name of standaloneNames) {
      attendees.push({ name, email: sharedEmail });
    }
  }

  // Deduplicate identical Name + Email pairs (preserving distinct attendees even if they share an email)
  const uniqueAttendees = [];
  const seenKey = new Set();
  for (const a of attendees) {
    const key = `${normalizeText(a.name)}|${a.email.toLowerCase().trim()}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      uniqueAttendees.push(a);
    }
  }

  return uniqueAttendees;
}

function getRemainingTicketsDescription(detectedTickets, filledCount) {
  const flatSlots = [];
  for (const dt of detectedTickets) {
    for (let i = 0; i < dt.quantity; i++) {
      flatSlots.push(dt.ticket.name);
    }
  }
  const remaining = flatSlots.slice(filledCount);
  const counts = {};
  for (const name of remaining) {
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => `- ${count} vé ${name}`).join('\n');
}

function findMatchingPublishedEvent(queryOrMessage, eventsList) {
  if (!queryOrMessage || !eventsList || eventsList.length === 0) return null;

  const normalize = (str) => (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normInput = normalize(queryOrMessage);
  if (!normInput || normInput.length < 3) return null;

  // 1. Direct contains check:
  for (const e of eventsList) {
    const normTitle = normalize(e.title);
    const normSlug = normalize(e.slug);

    if (normTitle && normTitle.length >= 6) {
      if (normInput.includes(normTitle)) {
        return e;
      }
    }
    if (normSlug && normSlug.length >= 6) {
      if (normInput.includes(normSlug)) {
        return e;
      }
    }
  }

  // 2. Distinctive title keywords match:
  const stopWords = new Set([
    'hay', 'giup', 'toi', 'minh', 'cho', 'dat', 'mua', 've', 'su', 'kien', 'show',
    'xem', 've', 'o', 'eve', 'oi', 'co', 'gi', 'nao', 'dang', 'khong',
    'bao', 'nhieu', 'suat', 'dien', 'tien', 'gia', 'loai', 'mot', 'hai', 'ba',
    'bon', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi', 'thong', 'tin', 'cua',
    'ban', 'anh', 'chi', 'em', 'nguoi', 'tham', 'gia', 'dung', 'sdt', 'email',
    'so', 'dien', 'thoai', 'xin', 'chao', 'tro', 'ly', 'nhe', 'nha', 'a', 'da',
    'voi', 'la', 'cac', 'nhung', 'de', 'duoc', 'con', 'lai', 'gio', 'ngay', 'thang',
    'va', 'thi', 'ma', 'trong', 'ngoai', 'tren', 'duoi', 'den', 'tu', 'cung', 'nhu',
    'chon', 'ghe', 'hang', 'thuong', 'vip', 'regular', 'hanh', 'truoc', 'khi', 'toan',
    'bo', 'san', 'diem', 'chi', 'tiet', 'chuan', 'bi', 'xong', 'roi', 'ngay', 'mai',
    'hom', 'nay', 'qua', 'kia', 'do', 'day', 'ta', 'tai', 'khoan', 'luc', 'vao',
    'tuong', 'thich', 'quan', 'tam', 'muon',
    // Category & discovery terms (MUST NOT be treated as event titles):
    'nhac', 'am', 'ca', 'hat', 'concert', 'kich', 'hai', 'san', 'khau',
    'workshop', 'hoi', 'thao', 'giao', 'duc', 'the', 'thao', 'le', 'hoi', 'van', 'hoa',
    'cong', 'nghe', 'kinh', 'doanh', 'sap', 'toi', 'noi', 'bat', 'hot', 'moi', 'linh', 'vuc',
    'chuong', 'trinh', 'the', 'loai', 'top'
  ]);

  const rawWords = normInput.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
  if (rawWords.length === 0) {
    return null;
  }
  const uniqueInputWords = [...new Set(rawWords)];

  const cleanedQuery = uniqueInputWords.join(' ');
  if (cleanedQuery.length < 3) return null;

  let bestMatch = null;
  let maxScore = 0;

  for (const e of eventsList) {
    const normTitle = normalize(e.title);
    const titleWords = normTitle.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
    if (titleWords.length === 0) continue;

    if (cleanedQuery.length >= 6 && normTitle.includes(cleanedQuery)) {
      const score = cleanedQuery.length / normTitle.length;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = e;
      }
      continue;
    }

    const matchedDistinctWords = uniqueInputWords.filter(w => titleWords.includes(w));
    const hasLongUniqueWord = uniqueInputWords.some(w => w.length >= 6 && titleWords.includes(w));
    const validMatches = matchedDistinctWords.filter(w => w.length >= 3);
    if (validMatches.length >= 2 || hasLongUniqueWord) {
      const score = matchedDistinctWords.length / titleWords.length;
      if (score > maxScore && score >= 0.35) {
        maxScore = score;
        bestMatch = e;
      }
    }
  }

  return bestMatch;
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'searchEvents',
      description: 'Tìm kiếm sự kiện trên EventHub theo từ khóa hoặc thể loại (âm nhạc, kịch, workshop, thể thao...). KHÔNG GỌI hàm này khi khách đang chọn suất diễn, chọn loại vé hoặc đang đặt vé cho một sự kiện cụ thể.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa hoặc thể loại cần tìm kiếm (VD: "âm nhạc", "kịch", "Porsche"... hoặc để trống "" nếu hỏi chung chung).' },
          limit: { type: 'integer', description: 'Số lượng kết quả trả về' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getEventDetails',
      description: 'Lấy thông tin suất diễn và vé của 1 sự kiện cụ thể. CHỈ GỌI KHI khách hàng đã nêu đích danh một sự kiện hoặc chọn 1 sự kiện để xem chi tiết. TUYỆT ĐỐI KHÔNG GỌI khi khách chỉ hỏi chung chung hay hỏi danh sách sự kiện hot.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID, slug hoặc tên của sự kiện cần xem' }
        },
        required: ['eventId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getUserOrders',
      description: 'Lấy danh sách các đơn hàng mua vé gần nhất của khách hàng (chỉ gọi khi cần tra cứu đơn hàng).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Số lượng đơn hàng (mặc định 5)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getUserTickets',
      description: 'Lấy danh sách các vé đã mua của khách hàng. Có thể dùng để hiển thị mã QR vé.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Trạng thái vé (VD: VALID, CHECKED_IN)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRefundStatus',
      description: 'Kiểm tra trạng thái các yêu cầu hoàn tiền của khách hàng.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRefundPolicy',
      description: 'Lấy thông tin chính sách hoàn tiền vé của hệ thống EventHub.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generateBookingAction',
      description: 'GỌI KHI sự kiện CÓ SƠ ĐỒ CHỖ NGỒI (để mở sơ đồ ghế cho khách tự do chọn vị trí và loại vé), hoặc khi khách muốn tự mở trang đặt vé.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID thực sự hoặc slug của sự kiện.' },
          sessionId: { type: 'string', description: '(Tùy chọn) ID của suất diễn cụ thể' }
        },
        required: ['eventId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generatePrefillBookingAction',
      description: 'GỌI KHI khách hàng ĐÃ CÓ SỐ ĐIỆN THOẠI và đã có đủ thông tin (loại vé/số lượng, và thông tin người tham gia nếu sự kiện yêu cầu). Dùng cho CẢ sự kiện vé tự do và sự kiện có sơ đồ ghế (để lưu thông tin người tham gia trước khi khách vào sơ đồ chọn vị trí ghế).',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID, slug hoặc tên của sự kiện.' },
          sessionId: { type: 'string', description: 'ID hoặc tên của suất diễn khách chọn.' },
          ticketTypeId: { type: 'string', description: 'ID hoặc tên của loại vé khách chọn (với sự kiện có sơ đồ ghế có thể để trống hoặc điền "seated").' },
          quantity: { type: 'integer', description: 'Số lượng vé khách muốn đặt.' },
          buyerPhone: { type: 'string', description: 'Số điện thoại của người mua (từ profile hoặc khách cung cấp). BẮT BUỘC, không được tự bịa.' },
          buyerName: { type: 'string', description: 'Họ và tên của người mua.' },
          buyerEmail: { type: 'string', description: 'Email của người mua.' },
          attendeeName: { type: 'string', description: 'Họ và tên người tham gia (nếu khách cung cấp).' },
          attendeeEmail: { type: 'string', description: 'Email người tham gia (nếu khách cung cấp).' }
        },
        required: ['eventId', 'sessionId', 'quantity', 'buyerPhone']
      }
    }
  }
];

const SYSTEM_PROMPT = `Bạn tên là Eve, Trợ lý AI đáng yêu, thông minh và tận tâm của EventHub.
- Giọng điệu: GenZ, thân thiện, dùng emoji một cách tự nhiên.
- Luôn thể hiện sự quan tâm và thấu cảm với khách hàng.
- BẮT BUỘC 100% TIẾNG VIỆT: Tuyệt đối KHÔNG sử dụng chữ Hán/tiếng Trung (như 電子信箱, 邮箱, 好的). Luôn viết là "Email" hoặc "hòm thư" thay vì tiếng Trung.
- TUYỆT ĐỐI KHÔNG HỨA SUÔNG: Khi đã có đủ thông tin đặt vé, BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction. Tuyệt đối không tự nói "Đang xử lý đặt vé" hay "Vui lòng đợi một chút" bằng chữ mà không gọi tool!

QUY TẮC CỐT LÕI - BẢO MẬT & CHỐNG ẢO GIÁC (GROUNDING TUYỆT ĐỐI):
1. BẢO MẬT DỮ LIỆU EVENTHUB: Bạn là trợ lý AI nội bộ của nền tảng EventHub. Bạn CHỈ ĐƯỢC PHÉP giới thiệu các sự kiện CÓ TRÊN HỆ THỐNG EVENTHUB (được trả về qua kết quả của tool searchEvents hoặc getEventDetails).
2. TUYỆT ĐỐI KHÔNG ĐƯỢC LẤY SỰ KIỆN Ở NGOÀI ĐỜI, không tự nghĩ ra bất kỳ tên sự kiện, show ca nhạc, ban nhạc, ca sĩ ngoài đời. Bất cứ sự kiện nào bạn nêu tên đều PHẢI có thật trong danh sách tool trả về!
3. CHỈ GIỚI THIỆU ĐÚNG SỐ LƯỢNG SỰ KIỆN TOOL TRẢ VỀ:
   - Nếu tool trả về 1 sự kiện → CHỈ giới thiệu đúng duy nhất 1 sự kiện đó!
   - Nếu tool trả về 2 sự kiện → CHỈ giới thiệu đúng 2 sự kiện đó.
   - Nếu tool trả về status NOT_FOUND hoặc 0 sự kiện → Báo thành thật chưa có và gợi ý các sự kiện khác trên hệ thống.
4. BẮT BUỘC PHẢI GỌI searchEvents TRONG CÁC TÌNH HUỐNG SAU (KHÔNG ĐƯỢC TRẢ LỜI KHI CHƯA GỌI TOOL):
   - Khách hỏi sự kiện hot / mới / chung chung → Gọi searchEvents({ query: "" }).
   - Khách hỏi theo THỂ LOẠI hoặc CHỦ ĐỀ → Gọi searchEvents({ query: "tên thể loại" }).
   - Khách hỏi theo TỪ KHÓA hoặc TÊN SỰ KIỆN → Gọi searchEvents({ query: "từ khóa chính" }).

QUY TRÌNH TƯ VẤN VÀ ĐẶT VÉ (BẮT BUỘC TUÂN THỦ TỪNG BƯỚC):
  BƯỚC 1: Khi khách hỏi chung chung hoặc tìm kiếm sự kiện:
    → Trình bày danh sách sự kiện từ kết quả searchEvents (Tên sự kiện, Thời gian, Giá vé khởi điểm) và hỏi: "Bạn muốn xem chi tiết hoặc mua vé sự kiện nào ạ? 😊".
  BƯỚC 2: Khi khách hàng HỎI THÔNG TIN CHI TIẾT hoặc TÌM HIỂU về 1 sự kiện cụ thể:
    → Gọi getEventDetails để lấy thông tin chi tiết sự kiện.
    → Giới thiệu ĐẦY ĐỦ VÀ CHI TIẾT cho khách hàng:
      + Tên sự kiện & Nội dung / trải nghiệm nổi bật của sự kiện
      + Thời gian diễn ra & Địa điểm tổ chức
      + Bảng giá vé & Các hạng vé hiện có
      + Lưu ý hoặc đặc điểm chỗ ngồi (sơ đồ ghế / vé tự do)
    → Sau đó hỏi khách: "Bạn có muốn Eve hỗ trợ đặt vé sự kiện này không ạ? 🥰".
    → TUYỆT ĐỐI KHÔNG tự động chuyển sang đặt vé hay mở sơ đồ chọn ghế khi khách chỉ đang hỏi thông tin chi tiết!
  BƯỚC 3: KHI KHÁCH HÀNG MUỐN ĐẶT VÉ / CHỌN GHẾ / MUA VÉ:
    ★ TRƯỜNG HỢP 1: SỰ KIỆN CÓ SƠ ĐỒ CHỖ NGỒI (SEATED EVENT):
      - Nếu sự kiện có từ 2 suất diễn trở lên và khách chưa chọn: Hỏi khách muốn chọn suất diễn nào.
      - HỖ TRỢ ĐIỀN THÔNG TIN TỰ ĐỘNG ĐỂ NHẢY THẲNG ĐẾN TRANG THANH TOÁN (FAST-FORWARD CHECKOUT):
        * Để khách sau khi chọn ghế xong KHÔNG PHẢI GÕ FORM THỦ CÔNG mà được chuyển thẳng đến trang thanh toán:
        * TỰ ĐỘNG lấy Họ tên và Email từ tài khoản người dùng. Nếu chưa có SĐT, hỏi SĐT người mua.
        * Nếu sự kiện CÓ YÊU CẦU thông tin người tham gia (require_attendee_info = true):
          - Hỏi khách muốn đặt mấy vé và xin Họ tên + Email cho từng người tham gia (khách có thể nhắn "dùng thông tin của tôi").
          - Khi khách đã cung cấp đủ thông tin cho số vé: LẬP TỨC GỌI TOOL generatePrefillBookingAction({ eventId, sessionId, quantity, buyerPhone, buyerName, buyerEmail, attendeeName, attendeeEmail }).
        * Nếu sự kiện KHÔNG YÊU CẦU thông tin người tham gia (require_attendee_info = false):
          - Khi đã có SĐT người mua, LẬP TỨC GỌI TOOL generateBookingAction({ eventId, sessionId }) để mở sơ đồ ghế. Sau khi chọn ghế xong, khách sẽ được chuyển thẳng đến trang thanh toán!
        * NẾU KHÁCH NÓI MUỐN VÀO THẲNG SƠ ĐỒ CHỌN GHẾ NGAY: Gọi ngay generateBookingAction({ eventId, sessionId }).
    ★ TRƯỜNG HỢP 2: SỰ KIỆN KHÔNG CÓ CHỖ NGỒI (VÉ TỰ DO / UNSEATED EVENT):
      - Nếu sự kiện có từ 2 suất diễn trở lên và khách chưa chọn: Hỏi khách muốn tham dự suất diễn nào. (Nếu chỉ có 1 suất diễn thì tự động áp dụng suất đó, không cần hỏi).
      - Hỏi thông tin về loại vé và số lượng vé khách hàng muốn đặt.
      - Khi đã có thông tin số lượng và loại vé:
        + THÔNG TIN NGƯỜI MUA: Hệ thống tự động lấy Họ tên và Email từ tài khoản khách hàng. Nếu tài khoản chưa có số điện thoại liên hệ (và khách chưa gửi SĐT trong chat), BẮT BUỘC PHẢI HỎI: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰". TUYỆT ĐỐI KHÔNG TỰ BỊA SỐ ĐIỆN THOẠI.
        + THÔNG TIN NGƯỜI THAM GIA:
          * Nếu sự kiện KHÔNG yêu cầu thông tin người tham gia (require_attendee_info = false): TUYỆT ĐỐI KHÔNG HỎI thông tin người tham gia. Khi đã có SĐT người mua, LẬP TỨC GỌI TOOL generatePrefillBookingAction!
          * Nếu sự kiện CÓ yêu cầu thông tin người tham gia (require_attendee_info = true): Sau khi đã có SĐT người mua, BẮT BUỘC HỎI thông tin người tham gia (Họ và tên, Email). Gợi ý khách có thể nhắn "dùng thông tin của tôi" nếu khách tự tham gia. Khi khách cung cấp hoặc nhắn "dùng thông tin của tôi", LẬP TỨC GỌI TOOL generatePrefillBookingAction!`;

class AiAssistantService {
  async executeTool(userId, name, args, context = {}) {
    try {
      // Helper to safely extract args (Qwen3 sometimes wraps them in JSON Schema objects)
      const getArg = (arg) => (arg && typeof arg === 'object' && arg.value !== undefined) ? arg.value : arg;
      
      if (name === 'searchEvents') {
        const rawQuery = getArg(args.query);
        let queryArg = typeof rawQuery === 'string' ? rawQuery.trim() : '';
        // If query is generic ("hot", "mới", "hay", "sự kiện", "đang hot", "sắp tới", "nổi bật"), treat as empty to search all
        if (/^(hot|mới|hay|gợi ý|sự kiện|tất cả|đang hot|sắp tới|nổi bật|sự kiện sắp tới)$/i.test(queryArg)) {
          queryArg = '';
        } else {
          // Clean conversational prefixes
          queryArg = queryArg.replace(/^(hãy|giúp|tôi|mình|cho|đặt|mua|vé|sự|kiện|show|ở|về|cho tôi hỏi|cho hỏi|eve ơi|có|gì|nào|đang|hay|không|\?|\s)+/gi, '').trim();
        }

        const catInfo = detectCategory(queryArg);

        // ONLY attempt exact title match if query is NOT a category or generic term
        if (!catInfo && queryArg && queryArg.length >= 4) {
          const publishedList = await getPublishedEventsCache();
          const matchedExact = findMatchingPublishedEvent(queryArg, publishedList);
          if (matchedExact) {
            return {
              status: 'FOUND',
              total: 1,
              events: [{
                id: matchedExact.slug || matchedExact.id,
                title: matchedExact.title,
                category: matchedExact.category_name || 'Khác',
                start: matchedExact.start_time ? new Date(matchedExact.start_time).toLocaleDateString('vi-VN') : 'Sắp diễn ra',
                price: matchedExact.min_price ? `${Number(matchedExact.min_price).toLocaleString('vi-VN')}đ` : 'Liên hệ'
              }],
              instruction: `Eve hãy dùng giọng điệu thân thiện, hào hứng gửi khách thông tin sự kiện "${matchedExact.title}". Kèm ngày diễn ra và giá vé khởi điểm, sau đó hỏi khách muốn xem chi tiết hay đặt vé sự kiện này. TUYỆT ĐỐI không chép lại câu nhắc lệnh này!`
            };
          }
        }

        // Always query upcoming events (start_time/end_time >= now)
        let result = await eventsService.getPublicEvents({
          category_slug: catInfo ? catInfo.slug : undefined,
          keyword: catInfo ? undefined : (queryArg || undefined),
          limit: parseInt(getArg(args.limit), 10) || 5,
          page: 1,
          upcoming_only: true
        }, userId);

        // If category_slug query returned 0, try keyword search
        if ((!result.items || result.items.length === 0) && catInfo) {
          result = await eventsService.getPublicEvents({
            keyword: queryArg || undefined,
            limit: parseInt(getArg(args.limit), 10) || 5,
            page: 1,
            upcoming_only: true
          }, userId);
        }

        if (!result.items || result.items.length === 0) {
          // If no upcoming events match this category or keyword, fetch general upcoming events to suggest
          const generalUpcoming = await eventsService.getPublicEvents({
            limit: 3,
            page: 1,
            upcoming_only: true
          }, userId);

          const suggestions = (generalUpcoming.items || []).map(e => `"${e.title}"`).join(', ');
          return {
            status: 'NOT_FOUND',
            total: 0,
            events: [],
            message: `Dạ hiện tại trên EventHub chưa có sự kiện sắp tới nào thuộc thể loại / từ khóa "${queryArg}". Bạn hãy báo với khách một cách nhẹ nhàng, thân thiện và gợi ý các sự kiện sắp diễn ra nổi bật khác trên EventHub: [${suggestions}] nhé.`
          };
        }

        const events = result.items.map(e => ({
          id: e.slug || e.id,
          title: e.title,
          category: e.category?.name || e.category_name || (catInfo ? catInfo.name : 'Khác'),
          start: e.start_time ? new Date(e.start_time).toLocaleDateString('vi-VN') : 'Sắp diễn ra',
          price: e.min_price ? `${Number(e.min_price).toLocaleString('vi-VN')}đ` : 'Liên hệ'
        }));

        return {
          status: 'FOUND',
          total: events.length,
          events: events,
          instruction: `Eve hãy dùng giọng điệu thân thiện, hào hứng gửi khách danh sách ${events.length} sự kiện sắp tới có trên hệ thống EventHub: [${events.map(e => `"${e.title}" (${e.start}, từ ${e.price})`).join('; ')}]. Sau đó hỏi khách muốn xem chi tiết hay đặt vé sự kiện nào. TUYỆT ĐỐI không chép lại câu nhắc lệnh này và không gọi thêm tool nào khác!`
        };
      }
      
      if (name === 'getEventDetails') {
        let identifier = getArg(args.eventId) || getArg(args.identifier);
        const publishedList = await getPublishedEventsCache();
        const matched = findMatchingPublishedEvent(identifier, publishedList);
        if (matched) {
          identifier = matched.slug || matched.id;
        }
        const result = await eventsService.getPublicEventDetail(identifier, userId);
        const sessions = result.sessions || [];
        const hasSeatMap = Boolean(
          sessions.some(s => s.seat_map_id || s.has_seat_map) ||
          result.ticket_types?.some(t => t.is_seated === true)
        );
        const hasSingleSession = sessions.length <= 1;

        const userMsgNorm = normalizeText(context.message || '');
        const isDetailInquiry = /(thong tin|chi tiet|gioi thieu|noi dung|ve cai gi|co gi hay|o dau|khi nao|may gio|ngay nao|dia diem|dien gia|nghe si|ca si|gia ve|ve bao nhieu)/i.test(userMsgNorm);
        const isBookingExplicit = /(toi muon dat ve|muon dat ve|dat ve|mua ve|chon ghe|book ve|mua ve su kien|vao dat ve)/i.test(userMsgNorm) && !isDetailInquiry;

        const eventDesc = stripHtml(result.description || result.short_description || '');
        const venueSummary = result.venue?.summary || [result.venue?.name, result.venue?.address_line, result.venue?.city].filter(Boolean).join(', ') || 'Chưa cập nhật địa điểm';
        const ticketSummary = (result.ticket_types || []).map(t => `${t.name}: ${Number(t.price).toLocaleString('vi-VN')}đ (còn ${t.available_quantity} vé)`).join(', ');

        let instruction = '';
        if (isDetailInquiry || !isBookingExplicit) {
          instruction = `Khách hàng đang tìm hiểu THÔNG TIN CHI TIẾT về sự kiện "${result.title}". Hãy dùng giọng điệu hào hứng, thân thiện để giới thiệu đầy đủ chi tiết cho khách:
- Giới thiệu nội dung/chủ đề sự kiện: ${eventDesc ? `"${eventDesc.slice(0, 400)}..."` : 'Sự kiện trải nghiệm hấp dẫn'}
- Thời gian diễn ra: ${sessions.map(s => s.start_time ? new Date(s.start_time).toLocaleString('vi-VN') : '').filter(Boolean).join(', ') || 'Xem chi tiết'}
- Địa điểm tổ chức: ${venueSummary}
- Bảng giá vé: ${ticketSummary || 'Liên hệ'}
- Đặc điểm chỗ ngồi: ${hasSeatMap ? 'Sự kiện CÓ SƠ ĐỒ CHỖ NGỒI (khách sẽ tự do chọn vị trí khi đặt vé).' : 'Vé tự do (không có sơ đồ ghế).'}
Sau đó, hãy vui vẻ hỏi khách: "Bạn có muốn Eve hỗ trợ đặt vé sự kiện này không ạ? 🥰".
TUYỆT ĐỐI KHÔNG tự ý mở sơ đồ chọn ghế hoặc dán action tag khi khách chỉ đang hỏi thông tin sự kiện!`;
        } else if (hasSeatMap) {
          if (hasSingleSession) {
            instruction = `Khách hàng muốn ĐẶT VÉ sự kiện "${result.title}". Sự kiện này CÓ SƠ ĐỒ CHỖ NGỒI và chỉ có 1 suất diễn duy nhất. BẠN KHÔNG ĐƯỢC HỎI loại vé hay số lượng vé. Hãy nói vui vẻ: "Dạ sự kiện này có sơ đồ chỗ ngồi, Eve mở sơ đồ ghế để bạn tự do chọn vị trí và vé ưng ý nhất nhé! 🎭✨" và dán CHÍNH XÁC đoạn mã sau vào cuối câu trả lời: \n[ACTION:BOOKING:${result.slug}:${sessions[0]?.id || ''}]`;
          } else {
            instruction = `Khách hàng muốn ĐẶT VÉ sự kiện "${result.title}". Sự kiện CÓ SƠ ĐỒ CHỖ NGỒI. BẠN KHÔNG ĐƯỢC HỎI loại vé hay số lượng vé. Hãy gửi thông tin các suất diễn và hỏi khách: "Sự kiện có sơ đồ chỗ ngồi, bạn muốn chọn suất diễn nào để Eve mở sơ đồ ghế cho bạn chọn ạ? 🥰"`;
          }
        } else {
          const reqAttendeeText = result.require_attendee_info ? 'Sự kiện này CÓ YÊU CẦU thông tin người tham gia check-in vé.' : 'Sự kiện này KHÔNG YÊU CẦU thông tin người tham gia.';
          if (hasSingleSession) {
            instruction = `Sự kiện "${result.title}" KHÔNG CÓ sơ đồ chỗ ngồi (vé tự do) và chỉ có 1 suất diễn. ${reqAttendeeText} Hãy trình bày các loại vé và hỏi khách muốn đặt loại vé nào và số lượng bao nhiêu ạ.`;
          } else {
            instruction = `Sự kiện "${result.title}" KHÔNG CÓ sơ đồ chỗ ngồi. ${reqAttendeeText} Hãy trình bày các suất diễn và các loại vé, rồi hỏi khách muốn tham dự suất diễn nào, loại vé nào và số lượng bao nhiêu ạ.`;
          }
        }

        return {
          id: result.slug || result.id,
          title: result.title,
          slug: result.slug,
          description: eventDesc,
          venue: venueSummary,
          has_seat_map: hasSeatMap,
          require_attendee_info: Boolean(result.require_attendee_info),
          sessions: sessions.map(s => ({
            id: s.id,
            session_name: s.session_name || '',
            start_time: s.start_time,
            end_time: s.end_time,
            venue: s.venue ? [s.venue.name, s.venue.address_line].filter(Boolean).join(', ') : venueSummary,
            has_seat_map: Boolean(s.seat_map_id || s.has_seat_map)
          })),
          ticket_types: (result.ticket_types || []).map(t => ({
            id: t.id,
            name: t.name,
            price: Number(t.price).toLocaleString('vi-VN') + 'đ',
            available_quantity: t.available_quantity,
            is_seated: Boolean(t.is_seated)
          })),
          instruction
        };
      }

      if (name === 'getUserOrders') {
        if (!userId) return { error: 'Vui lòng đăng nhập để xem đơn hàng.' };
        const result = await ordersService.getCustomerOrders(userId, { limit: args.limit || 5 });
        return result.items.map(o => ({
          id: o.id,
          order_code: o.order_code,
          event_title: o.event?.title,
          total_amount: o.total_amount,
          status: o.status,
          created_at: o.created_at
        }));
      }

      if (name === 'getUserTickets') {
        if (!userId) return { error: 'Vui lòng đăng nhập để xem vé.' };
        const result = await ticketsService.getCustomerTickets(userId, { status: args.status || 'ALL' });
        return result.items.map(t => ({
          id: t.id,
          ticket_code: t.ticket_code,
          event_title: t.event?.title,
          status: t.status,
          check_in_status: t.check_in_status
        }));
      }

      if (name === 'getRefundStatus') {
        if (!userId) return { error: 'Vui lòng đăng nhập để tra cứu hoàn tiền.' };
        const result = await refundsService.getCustomerRefunds(userId, {});
        return result.map(r => ({
          id: r.id,
          event_title: r.event?.title,
          refund_amount: r.refund_amount,
          status: r.status,
          reason: r.reason
        }));
      }

      if (name === 'getRefundPolicy') {
        return {
          policy: 'Khách hàng có thể yêu cầu hoàn tiền vé chậm nhất 72 giờ trước khi sự kiện bắt đầu. Phí hoàn vé là 10% giá vé. Tiền sẽ được hoàn về tài khoản ngân hàng trong vòng 5-7 ngày làm việc.'
        };
      }

      if (name === 'generateBookingAction') {
        let eventId = context.activeEvent?.slug || getArg(args.eventId);
        let sessionId = getArg(args.sessionId);
        if (!eventId || eventId === 'undefined') {
          return { error: 'Thất bại: Thiếu eventId. Bạn PHẢI gọi searchEvents để tìm chính xác ID sự kiện trước.' };
        }
        try {
          const detail = await eventsService.getPublicEventDetail(eventId, userId);
          if (detail?.slug) eventId = detail.slug;
          if (detail?.sessions?.length) {
            const numMatch = String(sessionId || '').match(/\d+/);
            const idx = numMatch ? parseInt(numMatch[0], 10) - 1 : -1;
            const matchS = detail.sessions.find(s => String(s.id) === String(sessionId)) || (idx >= 0 ? detail.sessions[idx] : null);
            sessionId = matchS ? matchS.id : (detail.sessions[0]?.id || sessionId);
          }
        } catch { /* keep original */ }
        const actionTag = `[ACTION:BOOKING:${eventId}${sessionId ? `:${sessionId}` : ''}]`;
        if (context) context.lastGeneratedActionTag = actionTag;
        return {
          instruction: `Tuyệt đối KHÔNG BẢO KHÁCH HÀNG COPY MÃ. Bạn CHỈ CẦN nói 1 câu vui vẻ (VD: "Eve mở sơ đồ ghế cho bạn chọn vị trí ưng ý ngay đây nha! 🎭✨") và dán CHÍNH XÁC đoạn mã sau vào cuối câu trả lời của bạn: \n${actionTag}`
        };
      }

      if (name === 'generatePrefillBookingAction') {
        let eventId = context.activeEvent?.slug || getArg(args.eventId);
        let sessionId = getArg(args.sessionId);
        let ticketTypeId = getArg(args.ticketTypeId);
        let quantity = parseInt(getArg(args.quantity), 10) || 1;

        const userProfile = context.userProfile || null;
        const history = context.history || [];
        const currentMessage = context.message || '';

        // Extract phone genuinely provided by user in user chat messages
        const userMessages = [
          currentMessage,
          ...history.filter(m => m.role === 'user').map(m => m.content || '')
        ].join('\n');
        
        const userChatPhone = extractPhoneNumber(userMessages);

        const profilePhone = (userProfile?.phone && userProfile.phone.replace(/\D/g, '').length >= 9) 
          ? userProfile.phone.trim() 
          : '';

        let validPhone = profilePhone || userChatPhone;

        // If neither profile nor user messages contain a valid phone:
        if (!validPhone) {
          return {
            error: 'LỖI: Khách hàng CHƯA cung cấp số điện thoại liên hệ và trong tài khoản cá nhân cũng CHƯA CÓ số điện thoại. TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý ĐIỀN HOẶC BỊA SỐ ĐIỆN THOẠI! Bạn hãy DỪNG LẠI và hỏi khách hàng số điện thoại liên hệ: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰"'
          };
        }

        // BUYER INFO MUST ALWAYS BE FROM THE LOGGED-IN ACCOUNT PROFILE:
        const buyerName = userProfile?.full_name || 'Khách hàng';
        const buyerEmail = userProfile?.email || '';
        const buyerPhone = validPhone; // NEVER use hallucinated args.buyerPhone!

        if (!eventId) {
          return { error: 'Thất bại: Thiếu tham số eventId. Bạn PHẢI gọi getEventDetails trước.' };
        }

        const allUserText = userMessages;

        let detail = null;
        try {
          detail = await eventsService.getPublicEventDetail(eventId, userId);
          if (detail) {
            eventId = detail.slug || detail.id;

            // Match session by ID, session_name, or index (1-based: "suất 1", "suất 2", "1", "2")
            const sessionNumMatch = String(sessionId || '').match(/\d+/);
            const sessionIdx = sessionNumMatch ? parseInt(sessionNumMatch[0], 10) - 1 : -1;

            let matchedSession = detail.sessions?.find(s => 
              String(s.id) === String(sessionId) || 
              (s.session_name && s.session_name.toLowerCase().includes(String(sessionId).toLowerCase()))
            );

            if (!matchedSession && sessionIdx >= 0 && sessionIdx < (detail.sessions?.length || 0)) {
              matchedSession = detail.sessions[sessionIdx];
            }

            // Fallback: search allUserText for session mentions like "suất 1", "suất 2", "suat 2"
            if (!matchedSession && detail.sessions?.length > 0) {
              const sessTextMatch = allUserText.match(/su[aấ]t\s*(\d+)/i);
              if (sessTextMatch) {
                const sIdx = parseInt(sessTextMatch[1], 10) - 1;
                if (sIdx >= 0 && sIdx < detail.sessions.length) {
                  matchedSession = detail.sessions[sIdx];
                }
              }
            }

            sessionId = matchedSession ? matchedSession.id : (detail.sessions?.[0]?.id || sessionId);

            // MULTI-TICKET & SINGLE TICKET DETECTION FROM USER TEXT:
            if (detail.ticket_types && detail.ticket_types.length > 0) {
              const detectedTickets = parseTicketsFromText(allUserText, detail.ticket_types);

              if (detectedTickets.length > 1) {
                // Multi-ticket selection: format as id1*qty1,id2*qty2,...
                ticketTypeId = detectedTickets.map(dt => `${dt.ticket.id}*${dt.quantity}`).join(',');
                quantity = detectedTickets.reduce((sum, dt) => sum + dt.quantity, 0);
              } else if (detectedTickets.length === 1) {
                ticketTypeId = detectedTickets[0].ticket.id;
                quantity = detectedTickets[0].quantity;
              } else {
                // Fallback: match by argument or first ticket type
                const normTicketArg = String(ticketTypeId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                let matchedTicket = detail.ticket_types.find(t => 
                  String(t.id) === String(ticketTypeId) || 
                  (normTicketArg && t.name && t.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normTicketArg)) ||
                  (normTicketArg && t.name && normTicketArg.includes(t.name.toLowerCase().replace(/[^a-z0-9]/g, '')))
                );
                ticketTypeId = matchedTicket ? matchedTicket.id : detail.ticket_types[0].id;
                if (quantity <= 1) {
                  const qtyMatch = allUserText.match(/(\d+)\s*(?:v[eé]|chỗ|ghế|ticket)/i);
                  if (qtyMatch) {
                    const parsedQty = parseInt(qtyMatch[1], 10);
                    if (parsedQty > 0) quantity = parsedQty;
                  }
                }
              }
            }
          }
        } catch { /* keep original */ }

        const requireAttendeeInfo = Boolean(detail?.require_attendee_info ?? context.activeEvent?.require_attendee_info ?? false);
        let attendeesParam = '';
        if (requireAttendeeInfo) {
          const collectedAttendees = extractAttendeesFromText(allUserText, userProfile);
          if (collectedAttendees.length > quantity) {
            quantity = collectedAttendees.length;
          }
          if (collectedAttendees.length < quantity) {
            return {
              error: `LỖI: Khách hàng đặt ${quantity} vé nhưng mới chỉ cung cấp thông tin cho ${collectedAttendees.length} người tham gia. Sự kiện này bắt buộc mỗi vé phải có thông tin check-in riêng (chỉ người đó mới được vào, không thể đổi người khác). Bạn PHẢI yêu cầu khách cung cấp tiếp Họ và tên + Email cho các vé còn lại, TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý BỊA ĐIỀN HOẶC SAO CHÉP 1 NGƯỜI CHO NHIỀU VÉ!`
            };
          }
          attendeesParam = collectedAttendees.slice(0, quantity).map(a => `${a.name}|${a.email}`).join(';');
        } else {
          attendeesParam = `${buyerName}|${buyerEmail}`;
        }

        const safeParam = (val) => encodeURIComponent(String(val || '').trim());
        const actionTag = `[ACTION:PREFILL_BOOKING:${eventId}:${sessionId}:${ticketTypeId || ''}:${quantity}:${safeParam(buyerPhone)}:${safeParam(buyerName)}:${safeParam(buyerEmail)}:${safeParam(attendeesParam)}]`;
        if (context) context.lastGeneratedActionTag = actionTag;

        const sessions = detail?.sessions || [];
        const hasSeatMap = Boolean(
          sessions.some(s => s.seat_map_id || s.has_seat_map) ||
          detail?.ticket_types?.some(t => t.is_seated === true)
        );

        let instruction = '';
        if (hasSeatMap) {
          instruction = `Tuyệt đối KHÔNG BẢO KHÁCH HÀNG COPY MÃ. Hãy nói vui vẻ: "Eve đã ghi nhận thông tin người tham gia cho bạn rồi nhé! Bạn nhấn vào nút bên dưới để chọn đúng ${quantity} vị trí ghế ưng ý trên sơ đồ, sau đó hệ thống sẽ tự động đưa bạn đến thẳng trang thanh toán nha! 🎭✨" và dán CHÍNH XÁC đoạn mã sau vào cuối câu trả lời: \n${actionTag}`;
        } else {
          instruction = `Tuyệt đối KHÔNG BẢO KHÁCH HÀNG COPY MÃ. Hãy nói "Eve đã tạo thông tin vé giúp bạn rồi nè! Bạn nhấn vào nút bên dưới để chuyển thẳng đến trang xác nhận và thanh toán vé nha! 🎉" và dán CHÍNH XÁC đoạn mã sau vào cuối câu trả lời: \n${actionTag}`;
        }

        return { instruction };
      }

      return { error: 'Function not found' };
    } catch (err) {
      logger.error(`[AiAssistant] Tool error for ${name}: ${err.message}`);
      return { error: 'Failed to execute tool', details: err.message };
    }
  }

  async chat(userId, message, history = []) {
    const cleanHistory = history || [];

    // Extract any phone number provided by the user in the current message or chat history
    const allUserMessages = [
      message,
      ...cleanHistory.filter(m => m.role === 'user').map(m => m.content || '')
    ].join('\n');

    const userChatPhone = extractPhoneNumber(allUserMessages);

    let userProfile = null;
    if (userId) {
      try {
        userProfile = await userService.getProfile(userId);
      } catch (err) {
        logger.warn(`[AiAssistant] Could not load user profile for ${userId}: ${err.message}`);
      }
    }

    const profilePhone = (userProfile?.phone && userProfile.phone.replace(/\D/g, '').length >= 9)
      ? userProfile.phone.trim()
      : '';

    let effectivePhone = profilePhone || userChatPhone;

    // Auto-save phone to user in DB if user provided it in chat and user account didn't have one
    if (userId && userChatPhone && !profilePhone) {
      try {
        await authRepository.updateUser(userId, { phone: userChatPhone });
        if (userProfile) userProfile.phone = userChatPhone;
        logger.info(`[AiAssistant] Auto-saved extracted phone ${userChatPhone} to user profile ${userId}`);
      } catch (err) {
        logger.warn(`[AiAssistant] Could not auto-save phone to user: ${err.message}`);
      }
    }

    let dynamicSystemPrompt = SYSTEM_PROMPT;
    if (userId) {
      dynamicSystemPrompt = dynamicSystemPrompt.replace(
        '- Nếu người dùng chưa đăng nhập, hãy khuyên họ đăng nhập.',
        '- Người dùng hiện đã đăng nhập, bạn không cần khuyên họ đăng nhập nữa.'
      );
      if (userProfile) {
        const hasPhone = Boolean(effectivePhone);
        dynamicSystemPrompt += `\n\nTHÔNG TIN TÀI KHOẢN KHÁCH HÀNG ĐANG CHAT:
- Họ và tên: ${userProfile.full_name || 'Khách hàng'} (Tự động lấy làm người mua vé)
- Email: ${userProfile.email || 'Chưa cập nhật'} (Tự động lấy làm người mua vé)
- Số điện thoại liên hệ: ${hasPhone ? `${effectivePhone} (ĐÃ CÓ SỐ ĐIỆN THOẠI, TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI LẠI SỐ ĐIỆN THOẠI NỮA!)` : 'Chưa cập nhật (BẮT BUỘC HỎI KHÁCH CUNG CẤP SĐT KHI ĐẶT VÉ)'}`;
      }
    } else {
      dynamicSystemPrompt = dynamicSystemPrompt.replace(
        '- Nếu người dùng chưa đăng nhập, hãy khuyên họ đăng nhập.',
        '- Người dùng chưa đăng nhập, bạn phải yêu cầu họ đăng nhập trước khi đặt vé.'
      );
    }

    // Pre-flight Grounding Optimization:
    // Check if the user is asking about or wanting to book a specific published event in EventHub:
    const publishedEvents = await getPublishedEventsCache();
    const currentMatchedEvent = findMatchingPublishedEvent(message, publishedEvents);

    // Look back in cleanHistory to find the active event if not mentioned in the current turn
    // IMPORTANT: ONLY scan user messages! Assistant messages contain event lists & generic instructions
    let activeEvent = currentMatchedEvent;
    if (!activeEvent && cleanHistory.length > 0) {
      for (let i = cleanHistory.length - 1; i >= 0; i--) {
        const hMsg = cleanHistory[i];
        if (hMsg.role !== 'user') continue;
        const found = findMatchingPublishedEvent(hMsg.content, publishedEvents);
        if (found) {
          activeEvent = found;
          break;
        }
      }
    }

    let requireAttendeeInfo = false;
    let hasSeatMap = false;
    let eventDetail = null;
    let sessionList = [];

    if (activeEvent) {
      let sessionText = '';
      let ticketText = '';
      try {
        eventDetail = await eventsService.getPublicEventDetail(activeEvent.slug || activeEvent.id, userId);
        if (eventDetail) {
          sessionList = eventDetail.sessions || [];
          requireAttendeeInfo = Boolean(eventDetail.require_attendee_info);
          if (activeEvent) activeEvent.require_attendee_info = requireAttendeeInfo;
          hasSeatMap = Boolean(
            sessionList.some(s => s.seat_map_id || s.has_seat_map) ||
            eventDetail.ticket_types?.some(t => t.is_seated === true)
          );
          sessionText = sessionList.map((s, idx) => `Suất ${idx + 1} (${s.session_name || 'Mặc định'} lúc ${s.start_time ? new Date(s.start_time).toLocaleString('vi-VN') : ''}): ID=${s.id}`).join('\n  ');
          ticketText = (eventDetail.ticket_types || []).map(t => `${t.name} (${Number(t.price).toLocaleString('vi-VN')}đ, còn ${t.available_quantity} vé): ID=${t.id}`).join('\n  ');
        }
      } catch (err) {
        logger.warn(`[AiAssistant] Error fetching activeEvent detail: ${err.message}`);
      }

      const sessionCount = sessionList.length;
      const activeEventDesc = stripHtml(eventDetail?.description || activeEvent.description || '');
      const activeEventVenue = eventDetail?.venue?.summary || [eventDetail?.venue?.name, eventDetail?.venue?.address_line, eventDetail?.venue?.city].filter(Boolean).join(', ') || 'Chưa cập nhật';

      if (hasSeatMap) {
        dynamicSystemPrompt += `\n\nSỰ KIỆN KHÁCH HÀNG ĐANG XEM / ĐẶT VÉ TRONG ĐOẠN CHAT:
- Tên sự kiện: ${activeEvent.title}
- Slug / ID: ${activeEvent.slug}
- ĐẶC ĐIỂM: SỰ KIỆN CÓ SƠ ĐỒ CHỖ NGỒI (Khách sẽ tự do chọn vị trí và vé trên sơ đồ ghế).
- Yêu cầu thông tin người tham gia (require_attendee_info): ${requireAttendeeInfo ? 'CÓ YÊU CẦU' : 'KHÔNG YÊU CẦU'}
- Giới thiệu / Nội dung: ${activeEventDesc ? `"${activeEventDesc.slice(0, 450)}..."` : 'Sự kiện trải nghiệm hấp dẫn'}
- Địa điểm tổ chức: ${activeEventVenue}
- Số lượng suất diễn: ${sessionCount}
- Danh sách suất diễn:
  ${sessionText || 'Xem chi tiết'}
- Danh sách loại vé & giá vé tham khảo:
  ${ticketText || 'Xem chi tiết'}

QUY TẮC PHẢN HỒI CHO SỰ KIỆN CÓ SƠ ĐỒ CHỖ NGỒI:
1. NẾU KHÁCH HỎI THÔNG TIN / CHI TIẾT SỰ KIỆN (chưa nói muốn đặt vé):
   - Giới thiệu chi tiết về sự kiện: Nội dung/trải nghiệm nổi bật, thời gian diễn ra, địa điểm tổ chức, các loại vé & giá vé.
   - Nhắc khách rằng sự kiện có sơ đồ chỗ ngồi để khách tự chọn ghế khi đặt vé.
   - Sau đó hỏi khách: "Bạn có muốn Eve hỗ trợ đặt vé sự kiện này không ạ? 🥰".
   - TUYỆT ĐỐI KHÔNG tự ý mở sơ đồ chọn ghế hoặc gọi generateBookingAction khi khách chỉ đang hỏi thông tin!
2. NẾU KHÁCH NÓI RÕ MUỐN ĐẶT VÉ / CHỌN GHẾ:
   - Nếu sự kiện có từ 2 suất diễn trở lên và khách chưa chọn: Hỏi khách muốn chọn suất diễn nào trước.
   - QUY TRÌNH HỖ TRỢ ĐẶT GHẾ NHANH (FAST-FORWARD CHECKOUT):
     * Yêu cầu thông tin người tham gia: ${requireAttendeeInfo ? 'CÓ YÊU CẦU' : 'KHÔNG YÊU CẦU'}.
     ${requireAttendeeInfo ? `* Vì sự kiện CÓ YÊU CẦU thông tin người tham gia: Để giúp khách sau khi chọn ghế xong được chuyển THẲNG sang trang thanh toán mà không phải gõ form thủ công:
       - Hãy hỏi khách muốn đặt mấy vé và xin Họ tên + Email của người tham gia (khách có thể nhắn "dùng thông tin của tôi" nếu tự đi một mình).
       - Khi khách đã cung cấp đủ thông tin cho số vé: LẬP TỨC GỌI TOOL generatePrefillBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}", quantity: <số vé>, buyerPhone: "${effectivePhone || ''}", buyerName: "${userProfile?.full_name || ''}", buyerEmail: "${userProfile?.email || ''}" }).
       - Nếu khách chưa cung cấp số lượng vé hoặc thông tin người tham gia: Hãy hỏi số lượng và thông tin người tham gia trước.` : `* Vì sự kiện KHÔNG YÊU CẦU thông tin người tham gia:
       ${effectivePhone ? `* ĐÃ CÓ SĐT LIÊN HỆ: ${effectivePhone}. Hãy nói vui vẻ: "Dạ sự kiện "${activeEvent.title}" có sơ đồ chỗ ngồi, Eve mở sơ đồ ghế để bạn tự do chọn vị trí ưng ý nhất nhé! Sau khi chọn ghế xong, bạn sẽ được chuyển thẳng đến trang thanh toán nha! 🎭✨" và LẬP TỨC GỌI TOOL generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}" })!` : `* Chưa có SĐT: Bắt buộc hỏi khách cung cấp SĐT người mua trước khi mở sơ đồ chọn ghế.`}`}
     * NẾU KHÁCH NÓI MUỐN TỰ VÀO SƠ ĐỒ CHỌN GHẾ NGAY: Gọi ngay generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}" }).`;
      } else {
        dynamicSystemPrompt += `\n\nSỰ KIỆN KHÁCH HÀNG ĐANG XEM / ĐẶT VÉ TRONG ĐOẠN CHAT:
- Tên sự kiện: ${activeEvent.title}
- Slug / ID: ${activeEvent.slug}
- ĐẶC ĐIỂM: SỰ KIỆN KHÔNG CÓ CHỖ NGỒI (Vé tự do, không có sơ đồ ghế).
- Giới thiệu / Nội dung: ${activeEventDesc ? `"${activeEventDesc.slice(0, 450)}..."` : 'Sự kiện trải nghiệm hấp dẫn'}
- Địa điểm tổ chức: ${activeEventVenue}
- Yêu cầu thông tin người tham gia (require_attendee_info): ${requireAttendeeInfo ? 'CÓ YÊU CẦU' : 'KHÔNG YÊU CẦU'}
- Số lượng suất diễn: ${sessionCount}
- Danh sách suất diễn:
  ${sessionText || 'Xem chi tiết'}
- Danh sách loại vé:
  ${ticketText || 'Xem chi tiết'}

QUY TẮC PHẢN HỒI CHO SỰ KIỆN KHÔNG CÓ CHỖ NGỒI:
1. NẾU KHÁCH HỎI THÔNG TIN / CHI TIẾT SỰ KIỆN (chưa nói muốn đặt vé):
   - Giới thiệu chi tiết về sự kiện: Nội dung/trải nghiệm nổi bật, thời gian diễn ra, địa điểm tổ chức, các loại vé & giá vé.
   - Sau đó hỏi khách: "Bạn có muốn Eve hỗ trợ đặt vé sự kiện này không ạ? 🥰".
   - TUYỆT ĐỐI KHÔNG tự động chuyển sang quy trình hỏi vé, SĐT khi khách chỉ đang hỏi thông tin!
2. NẾU KHÁCH NÓI RÕ MUỐN ĐẶT VÉ:
   - NẾU SỰ KIỆN CÓ TỪ 2 SUẤT DIỄN TRỞ LÊN và khách chưa chọn: Hỏi khách muốn tham gia suất diễn nào. (Nếu chỉ có 1 suất diễn thì tự động áp dụng suất đó, không cần hỏi).
   - HỎI THÔNG TIN VÉ: Nếu khách chưa nói rõ loại vé và số lượng muốn đặt, hãy giới thiệu lịch diễn của sự kiện, liệt kê các hạng vé hiện có kèm giá vé và số lượng vé còn lại, rồi hỏi khách muốn đặt loại vé nào và số lượng bao nhiêu (ví dụ: "Dạ, sự kiện sẽ diễn vào ... và hiện tại có các loại vé như sau: ... Bạn vui lòng cho Eve biết bạn muốn đặt loại vé nào và số lượng bao nhiêu nhé! 🎭"). TUYỆT ĐỐI KHÔNG hỏi số điện thoại và KHÔNG hỏi người tham gia khi khách chưa chọn vé!
3. THÔNG TIN NGƯỜI MUA:
   - TỰ ĐỘNG lấy Họ tên (${userProfile?.full_name || 'Khách hàng'}) và Email (${userProfile?.email || 'Chưa cập nhật'}) từ tài khoản cá nhân.
   - Số điện thoại liên hệ:
     ${effectivePhone ? `+ ĐÃ CÓ SĐT LIÊN HỆ: ${effectivePhone}. TUYỆT ĐỐI KHÔNG HỎI LẠI SỐ ĐIỆN THOẠI NỮA!` : `+ CHƯA CÓ SĐT: Bắt buộc hỏi khách cung cấp số điện thoại: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰"`}
4. THÔNG TIN NGƯỜI THAM GIA:
   ${requireAttendeeInfo ? 
   `- SỰ KIỆN NÀY YÊU CẦU THÔNG TIN NGƯỜI THAM GIA:
    + ĐIỀU KIỆN TIÊN QUYẾT: CHỈ HỎI KHI KHÁCH ĐÃ CHỌN XONG LOẠI VÉ VÀ SỐ LƯỢNG VÉ! Nếu khách chưa chọn vé, TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI thông tin người tham gia!
    + Sau khi khách ĐÃ CHỌN loại vé/số lượng và đã có SĐT liên hệ: BẮT BUỘC PHẢI HỎI thông tin người tham gia (Họ và tên, Email người tham gia). Gợi ý khách nếu là người tham gia thì chỉ cần gõ "dùng thông tin của tôi" là được!
    + Khi khách cung cấp thông tin người tham gia HOẶC khách nói "dùng thông tin của tôi" / "lấy thông tin của tôi": Kiểm tra xem đã đủ số lượng người cho số vé đặt hay chưa. Nếu đủ thì GỌI TOOL generatePrefillBookingAction!` 
   : 
   `- SỰ KIỆN NÀY KHÔNG YÊU CẦU THÔNG TIN NGƯỜI THAM GIA:
    + TUYỆT ĐỐI KHÔNG HỎI THÔNG TIN NGƯỜI THAM GIA!
    + Khi đã có số điện thoại liên hệ và loại vé/số lượng: LẬP TỨC GỌI TOOL generatePrefillBookingAction để hỗ trợ đặt vé và chuyển thẳng khách đến trang xác nhận vé (/booking/review)!`}`;
      }
    }

    const messages = [
      { role: 'system', content: dynamicSystemPrompt },
      ...cleanHistory,
      { role: 'user', content: message }
    ];

    if (currentMatchedEvent) {
      // User just named or asked for this specific event in the current message
      logger.info(`[AiAssistant] User specified event: "${currentMatchedEvent.title}" (${currentMatchedEvent.slug}). Pre-fetching event details...`);
      const detailRes = await this.executeTool(userId, 'getEventDetails', { eventId: currentMatchedEvent.slug });
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_auto_detail', function: { name: 'getEventDetails', arguments: { eventId: currentMatchedEvent.slug } } }]
      });
      messages.push({
        role: 'tool',
        name: 'getEventDetails',
        tool_call_id: 'call_auto_detail',
        content: JSON.stringify(detailRes)
      });
    } else if (!activeEvent) {
      // ONLY pre-fetch searchEvents when there is NO active event being discussed
      // AND the message is actually asking to discover events (not selecting tickets)
      const isBookingOrTicketSelect = /(suất|vé|ghế|đặt|mua|chọn|số lượng|\d+\s*vé)/i.test(message);
      const isEventInquiry = !isBookingOrTicketSelect && /(sự kiện gì|show gì|thể loại|lĩnh vực|nhạc|kịch|workshop|hội thảo|có gì hot|có gì hay|diễn ra|ca nhạc|concert|đang hot|tìm vé xem|sự kiện nào|sắp tới|nổi bật|sự kiện)/i.test(message);

      if (isEventInquiry) {
        let q = '';
        const catInfo = detectCategory(message);
        if (catInfo) {
          q = catInfo.name;
        } else if (!/hot|mới|hay|gợi ý|sự kiện nào|sắp tới|nổi bật/i.test(message)) {
          q = message.replace(/^(hãy|giúp|tôi|mình|cho|đặt|mua|vé|sự|kiện|show|ở|về|cho tôi hỏi|cho hỏi|eve ơi|có|gì|nào|đang|hay|không|\?|\s)+/gi, '').trim();
        }

        logger.info(`[AiAssistant] Pre-fetching events from DB for query: "${q}"...`);
        const searchRes = await this.executeTool(userId, 'searchEvents', { query: q, limit: 5 });
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_auto_search', function: { name: 'searchEvents', arguments: { query: q } } }]
        });
        messages.push({
          role: 'tool',
          name: 'searchEvents',
          tool_call_id: 'call_auto_search',
          content: JSON.stringify(searchRes)
        });
      }
    }

    // Context triggers for phone or "dùng thông tin của tôi":
    const normMsg = normalizeText(message);
    const hasUseMyInfoInMsg = /(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi|thong\s+tin\s+nhu\s+tren/i.test(normMsg);
    const allUserNorm = normalizeText(allUserMessages);
    const hasSaidUseMyInfo = /(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi|thong\s+tin\s+nhu\s+tren/i.test(allUserNorm);

    // Calculate ordered tickets and quantities from conversation:
    const ticketTypesList = eventDetail?.ticket_types || [];
    const detectedTickets = parseTicketsFromText(allUserMessages, ticketTypesList);
    const hasChosenTickets = detectedTickets.length > 0;
    const totalOrderQty = hasChosenTickets 
      ? detectedTickets.reduce((sum, dt) => sum + dt.quantity, 0)
      : 0;

    const collectedAttendees = extractAttendeesFromText(allUserMessages, userProfile);
    const hasEnoughAttendees = !requireAttendeeInfo || (hasChosenTickets && collectedAttendees.length >= totalOrderQty);

    const seatedOrderQty = (() => {
      if (detectedTickets.length > 0) return detectedTickets.reduce((sum, dt) => sum + dt.quantity, 0);
      const qtyMatch = allUserMessages.match(/(\d+)\s*(?:v[eé]|chỗ|ghế|ticket)/i);
      if (qtyMatch) {
        const q = parseInt(qtyMatch[1], 10);
        if (q > 0) return q;
      }
      if (collectedAttendees.length > 0) return collectedAttendees.length;
      return 1;
    })();

    const msgClean = (message || '').trim().replace(/[\.\-\s\+]/g, '');
    const isJustPhone = msgClean.length >= 9 && msgClean.length <= 13 && /^(?:84|0)[35789]\d{8}$|^0\d{9,10}$/.test(msgClean);

    if (activeEvent && hasSeatMap) {
      if (isJustPhone) {
        if (!requireAttendeeInfo) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Sự kiện có sơ đồ chỗ ngồi và KHÔNG yêu cầu thông tin người tham gia. Bạn PHẢI GỌI NGAY tool generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}" }) để mở sơ đồ chọn ghế cho khách!`
          });
        } else {
          if (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0) {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}) và đã cung cấp đủ thông tin người tham gia cho cả ${seatedOrderQty} vé: [${collectedAttendees.slice(0, seatedOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Bạn PHẢI GỌI NGAY tool generatePrefillBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}", quantity: ${seatedOrderQty} }) để tạo nút chọn ghế trên sơ đồ cho khách!`
            });
          } else {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Bạn hãy cảm ơn khách đã gửi SĐT, TUYỆT ĐỐI KHÔNG HỎI LẠI SỐ ĐIỆN THOẠI NỮA. Sự kiện này có sơ đồ chỗ ngồi và có yêu cầu thông tin check-in riêng cho từng người tham gia. Bạn hãy hỏi khách muốn đặt mấy vé và xin Họ tên + Email của người tham gia (khách có thể nhắn "dùng thông tin của tôi" nếu tự đi một mình).`
            });
          }
        }
      } else if (!effectivePhone) {
        messages.push({
          role: 'system',
          content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng muốn đặt vé nhưng tài khoản CHƯA CÓ số điện thoại liên hệ. Bạn hãy hỏi khách hàng số điện thoại liên hệ: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰". TUYỆT ĐỐI KHÔNG TỰ BỊA SỐ ĐIỆN THOẠI VÀ CHƯA GỌI TOOL generatePrefillBookingAction!`
        });
      } else if (requireAttendeeInfo) {
        if (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng đã cung cấp ĐỦ thông tin người tham gia cho cả ${seatedOrderQty} vé: [${collectedAttendees.slice(0, seatedOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Thông tin người mua tự động lấy từ tài khoản: ${userProfile?.full_name || 'Khách hàng'} (${userProfile?.email || ''}, SĐT: ${effectivePhone}).
Sự kiện có sơ đồ chỗ ngồi. Bạn BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${sessionList[0]?.id || ''}", quantity: ${seatedOrderQty} }) ngay lập tức để hoàn tất tạo thông tin vé cho khách!
TUYỆT ĐỐI KHÔNG được trả lời dạng hứa hẹn "đang chuyển bạn đến trang thanh toán", "vui lòng đợi" mà BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction!`
          });
        }
      }
    } else if (activeEvent && !hasSeatMap) {
      if (!hasChosenTickets) {
        // Customer has NOT chosen ticket types and quantities yet!
        // DO NOT ask for attendees or phone. Let the assistant introduce the schedule and ticket categories as requested.
        if (isJustPhone) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Bạn hãy cảm ơn khách đã gửi SĐT, rồi giới thiệu các loại vé hiện có kèm giá vé và hỏi khách muốn đặt loại vé nào và số lượng bao nhiêu vé nhé! 🎭`
          });
        }
      } else {
        // Customer HAS chosen tickets!
        if (isJustPhone) {
          if (!requireAttendeeInfo) {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Thông tin người mua đã đầy đủ và sự kiện này KHÔNG yêu cầu thông tin người tham gia. Bạn PHẢI GỌI NGAY tool generatePrefillBookingAction với buyerPhone: "${effectivePhone}" để tạo liên kết xác nhận đặt vé cho khách! TUYỆT ĐỐI KHÔNG hỏi lại số điện thoại và KHÔNG hỏi thông tin người tham gia!`
            });
          } else {
            if (hasEnoughAttendees) {
              messages.push({
                role: 'system',
                content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}) và đã cung cấp đủ thông tin người tham gia cho cả ${totalOrderQty} vé: [${collectedAttendees.slice(0, totalOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Thông tin người mua tự động lấy từ tài khoản (${userProfile?.full_name || 'Khách hàng'} - ${userProfile?.email || ''}). Bạn PHẢI GỌI NGAY tool generatePrefillBookingAction!`
              });
            } else {
              messages.push({
                role: 'system',
                content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Bạn hãy cảm ơn khách đã gửi SĐT, TUYỆT ĐỐI KHÔNG HỎI LẠI SỐ ĐIỆN THOẠI NỮA. Vì sự kiện này có yêu cầu thông tin check-in riêng cho từng người tham gia (${totalOrderQty} vé), hiện tại khách ${collectedAttendees.length > 0 ? `mới chỉ cung cấp ${collectedAttendees.length} người: [${collectedAttendees.map(a => `${a.name} - ${a.email}`).join('; ')}]` : 'chưa cung cấp thông tin người tham gia'}. Bạn PHẢI yêu cầu khách cung cấp Họ và tên + Email cho ${totalOrderQty - collectedAttendees.length} vé còn lại:\n${getRemainingTicketsDescription(detectedTickets, collectedAttendees.length)}\nTUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý HOÀN TẤT ĐẶT VÉ KHI THIẾU THÔNG TIN!`
              });
            }
          }
        } else if (!effectivePhone) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng đã chọn vé (${totalOrderQty} vé) nhưng tài khoản CHƯA CÓ số điện thoại liên hệ. Bạn hãy hỏi khách hàng số điện thoại liên hệ: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰". TUYỆT ĐỐI KHÔNG TỰ BỊA SỐ ĐIỆN THOẠI VÀ CHƯA GỌI TOOL generatePrefillBookingAction!`
          });
        } else if (requireAttendeeInfo) {
          if (hasEnoughAttendees) {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng đã cung cấp ĐỦ thông tin người tham gia cho tất cả ${totalOrderQty} vé: [${collectedAttendees.slice(0, totalOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Thông tin người mua tự động lấy từ tài khoản: ${userProfile?.full_name || 'Khách hàng'} (${userProfile?.email || ''}, SĐT: ${effectivePhone}). Bạn BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction ngay lập tức để hoàn tất đặt vé! TUYỆT ĐỐI KHÔNG hỏi thêm gì nữa!`
            });
          } else {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng đặt ${totalOrderQty} vé. Sự kiện này BẮT BUỘC có thông tin check-in riêng cho từng người tham gia (chỉ người đó mới được vào, không thể đổi người khác).
Hiện tại khách ${collectedAttendees.length > 0 ? `mới chỉ cung cấp ${collectedAttendees.length} người: [${collectedAttendees.map(a => `${a.name} - ${a.email}`).join('; ')}]` : 'chưa cung cấp thông tin người tham gia'}.
VẪN CÒN THIẾU ${totalOrderQty - collectedAttendees.length} người tham gia!
TUYỆT ĐỐI KHÔNG ĐƯỢC GỌI TOOL generatePrefillBookingAction!
Bạn hãy ghi nhận thông tin đã có (nếu có), và YÊU CẦU KHÁCH CUNG CẤP TIẾP Họ tên + Email cho ${totalOrderQty - collectedAttendees.length} vé còn lại:
${getRemainingTicketsDescription(detectedTickets, collectedAttendees.length)}`
            });
          }
        }
      }
    }

    const MAX_LOOPS = 5;
    let loopsLeft = MAX_LOOPS;
    let finalContent = "";
    const toolExecutionContext = {
      userProfile,
      history: cleanHistory,
      message,
      activeEvent,
      lastGeneratedActionTag: null
    };

    while (loopsLeft > 0) {
      const loopNum = MAX_LOOPS - loopsLeft + 1;
      logger.info(`[AgentLoop] Loop ${loopNum} starting...`);

      const lastMessage = messages[messages.length - 1];
      const hasRecentToolResult = lastMessage && lastMessage.role === 'tool';
      let activeTools = TOOLS;
      if (hasRecentToolResult) {
        activeTools = [];
      } else if (activeEvent && !/(sự kiện khác|show khác|tìm sự kiện|tìm kiếm|xem sự kiện khác)/i.test(message)) {
        // When user is currently in a booking flow for an active event, exclude searchEvents so model doesn't search for session/ticket terms
        activeTools = TOOLS.filter(t => t.function.name !== 'searchEvents');

        // Only allow generatePrefillBookingAction when customer has chosen tickets, has phone, and has provided enough attendees
        const canPrefill = hasSeatMap
          ? (Boolean(effectivePhone) && (!requireAttendeeInfo || (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0)))
          : (hasChosenTickets && Boolean(effectivePhone) && hasEnoughAttendees);
        if (!canPrefill) {
          activeTools = activeTools.filter(t => t.function.name !== 'generatePrefillBookingAction');
        }
      }

      let response = await ollamaClient.chat(messages, { tools: activeTools });
      let toolCalls = response.tool_calls || [];

      // Fallback: If model returned empty content with tools enabled, re-run without tools
      if (!response.content && toolCalls.length === 0 && activeTools.length > 0) {
        logger.info(`[AgentLoop] Model returned empty with tools, retrying without tools...`);
        response = await ollamaClient.chat(messages, { tools: [] });
        toolCalls = response.tool_calls || [];
      }

      logger.info(`[AgentLoop] Content: "${(response.content || '').substring(0, 200)}"`);
      logger.info(`[AgentLoop] Tool calls: ${JSON.stringify(toolCalls.map(tc => tc.function?.name || 'unknown'))}`);

      // If model made tool calls → execute them and loop again
      if (toolCalls.length > 0) {
        // Push assistant message WITH tool_calls for Ollama's chat template
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: toolCalls
        });

        for (const call of toolCalls) {
          const toolName = call.function.name;
          const toolArgs = call.function.arguments || {};
          logger.info(`[AgentLoop] Executing tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
          
          const result = await this.executeTool(userId, toolName, toolArgs, toolExecutionContext);
          logger.info(`[AgentLoop] Tool result: ${JSON.stringify(result).substring(0, 300)}`);

          messages.push({
            role: 'tool',
            name: toolName,
            tool_call_id: call.id,
            content: JSON.stringify(result)
          });
        }

        loopsLeft--;
        continue;
      }

      // No tool calls → model is done, this is the final response
      finalContent = response.content || '';
      logger.info(`[AgentLoop] Finished. Final content length: ${finalContent.length}`);
      break;
    }

    if (loopsLeft === 0 && !finalContent) {
      logger.warn(`[AgentLoop] Max loops (${MAX_LOOPS}) exhausted!`);
      finalContent = "Eve đã cố gắng tìm kiếm nhưng có vẻ thông tin hơi phức tạp. Bạn có thể cung cấp thêm chi tiết để Eve hỗ trợ tốt hơn không? 🥺";
    }

    // Strip <think> blocks from the output (Qwen3 thinking mode)
    finalContent = this._stripThinkBlocks(finalContent);

    // Programmatic Grounding Sanitizer: Filter out any hallucinated event not in EventHub
    finalContent = await this._sanitizeEventRecommendations(finalContent, activeEvent);

    // Sanitize any Chinese characters leaked by Qwen foundation model
    finalContent = finalContent
      .replace(/電子信箱|电子邮箱|邮箱/gi, 'Email')
      .replace(/[\u4e00-\u9fff]+/g, '')
      .replace(/\s*\(?\s*Đang xử lý đặt vé[^\)]*\)?\s*/gi, '')
      .trim();

    // Convert any code-block function calls like ```javascript generateBookingAction(...)``` into actual action tag
    if (finalContent.includes('generateBookingAction') && !finalContent.includes('[ACTION:BOOKING:')) {
      const codeCallMatch = finalContent.match(/generateBookingAction\s*\(\s*\{([\s\S]*?)\}\s*\)/i);
      if (codeCallMatch) {
        const argsText = codeCallMatch[1];
        const evMatch = argsText.match(/eventId\s*:\s*["']([^"']+)["']/i);
        const sessMatch = argsText.match(/sessionId\s*:\s*["']([^"']+)["']/i);
        const evId = evMatch ? evMatch[1] : (activeEvent?.slug || '');
        const sessId = sessMatch ? sessMatch[1] : '';
        if (evId) {
          finalContent = finalContent.replace(/```[a-z]*\s*generateBookingAction\s*\([\s\S]*?\)\s*```/gi, '').trim();
          finalContent += `\n\n[ACTION:BOOKING:${evId}${sessId ? `:${sessId}` : ''}]`;
        }
      }
    }

    // Safety net for ACTION tags:
    // If the requirements are met but the model did NOT emit the tool call (or hallucinated in text),
    // automatically execute generatePrefillBookingAction deterministically!
    let effectiveSeatedQty = seatedOrderQty || 1;
    if (!toolExecutionContext.lastGeneratedActionTag && activeEvent) {
      let shouldAutoPrefill = false;
      let autoPrefillQty = 1;

      if (hasSeatMap) {
        if (effectivePhone && (!requireAttendeeInfo || (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0))) {
          shouldAutoPrefill = true;
          autoPrefillQty = seatedOrderQty;
          effectiveSeatedQty = autoPrefillQty;
        }
      } else {
        if (hasChosenTickets && Boolean(effectivePhone) && hasEnoughAttendees) {
          shouldAutoPrefill = true;
          autoPrefillQty = totalOrderQty;
        }
      }

      if (shouldAutoPrefill) {
        logger.info(`[AgentLoop] Auto-triggering generatePrefillBookingAction (hasSeatMap=${hasSeatMap}, qty=${autoPrefillQty}) because all requirements are met but model skipped tool call.`);
        await this.executeTool(userId, 'generatePrefillBookingAction', {
          eventId: activeEvent.slug,
          sessionId: (sessionList?.[0]?.id || eventDetail?.sessions?.[0]?.id || activeEvent.sessions?.[0]?.id || ''),
          quantity: autoPrefillQty
        }, toolExecutionContext);
      }
    }

    // If an action tool was executed (or auto-triggered),
    // ensure that any truncated, corrupted, or missing action tag is cleaned up and replaced with the exact generated tag!
    if (toolExecutionContext.lastGeneratedActionTag) {
      // Remove any partial, truncated, or broken [ACTION:... from model output
      finalContent = finalContent.replace(/\[ACTION:[A-Z_]+:?[\s\S]*?(?:\]|$)/gi, '').trim();

      // If the model ended with a pending/waiting phrase like "Vui lòng đợi một chút nhé", make it clear and helpful
      if (/vui lòng đợi|đang xử lý|đang chuyển|hãy đợi|chuyển bạn đến trang/i.test(finalContent)) {
        finalContent = finalContent.replace(/(?:👉\s*)?(?:\*{1,2})?(?:vui lòng đợi|đang xử lý|đang chuyển|hãy đợi|chuyển bạn đến trang)[\s\S]*$/i, '').trim();
        if (hasSeatMap) {
          finalContent += `\n\nEve đã ghi nhận thông tin người tham gia cho bạn rồi nhé! Bạn nhấn vào nút bên dưới để chọn đúng ${effectiveSeatedQty} vị trí ghế ưng ý trên sơ đồ, sau đó hệ thống sẽ tự động đưa bạn đến thẳng trang thanh toán nha! 🎭✨`;
        } else {
          finalContent += '\n\nEve đã tạo thông tin vé giúp bạn rồi nè! Bạn nhấn vào nút bên dưới để chuyển thẳng đến trang xác nhận và thanh toán vé nha! 🎉';
        }
      }

      finalContent += `\n\n${toolExecutionContext.lastGeneratedActionTag}`;
    }

    // Final safety net
    if (!finalContent || finalContent.trim() === '') {
      logger.info(`[AgentLoop] Empty content after stripping think blocks.`);
      finalContent = "Ui cha, hệ thống của Eve vừa bị hắt xì hơi một chút! Bạn có thể nhắc lại hoặc tải lại trang web (F5) để xóa lịch sử chat và thử lại nhé! 🥺";
    }

    // Asynchronously log this conversation turn for continuous self-training
    this._logConversationSample(messages, finalContent);

    return {
      role: 'assistant',
      content: finalContent
    };
  }

  /**
   * Log meaningful conversation turns into ai/datasets/collected_chat_logs.jsonl for future model fine-tuning.
   */
  async _logConversationSample(messages, finalContent) {
    try {
      if (!finalContent || finalContent.includes('hắt xì hơi') || finalContent.length < 10) return;

      const logPath = path.resolve(__dirname, '../../../../ai/datasets/collected_chat_logs.jsonl');
      const dir = path.dirname(logPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Clean messages for training dataset format
      const trainingMessages = messages.map(m => {
        if (m.role === 'tool') {
          return { role: 'tool', name: m.name, content: m.content };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls };
        }
        return { role: m.role, content: m.content || '' };
      });

      // Add final assistant message
      trainingMessages.push({ role: 'assistant', content: finalContent });

      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        messages: trainingMessages
      });

      await fs.promises.appendFile(logPath, line + '\n', 'utf-8');
      logger.info(`[AiAssistant] Successfully logged conversation turn to ${logPath}`);
    } catch (err) {
      logger.warn(`[AiAssistant] Could not log conversation sample for training: ${err.message}`);
    }
  }

  /**
   * Get statistics of collected real-world training samples.
   */
  async getCollectedTrainingStats() {
    try {
      const logPath = path.resolve(__dirname, '../../../../ai/datasets/collected_chat_logs.jsonl');
      if (!fs.existsSync(logPath)) {
        return { count: 0, path: logPath };
      }
      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      return { count: lines.length, path: logPath };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  }

  /**
   * Strip <think>...</think> blocks from model output.
   * Qwen3 uses these for chain-of-thought reasoning which should not be shown to users.
   */
  _stripThinkBlocks(text) {
    if (!text) return '';
    // Remove all <think>...</think> blocks (including multiline)
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // If the model only output a think block with no visible content, 
    // try to extract from inside the think block as a fallback
    if (!cleaned && text.toLowerCase().includes('<think>')) {
      logger.info(`[AgentLoop] Fallback: AI only generated <think> block.`);
      cleaned = text.replace(/<\/?think>/gi, '').trim();
    }
    // Clean meta-preambles often produced by Qwen when responding to system instructions
    cleaned = cleaned.replace(/^Dưới đây là (?:nội dung|câu trả lời|tin nhắn|thông tin|đoạn chat).*?(?:\n+---*\n*|\n\n)/i, '').trim();
    return cleaned;
  }

  /**
   * Programmatic Grounding Sanitizer:
   * Analyzes assistant content and verifies all mentioned events against the real EventHub database.
   * If any event is hallucinated / does not exist in EventHub, it is filtered out.
   */
  async _sanitizeEventRecommendations(content, activeEvent = null) {
    if (!content || content.length < 20) return content;
    // If we are currently handling an active event in conversation, do not sanitize questions/dialogue as event recommendations
    if (activeEvent) return content;

    const publishedEvents = await getPublishedEventsCache();
    if (!publishedEvents || publishedEvents.length === 0) return content;

    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u1EA0-\u1EF9]/gi, ' ').replace(/\s+/g, ' ').trim();

    // If the content directly mentions a verified published event from our database, it is 100% grounded!
    const normContent = normalize(content);
    const mentionsVerifiedEvent = publishedEvents.some(pub => {
      const normPub = normalize(pub.title);
      return normPub.length >= 4 && normContent.includes(normPub);
    });
    if (mentionsVerifiedEvent) {
      return content;
    }

    const matchesAnyPublished = (candidate) => {
      const normCand = normalize(candidate);
      if (normCand.length < 3) return false;
      return publishedEvents.some(pub => {
        const normPub = normalize(pub.title);
        return normPub.includes(normCand) || normCand.includes(normPub);
      });
    };

    const sections = content.split(/\n\s*\n/);
    const keptSections = [];
    let detectedEventCount = 0;
    let validEventCount = 0;

    for (const sec of sections) {
      // If the section is asking the user questions or listing required fields, it is NOT an event block
      if (/(vui lòng cung cấp|cho eve xin|thông tin sau|bạn có thể gửi|để hỗ trợ bạn|đặt vé|hướng dẫn|thông tin liên hệ|bước \d)/i.test(sec)) {
        keptSections.push(sec);
        continue;
      }

      const lines = sec.trim().split('\n');
      const isListCandidate = /^\s*(\d+[\.\)]|[\*\-\•])\s+/.test(lines[0]);
      const hasPrice = lines.some(l => /(\d+[\.\,]?\d*\s*(đ|vnd|đồng)|giá vé|vé từ)/i.test(l));
      const hasTimeOrLocation = lines.some(l => /(thời gian|ngày diễn|địa điểm|suất diễn|venue|bắt đầu)/i.test(l));
      const isEventBlock = isListCandidate && hasPrice && hasTimeOrLocation;

      if (isEventBlock) {
        detectedEventCount++;
        const titleCandidate = lines[0].replace(/^[\d\.\-\*\#\s]+/, '').replace(/\*+/g, '').trim();
        // Ignore prompts and non-event titles
        if (/(tên sự kiện|thời gian|suất diễn|loại vé|số lượng|số điện thoại|sdt|email|họ tên|họ và tên|thông tin|người tham gia|xác nhận|chọn ghế|thanh toán|lưu ý)/i.test(titleCandidate)) {
          keptSections.push(sec);
          continue;
        }

        if (matchesAnyPublished(titleCandidate)) {
          validEventCount++;
          const renumbered = sec.replace(/^\d+\.\s*/, `${validEventCount}. `);
          keptSections.push(renumbered);
        } else {
          logger.warn(`[GroundingSanitizer] Filtered out hallucinated event block: "${titleCandidate}"`);
        }
      } else {
        keptSections.push(sec);
      }
    }

    // If hallucinated events were detected and removed
    if (detectedEventCount > 0 && validEventCount < detectedEventCount) {
      if (validEventCount === 0) {
        // All events in the recommendation were hallucinated! Replace with real UPCOMING events
        logger.warn(`[GroundingSanitizer] All ${detectedEventCount} events were hallucinated! Replacing with grounded upcoming events.`);
        let upcomingEvents = [];
        try {
          const upRes = await eventsService.getPublicEvents({ limit: 3, page: 1, upcoming_only: true });
          upcomingEvents = upRes.items || [];
        } catch { }

        const eventListStr = upcomingEvents.map((e, idx) => 
          `${idx + 1}. **${e.title}**\n   - Thể loại: ${e.category?.name || 'Sự kiện'}\n   - Giá vé từ: ${e.min_price ? Number(e.min_price).toLocaleString('vi-VN') + 'đ' : 'Liên hệ'}`
        ).join('\n\n');

        return `Dạ hiện tại trên EventHub chưa có sự kiện khớp với yêu cầu bạn vừa hỏi rồi nè 🥺.\n\nEve xin gợi ý một số sự kiện nổi bật đang có trên hệ thống EventHub để bạn tham khảo nhé:\n\n${eventListStr}\n\nBạn có muốn Eve hỗ trợ xem thông tin sự kiện nào trong số này không ạ? 🥰`;
      }

      let result = keptSections.join('\n\n');
      result = result.replace(/tìm thấy \d+ sự kiện/i, `tìm thấy ${validEventCount} sự kiện`);
      result = result.replace(/có \d+ sự kiện/i, `có ${validEventCount} sự kiện`);
      return result;
    }

    return content;
  }
}

module.exports = new AiAssistantService();
