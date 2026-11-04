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
const seatAllocationService = require('../events/seatAllocation.service');
const { normalizeRules } = require('../events/seatingRules');
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
      short_description: r.short_description || '',
      category_name: r.category_name,
      category_slug: r.category_slug,
      city: r.city || '',
      venue_name: r.venue_name || '',
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

// Semantic topic map linking customer natural language queries/interests to real events and categories in EventHub
const SEMANTIC_TOPIC_MAP = [
  {
    topic: 'xe cộ, ô tô & tốc độ',
    terms: ['xe', 'o to', 'oto', 'xe hoi', 'sieu xe', 'xe may', 'motor', 'car', 'racing', 'porsche', 'ferrari', 'lamborghini', 'bmw', 'mercedes', 'audi', 'vinfast', 'honda', 'yamaha', 'trien lam xe', 'lai thu', 'xe the thao', 'o to the thao'],
    matchedSlugs: ['khong-gian-trai-nghiem-porsche-tai-a-nang-mrucqut0'],
    relatedCategories: ['kinh-doanh-cong-nghe', 'le-hoi-van-hoa'],
    highlightIntro: 'Không gian Trải nghiệm Porsche tại Đà Nẵng (sự kiện trải nghiệm xe thể thao & công nghệ đẳng cấp)'
  },
  {
    topic: 'hội họa & vẽ tranh',
    terms: ['ve', 've tranh', 'my thuat', 'hoi hoa', 'sap dau', 'mau nuoc', 'oil pastel', 'painting', 'art', 'workshop ve', 've voi'],
    matchedSlugs: ['art-workshop-oil-pastel-painting-melted-thoughts'],
    relatedCategories: ['hoi-thao-giao-duc', 'le-hoi-van-hoa'],
    highlightIntro: 'ART WORKSHOP OIL PASTEL PAINTING "MELTED THOUGHTS" (workshop vẽ tranh sáp dầu nghệ thuật)'
  },
  {
    topic: 'làm gốm & đồ thủ công',
    terms: ['gom', 'lam gom', 'do gom', 'gom su', 'pottery', 'ceramic', 'thu cong', 'handmade', 'lemlab', 'nan gom'],
    matchedSlugs: ['lemlab-workshop-trai-nghiem-lam-gom-mrwjuz6a'],
    relatedCategories: ['le-hoi-van-hoa', 'hoi-thao-giao-duc'],
    highlightIntro: '[LEMLAB] Workshop TRẢI NGHIỆM LÀM GỐM (workshop thủ công trải nghiệm làm gốm nghệ thuật)'
  },
  {
    topic: 'sân khấu & kịch nghệ',
    terms: ['kich', 'hai kich', 'san khau', 'tuong', 'vo kich', 'dien xuat', 'idecaf', 'quoc thao', 'san khau 5b', 'luong son ba', 'chuc anh dai', 'dao hoa hau', 'ngoi nha thieu dan ba', 'ngoi nha khong co dan ong', 'dam cuoi ben con', 'dai chien hon trieu do', 'nhac kich thieu nhi', 'san khau moi'],
    matchedSlugs: [
      'nha-hat-kich-idecaf-luong-son-ba-chuc-anh-ai-ngoai-truyen-mue2mmg0',
      'hai-kich-dao-hoa-hau',
      'san-khau-5b-ngoi-nha-thieu-an-ba-mrnc8t3p',
      'ngoi-nha-khong-co-an-ong-mukod5va',
      'san-khau-quoc-thao-ai-chien-hon-trieu-o-mruj7512',
      'skqt-am-cuoi-ben-con-mrujlcl1',
      'san-khau-quoc-thao-nhac-kich-thieu-nhi-vung-at-dieu-ky-mrxvo3dn',
      'vo-dien-ra-gieng-cho-cuoi-hon-mot-cai-nha-ba-kieu-tet-san-khau-moi-mue2y8hj'
    ],
    relatedCategories: ['am-nhac-bieu-dien', 'le-hoi-van-hoa'],
    highlightIntro: 'Các vở kịch đặc sắc tại Sân khấu kịch IDECAF, Sân khấu 5B và Sân khấu Quốc Thảo'
  },
  {
    topic: 'âm nhạc, ca nhạc & concert',
    terms: ['nhac', 'ca nhac', 'hat', 'live show', 'concert', 'am nhac', 'show ca nhac', 'liveshow', 'ca si', 'nhac song', 'fan meeting', 'rap', 'hiphop', 'indie', 'ballad'],
    matchedSlugs: [
      'nhung-thanh-pho-mo-mang-ha-noi-2026',
      'legacy-of-love-10-nam-tuong-nho-nhac-si-thanh-tung-mruchtam',
      'fan-meeting-off-space',
      'xoay-tron-concert-hoang-dung-mrwida3r',
      'ha-nhi-nguoi-yeu-cu-la-tri-ky-mrxwj3rq'
    ],
    relatedCategories: ['am-nhac-bieu-dien'],
    highlightIntro: 'Các đại nhạc hội và live concert nổi bật (Những Thành Phố Mơ Màng, Hoàng Dũng, Hà Nhi, SpaceSpeakers...)'
  }
];

function isGeneralDiscoveryQuery(message) {
  if (!message) return true;
  const norm = normalizeText(message);

  // Pure greeting
  if (/^(xin chao|chao ban|chao eve|chao em|hello|hi|hey|halo|alo)\s*([!.,~^]?)*$/i.test(norm)) {
    return true;
  }

  // Casual general discovery ("có sự kiện gì thú vị không", "có gì hot không", "gợi ý sự kiện hay", etc.)
  const hasDiscoveryVibe = /(co|tim|goi y|xem|co nhung)?\s*(su kien|show|chuong trinh|hoat dong|ke hoach)?\s*(gi|nao)?\s*(hot|moi|hay|thu vi|vui|hap dan|dac sac|noi bat|sap toi|dang dien ra|dang co|nay|khong|\?|\s)*$/i.test(norm);
  if (hasDiscoveryVibe) {
    // If there is NO specific niche topic/entity mentioned:
    const specificTopics = /(xe|o to|oto|kich|nhac|ve tranh|gom|marathon|chay bo|hoi thao|kinh doanh|cong nghe|rap|rock|ballad|concert|fan meeting|hai|tuong|workshop|porsche|da nang|ha noi|sai gon|tphcm|hoang dung|thanh tung|soobin|ha nhi)/i;
    if (!specificTopics.test(norm)) {
      return true;
    }
  }

  return false;
}

function extractCoreSearchQuery(message) {
  if (!message) return '';
  let str = message.trim();
  // Remove greetings at start
  str = str.replace(/^(xin\s*chào|chào\s*bạn|chào\s*eve|chào\s*em|chào|hello|hi|hey|alo)\s*[,.!?~]*/gi, '').trim();
  // Remove polite inquiries
  str = str.replace(/^(bạn\s*ơi|eve\s*ơi|cho\s*mình\s*hỏi|cho\s*tôi\s*hỏi|hỏi\s*chút|tìm\s*giúp\s*mình|tìm\s*giúp\s*tôi|giúp\s*mình|giúp\s*tôi|tôi\s*muốn\s*tìm|mình\s*muốn\s*tìm|tìm\s*kiếm|tìm|xem|gợi\s*ý)\s+/gi, '').trim();
  // Remove "có sự kiện/show/chương trình ... nào không / về ..."
  str = str.replace(/^(có|có\s*những)\s+(sự\s*kiện|show|chương\s*trình|hoạt\s*động|vé)\s+(gì|nào)?\s*/gi, '').trim();
  str = str.replace(/^(sự\s*kiện|show|chương\s*trình|hoạt\s*động|vé)\s+(gì|nào)?\s*/gi, '').trim();
  str = str.replace(/^(về|liên\s*quan\s*đến|chủ\s*đề)\s+/gi, '').trim();
  // Remove question endings: nào không, không ạ, không, hả, nhỉ, thế, v.v.
  str = str.replace(/\s+(nào\s*không|không\s*ạ|không\s*nhỉ|không\s*bạn|không\s*eve|không|hả|nhỉ|thế|vậy|ạ|nhé|nha)[\s?!.]*$/gi, '').trim();
  str = str.replace(/[?!.]+$/g, '').trim();

  // If query is now purely generic discovery words, return empty for general upcoming
  if (/^(hot|mới|hay|gợi ý|sự kiện|tất cả|đang hot|sắp tới|nổi bật|thú vị|vui|gì|nào)$/i.test(str)) {
    return '';
  }
  return str;
}

function detectCategory(queryOrMessage) {
  if (!queryOrMessage) return null;
  const norm = normalizeText(queryOrMessage);
  if (/(am nhac|ca nhac|nhac|concert|live show|hat|ca si|ban nhac|rap|hiphop|rock|indie|ballad)/.test(norm)) {
    return { name: 'Âm nhạc & Biểu diễn', slug: 'am-nhac-bieu-dien' };
  }
  if (/(kich|hai kich|san khau|vo dien|tuong|dien xuat|kich noi)/.test(norm)) {
    return { name: 'Âm nhạc & Biểu diễn', slug: 'am-nhac-bieu-dien' };
  }
  if (/(hoi thao|giao duc|workshop|toa dam|hoc thuat|lop hoc|lam gom|ve tranh|thu cong)/.test(norm)) {
    return { name: 'Hội thảo & Giáo dục', slug: 'hoi-thao-giao-duc' };
  }
  if (/(le hoi|van hoa|trien lam|du lich|am thuc|hoi cho)/.test(norm)) {
    return { name: 'Lễ hội & Văn hóa', slug: 'le-hoi-van-hoa' };
  }
  if (/(kinh doanh|cong nghe|startup|tri tue nhan tao|tri tue|xe|o to|oto|xe hoi|sieu xe|motor|porsche)/.test(norm)) {
    return { name: 'Kinh doanh & Công nghệ', slug: 'kinh-doanh-cong-nghe' };
  }
  if (/(the thao|chay bo|marathon|giai dau|bong da)/.test(norm)) {
    return { name: 'Thể thao', slug: 'the-thao' };
  }
  return null;
}

function extractPhoneNumber(text) {
  if (!text) return '';
  const candidates = text.match(/(?:\(\+?84\)|\+84|84|0)[0-9\.\-\s\(\)]{8,17}/g) || [];
  for (const cand of candidates) {
    let clean = cand.replace(/[\.\-\s\(\)]/g, '');
    if (clean.startsWith('+840')) clean = clean.slice(3);
    else if (clean.startsWith('840')) clean = clean.slice(2);
    else if (clean.startsWith('+84')) clean = '0' + clean.slice(3);
    else if (clean.startsWith('84') && clean.length === 11) clean = '0' + clean.slice(2);

    if (/^0(?:3|5|7|8|9)\d{8}$/.test(clean)) {
      return clean;
    }
    if (/^0\d{9,10}$/.test(clean)) {
      return clean;
    }
  }
  return '';
}

const VIETNAMESE_WORD_TO_NUM = {
  'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'tu': 4, 'nam': 5,
  'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10,
  'cap': 2, 'doi': 2
};

function parseQuantityFromText(text, prevQuantity = null) {
  if (!text) return null;
  const norm = normalizeText(text);

  // 1. Explicit target TOTAL expressions (HIGHEST PRIORITY):
  // 'tong cong la 3 ve', 'tong cong 3 ve', 'tong la 3 ve', 'tong 3 ve', 'tat ca 3 ve', 'thanh 3 ve', 'doi thanh 3 ve', 'thanh 2 slot'
  const totalDigitMatch = norm.match(/(?:tong\s*cong|tong|tat\s*ca|thanh|doi\s*thanh|chuyen\s*thanh|tang\s*len|giam\s*xuong)\s*(?:la\s*)?(\d+)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?\b/i);
  if (totalDigitMatch) {
    return parseInt(totalDigitMatch[1], 10);
  }

  const totalWordMatch = norm.match(/(?:tong\s*cong|tong|tat\s*ca|thanh|doi\s*thanh|chuyen\s*thanh|tang\s*len|giam\s*xuong)\s*(?:la\s*)?(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?\b/i);
  if (totalWordMatch && VIETNAMESE_WORD_TO_NUM[totalWordMatch[1]]) {
    return VIETNAMESE_WORD_TO_NUM[totalWordMatch[1]];
  }

  // 2. Relative ADDITION / REDUCTION when previous quantity is known:
  // 'them 1 ve nua', 'dat them 1 ve', 'mua them 2 ve', 'lay them 1', 'them 1 slot'
  const addMatch = norm.match(/(?:dat\s*them|mua\s*them|lay\s*them|tang\s*them|them)\s+(?:cho\s*(?:minh|toi|tui|em|anh)\s*)?(\d+)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?(?:\s*nua)?\b/i);
  if (addMatch) {
    const addCount = parseInt(addMatch[1], 10);
    if (prevQuantity && prevQuantity > 0) {
      return prevQuantity + addCount;
    }
  }

  const addWordMatch = norm.match(/(?:dat\s*them|mua\s*them|lay\s*them|tang\s*them|them)\s+(?:cho\s*(?:minh|toi|tui|em|anh)\s*)?(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?(?:\s*nua)?\b/i);
  if (addWordMatch && VIETNAMESE_WORD_TO_NUM[addWordMatch[1]]) {
    const addCount = VIETNAMESE_WORD_TO_NUM[addWordMatch[1]];
    if (prevQuantity && prevQuantity > 0) {
      return prevQuantity + addCount;
    }
  }

  const subMatch = norm.match(/(?:bot|giam|huy\s*bot|bo\s*bot|bo)\s*(?:di\s*)?(\d+)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?\b/i);
  if (subMatch && prevQuantity && prevQuantity > 0) {
    const subCount = parseInt(subMatch[1], 10);
    return Math.max(1, prevQuantity - subCount);
  }

  const subWordMatch = norm.match(/(?:bot|giam|huy\s*bot|bo\s*bot|bo)\s*(?:di\s*)?(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)?\b/i);
  if (subWordMatch && VIETNAMESE_WORD_TO_NUM[subWordMatch[1]] && prevQuantity && prevQuantity > 0) {
    const subCount = VIETNAMESE_WORD_TO_NUM[subWordMatch[1]];
    return Math.max(1, prevQuantity - subCount);
  }

  // 3. Direct pairs with digit: "1 cap", "2 cap", "1 doi", "2 doi"
  const capMatch = norm.match(/(\d+)\s*(?:cap|doi)\b/i);
  if (capMatch) return parseInt(capMatch[1], 10) * 2;

  // 4. Action verb or modification verb followed by digits: "dat 2", "mua 3", "lay 1", "doi sang 2", "cho minh 2", "cho 2 slot", "nhom 3 dua", "2 dua tui"
  const actionDigitMatch = norm.match(/(?:dat|mua|lay|book|cham|doi\s*sang|chuyen\s*sang|cho\s*minh|cho\s*toi|cho\s*tui|cho|di|nhom|tui\s*minh|chung\s*minh)\s+(?:(?:giup|ho|gium|cho)\s*)?(?:minh|toi|tui|em|anh|chi|mik|b|fen|sop|shop|ad)?\s*(\d+)\b/i);
  if (actionDigitMatch) return parseInt(actionDigitMatch[1], 10);

  // 5. Check digit + ticket unit: "1 ve", "2 ve", "3 cho", "4 ghe", "2 ticket", "1 suat", "3 nguoi", "cho 3 nguoi", "2 slot", "3 dua", "2 ban", "2 mang"
  const digitUnitMatch = norm.match(/(?:cho\s*)?(\d+)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)\b/i);
  if (digitUnitMatch) return parseInt(digitUnitMatch[1], 10);

  // 6. Check numeral word + ticket unit: "mot ve", "hai ve", "ba ve", "hai nguoi", "hai slot"
  const wordUnitMatch = norm.match(/(?:cho\s*)?\b(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(?:ve|cho|ghe|ticket|suat|nguoi|slot|dua|ban|mang|phan)\b/i);
  if (wordUnitMatch && VIETNAMESE_WORD_TO_NUM[wordUnitMatch[1]]) {
    return VIETNAMESE_WORD_TO_NUM[wordUnitMatch[1]];
  }

  // 7. Action verb or modification verb followed by numeral word: "dat mot", "mua hai", "cho hai", "di hai"
  const actionWordMatch = norm.match(/(?:dat|mua|lay|book|cham|doi\s*sang|chuyen\s*sang|cho\s*minh|cho\s*toi|cho\s*tui|cho|di|nhom|tui\s*minh|chung\s*minh)\s+(?:(?:giup|ho|gium|cho)\s*)?(?:minh|toi|tui|em|anh|chi|mik|b|fen|sop|shop|ad)?\s*(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\b/i);
  if (actionWordMatch && VIETNAMESE_WORD_TO_NUM[actionWordMatch[1]]) {
    return VIETNAMESE_WORD_TO_NUM[actionWordMatch[1]];
  }

  // 8. Check standalone pair words "cap", "doi", excluding modification verbs (doi sang/thanh/qua/lai/hang/ghe/loai)
  if (/\b(?:1\s*cap|cap)\s*(?:ve)?\b/i.test(norm)) return 2;
  if (/\b(?:1\s*doi|doi\s*ve|mot\s*doi)\b/i.test(norm) && !/\bdoi\s*(?:sang|thanh|qua|lai|hang|ghe|loai)\b/i.test(norm)) return 2;
  if (/\bdoi\b/i.test(norm) && !/\bdoi\s*(?:sang|thanh|qua|lai|hang|ghe|loai|ve|cho)\b/i.test(norm) && /(?:mua|dat|lay)\s+doi\b/i.test(norm)) return 2;

  return null;
}

const ROMAN_NUMERAL_MAP = {
  '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v',
  'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5'
};

function parseTicketsFromText(allUserText, ticketTypes) {
  if (!allUserText || !ticketTypes || ticketTypes.length === 0) return [];
  const detectedTickets = [];
  const normUserText = normalizeText(allUserText);

  for (const t of ticketTypes) {
    const rawNorm = normalizeText(t.name);
    let cleanName = rawNorm.replace(/\([^)]*\)/g, '').replace(/\b(?:hang|loai|ve)\s+/g, '').trim();
    const pNum = Number(t.price || 0);
    const pK = pNum >= 1000 ? `${Math.round(pNum / 1000)}k` : '';

    const candidates = new Set();
    if (cleanName.length >= 2) candidates.add(cleanName);
    if (rawNorm.length >= 3) candidates.add(rawNorm);

    // Numbered zone abbreviations: "khu vuc 1" -> "khu 1", "kv 1", "kv1", "loai 1", "khu i", "kv i"
    const numMatch = cleanName.match(/(\d+)/);
    if (numMatch) {
      const num = numMatch[1];
      candidates.add(`khu ${num}`);
      candidates.add(`khu vuc ${num}`);
      candidates.add(`kv ${num}`);
      candidates.add(`kv${num}`);
      candidates.add(`loai ${num}`);
      candidates.add(`hang ${num}`);

      const roman = ROMAN_NUMERAL_MAP[num];
      if (roman) {
        candidates.add(`khu ${roman}`);
        candidates.add(`khu vuc ${roman}`);
        candidates.add(`kv ${roman}`);
        candidates.add(`kv${roman}`);
      }
    }

    // Check for roman numeral in name: "khu vuc i" -> "khu 1", "kv 1"
    const romanMatch = cleanName.match(/\b(i{1,3}|iv|v)\b/);
    if (romanMatch) {
      const rom = romanMatch[1];
      const digit = ROMAN_NUMERAL_MAP[rom];
      if (digit) {
        candidates.add(`khu ${digit}`);
        candidates.add(`khu vuc ${digit}`);
        candidates.add(`kv ${digit}`);
        candidates.add(`kv${digit}`);
      }
    }

    // Distinctive single tokens (only if not generic stop words like 'khu' or 'vuc')
    const tokens = cleanName.split(/\s+/).filter(w => w.length >= 2 && !['khu', 'vuc', 'hang', 'loai', 've', 'zone', 'ticket'].includes(w));
    for (const tok of tokens) {
      const sharedWithOther = ticketTypes.some(other => other.id !== t.id && normalizeText(other.name).includes(tok));
      if (!sharedWithOther) {
        candidates.add(tok);
      }
    }

    if (pK) candidates.add(pK);

    let matchedQty = 0;

    for (const cand of candidates) {
      const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern 0: "N cặp/đôi [vé] <candidate>" e.g. "2 cặp vé VIP", "1 cặp VIP", "3 đôi vé thường"
      const reCap = new RegExp('(?:(\\d+)|\\b(mot|hai|ba|bon|tu|nam|sau)\\b)?\\s*(?:c[aặ]p|cap|d[oô]i|doi)\\s*(?:v[eé]|ve)?\\s*(?:h[aà]ng|hang|lo[aạ]i|loai)?\\s*' + escaped + '\\b', 'i');
      const mCap = normUserText.match(reCap);
      if (mCap) {
        let mult = 1;
        if (mCap[1]) mult = parseInt(mCap[1], 10);
        else if (mCap[2]) mult = VIETNAMESE_WORD_TO_NUM[mCap[2].toLowerCase()] || 1;
        matchedQty = mult * 2;
        break;
      }

      // Pattern A: "<number|word> [ve] [hang] <candidate>" e.g. "2 ve khu vuc 1", "1 ve vip", "2 ve 50k", "mot ve thuong"
      const reA = new RegExp('(?:(\\d+)|\\b(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|cap|doi)\\b)\\s*(?:v[eé]|ve)?\\s*(?:h[aà]ng|hang|lo[aạ]i|loai)?\\s*' + escaped + '\\b', 'i');
      const mA = normUserText.match(reA);
      if (mA) {
        if (mA[1]) matchedQty = parseInt(mA[1], 10);
        else if (mA[2]) matchedQty = VIETNAMESE_WORD_TO_NUM[mA[2].toLowerCase()] || 1;
        break;
      }

      // Pattern B: "<candidate> [hang] <number|word>" e.g. "khu vuc 1 2 ve", "vip 2 ve"
      const reB = new RegExp(escaped + '\\s*(?:h[aà]ng|hang|lo[aạ]i|loai)?\\s*(?:(\\d+)|\\b(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|cap|doi)\\b)\\s*(?:v[eé]|ve)?', 'i');
      const mB = normUserText.match(reB);
      if (mB) {
        if (mB[1]) matchedQty = parseInt(mB[1], 10);
        else if (mB[2]) matchedQty = VIETNAMESE_WORD_TO_NUM[mB[2].toLowerCase()] || 1;
        break;
      }

      // Pattern C: "<number|word> <candidate>" e.g. "2 vip"
      const reC = new RegExp('\\b(?:(\\d+)|\\b(mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|cap|doi)\\b)\\s+' + escaped + '\\b', 'i');
      const mC = normUserText.match(reC);
      if (mC) {
        if (mC[1]) matchedQty = parseInt(mC[1], 10);
        else if (mC[2]) matchedQty = VIETNAMESE_WORD_TO_NUM[mC[2].toLowerCase()] || 1;
        break;
      }
    }

    if (matchedQty > 0) {
      detectedTickets.push({ ticket: t, quantity: matchedQty });
    }
  }

  return detectedTickets;
}

function findLastBookingProposal(cleanHistory, allEventTickets = []) {
  if (!Array.isArray(cleanHistory) || cleanHistory.length === 0) return null;
  for (let i = cleanHistory.length - 1; i >= 0; i--) {
    const msg = cleanHistory[i];
    if (msg.role !== 'assistant') continue;

    // 1. Check structured action object (if available in direct calls)
    if (msg.action?.type === 'PROPOSE_BOOKING' && msg.action.data) {
      const tickets = msg.action.data.tickets || [];
      const t0 = tickets[0];
      const totalQty = msg.action.data.quantity || tickets.reduce((s, t) => s + (t.quantity || 0), 0) || t0?.quantity || 1;
      return {
        event_slug: msg.action.data.event_slug,
        ticket_type_id: t0?.ticket_type_id,
        ticket_type_name: t0?.ticket_type_name,
        quantity: totalQty,
        seats: t0?.seats || [],
        tickets,
        totalAmount: msg.action.data.total_amount || msg.action.data.totalAmount
      };
    }

    // 2. Check [ACTION:BOOKING_PROPOSAL:...] embedded tag in msg.content (sent by frontend client)
    if (typeof msg.content === 'string') {
      const actionMatch = msg.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/i);
      if (actionMatch) {
        try {
          const raw = actionMatch[1].trim();
          const decoded = raw.startsWith('%7B') || raw.includes('%22') ? decodeURIComponent(raw) : raw;
          const data = JSON.parse(decoded);
          const seats = data.seats || [];
          const s0 = seats[0];
          const ticketTypeId = s0?.ticketTypeId || s0?.ticket_type_id || data.items?.[0]?.ticket_type_id || data.items?.[0]?.ticketTypeId || null;
          const ticketTypeName = s0?.ticketTypeName || s0?.ticket_type_name || data.items?.[0]?.ticketType?.name || null;
          const qty = data.quantity || seats.length || (data.items?.reduce((s, it) => s + (it.quantity || 0), 0)) || 1;
          const seatLabels = seats.map(s => (typeof s === 'string' ? s : (s?.label || ''))).filter(Boolean);

          return {
            event_slug: data.eventId || data.event_slug || null,
            ticket_type_id: ticketTypeId,
            ticket_type_name: ticketTypeName,
            quantity: qty,
            seats: seatLabels,
            totalAmount: data.totalAmount
          };
        } catch (e) {
          logger.warn(`[findLastBookingProposal] Error parsing action proposal: ${e.message}`);
        }
      }
    }

    // 3. Fallback: Parse from assistant text content
    if (msg.content && /(?:đề xuất đặt vé|thẻ đề xuất|vị trí ghế|loại vé)/i.test(msg.content)) {
      const normContent = normalizeText(msg.content);
      for (const t of allEventTickets) {
        if (normContent.includes(normalizeText(t.name))) {
          const seatMatch = msg.content.match(/(?:ghế(?:\s*đề\s*xuất)?|vị\s*trí(?:\s*ghế)?)\s*[:：]\s*([A-Za-z0-9,\s]+)/i);
          const seats = seatMatch ? seatMatch[1].split(/[\s,]+/).filter(s => /^[A-Za-z]\d+$/.test(s)) : [];
          return {
            event_slug: null,
            ticket_type_id: t.id,
            ticket_type_name: t.name,
            quantity: seats.length > 0 ? seats.length : 1,
            seats,
            tickets: [{ ticket_type_id: t.id, ticket_type_name: t.name, quantity: seats.length || 1, seats }]
          };
        }
      }
    }
  }
  return null;
}

function extractAttendeesFromText(text, userProfile = null) {
  if (!text) return [];
  const attendees = [];
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

  // 1. Check if user explicitly asked to use their own profile info
  const normText = normalizeText(text);
  const hasUseMyInfo = /(?:dung|lay|su\s*dung|giong|nhu)\s+(?:thong\s*tin\s*cua\s*(?:toi|minh|tui|em|anh)|thong\s*tin\s*(?:tai\s*khoan|cu|nhu\s*cu)|tai\s*khoan|profile|info)/i.test(normText) ||
    /(?:thong\s*tin\s*(?:cua\s*)?(?:toi|minh|tui|em|anh)|lay\s*(?:info|profile)|(?:tu\s*di|di)\s*(?:1|mot)\s*minh(?:\s*en)?|cho\s*chinh\s*(?:toi|minh|tui|em|anh)|thong\s*tin\s*nhu\s*cu)/i.test(normText);

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
          /(?:dung\s*chung|ghi\s*chung|gui\s*(?:het\s*)?(?:ve\s*)?|chung\s*(?:1\s*)?)\s*(?:email|mail)/i.test(lNorm)) {
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
    if (/^(?:email|mail|sdt|so\s*dien\s*thoai|phone|zalo|dt|tel|suat|ve|hang|tong)\b/i.test(lNorm)) return true;
    if (/^(?:\d+\s*)?(?:ve|nguoi|dua|ban|slot|cho|ghe)\b/i.test(lNorm)) return true;
    if (/^(?:info|tt|thong\s*tin|ds|danh\s*sach|nguoi\s*di|khach|dua\s*tui|nguoi\s*tui)\b/i.test(lNorm)) return true;
    if (/(?:ne|nha|ah|ạ|a|nhen)$/i.test(lNorm) && /(?:dua|nguoi|ban|slot|ve|info|tt)/i.test(lNorm)) return true;
    if (/(?:gom|sau\s*day|danh\s*sach|cac\s*loai\s*ve|thong\s*tin)\s*[:\-]?$/i.test(lNorm)) return true;
    return false;
  };

  // Helper to clean a name candidate
  const phoneRegex = /(?:(?:\+84|84|0)[35789]\d{8}|0\d{9,10})\b/g;

  const cleanName = (str) => {
    return str
      .replace(emailRegex, '')
      .replace(phoneRegex, '')
      .replace(/^(?:(?:info|tt|thong\s*tin|danh\s*sach|nguoi\s*di|ve|khach)\s*[^:\-–\n]*[:\-–]\s*)/gi, '')
      .replace(/^(?:[\d\.\-\*\•\)\:]|v[eé]\s*\d*|ng[uư][oờ]i\s*\d*|\-|\:)+/gi, '')
      .replace(/^\s*(?:h[oọ]\s*(?:v[aà]\s*)?t[eê]n|t[eê]n|kh[aá]ch|ng[uư][oờ]i\s*(?:tham\s*gia)?)\s*[:\-]?\s*/gi, '')
      .replace(/^\s*(?:anh|ch[iị]|em|b[aạ]n)\s+(?=[^\s]+\s+[^\s]+)/i, '')
      .replace(/(?:email|mail|sdt|s[oố]\s*đi[eệ]n\s*tho[aạ]i|phone|zalo|dt)\s*[:\-]?\s*.*$/gi, '')
      .replace(/[\(\)\[\],\-–:]+/g, ' ')
      .replace(/\b(?:nha|nhe|nhen|nhé|sóp|sop|shop|ad|admin)\s*$/gi, '')
      .trim();
  };

  // Strict validator to ensure candidate is a real person name and not conversational chat text
  const isValidPersonName = (candidate) => {
    if (!candidate || candidate.length < 2 || candidate.length > 50) return false;
    const lNorm = normalizeText(candidate);
    if (!lNorm) return false;
    if (isSectionOrMetaLine(candidate)) return false;

    // Reject conversational, inquiry, and ticket booking words that are NOT common Vietnamese names
    const chatWordsRegex = /\b(muon|mua|ve|suat|cho|ghe|tim|kiem|hoi|xem|co|khong|gi|nao|sao|bao\s*nhieu|the\s*nao|su\s*kien|show|kich|hat|nhac|ca\s*si|ca\s*nhac|rap|vnd|alo|chao|xin\s*chao|eve|tro\s*ly|ad|admin|nhe|da|vang|ok|duoc|cam\s*on|thank|thanks|lien\s*he|sdt|so\s*dien\s*thoai|email|mail|thong\s*tin|dia\s*chi|thoi\s*gian|linh\s*vuc|the\s*loai|danh\s*sach|chi\s*tiet|ngoai\s*truyen|san\s*khau|idecaf|theater|theatre|concert|festival|workshop|(?:dat\s*ve|dat\s*cho|dat\s*hang|nguoi\s*dat)|(?:tien\s*ve|tong\s*tien|chuyen\s*tien|thanh\s*tien|bao\s*nhieu\s*tien|gia\s*tien|hoan\s*tien)|(?:gia\s*ve|gia\s*tien|muc\s*gia|bao\s*gia|ha\s*gia|tang\s*gia|bang\s*gia)|(?:dong\s*tien|dong\s*gia|\d+\s*dong)|(?:thang\s*\d+|thang\s*sau|thang\s*nay|thang\s*toi|thang\s*truoc)|(?:ban\s*ve|ban\s*oi|nguoi\s*ban))\b/i;
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
        let phoneMatch = line.match(/(?:(?:\+84|84|0)[35789]\d{8}|0\d{9,10})\b/);
        if (!phoneMatch && i + 1 < lines.length && !processedLineIndices.has(i + 1)) {
          const nextL = lines[i + 1];
          const nextMatch = nextL.match(/(?:(?:\+84|84|0)[35789]\d{8}|0\d{9,10})\b/);
          if (nextMatch && (/(?:sdt|phone|so\s*dien\s*thoai|dien\s*thoai|tel|zalo|dt|lh|lien\s*he)/i.test(normalizeText(nextL)) || nextL.trim() === nextMatch[0])) {
            phoneMatch = nextMatch;
            processedLineIndices.add(i + 1);
          }
        }
        pairedAttendees.push({
          name: nameCandidate,
          email,
          ...(phoneMatch ? { phone: phoneMatch[0].trim() } : {})
        });
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
            const phoneMatch = part.match(/(?:(?:\+84|84|0)[35789]\d{8}|0\d{9,10})\b/);
            pairedAttendees.push({
              name: nameCandidate,
              email,
              ...(phoneMatch ? { phone: phoneMatch[0].trim() } : {})
            });
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
    if (isSectionOrMetaLine(line)) continue;

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

function detectEventChangeIntent(message) {
  if (!message) return { isChange: false, isCancelOnly: false, targetQuery: '' };
  const norm = normalizeText(message);

  // If user is just changing seats, rows, session/showtimes, or ticket tiers within the same event, NOT an event change:
  const isSeatOrTierOnly = (
    /(?:hang|day|row)\s*(?:ghe\s*)?[a-z\d]/i.test(norm) ||
    /(?:doi|chuyen|sang|chon)\s*(?:sang\s*|len\s*|xuong\s*)?(?:hang|day|row|ghe|vi\s*tri|cho\s*ngoi)\b/i.test(norm) ||
    /(?:ghe|hang|day|cho\s*ngoi|vi\s*tri)\s*khac\b/i.test(norm) ||
    /(?:doi|chuyen)\s*(?:sang\s*|qua\s*)?(?:suat|ca|buoi|ngay|khung\s*gio|gio\s*chieu)\b/i.test(norm) ||
    /(?:suat|ca|khung\s*gio|gio\s*chieu)\s*khac\b/i.test(norm) ||
    /(?:huy|bo|xoa)\s*(?:ghe|cho|hang|suat|\d+\s*ve|bot\s*\d+\s*ve)\b/i.test(norm) ||
    /(?:bot|giam)\s*(?:\d+\s*)?(?:ve|cho|slot)\b/i.test(norm) ||
    /(?:doi|chuyen)\s*(?:sang\s*)?(?:\d+\s*)?(?:ve\s*)?(?:vip|vvip|svip|regular|standard|eco|economy|premium|ga|early\s*bird|thuong|tieu chuan|pho thong|dong|bac|vang|kim cuong)\b/i.test(norm) ||
    /(?:doi|chuyen)\s*(?:sang\s*)?(?:loai\s*ve|hang\s*ve|khu\s*vuc|ve\s*re|ve\s*dat)\b/i.test(norm) ||
    /(?:doi|chuyen)\s*(?:thanh|sang)?\s*\d+\s*(?:ve|cho|ghe|slot)\b/i.test(norm) ||
    /(?:re\s*hon|dat\s*hon|gan\s*san\s*khau|xa\s*san\s*khau)/i.test(norm)
  );

  // 1. Pure cancellation:
  const isCancel = (
    /(?:thoi|thui)\s*(?:toi|minh|tui|e|em|k|ko|khong)?\s*(?:khong|dung|khoi|k|ko)?\s*(?:dat|mua|lay)|huy\s*(?:dat\s*)?ve|dung\s*dat\s*ve|khoi\s*(?:dat|mua)|khong\s*(?:muon\s*)?(?:dat|mua)\s*(?:ve\s*)?(?:nay\s*)?nua|khong\s*mua\s*(?:nua\s*dau|nua)?|(?:k|ko|khong)\s*(?:dat|mua)\s*(?:nua|nua\s*dau)?|bo\s*qua\s*(?:dat\s*ve|di)?|(?:thoi|thui)\s*dep\s*di|dep\s*di|bo\s*di\s*(?:ban|nhe)?|cancel\b|huy\s*keo|bung\s*keo|thoi\s*khoi\s*mua|thoi\s*khoi\s*dat/i.test(norm)
  );

  // 2. Explicit change event:
  // "đổi sự kiện", "đổi sự kiện muốn đặt", "thay đổi sự kiện", "đổi sang sự kiện khác", "chọn sự kiện khác", "xem sự kiện khác", "tìm sự kiện khác", "quay lại chọn sự kiện", "đổi qua show khác ik"
  const isExplicitChangeEvent = (
    /(?:thay\s*doi|doi|chuyen|chon|xem|tim|quay\s*lai)\s*(?:sang\s*|qua\s*|lai\s*)?(?:su\s*kien|show|chuong\s*trinh|vo\s*kich|tuong|kich|concert|buoi\s*dien|ca\s*nhac|danh\s*sach\s*su\s*kien)\s*(?:muon\s*dat|khac|moi)?(?:\s*ik|\s*nha|\s*di|\s*nhen)?\b/i.test(norm) ||
    /(?:su\s*kien|show|chuong\s*trinh|vo\s*kich|tuong|kich|concert)\s*khac\b/i.test(norm) ||
    /(?:khong|k|ko)\s*(?:muon\s*)?(?:dat|mua|xem)\s*(?:ve\s*)?(?:su\s*kien|show|vo|chuong\s*trinh)\s*(?:nay|do)?\s*nua/i.test(norm) ||
    /(?:huy\s*(?:dat\s*)?(?:su\s*kien|ve\s*su\s*kien)\s*(?:nay)?)/i.test(norm) ||
    /(?:doi\s*y\s*roi|khong\s*thich\s*su\s*kien\s*nay|tim\s*cai\s*khac)/i.test(norm) ||
    /(?:co\s*(?:su\s*kien|show|chuong\s*trinh)\s*nao\s*khac)/i.test(norm)
  );

  // 3. User says "đổi sang [event name/query]" or "chuyển sang [event name/query]":
  const switchTargetMatch = message.match(/(?:đổi|chuyển|chọn)\s*(?:sang|qua)\s*(?:sự\s*kiện|show|chương\s*trình|vở\s*kịch|tuồng|kịch|ca\s*nhạc|concert|buổi\s*diễn)?\s*(.+)/i) ||
    norm.match(/(?:doi|chuyen|chon)\s*(?:sang|qua)\s*(?:su\s*kien|show|chuong\s*trinh|vo\s*kich|tuong|kich|ca\s*nhac|concert|buoi\s*dien)?\s*(.+)/i);

  let targetQuery = '';
  if (switchTargetMatch && !isSeatOrTierOnly) {
    let candidate = switchTargetMatch[1].trim();
    candidate = candidate.replace(/^(?:xem|coi|dat|mua|kich|vo\s*kich|tuong)\s+/i, '').trim();
    if (!/^(hàng|dãy|ghế|vé|loại|hạng|khu|suất|ca|buổi|ngày|khác|\d+|vip|vvip|svip|regular|standard|eco|premium|ga|early\s*bird|tiêu\s*chuẩn|phổ\s*thông|thường|đồng|bạc|vàng|kim\s*cương)/i.test(candidate)) {
      targetQuery = candidate;
    }
  }

  if (isSeatOrTierOnly && !isExplicitChangeEvent) {
    return { isChange: false, isCancelOnly: false, targetQuery: '' };
  }

  if (isCancel && !isExplicitChangeEvent && !targetQuery) {
    return { isChange: true, isCancelOnly: true, targetQuery: '' };
  }

  if (isExplicitChangeEvent || targetQuery) {
    return { isChange: true, isCancelOnly: false, targetQuery };
  }

  return { isChange: false, isCancelOnly: false, targetQuery: '' };
}

function findMatchingSession(messageOrQuery, sessions = []) {
  if (!messageOrQuery || !sessions || sessions.length === 0) return sessions[0] || null;
  if (sessions.length === 1) return sessions[0];

  const norm = normalizeText(messageOrQuery);

  // 1. Direct ID match
  const directId = sessions.find(s => String(s.id) === String(messageOrQuery).trim());
  if (directId) return directId;

  // 2. Ordinal match: "suất 1", "suất 2", "suất thứ 2", "suất đầu", v.v. (single digit 1-9)
  const ordMatch = norm.match(/(?:suat|buoi|ca)\s*(?:so|thu)?\s*([1-9])\b/i) ||
    norm.match(/(?:suat|buoi|ca)\s*(mot|hai|ba|bon|nam)\b/i);
  if (ordMatch) {
    let idx = -1;
    if (/^\d+$/.test(ordMatch[1])) {
      idx = parseInt(ordMatch[1], 10) - 1;
    } else {
      idx = (VIETNAMESE_WORD_TO_NUM[ordMatch[1].toLowerCase()] || 1) - 1;
    }
    if (idx >= 0 && idx < sessions.length) {
      return sessions[idx];
    }
  }

  if (/(?:suat\s*dau|suat\s*dau\s*tien|buoi\s*dau)/i.test(norm)) {
    return sessions[0];
  }
  if (/(?:suat\s*cuoi|suat\s*cuoi\s*cung|buoi\s*cuoi)/i.test(norm)) {
    return sessions[sessions.length - 1];
  }

  // Helper to extract year, month, day directly from date string without timezone skew
  const getSessionDate = (startTimeStr) => {
    if (!startTimeStr) return null;
    const m = String(startTimeStr).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const dow = new Date(year, month - 1, day).getDay();
    return { year, month, day, dow };
  };

  // 3. Date match: match DD/MM or DD-MM or "ngay DD"
  for (const s of sessions) {
    const sDate = getSessionDate(s.start_time);
    if (!sDate) continue;

    const dayStr = String(sDate.day).padStart(2, '0');
    const monthStr = String(sDate.month).padStart(2, '0');

    const datePatterns = [
      `${dayStr}/${monthStr}`,
      `${sDate.day}/${sDate.month}`,
      `${dayStr}-${monthStr}`,
      `${sDate.day}-${sDate.month}`,
      `${sDate.day}\\s*thang\\s*${sDate.month}`,
      `${sDate.day}\\s*thang\\s*${monthStr}`,
      `ngay\\s*${dayStr}\\b`,
      `ngay\\s*${sDate.day}\\b`
    ];
    const isDateMatched = datePatterns.some(p => new RegExp(`(?:^|\\s|suat\\s*)${p}(?:\\s|$|[.,!?])`, 'i').test(norm));
    if (isDateMatched) {
      return s;
    }
  }

  // 4. Day of week match:
  const dayOfWeekMap = {
    'chu nhat': 0, 'cn': 0,
    'thu hai': 1, 'thu 2': 1, 't2': 1,
    'thu ba': 2, 'thu 3': 2, 't3': 2,
    'thu tu': 3, 'thu 4': 3, 't4': 3,
    'thu nam': 4, 'thu 5': 4, 't5': 4,
    'thu sau': 5, 'thu 6': 5, 't6': 5,
    'thu bay': 6, 'thu 7': 6, 't7': 6
  };
  for (const [dayName, dayNum] of Object.entries(dayOfWeekMap)) {
    if (new RegExp(`\\b${dayName}\\b`, 'i').test(norm)) {
      const matched = sessions.find(s => {
        const sDate = getSessionDate(s.start_time);
        return sDate && sDate.dow === dayNum;
      });
      if (matched) return matched;
    }
  }

  // 4b. Weekend match: "cuối tuần" (Saturday or Sunday)
  if (/\bcuoi\s*tuan\b/i.test(norm)) {
    const matched = sessions.find(s => {
      const sDate = getSessionDate(s.start_time);
      return sDate && (sDate.dow === 6 || sDate.dow === 0);
    });
    if (matched) return matched;
  }

  // 4c. Time of day match: "suất tối", "buổi chiều", "suất sáng"
  if (/(?:suat|buoi|ca)\s*toi\b/i.test(norm)) {
    const matched = sessions.find(s => {
      const sNorm = normalizeText(s.session_name || '');
      if (/(?:toi|dem)/i.test(sNorm)) return true;
      const m = String(s.start_time || '').match(/T(\d{2}):/);
      return m && parseInt(m[1], 10) >= 18;
    });
    if (matched) return matched;
  }

  if (/(?:suat|buoi|ca)\s*chieu\b/i.test(norm)) {
    const matched = sessions.find(s => {
      const sNorm = normalizeText(s.session_name || '');
      if (/chieu/i.test(sNorm)) return true;
      const m = String(s.start_time || '').match(/T(\d{2}):/);
      if (!m) return false;
      const h = parseInt(m[1], 10);
      return h >= 12 && h < 18;
    });
    if (matched) return matched;
  }

  if (/(?:suat|buoi|ca)\s*sang\b/i.test(norm)) {
    const matched = sessions.find(s => {
      const sNorm = normalizeText(s.session_name || '');
      if (/sang/i.test(sNorm)) return true;
      const m = String(s.start_time || '').match(/T(\d{2}):/);
      return m && parseInt(m[1], 10) < 12;
    });
    if (matched) return matched;
  }

  // 5. Session name / keyword match (e.g. "Gala", "chung kết", session_name)
  const sessionStopWords = new Set([
    'suat', 'buoi', 'ngay', 'dem', 'toi', 'minh', 'cho', 'muon', 'chieu', 'sang', 'chuyen', 'doi', 'xem', 'lay', 'dat', 've', 'cac', 'co'
  ]);

  for (const s of sessions) {
    if (s.session_name) {
      const sNorm = normalizeText(s.session_name);
      if (sNorm && (norm.includes(sNorm) || sNorm.includes(norm))) {
        return s;
      }
      const sTokens = sNorm.split(/\s+/).filter(w => w.length >= 3 && !sessionStopWords.has(w));
      const hasDistinctiveToken = sTokens.some(tok => norm.includes(tok));
      if (hasDistinctiveToken) {
        return s;
      }
    }
  }

  return sessions[0] || null;
}

function findMatchingPublishedEvent(queryOrMessage, eventsList, options = {}) {
  if (!queryOrMessage || !eventsList || eventsList.length === 0) return null;
  const allowSemanticTopic = options.allowSemanticTopic !== false;

  const normalize = (str) => String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normInput = normalize(queryOrMessage);
  if (!normInput || normInput.length < 3) return null;

  // 1a. Direct contains check:
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

  // 1b. Direct subtitle / artist / distinct phrase match:
  const strippedInput = normInput.replace(/^(su\s*kien|show|chuong\s*trinh|vo\s*kich|concert|buoi\s*dien|ve)\s*/i, '').trim();
  const isGenericCategoryQuery = (
    /^(?:ca\s*nhac|am\s*nhac|nhac|kich|hai\s*kich|kich\s*noi|san\s*khau|hoi\s*thao|giao\s*duc|workshop|the\s*thao|le\s*hoi|van\s*hoa|trien\s*lam|hoi\s*cho)$/i.test(strippedInput) ||
    /^(?:cac|nhung|tim|goi\s*y|xem|co)?\s*(?:su\s*kien|show|chuong\s*trinh|hoat\s*dong)?\s*(?:ve|lien\s*quan\s*den)?\s*(?:ca\s*nhac|am\s*nhac|nhac|kich|hai\s*kich|kich\s*noi|san\s*khau|hoi\s*thao|giao\s*duc|workshop|the\s*thao|le\s*hoi|van\s*hoa|trien\s*lam|hoi\s*cho)(?:\s*(?:nao|gi|hay|hot|moi|sap\s*toi|khong|a|nhi|the))?$/i.test(normInput)
  );
  if (isGenericCategoryQuery) {
    return null;
  }

  if (strippedInput.length >= 4) {
    for (const e of eventsList) {
      const normTitle = normalize(e.title);
      const normSlug = normalize(e.slug);
      if (normTitle.includes(strippedInput) || normSlug.includes(strippedInput.replace(/\s+/g, '-'))) {
        return e;
      }
    }
  }

  // 2. Semantic Topic Map check (only when allowSemanticTopic is true):
  if (allowSemanticTopic) {
    for (const topicItem of SEMANTIC_TOPIC_MAP) {
      const matchedTerm = topicItem.terms.find(t => {
        const reg = new RegExp(`(^|\\s)${t.replace(/[\s]/g, '\\s+')}(\\s|$)`, 'i');
        return reg.test(normInput);
      });
      if (matchedTerm) {
        for (const slug of topicItem.matchedSlugs) {
          const found = eventsList.find(e => e.slug === slug || (e.slug && e.slug.includes(slug.split('-')[0])));
          if (found) {
            logger.info(`[SemanticMatch] Matched event "${found.title}" via topic "${topicItem.topic}" (term: "${matchedTerm}")`);
            return found;
          }
        }
      }
    }
  }

  // 3. Distinctive title keywords match:
  const stopWords = new Set([
    'hay', 'giup', 'toi', 'minh', 'cho', 'dat', 'mua', 've', 'su', 'kien', 'show',
    'xem', 've', 'o', 'eve', 'oi', 'co', 'gi', 'nao', 'dang', 'khong',
    'bao', 'nhieu', 'suat', 'dien', 'tien', 'gia', 'loai', 'mot', 'hai', 'ba',
    'bon', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi', 'thong', 'tin', 'cua',
    'ban', 'anh', 'chi', 'em', 'nguoi', 'tham', 'gia', 'sdt', 'email',
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

  // 4. Check short_description if still no match:
  if (!bestMatch) {
    for (const e of eventsList) {
      const normDesc = normalize(e.short_description || '');
      if (normDesc.length >= 10) {
        const matchedDescWords = uniqueInputWords.filter(w => normDesc.includes(w) && w.length >= 3);
        if (matchedDescWords.length >= 2 || uniqueInputWords.some(w => ['porsche', 'lemlab', 'idecaf'].includes(w) && normDesc.includes(w))) {
          return e;
        }
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
  },
  {
    type: 'function',
    function: {
      name: 'proposeSmartBooking',
      description: 'GỌI KHI khách hàng muốn đặt vé, đặt luôn, nhờ AI chọn ghế hoặc chỉ định số lượng vé / hàng ghế (VD: "đặt giúp tôi 3 vé sự kiện ABC ưu tiên hàng ghế C", "đặt luôn 2 vé", "chọn cho tôi 3 vé hàng C", "đổi sang hàng D", "đặt 2 vé VIP"). Áp dụng cho CẢ sự kiện có sơ đồ ghế và vé tự do. Tool sẽ tự động phân bổ ghế tối ưu theo quy tắc của Ban tổ chức, tính toán tổng tiền, và tạo Đề xuất Đặt vé (Booking Proposal) cho khách duyệt.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID, slug hoặc tên của sự kiện.' },
          sessionId: { type: 'string', description: '(Tùy chọn) ID hoặc số thứ tự của suất diễn (suất 1, 2...).' },
          quantity: { type: 'integer', description: 'Số lượng vé muốn đặt (mặc định 1 nếu khách không nói rõ).' },
          preferredRow: { type: 'string', description: '(Tùy chọn) Hàng ghế ưu tiên nếu sự kiện có sơ đồ ghế (VD: "C", "D", "A"...).' },
          excludeRow: { type: 'string', description: '(Tùy chọn) Hàng ghế cần LOẠI TRỪ khi khách yêu cầu đổi sang hàng ghế khác (VD: "F", "A"...).' },
          ticketTypeId: { type: 'string', description: '(Tùy chọn) ID của loại vé muốn đặt.' },
          ticketTypeName: { type: 'string', description: '(Tùy chọn) Tên loại vé khách muốn (nếu sự kiện vé tự do hoặc muốn loại vé cụ thể).' },
          tickets: {
            type: 'array',
            description: '(Tùy chọn) Danh sách các loại vé và số lượng khi khách đặt nhiều loại vé khác nhau (VD: [{ ticketTypeId: "...", ticketTypeName: "Hạng thường", quantity: 2 }, { ticketTypeId: "...", ticketTypeName: "HẠNG VIP", quantity: 1 }])',
            items: {
              type: 'object',
              properties: {
                ticketTypeId: { type: 'string' },
                ticketTypeName: { type: 'string' },
                quantity: { type: 'integer' }
              }
            }
          }
        },
        required: ['eventId', 'quantity']
      }
    }
  }
];

const SYSTEM_PROMPT = `Bạn tên là Eve, Trợ lý AI đáng yêu, thông minh, am hiểu sâu sắc về sự kiện và tận tâm của EventHub.
- Giọng điệu: GenZ, thân thiện, vui vẻ, duyên dáng, dùng emoji một cách tự nhiên.
- Luôn thể hiện sự quan tâm, thấu cảm và tư duy linh hoạt như người thật.
- BẮT BUỘC 100% TIẾNG VIỆT: Tuyệt đối KHÔNG sử dụng chữ Hán/tiếng Trung (như 電子信箱, 邮箱, 好的). Luôn viết là "Email" hoặc "hòm thư" thay vì tiếng Trung.
- TUYỆT ĐỐI KHÔNG HỨA SUÔNG: Khi đã có đủ thông tin đặt vé, BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction. Tuyệt đối không tự nói "Đang xử lý đặt vé" hay "Vui lòng đợi một chút" bằng chữ mà không gọi tool!

QUY TẮC CỐT LÕI - GIAO TIẾP TỰ NHIÊN, LINH HOẠT & BẢO MẬT:
1. HIỂU Ý ĐỊNH THỰC SỰ CỦA KHÁCH HÀNG (TRÁNH RẬP KHUÔN, CỨNG NHẮC):
   - Khi khách chào hỏi hoặc hỏi khám phá chung (VD: "xin chào, có sự kiện gì thú vị không", "có gì hot không", "hôm nay có gì vui"): Hãy chào khách ấm áp và hào hứng giới thiệu các sự kiện nổi bật nhất đang có trên EventHub.
   - Khi khách hỏi theo sở thích/chủ đề (VD: xe ô tô, vẽ tranh, làm gốm, ca nhạc, kịch): Hãy liên tưởng thông minh đến sự kiện phù hợp trên hệ thống (Ví dụ: khách hỏi về xe cộ/ô tô -> giới thiệu Không gian Trải nghiệm Porsche; vẽ tranh -> Art Workshop Oil Pastel; làm gốm -> LemLab làm gốm).
   - Nếu thực sự EventHub chưa có sự kiện riêng về chủ đề khách hỏi: Hãy trả lời tự nhiên, khéo léo như một người bạn (Ví dụ: "Dạ hiện tại trên EventHub chưa có sự kiện riêng về [chủ đề] nè 🥺... nhưng Eve gợi ý bạn xem thử các sự kiện cực hot này nhé...").
   - NGHIÊM CẤM TUYỆT ĐỐI:
     + KHÔNG BAO GIỜ nói câu cứng nhắc: "không có sự kiện nào thuộc thể loại / từ khóa...", "kết quả tìm kiếm cho thấy 0 sự kiện".
     + KHÔNG BAO GIỜ lặp lại nguyên văn câu hỏi dài của khách đặt trong dấu ngoặc kép như một từ khóa máy tính.
2. BẢO MẬT DỮ LIỆU & CHỐNG ẢO GIÁC (GROUNDING):
   - Bạn là trợ lý AI nội bộ của nền tảng EventHub. Bạn CHỈ ĐƯỢC PHÉP giới thiệu các sự kiện CÓ TRÊN HỆ THỐNG EVENTHUB (được trả về qua kết quả của tool searchEvents hoặc getEventDetails).
   - TUYỆT ĐỐI KHÔNG ĐƯỢC LẤY SỰ KIỆN Ở NGOÀI ĐỜI không có trên EventHub.
3. CHỈ GIỚI THIỆU ĐÚNG SỐ LƯỢNG SỰ KIỆN TOOL TRẢ VỀ:
   - Trình bày danh sách sự kiện hấp dẫn, kèm giá vé và ngày diễn ra, sau đó hỏi khách muốn xem chi tiết hoặc đặt vé sự kiện nào.
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
        queryArg = extractCoreSearchQuery(queryArg);

        const publishedList = await getPublishedEventsCache();

        // 1. General Discovery Query (empty query or greeting vibe):
        if (!queryArg) {
          const generalUpcoming = await eventsService.getPublicEvents({
            limit: 4,
            page: 1,
            upcoming_only: true
          }, userId);

          const events = (generalUpcoming.items || []).map(e => ({
            id: e.slug || e.id,
            title: e.title,
            category: e.category?.name || e.category_name || 'Sự kiện nổi bật',
            start: e.start_time ? new Date(e.start_time).toLocaleDateString('vi-VN') : 'Sắp diễn ra',
            price: e.min_price ? `${Number(e.min_price).toLocaleString('vi-VN')}đ` : 'Liên hệ'
          }));

          return {
            status: 'FOUND',
            mode: 'DISCOVERY',
            total: events.length,
            events: events,
            instruction: `Khách hàng đang chào hỏi hoặc muốn khám phá các sự kiện thú vị/nổi bật trên EventHub. Eve hãy chào khách thật ấm áp, thân thiện (dùng emoji tự nhiên) và hào hứng giới thiệu 2-3 sự kiện nổi bật nhất trên hệ thống: [${events.map(e => `"${e.title}" (${e.start}, từ ${e.price})`).join('; ')}]. Sau đó hỏi khách thích thể loại nào (âm nhạc, kịch nghệ, workshop trải nghiệm hay không gian triển lãm...) để Eve tư vấn chi tiết hơn nhé! TUYỆT ĐỐI không chép lại câu nhắc lệnh này và không dùng câu từ máy móc!`
          };
        }

        // 2. Query has a specific topic / keyword:
        // Try Semantic Match from published cache first (e.g. "xe ô tô" -> Porsche):
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
            instruction: `Eve hãy dùng giọng điệu thân thiện, hào hứng giới thiệu sự kiện phù hợp nhất với chủ đề/sở thích của khách: "${matchedExact.title}". Kèm ngày diễn ra và giá vé khởi điểm, sau đó hỏi khách muốn xem chi tiết hay đặt vé sự kiện này. TUYỆT ĐỐI không chép lại câu nhắc lệnh này và KHÔNG nói câu máy móc như "thuộc thể loại / từ khóa"!`
          };
        }

        // 3. Try In-memory Search on Title, Short Description, Category:
        const normQuery = normalizeText(queryArg);
        const inMemoryMatches = publishedList.filter(e => {
          const normTitle = normalizeText(e.title);
          const normDesc = normalizeText(e.short_description);
          const normCat = normalizeText(e.category_name);
          return normTitle.includes(normQuery) || normDesc.includes(normQuery) || normCat.includes(normQuery);
        });

        if (inMemoryMatches.length > 0) {
          const events = inMemoryMatches.slice(0, 5).map(e => ({
            id: e.slug || e.id,
            title: e.title,
            category: e.category_name || 'Khác',
            start: e.start_time ? new Date(e.start_time).toLocaleDateString('vi-VN') : 'Sắp diễn ra',
            price: e.min_price ? `${Number(e.min_price).toLocaleString('vi-VN')}đ` : 'Liên hệ'
          }));

          return {
            status: 'FOUND',
            total: events.length,
            events: events,
            instruction: `Eve hãy dùng giọng điệu thân thiện, hào hứng gửi khách danh sách ${events.length} sự kiện liên quan trên hệ thống EventHub: [${events.map(e => `"${e.title}" (${e.start}, từ ${e.price})`).join('; ')}]. Sau đó hỏi khách muốn xem chi tiết hay đặt vé sự kiện nào. TUYỆT ĐỐI không chép lại câu nhắc lệnh này!`
          };
        }

        // 4. Query database via eventsService:
        const catInfo = detectCategory(queryArg);
        let result = await eventsService.getPublicEvents({
          category_slug: catInfo ? catInfo.slug : undefined,
          keyword: catInfo ? undefined : (queryArg || undefined),
          limit: parseInt(getArg(args.limit), 10) || 5,
          page: 1,
          upcoming_only: true
        }, userId);

        if ((!result.items || result.items.length === 0) && catInfo) {
          result = await eventsService.getPublicEvents({
            keyword: queryArg || undefined,
            limit: parseInt(getArg(args.limit), 10) || 5,
            page: 1,
            upcoming_only: true
          }, userId);
        }

        // 5. If STILL no event found -> Informative friendly fallback:
        if (!result.items || result.items.length === 0) {
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
            topic: queryArg,
            instruction: `Khách hàng đang hỏi về chủ đề "${queryArg}". Hiện tại trên EventHub chưa có sự kiện mở bán riêng về chủ đề này. Eve hãy giải thích duyên dáng, tự nhiên như một người bạn (Ví dụ: "Dạ hiện tại trên EventHub chưa có sự kiện riêng về ${queryArg} nè 🥺..."), và khéo léo gợi ý khách tham khảo các sự kiện đang rất hot khác trên EventHub: [${suggestions}]. TUYỆT ĐỐI KHÔNG dùng câu văn cứng nhắc, máy móc như "thuộc thể loại / từ khóa"! CŨNG KHÔNG lặp lại câu hỏi dài của khách.`
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
        const hasBookingActionWords = /(?:dat|mua|lay|book|booking|order|giu cho|cho minh|cho toi|cho em|cho anh|dang ky|can)\s*(?:giup|ho|ngay|luon|nhanh)?\s*(?:\d+|mot|hai|ba|bon|nam|cap|doi)?\s*(?:ve|ghe|cho|ticket|suat)?/i.test(userMsgNorm) ||
          /^(?:dat|mua|lay|book|order)\b/i.test(userMsgNorm);

        const isDetailInquiry = /(thong tin|chi tiet|gioi thieu|noi dung|ve cai gi|co gi hay|o dau|khi nao|may gio|ngay nao|dia diem|dien gia|nghe si|ca si|gia ve|ve bao nhieu)/i.test(userMsgNorm) && !hasBookingActionWords;
        const isBookingExplicit = hasBookingActionWords;

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
        } else {
          instruction = `Khách hàng muốn ĐẶT VÉ sự kiện "${result.title}". Hãy hỗ trợ khách đặt vé chu đáo và thân thiện.`;
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

      if (name === 'proposeSmartBooking') {
        let identifier = context.activeEvent?.slug || getArg(args.eventId);
        let sessionId = getArg(args.sessionId);
        let quantity = parseInt(getArg(args.quantity), 10) || 1;
        let preferredRow = getArg(args.preferredRow) || '';
        let excludeRow = getArg(args.excludeRow) || '';
        let ticketTypeId = getArg(args.ticketTypeId) || null;
        let ticketTypeName = getArg(args.ticketTypeName) || '';

        const userProfile = context.userProfile || null;
        const history = context.history || [];
        const currentMessage = context.message || '';
        const normCurrent = normalizeText(currentMessage);

        const isChangeRowRequest = /(?:đổi|chuyển|chọn)\s*(?:sang\s*)?(?:hàng|dãy|row)\s*(?:ghế\s*)?khác\b/i.test(currentMessage) ||
          /(?:doi|chuyen|chon)\s*(?:sang\s*)?(?:hang|day|row)\s*(?:ghe\s*)?khac\b/i.test(normCurrent) ||
          /(?:hàng\s*khác|hang\s*khac)/i.test(normCurrent);

        const isSeatAdjustmentRequest = (
          /(?:lệch|lech|bị\s*lệch|bi\s*lech|chính\s*giữa|chinh\s*giua|ở\s*giữa|o\s*giua|giữa\s*hàng|giua\s*hang|đổi\s*ghế|doi\s*ghe|đổi\s*hàng|doi\s*hang|đổi\s*sang|doi\s*sang|chuyển\s*sang|chuyen\s*sang|chọn\s*lại|chon\s*lai|hàng\s*khác|hang\s*khac|sang\s*hang|sang\s*hàng|đổi\s*vé|doi\s*ve|đổi\s*loại|doi\s*loai|chuyển\s*loại|chuyen\s*loai)/i.test(currentMessage) ||
          /(?:lech|bi\s*lech|chinh\s*giua|o\s*giua|giua\s*hang|doi\s*ghe|doi\s*hang|doi\s*sang|chuyen\s*sang|chon\s*lai|hang\s*khac|sang\s*hang|doi\s*ve|doi\s*loai|chuyen\s*loai)/i.test(normCurrent) ||
          isChangeRowRequest
        );

        const userMessages = [
          currentMessage,
          ...history.filter(m => m.role === 'user').map(m => m.content || '')
        ].join('\n');

        // Extract preferredRow from CURRENT user text if not passed in tool args and not asking for a different row
        if (!preferredRow && !isChangeRowRequest) {
          const rowMatch = currentMessage.match(/(?:hàng\s*(?:ghế\s*)?|row\s*)([a-zA-Z\d]+)/i);
          if (rowMatch) preferredRow = rowMatch[1];
        }

        const isCenterPreferred = /(?:trung|giữa|giua|center)/i.test(preferredRow) || /(?:trung\s*tâm|ở\s*giữa|khu\s*vực\s*giữa|chính\s*giữa)/i.test(userMessages);

        let horizontalPreference = 'CENTER';
        if (/(?:bên\s*trái|lệch\s*trái|phía\s*trái|tay\s*trái)/i.test(currentMessage) && !/(?:bị\s*lệch|quá\s*lệch|lệch\s*quá)/i.test(currentMessage)) {
          horizontalPreference = 'LEFT';
        } else if (/(?:bên\s*phải|lệch\s*phải|phía\s*phải|tay\s*phải)/i.test(currentMessage) && !/(?:bị\s*lệch|quá\s*lệch|lệch\s*quá)/i.test(currentMessage)) {
          horizontalPreference = 'RIGHT';
        } else {
          horizontalPreference = 'CENTER';
        }

        // Resolve event slug/id if title was passed
        const publishedList = await getPublishedEventsCache();
        const matched = findMatchingPublishedEvent(identifier, publishedList);
        if (matched) {
          identifier = matched.slug || matched.id;
        }

        const userChatPhone = extractPhoneNumber(userMessages);
        const profilePhone = (userProfile?.phone && userProfile.phone.replace(/\D/g, '').length >= 9)
          ? userProfile.phone.trim()
          : '';
        const buyerPhone = profilePhone || userChatPhone || '';
        const buyerName = userProfile?.full_name || 'Khách hàng';
        const buyerEmail = userProfile?.email || '';

        let detail = null;
        try {
          detail = await eventsService.getPublicEventDetail(identifier, userId);
        } catch (e) {
          return { error: `Không tìm thấy chi tiết sự kiện "${identifier}".` };
        }

        if (!detail) {
          return { error: 'Không tìm thấy thông tin sự kiện.' };
        }

        let eventId = detail.slug || detail.id;
        const sessions = detail.sessions || [];

        // Match session
        let matchedSession = null;
        if (sessionId) {
          const sNumMatch = String(sessionId).match(/\d+/);
          const sIdx = sNumMatch ? parseInt(sNumMatch[0], 10) - 1 : -1;
          matchedSession = sessions.find(s =>
            String(s.id) === String(sessionId) ||
            (s.session_name && s.session_name.toLowerCase().includes(String(sessionId).toLowerCase()))
          );
          if (!matchedSession && sIdx >= 0 && sIdx < sessions.length) {
            matchedSession = sessions[sIdx];
          }
        }
        if (!matchedSession) {
          matchedSession = sessions[0] || null;
        }

        const hasSeatMap = Boolean(
          matchedSession?.seat_map_id ||
          matchedSession?.has_seat_map ||
          detail.ticket_types?.some(t => t.is_seated === true)
        );

        const allEventTickets = detail.ticket_types || [];
        let requestedTickets = [];
        const rawTickets = args.tickets || (args.parsedTickets || null);
        if (Array.isArray(rawTickets) && rawTickets.length > 0) {
          for (const item of rawTickets) {
            let matchedT = null;
            if (item.ticketTypeId) {
              matchedT = allEventTickets.find(t => String(t.id) === String(item.ticketTypeId));
            }
            if (!matchedT && item.ticketTypeName) {
              const normN = normalizeText(item.ticketTypeName);
              matchedT = allEventTickets.find(t => normalizeText(t.name).includes(normN));
            }
            if (matchedT) {
              requestedTickets.push({
                ticket: matchedT,
                quantity: Math.max(1, parseInt(item.quantity, 10) || 1)
              });
            }
          }
        }

        const lastProp = findLastBookingProposal(history, allEventTickets);
        const prevPropQty = lastProp?.quantity || null;

        if (!excludeRow && isChangeRowRequest && lastProp?.seats?.length > 0) {
          const firstSeat = typeof lastProp.seats[0] === 'string' ? lastProp.seats[0] : (lastProp.seats[0]?.label || '');
          if (firstSeat) {
            excludeRow = firstSeat.charAt(0).toUpperCase();
          }
        }
        if (isChangeRowRequest) {
          preferredRow = '';
        }

        const parsedQFromCurrent = parseQuantityFromText(currentMessage, prevPropQty);
        if (parsedQFromCurrent && parsedQFromCurrent > 0) {
          quantity = parsedQFromCurrent;
        } else if (prevPropQty && (!args.quantity || parseInt(args.quantity, 10) === 1)) {
          quantity = prevPropQty;
        }

        // 1. Check if current message specifies tickets directly
        const fromCurrent = parseTicketsFromText(currentMessage, allEventTickets);
        if (fromCurrent.length > 0) {
          requestedTickets = fromCurrent;
        }

        // 2. Check if current message explicitly mentions a ticket tier by name or price
        for (const t of allEventTickets) {
          const normName = normalizeText(t.name).replace(/\([^)]*\)/g, '').trim();
          const pNum = Number(t.price);
          const pK = `${Math.round(pNum / 1000)}k`;
          const priceRegex = new RegExp(`\\b${pK}\\b|\\b${pNum}\\b`, 'i');
          if ((normName.length >= 3 && normCurrent.includes(normName)) || priceRegex.test(normCurrent)) {
            ticketTypeId = t.id;
            break;
          }
        }

        if (!ticketTypeId && ticketTypeName) {
          const norm = normalizeText(ticketTypeName);
          const found = allEventTickets.find(t => normalizeText(t.name).includes(norm));
          if (found) {
            ticketTypeId = found.id;
          }
        }

        // Check if user specifically requested to switch to a different zone / tier:
        const wantsDifferentTierInTool = /(?:đổi|chuyển|qua|sang|chọn|lấy|mua)?\s*(?:sang\s*)?(?:khu\s*vực|khu|hạng|loại\s*vé|loại|vùng)\s*khác\b/i.test(currentMessage) ||
          /(?:doi|chuyen|qua|sang|chon|lay|mua)?\s*(?:sang\s*)?(?:khu\s*vuc|khu|hang|loai\s*ve|loai|vung)\s*khac\b/i.test(normCurrent) ||
          /(?:đổi\s*khu|đổi\s*khu\s*vực|chuyển\s*khu|chuyển\s*khu\s*vực|khu\s*vực\s*khác|loại\s*vé\s*khác|hạng\s*vé\s*khác|loại\s*khác|hạng\s*khác)/i.test(currentMessage) ||
          /(?:doi\s*khu|doi\s*khu\s*vuc|chuyen\s*khu|chuyen\s*khu\s*vuc|khu\s*vuc\s*khac|loai\s*ve\s*khac|hang\s*ve\s*khac|loai\s*khac|hang\s*khac)/i.test(normCurrent);

        if (wantsDifferentTierInTool && allEventTickets.length > 1) {
          const prevTierId = lastProp?.ticket_type_id;
          const candidateOther = allEventTickets.filter(t => (!prevTierId || String(t.id) !== String(prevTierId)) && t.is_seated !== false);
          const otherTiers = candidateOther.length > 0 ? candidateOther : allEventTickets.filter(t => !prevTierId || String(t.id) !== String(prevTierId));
          if (otherTiers.length > 0) {
            ticketTypeId = otherTiers[0].id;
            ticketTypeName = otherTiers[0].name;
            requestedTickets = [{ ticket: otherTiers[0], quantity }];
          }
          // Do not inherit row from previous zone when switching zones
          const rowInCurrent = currentMessage.match(/(?:hàng\s*(?:ghế\s*)?|dãy\s*(?:ghế\s*)?|row\s*)([a-zA-Z\d]+)/i);
          preferredRow = rowInCurrent ? rowInCurrent[1] : '';
        } else if (!wantsDifferentTierInTool && (isChangeRowRequest || isSeatAdjustmentRequest) && !ticketTypeId && lastProp?.ticket_type_id) {
          // Preserve previous tier when user is adjusting seats or changing rows
          const prevMatched = allEventTickets.find(t => String(t.id) === String(lastProp.ticket_type_id));
          if (prevMatched) {
            ticketTypeId = prevMatched.id;
            ticketTypeName = prevMatched.name;
            requestedTickets = [{ ticket: prevMatched, quantity }];
          }
        }

        // If ticketTypeId was specified (or changed in current turn), bind requestedTickets to this tier
        if (ticketTypeId) {
          const matchedT = allEventTickets.find(t => String(t.id) === String(ticketTypeId));
          if (matchedT && requestedTickets.length <= 1) {
            requestedTickets = [{ ticket: matchedT, quantity }];
          }
        }

        // 3. Only if no tickets were determined from current message or explicit args, check conversation history:
        if (requestedTickets.length === 0) {
          const fromText = parseTicketsFromText(userMessages, allEventTickets);
          if (fromText.length > 0) {
            requestedTickets = fromText;
          }
        }

        // If requestedTickets is present, recalculate total quantity
        if (requestedTickets.length > 0) {
          quantity = requestedTickets.reduce((sum, it) => sum + it.quantity, 0);
        }

        const requireAttendeeInfo = Boolean(detail.require_attendee_info);
        const collectedAttendees = extractAttendeesFromText(userMessages, userProfile);
        const isAttendeesComplete = !requireAttendeeInfo || (collectedAttendees.length >= quantity);

        // Resolve ticket tier / cheapest preference:
        const normUserMsgs = normalizeText(userMessages);
        const wantsCheapest = /(?:rẻ\s*nhất|tiết\s*kiệm\s*nhất|loại\s*rẻ|vé\s*rẻ|giá\s*thấp\s*nhất|loại\s*nào\s*cũng\s*được|sao\s*cũng\s*được|tùy\s*bạn|bất\s*kỳ|loại\s*thấp\s*tiền)/i.test(userMessages) ||
          /(?:re\s*nhat|tiet\s*kiem\s*nhat|loai\s*re|ve\s*re|gia\s*thap\s*nhat|loai\s*nao\s*cung\s*duoc|sao\s*cung\s*duoc|tuy\s*ban|bat\s*ky|thap\s*tien)/i.test(normUserMsgs);

        if (!ticketTypeId && allEventTickets.length > 0 && requestedTickets.length <= 1) {
          // Check if user specifically requested a ticket tier by name in userMessages
          for (const t of allEventTickets) {
            const normName = normalizeText(t.name).replace(/\([^)]*\)/g, '').trim();
            if (normName.length >= 3 && normUserMsgs.includes(normName)) {
              ticketTypeId = t.id;
              break;
            }
          }
          // Or check if user requested by price (e.g. "50k", "100k")
          if (!ticketTypeId) {
            for (const t of allEventTickets) {
              const pNum = Number(t.price);
              const pK = `${Math.round(pNum / 1000)}k`;
              if (new RegExp(`\\b${pK}\\b|\\b${pNum}\\b`, 'i').test(userMessages)) {
                ticketTypeId = t.id;
                break;
              }
            }
          }
          // If still no ticket tier specified, default to the cheapest tier!
          if (!ticketTypeId) {
            const sortedByPrice = [...allEventTickets].sort((a, b) => Number(a.price) - Number(b.price));
            ticketTypeId = sortedByPrice[0]?.id;
          }
        }

        // Release any previous holds for this user before new allocation
        if (userId) {
          try {
            await eventsService.releaseSeatHolds(userId, { event_id: detail.id, session_seat_ids: [] });
          } catch (relErr) {
            // ignore release error
          }
        }

        let proposalData = null;

        if (hasSeatMap && matchedSession) {
          // Fetch all seats in this session
          let allSessionSeats = [];
          try {
            const seatsRes = await eventsService.getSessionSeats(matchedSession.id, {});
            allSessionSeats = seatsRes.seats || [];
          } catch (err) {
            logger.error(`[AiAssistant] Error loading seats: ${err.message}`);
          }

          let allocResultSeats = [];
          let allocResultItems = [];
          let allocTotalAmount = 0;
          let allocNote = null;
          let allocRulesApplied = detail.seating_rules || {};

          if (requestedTickets.length > 1) {
            let remainingSessionSeats = [...allSessionSeats];
            for (const rt of requestedTickets) {
              const singleAlloc = seatAllocationService.allocateSeats(
                remainingSessionSeats,
                detail.seating_rules,
                detail.ticket_types || [],
                {
                  quantity: rt.quantity,
                  preferredRow,
                  excludeRow,
                  ticketTypeId: rt.ticket.id,
                  isCenterPreferred,
                  horizontalPreference,
                  userMessage: currentMessage
                }
              );
              if (!singleAlloc.success) {
                return {
                  error: singleAlloc.message,
                  code: singleAlloc.code,
                  rules: detail.seating_rules
                };
              }
              allocResultSeats.push(...singleAlloc.seats);
              allocResultItems.push(...singleAlloc.items);
              allocTotalAmount += singleAlloc.totalAmount;
              if (singleAlloc.note && !allocNote) allocNote = singleAlloc.note;
              allocRulesApplied = singleAlloc.rulesApplied || allocRulesApplied;
              const usedIds = new Set(singleAlloc.seats.map(s => s.session_seat_id));
              remainingSessionSeats = remainingSessionSeats.filter(s => !usedIds.has(s.session_seat_id));
            }
          } else {
            const singleTargetTier = ticketTypeId || requestedTickets[0]?.ticket?.id;
            const singleQty = requestedTickets[0]?.quantity || quantity;
            const singleAlloc = seatAllocationService.allocateSeats(
              allSessionSeats,
              detail.seating_rules,
              detail.ticket_types || [],
              {
                quantity: singleQty,
                preferredRow,
                excludeRow,
                ticketTypeId: singleTargetTier,
                cheapestOnly: wantsCheapest || !singleTargetTier,
                isCenterPreferred,
                horizontalPreference,
                userMessage: currentMessage
              }
            );

            if (!singleAlloc.success) {
              return {
                error: singleAlloc.message,
                code: singleAlloc.code,
                rules: detail.seating_rules
              };
            }
            allocResultSeats = singleAlloc.seats;
            allocResultItems = singleAlloc.items;
            allocTotalAmount = singleAlloc.totalAmount;
            allocNote = singleAlloc.note;
            allocRulesApplied = singleAlloc.rulesApplied;
          }

          // Attempt seat holding if userId is available
          let holdExpiresAt = null;
          if (userId) {
            try {
              const holdRes = await eventsService.holdSeats(userId, {
                event_id: detail.id,
                items: allocResultItems
              });
              holdExpiresAt = holdRes.hold_expires_at || null;
            } catch (holdErr) {
              logger.warn(`[AiAssistant] Could not hold seats: ${holdErr.message}`);
            }
          }
          if (!holdExpiresAt) {
            holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          }

          proposalData = {
            eventId: detail.id,
            eventSlug: detail.slug,
            eventTitle: detail.title,
            eventStartTime: matchedSession.start_time || detail.start_time,
            eventEndTime: matchedSession.end_time || detail.end_time,
            session: {
              id: matchedSession.id,
              name: matchedSession.session_name || 'Suất chính',
              start_time: matchedSession.start_time,
              end_time: matchedSession.end_time
            },
            venueSummary: detail.venue?.summary || [detail.venue?.name, detail.venue?.address_line, detail.venue?.city].filter(Boolean).join(', ') || '',
            hasSeatMap: true,
            quantity,
            seats: allocResultSeats.map(s => ({
              id: s.id,
              session_seat_id: s.session_seat_id,
              label: s.label,
              row_label: s.row_label,
              seat_number: s.seat_number,
              price: s.price,
              ticketTypeId: s.ticketType?.id,
              ticketTypeName: s.ticketType?.name,
              zoneName: s.zone?.name || null,
              zoneColor: s.zone?.color || null
            })),
            selectedSeatIds: allocResultSeats.map(s => s.session_seat_id),
            items: allocResultItems,
            totalAmount: allocTotalAmount,
            requireAttendeeInfo,
            buyer: {
              name: buyerName,
              email: buyerEmail,
              phone: buyerPhone
            },
            attendees: collectedAttendees.slice(0, quantity),
            isAttendeesComplete,
            holdExpiresAt,
            note: allocNote || null,
            rulesApplied: allocRulesApplied
          };
        } else {
          // Unseated event (Vé tự do)
          const sortedByPrice = [...allEventTickets].sort((a, b) => Number(a.price) - Number(b.price));
          let orderItems = [];
          let totalAmount = 0;

          if (requestedTickets.length > 0) {
            for (const rt of requestedTickets) {
              const p = Number(rt.ticket.price || 0);
              orderItems.push({
                ticket_type_id: rt.ticket.id,
                ticketType: rt.ticket,
                quantity: rt.quantity,
                sessionSeatIds: []
              });
              totalAmount += p * rt.quantity;
            }
          } else {
            let chosenTicket = null;
            if (ticketTypeId) {
              chosenTicket = allEventTickets.find(t => String(t.id) === String(ticketTypeId));
            }
            if (!chosenTicket && ticketTypeName) {
              const normReq = normalizeText(ticketTypeName);
              chosenTicket = allEventTickets.find(t => normalizeText(t.name).includes(normReq));
            }
            if (!chosenTicket) {
              chosenTicket = sortedByPrice[0] || allEventTickets[0];
            }

            const price = Number(chosenTicket?.price || 0);
            totalAmount = price * quantity;
            if (chosenTicket) {
              orderItems.push({
                ticket_type_id: chosenTicket.id,
                ticketType: chosenTicket,
                quantity,
                sessionSeatIds: []
              });
            }
          }

          proposalData = {
            eventId: detail.id,
            eventSlug: detail.slug,
            eventTitle: detail.title,
            eventStartTime: matchedSession?.start_time || detail.start_time,
            eventEndTime: matchedSession?.end_time || detail.end_time,
            session: matchedSession ? {
              id: matchedSession.id,
              name: matchedSession.session_name || 'Suất chính',
              start_time: matchedSession.start_time,
              end_time: matchedSession.end_time
            } : null,
            venueSummary: detail.venue?.summary || [detail.venue?.name, detail.venue?.address_line, detail.venue?.city].filter(Boolean).join(', ') || '',
            hasSeatMap: false,
            quantity,
            seats: [],
            selectedSeatIds: [],
            items: orderItems,
            totalAmount,
            requireAttendeeInfo,
            buyer: {
              name: buyerName,
              email: buyerEmail,
              phone: buyerPhone
            },
            attendees: collectedAttendees.slice(0, quantity),
            isAttendeesComplete,
            holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            note: null,
            rulesApplied: detail.seating_rules || {}
          };
        }

        const actionTag = `[ACTION:BOOKING_PROPOSAL:${encodeURIComponent(JSON.stringify(proposalData))}]`;
        if (context) context.lastGeneratedActionTag = actionTag;

        const seatSummary = proposalData.seats.length > 0 
          ? proposalData.seats.map(s => s.label).join(', ') 
          : proposalData.items.map(it => `${it.quantity} vé ${it.ticketType?.name || ''} (${Number(it.ticketType?.price || 0).toLocaleString('vi-VN')}đ)`).join(', ');

        const labelType = proposalData.seats.length > 0 ? 'các vị trí ghế' : 'các loại vé';
        let instruction = '';
        if (requireAttendeeInfo && !isAttendeesComplete) {
          const needed = quantity - collectedAttendees.length;
          instruction = `Eve đã chọn trước ${labelType}: [${seatSummary}], tổng tiền ${proposalData.totalAmount.toLocaleString('vi-VN')}đ. Tuy nhiên, sự kiện này CÓ YÊU CẦU thông tin check-in vé của từng người tham gia. Hiện tại khách đã có ${collectedAttendees.length}/${quantity} người. Eve hãy vui vẻ thông báo ${labelType} đã chọn, và nhẹ nhàng xin Họ tên + Email cho ${needed} người còn lại (gợi ý khách có thể nhắn "dùng thông tin của tôi" nếu tự đi một mình). TUYỆT ĐỐI không dán mã hay URL.`;
        } else {
          instruction = `Eve đã tạo Đề xuất Đặt vé thành công với ${labelType}: [${seatSummary}], tổng tiền: ${proposalData.totalAmount.toLocaleString('vi-VN')}đ ${proposalData.note ? `(${proposalData.note})` : ''}. Eve hãy thông báo vui vẻ và bảo khách kiểm tra thông tin trên thẻ đề xuất bên dưới, rồi nhấn nút "Xác nhận & Đi tới Thanh toán" để thanh toán ngay, hoặc nếu muốn đổi vị trí/tự chọn thì Eve luôn sẵn sàng hỗ trợ nhé! TUYỆT ĐỐI không dán mã hay URL.`;
        }

        return {
          status: 'SUCCESS',
          proposal: {
            seats: seatSummary,
            totalAmount: proposalData.totalAmount,
            note: proposalData.note
          },
          instruction
        };
      }

      return { error: 'Function not found' };
    } catch (err) {
      logger.error(`[AiAssistant] Tool error for ${name}: ${err.message}`);
      return { error: 'Failed to execute tool', details: err.message };
    }
  }

  async chat(userId, messageOrPayload, maybeHistory = []) {
    try {
      let message = typeof messageOrPayload === 'string' ? messageOrPayload : (messageOrPayload?.message || '');
      const rawHistory = (Array.isArray(maybeHistory) && maybeHistory.length > 0)
        ? maybeHistory
        : (messageOrPayload?.history || []);
      const cleanHistory = Array.isArray(rawHistory)
        ? rawHistory.filter(m => m && typeof m === 'object' && typeof m.role === 'string').map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
          }))
        : [];

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
    // Check if the user is asking about or wanting to book a specific named event in EventHub:
    const publishedEvents = await getPublishedEventsCache();
    const eventChangeInfo = detectEventChangeIntent(message);

    // If user asked to switch to a target ("Đổi sang sự kiện Hoàng Dũng"), try to match that target query first!
    const queryForMatching = eventChangeInfo.targetQuery || message;
    const currentMatchedEvent = findMatchingPublishedEvent(
      queryForMatching,
      publishedEvents,
      { allowSemanticTopic: true }
    );

    // Look back in cleanHistory to find the previous active event:
    // IMPORTANT: ONLY scan user messages! Assistant messages contain event lists & generic instructions
    let previousActiveEvent = null;
    if (cleanHistory.length > 0) {
      for (let i = cleanHistory.length - 1; i >= 0; i--) {
        const hMsg = cleanHistory[i];
        if (hMsg.role !== 'user') continue;
        const hChange = detectEventChangeIntent(hMsg.content);
        if (hChange.isChange && !hChange.targetQuery) {
          // An earlier message in history broke the active event binding
          break;
        }
        const found = findMatchingPublishedEvent(hChange.targetQuery || hMsg.content, publishedEvents, { allowSemanticTopic: false });
        if (found) {
          previousActiveEvent = found;
          break;
        }
      }
    }

    // Determine effective activeEvent for this turn:
    let activeEvent = null;
    let isEventSwitched = false;

    if (eventChangeInfo.isCancelOnly) {
      // User cancelled booking entirely
      activeEvent = null;
    } else if (eventChangeInfo.isChange && !currentMatchedEvent) {
      // User asked to change/abandon event without specifying the new event title yet
      activeEvent = null;
    } else if (currentMatchedEvent) {
      activeEvent = currentMatchedEvent;
      if (previousActiveEvent && previousActiveEvent.slug !== currentMatchedEvent.slug) {
        isEventSwitched = true;
      }
    } else {
      activeEvent = previousActiveEvent;
    }

    let requireAttendeeInfo = false;
    let hasSeatMap = false;
    let eventDetail = null;
    let sessionList = [];
    let activeSessionId = '';

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

      const matchedSession = findMatchingSession(message, sessionList);
      activeSessionId = matchedSession?.id || sessionList[0]?.id || '';

      const sessionCount = sessionList.length;
      const activeEventDesc = stripHtml(eventDetail?.description || activeEvent.description || '');
      const activeEventVenue = eventDetail?.venue?.summary || [eventDetail?.venue?.name, eventDetail?.venue?.address_line, eventDetail?.venue?.city].filter(Boolean).join(', ') || 'Chưa cập nhật';

      const rawRules = eventDetail?.seating_rules || activeEvent?.seating_rules || {};
      const normRules = normalizeRules(rawRules);
      const rulesSummary = [
        `- Giới hạn số vé tối đa mỗi đơn: ${normRules.max_tickets_per_order} vé`,
        `- Yêu cầu cùng một hàng: ${normRules.require_same_row ? 'BẮT BUỘC CÙNG HÀNG' : 'Không bắt buộc cùng hàng (linh hoạt)'}`,
        `- Yêu cầu ghế ngồi liền kề: ${normRules.require_adjacent_seats ? 'BẮT BUỘC LIỀN KỀ NHAU' : 'Không bắt buộc liền kề'}`,
        `- Quy tắc chống để lại ghế lẻ loi: ${normRules.disallow_single_seat_left ? 'BẬT (không được để lại 1 ghế trống đơn độc)' : 'TẮT'}`
      ].join('\n  ');

      if (hasSeatMap) {
        dynamicSystemPrompt += `\n\nSỰ KIỆN KHÁCH HÀNG ĐANG XEM / ĐẶT VÉ TRONG ĐOẠN CHAT:
- Tên sự kiện: ${activeEvent.title}
- Slug / ID: ${activeEvent.slug}
- ĐẶC ĐIỂM: SỰ KIỆN CÓ SƠ ĐỒ CHỖ NGỒI (Khách có thể nhờ AI chọn ghế hoặc tự do chọn trên sơ đồ).
- Yêu cầu thông tin người tham gia (require_attendee_info): ${requireAttendeeInfo ? 'CÓ YÊU CẦU' : 'KHÔNG YÊU CẦU'}
- Giới thiệu / Nội dung: ${activeEventDesc ? `"${activeEventDesc.slice(0, 450)}..."` : 'Sự kiện trải nghiệm hấp dẫn'}
- Địa điểm tổ chức: ${activeEventVenue}
- Số lượng suất diễn: ${sessionCount}
- Danh sách suất diễn:
  ${sessionText || 'Xem chi tiết'}
- Danh sách loại vé & giá vé tham khảo:
  ${ticketText || 'Xem chi tiết'}
- QUY TẮC ĐẶT CHỖ RIÊNG CỦA SỰ KIỆN NÀY (DO BAN TỔ CHỨC THIẾT LẬP):
  ${rulesSummary}

QUY TẮC HỖ TRỢ ĐẶT VÉ LINH HOẠT (HYBRID AGENT):
1. NẾU KHÁCH CHỈ HỎI THÔNG TIN / CHI TIẾT SỰ KIỆN (chưa nói muốn đặt vé):
   - Giới thiệu chi tiết nội dung/trải nghiệm nổi bật, thời gian diễn ra, địa điểm tổ chức, các loại vé & giá vé.
   - Sau đó hỏi khách: "Bạn có muốn Eve hỗ trợ đặt vé sự kiện này không ạ? 🥰".
   - TUYỆT ĐỐI KHÔNG tự ý mở sơ đồ chọn ghế hoặc gọi action tag khi khách chỉ đang hỏi thông tin!
2. CHẾ ĐỘ 1 - TỰ ĐỘNG HÓA THÔNG MINH (KHI KHÁCH NHỜ ĐẶT VÉ, ĐẶT LUÔN HOẶC CHỈ ĐỊNH SỐ LƯỢNG / HÀNG GHẾ):
   - Khi khách nói: "đặt giúp tôi 3 vé sự kiện ABC ưu tiên hàng C", "đặt luôn 2 vé", "chọn cho tôi 3 vé hàng C", "lấy 2 vé", "đổi sang hàng D":
   - BẮT BUỘC GỌI TOOL proposeSmartBooking({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}", quantity: <số vé>, preferredRow: "<hàng ghế nếu có>" })!
   - Tool sẽ tự động phân bổ ghế tối ưu theo quy tắc của Ban tổ chức, giữ chỗ tạm thời và tạo Thẻ Đề Xuất Đặt Vé (Booking Proposal) ngay trong chat.
   - NẾU SỰ KIỆN CÓ YÊU CẦU THÔNG TIN NGƯỜI THAM GIA (${requireAttendeeInfo ? 'CÓ YÊU CẦU' : 'KHÔNG YÊU CẦU'}):
     * Sau khi tool giữ ghế thành công, nếu khách chưa cung cấp đủ Họ tên + Email cho từng vé, hãy vui vẻ thông báo ghế đã chọn và xin bổ sung Họ tên + Email cho các vé còn lại (khách có thể nhắn "dùng thông tin của tôi" nếu tự đi một mình).
   - NẾU KHÁCH YÊU CẦU ĐỔI HÀNG GHẾ (VD: "đổi sang hàng D"): Tiếp tục gọi proposeSmartBooking với preferredRow mới để cập nhật đề xuất!
3. CHẾ ĐỘ 2 - TỰ CHỌN GHẾ TRÊN SƠ ĐỒ (KHI KHÁCH MUỐN TỰ TAY CHỌN):
   - Khi khách nói: "để tôi tự chọn ghế", "mở sơ đồ ghế", "cho tôi tự chọn", "tự vào sơ đồ":
   - Gọi ngay generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}" }) để mở sơ đồ ghế cho khách!`;
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

    if (eventChangeInfo.isCancelOnly) {
      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa thông báo không muốn đặt vé nữa / muốn dừng đặt vé.
Bạn hãy vui vẻ xác nhận đã dừng quy trình đặt vé và chúc khách một ngày tốt lành, sẵn sàng hỗ trợ bất cứ khi nào khách cần. TUYỆT ĐỐI KHÔNG gọi tool đặt vé hay tạo action tag đặt vé nữa!`
      });
    } else if (eventChangeInfo.isChange && !currentMatchedEvent) {
      logger.info(`[AiAssistant] User requested event change/abandonment without naming new event yet. Loading new events...`);
      const searchRes = await this.executeTool(userId, 'searchEvents', { query: '', limit: 5 });
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_auto_search', function: { name: 'searchEvents', arguments: { query: '' } } }]
      });
      messages.push({
        role: 'tool',
        name: 'searchEvents',
        tool_call_id: 'call_auto_search',
        content: JSON.stringify(searchRes)
      });
      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa yêu cầu đổi sự kiện / không muốn đặt vé cho sự kiện "${previousActiveEvent?.title || 'trước đó'}" nữa.
Hệ thống đã dừng quy trình đặt vé cho sự kiện cũ và tải danh sách sự kiện mới.
Bạn hãy vui vẻ xác nhận đã dừng đặt vé cho sự kiện cũ, sau đó gợi ý các sự kiện nổi bật hiện có (từ kết quả tool searchEvents) hoặc hỏi xem khách hàng muốn tham gia thể loại sự kiện nào (ca nhạc, kịch nghệ, workshop, triển lãm...) để Eve hỗ trợ tìm nhé! 🥰
TUYỆT ĐỐI KHÔNG gọi tool đặt vé hoặc tạo proposal cho sự kiện cũ!`
      });
    } else if (isEventSwitched && activeEvent) {
      logger.info(`[AiAssistant] User switched from "${previousActiveEvent?.title}" to "${activeEvent.title}". Pre-fetching new event details...`);
      const detailRes = await this.executeTool(userId, 'getEventDetails', { eventId: activeEvent.slug }, { message });
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_auto_detail', function: { name: 'getEventDetails', arguments: { eventId: activeEvent.slug } } }]
      });
      messages.push({
        role: 'tool',
        name: 'getEventDetails',
        tool_call_id: 'call_auto_detail',
        content: JSON.stringify(detailRes)
      });
      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa chuyển từ sự kiện "${previousActiveEvent?.title || 'cũ'}" sang sự kiện "${activeEvent.title}".
Hệ thống đã chuyển sang sự kiện mới và hủy bỏ toàn bộ đề xuất của sự kiện cũ.
Bạn hãy xác nhận đã chuyển sang sự kiện "${activeEvent.title}", giới thiệu thông tin sự kiện mới và các hạng vé hiện có để hỗ trợ khách nhé!`
      });
    } else if (currentMatchedEvent) {
      // User just named or asked for this specific event in the current message
      logger.info(`[AiAssistant] User specified event: "${currentMatchedEvent.title}" (${currentMatchedEvent.slug}). Pre-fetching event details...`);
      const detailRes = await this.executeTool(userId, 'getEventDetails', { eventId: currentMatchedEvent.slug }, { message });
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
      // AND the message is not selecting tickets/seats/checkout
      const isBookingOrTicketSelect = /(suất|vé|ghế|đặt|mua|chọn|số lượng|\d+\s*vé|sdt|số điện thoại|email)/i.test(message);

      if (!isBookingOrTicketSelect) {
        const isGeneralDiscovery = isGeneralDiscoveryQuery(message);
        const isEventInquiry = isGeneralDiscovery || /(sự kiện|show|chương trình|thể loại|lĩnh vực|nhạc|kịch|workshop|hội thảo|có gì|diễn ra|ca nhạc|concert|đang hot|tìm|xem|sắp tới|nổi bật|xe|ô tô|oto|vẽ|gốm)/i.test(message);

        if (isEventInquiry) {
          let q = '';
          if (isGeneralDiscovery) {
            q = '';
          } else {
            q = extractCoreSearchQuery(message);
            const catInfo = detectCategory(q);
            if (catInfo && q.length < 3) {
              q = catInfo.name;
            }
          }

          logger.info(`[AiAssistant] Pre-fetching events from DB for query: "${q}" (isGeneralDiscovery: ${isGeneralDiscovery})...`);
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
    }

    // Context triggers for phone or "dùng thông tin của tôi":
    const normMsg = normalizeText(message);
    const hasUseMyInfoInMsg = /(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi|thong\s+tin\s+nhu\s+tren/i.test(normMsg);
    const allUserNorm = normalizeText(allUserMessages);
    const hasSaidUseMyInfo = /(dung|lay|su dung|giong)\s+thong\s+tin\s+cua\s+toi|thong\s+tin\s+nhu\s+tren/i.test(allUserNorm);

    // 1. Detect user intents from current message early:
    const wantsDifferentTier = !eventChangeInfo.isChange && (
      /(?:đổi|chuyển|qua|sang|chọn|lấy|mua)?\s*(?:sang\s*)?(?:khu\s*vực|khu|hạng|loại\s*vé|loại|vùng)\s*khác\b/i.test(message) ||
      /(?:doi|chuyen|qua|sang|chon|lay|mua)?\s*(?:sang\s*)?(?:khu\s*vuc|khu|hang|loai\s*ve|loai|vung)\s*khac\b/i.test(normMsg) ||
      /(?:đổi\s*khu|đổi\s*khu\s*vực|chuyển\s*khu|chuyển\s*khu\s*vực|khu\s*vực\s*khác|loại\s*vé\s*khác|hạng\s*vé\s*khác|loại\s*khác|hạng\s*khác)/i.test(message) ||
      /(?:doi\s*khu|doi\s*khu\s*vuc|chuyen\s*khu|chuyen\s*khu\s*vuc|khu\s*vuc\s*khac|loai\s*ve\s*khac|hang\s*ve\s*khac|loai\s*khac|hang\s*khac)/i.test(normMsg)
    );

    const isChangeRowRequest = !eventChangeInfo.isChange && (
      /(?:đổi|chuyển|chọn)\s*(?:sang\s*)?(?:hàng|dãy|row)\s*(?:ghế\s*)?khác\b/i.test(message) ||
      /(?:doi|chuyen|chon)\s*(?:sang\s*)?(?:hang|day|row)\s*(?:ghe\s*)?khac\b/i.test(normMsg) ||
      /(?:hàng\s*khác|hang\s*khac)/i.test(normMsg)
    );

    const isSeatAdjustmentRequest = !eventChangeInfo.isChange && (
      /(?:lệch|lech|bị\s*lệch|bi\s*lech|chính\s*giữa|chinh\s*giua|ở\s*giữa|o\s*giua|giữa\s*hàng|giua\s*hang|đổi\s*ghế|doi\s*ghe|đổi\s*hàng|doi\s*hang|đổi\s*sang|doi\s*sang|chuyển\s*sang|chuyen\s*sang|chọn\s*lại|chon\s*lai|hàng\s*khác|hang\s*khac|sang\s*hang|sang\s*hàng|đổi\s*vé|doi\s*ve|đổi\s*loại|doi\s*loai|chuyển\s*loại|chuyen\s*loai)/i.test(message) ||
      /(?:lech|bi\s*lech|chinh\s*giua|o\s*giua|giua\s*hang|doi\s*ghe|doi\s*hang|doi\s*sang|chuyen\s*sang|chon\s*lai|hang\s*khac|sang\s*hang|doi\s*ve|doi\s*loai|chuyen\s*loai)/i.test(normMsg) ||
      wantsDifferentTier ||
      isChangeRowRequest
    );

    const isAutonomousBookingRequest = (
      !eventChangeInfo.isChange &&
      !eventChangeInfo.isCancelOnly &&
      (
        /(?:đặt|đạt|dat|mua|lấy|lay|chọn|chon|đổi|doi|chuyển|chuyen|book|booking|order|giữ\s*chỗ|giu\s*cho|cho\s*mình|cho\s*minh|cho\s*tôi|cho\s*toi|cho\s*em|cho\s*anh|lấy\s*hộ|lay\s*ho|lấy\s*giúp|lay\s*giup|cần|can|muốn\s*đặt|muon\s*dat|muốn\s*mua|muon\s*mua|đăng\s*ký|dang\s*ky)\s*(?:giúp\s*tôi|giup\s*toi|giúp\s*mình|giup\s*minh|hộ\s*tôi|ho\s*toi|hộ\s*mình|ho\s*minh|luôn|luon|ngay|lại|lai|sang)?\s*(?:\d+|một|mot|hai|ba|bốn|bon|năm|nam|cặp|cap|đôi|doi)?\s*(?:vé|ve|chỗ|cho|ghế|ghe|ticket|suất|suat)?/i.test(message) ||
        /(?:dat|mua|lay|book|booking|order|giu cho|cho minh|cho toi)\s*(\d+|mot|hai|ba|bon|nam|cap|doi|ve|cho|ghe|ticket)/i.test(normMsg)
      ) && !/(?:tự\s*chọn|tu\s*chon|sơ\s*đồ\s*ghế|so\s*do\s*ghe|mở\s*sơ\s*đồ|mo\s*so\s*do|cho\s*tôi\s*tự\s*chọn|cho\s*toi\s*tu\s*chon|tự\s*vào\s*chọn|tu\s*vao\s*chon)/i.test(normMsg)
    );

    const isManualSeatMapRequest = /(?:tự\s*chọn|tu\s*chon|sơ\s*đồ\s*ghế|so\s*do\s*ghe|mở\s*sơ\s*đồ|mo\s*so\s*do|cho\s*tôi\s*tự\s*chọn|cho\s*toi\s*tu\s*chon|tự\s*vào\s*chọn|tu\s*vao\s*chon)/i.test(normMsg);

    // 2. Extract last proposal from history (ignore old proposal if switching/abandoning event):
    const ticketTypesList = eventDetail?.ticket_types || [];
    const lastProposal = (isEventSwitched || eventChangeInfo.isChange)
      ? null
      : findLastBookingProposal(cleanHistory, ticketTypesList);
    const prevProposalQty = lastProposal?.quantity || null;
    const firstSeat = lastProposal?.seats?.[0];
    const firstSeatLabel = typeof firstSeat === 'string' ? firstSeat : (firstSeat?.label || '');
    const prevRow = firstSeatLabel ? firstSeatLabel.charAt(0).toUpperCase() : null;
    const excludeRow = isChangeRowRequest ? prevRow : null;

    const userTextForCurrentEvent = (isEventSwitched || eventChangeInfo.isChange)
      ? message
      : allUserMessages;

    const ticketsFromCurrentMsg = parseTicketsFromText(message, ticketTypesList);
    const detectedTickets = parseTicketsFromText(userTextForCurrentEvent, ticketTypesList);

    const collectedAttendees = extractAttendeesFromText(allUserMessages, userProfile);

    const seatedOrderQty = (() => {
      if (ticketsFromCurrentMsg.length > 0) return ticketsFromCurrentMsg.reduce((sum, dt) => sum + dt.quantity, 0);
      const parsedQInMsg = parseQuantityFromText(message, prevProposalQty);
      if (parsedQInMsg && parsedQInMsg > 0) return parsedQInMsg;
      if (wantsDifferentTier || isSeatAdjustmentRequest) {
        if (prevProposalQty && prevProposalQty > 0) return prevProposalQty;
      }
      if (detectedTickets.length > 0) return detectedTickets.reduce((sum, dt) => sum + dt.quantity, 0);
      const parsedQ = parseQuantityFromText(userTextForCurrentEvent);
      if (parsedQ && parsedQ > 0) return parsedQ;
      if (collectedAttendees.length > 0) return collectedAttendees.length;
      return prevProposalQty || 1;
    })();

    // Detect candidate ticket tiers & prices for active event:
    const activeTicketList = (eventDetail?.ticket_types || activeEvent?.ticket_types || []).filter(
      t => (t.available_quantity > 0 || t.available_quantity === undefined)
    );
    const seatedTicketList = activeTicketList.filter(t => t.is_seated !== false);
    const targetCandidateTickets = (hasSeatMap && seatedTicketList.length > 0) ? seatedTicketList : activeTicketList;

    const distinctPrices = new Set(targetCandidateTickets.map(t => Number(t.price || 0)));
    const hasMultiplePriceTiers = distinctPrices.size > 1;
    const sortedCandidateTickets = [...targetCandidateTickets].sort((a, b) => Number(a.price) - Number(b.price));
    const cheapestTicket = sortedCandidateTickets[0] || null;

    const normAllUser = normalizeText(allUserMessages);

    const wantsCheapestInMsg = /(?:rẻ\s*nhất|tiết\s*kiệm\s*nhất|loại\s*rẻ|vé\s*rẻ|giá\s*thấp\s*nhất|loại\s*nào\s*cũng\s*được|sao\s*cũng\s*được|tùy\s*bạn|bất\s*kỳ|loại\s*thấp\s*tiền)/i.test(message) ||
      /(?:re\s*nhat|tiet\s*kiem\s*nhat|loai\s*re|ve\s*re|gia\s*thap\s*nhat|loai\s*nao\s*cung\s*duoc|sao\s*cung\s*duoc|tuy\s*ban|bat\s*ky|thap\s*tien)/i.test(normMsg);

    const wantsCheapestAll = /(?:rẻ\s*nhất|tiết\s*kiệm\s*nhất|loại\s*rẻ|vé\s*rẻ|giá\s*thấp\s*nhất|loại\s*nào\s*cũng\s*được|sao\s*cũng\s*được|tùy\s*bạn|bất\s*kỳ|loại\s*thấp\s*tiền)/i.test(allUserMessages) ||
      /(?:re\s*nhat|tiet\s*kiem\s*nhat|loai\s*re|ve\s*re|gia\s*thap\s*nhat|loai\s*nao\s*cung\s*duoc|sao\s*cung\s*duoc|tuy\s*ban|bat\s*ky|thap\s*tien)/i.test(normAllUser);

    // Detect if user specifically mentioned any ticket tier by name or price in current message or in history:
    let matchedTierInMsg = null;
    let matchedTierAll = null;
    for (const t of targetCandidateTickets) {
      const normName = normalizeText(t.name).replace(/\([^)]*\)/g, '').trim();
      const pNum = Number(t.price);
      const pK = `${Math.round(pNum / 1000)}k`;
      const priceRegex = new RegExp(`\\b${pK}\\b|\\b${pNum}\\b`, 'i');

      if ((normName.length >= 3 && normMsg.includes(normName)) || priceRegex.test(normMsg)) {
        matchedTierInMsg = t;
      }
      if ((normName.length >= 3 && normAllUser.includes(normName)) || priceRegex.test(normAllUser)) {
        matchedTierAll = t;
      }
    }

    const requestedQty = parseQuantityFromText(message, prevProposalQty) || ((wantsDifferentTier || isSeatAdjustmentRequest) ? prevProposalQty : null);

    let requestedRow = null;
    if (!wantsDifferentTier && !isChangeRowRequest) {
      const rowMatch = message.match(/(?:hàng\s*(?:ghế\s*)?|dãy\s*(?:ghế\s*)?|row\s*)([a-zA-Z\d]+)/i) ||
        normMsg.match(/(?:hang\s*(?:ghe\s*)?|day\s*(?:ghe\s*)?|row\s*)([a-z\d]+)/i) ||
        normMsg.match(/(?:doi\s*sang|chuyen\s*sang|lay\s*hang|chon\s*hang|hang)\s+([a-z\d])\b/i);

      if (rowMatch) {
        const candidateRow = rowMatch[1].toUpperCase();
        if (!/(?:TRUNG|GIỮA|GIUA|DAU|ĐẦU|CUOI|CUỐI|VIP|TAM)/i.test(candidateRow)) {
          requestedRow = candidateRow;
        }
      }
    } else if (!isChangeRowRequest) {
      const rowInCurrent = message.match(/(?:hàng\s*(?:ghế\s*)?|dãy\s*(?:ghế\s*)?|row\s*)([a-zA-Z\d]+)/i);
      if (rowInCurrent) {
        const candidateRow = rowInCurrent[1].toUpperCase();
        if (!/(?:TRUNG|GIỮA|GIUA|DAU|ĐẦU|CUOI|CUỐI|VIP|TAM)/i.test(candidateRow)) {
          requestedRow = candidateRow;
        }
      }
    }
    const isCenterInMsg = /(?:trung\s*tâm|ở\s*giữa|khu\s*vực\s*giữa|hàng\s*ghế\s*trung\s*tâm|chính\s*giữa)/i.test(message) ||
      /(?:trung\s*tam|o\s*giua|khu\s*vuc\s*giua|hang\s*ghe\s*trung\s*tam|chinh\s*giua|hang\s*giua|center)/i.test(normMsg);

    // If user previously asked to book and is now replying with a tier or price or "loại rẻ nhất":
    const hasBookingContext = /(?:đặt|đạt|dat|mua|lấy|lay|chọn|chon|book|order)\s*(?:giúp|giup|hộ|ho|vé|ve|ghế|ghe)?/i.test(normAllUser);
    const isTierOrPriceResponse = Boolean(matchedTierInMsg || wantsCheapestInMsg) && hasBookingContext;

    // Determine current effective target tier and tickets (CURRENT message takes strict priority over history)
    const isChangeTierInquiry = /(?:xem|hỏi|có\s*những|có\s*các)\s*(?:loại\s*vé|hạng\s*vé|khu\s*vực|giá\s*vé)/i.test(message) &&
      !matchedTierInMsg && !wantsCheapestInMsg && !wantsDifferentTier && !isAutonomousBookingRequest;

    let effDetectedTickets = [];
    let effTargetTier = null;

    if (ticketsFromCurrentMsg.length > 0) {
      effDetectedTickets = ticketsFromCurrentMsg;
      effTargetTier = ticketsFromCurrentMsg[0]?.ticket;
    } else if (matchedTierInMsg) {
      effTargetTier = matchedTierInMsg;
      const q = requestedQty || seatedOrderQty || 1;
      effDetectedTickets = [{ ticket: matchedTierInMsg, quantity: q }];
    } else if (wantsDifferentTier && targetCandidateTickets.length > 1) {
      // User specifically requested to switch to a different zone / tier:
      const prevTierId = lastProposal?.ticket_type_id;
      const candidateOther = targetCandidateTickets.filter(t => (!prevTierId || String(t.id) !== String(prevTierId)));
      const otherTiers = candidateOther.length > 0 ? candidateOther : targetCandidateTickets;
      effTargetTier = otherTiers[0] || targetCandidateTickets[0];
      const q = requestedQty || seatedOrderQty || prevProposalQty || 1;
      effDetectedTickets = [{ ticket: effTargetTier, quantity: q }];
    } else if (wantsCheapestInMsg) {
      effTargetTier = cheapestTicket;
      const q = requestedQty || seatedOrderQty || 1;
      effDetectedTickets = [{ ticket: cheapestTicket, quantity: q }];
    } else if (!wantsDifferentTier && (isChangeRowRequest || isSeatAdjustmentRequest) && lastProposal?.ticket_type_id) {
      // Preserve previous tier when user is adjusting seats or changing row
      const prevMatchedTier = targetCandidateTickets.find(t => String(t.id) === String(lastProposal.ticket_type_id));
      if (prevMatchedTier) {
        effTargetTier = prevMatchedTier;
        const q = requestedQty || seatedOrderQty || prevProposalQty || 1;
        effDetectedTickets = [{ ticket: prevMatchedTier, quantity: q }];
      }
    } else if (detectedTickets.length > 0) {
      effDetectedTickets = detectedTickets;
      effTargetTier = detectedTickets[0]?.ticket;
    } else {
      effTargetTier = matchedTierAll || (wantsCheapestAll ? cheapestTicket : cheapestTicket);
      if (effTargetTier) {
        const q = requestedQty || seatedOrderQty || 1;
        effDetectedTickets = [{ ticket: effTargetTier, quantity: q }];
      }
    }

    const effQty = requestedQty || (ticketsFromCurrentMsg.length > 0 ? ticketsFromCurrentMsg.reduce((s, t) => s + t.quantity, 0) : null) || (effDetectedTickets.length > 0 ? effDetectedTickets.reduce((s, t) => s + t.quantity, 0) : null) || seatedOrderQty || 1;
    const hasChosenTickets = effDetectedTickets.length > 0;
    const totalOrderQty = hasChosenTickets ? effDetectedTickets.reduce((sum, dt) => sum + dt.quantity, 0) : 0;
    const hasEnoughAttendees = !requireAttendeeInfo || (hasChosenTickets && collectedAttendees.length >= totalOrderQty);

    const hasSpecificPlacement = Boolean(requestedRow || isCenterInMsg || isSeatAdjustmentRequest);
    const hasSpecificTier = Boolean(effTargetTier || matchedTierAll || hasChosenTickets);

    const isBookingFlowActive = Boolean(
      activeEvent &&
      !eventChangeInfo.isChange &&
      !eventChangeInfo.isCancelOnly &&
      !isManualSeatMapRequest &&
      (isAutonomousBookingRequest || hasChosenTickets || isSeatAdjustmentRequest || isTierOrPriceResponse || /(?:đặt luôn|đặt vé|chọn vé|dat luon|dat ve|chon ve)/i.test(message))
    );

    if (isBookingFlowActive && !isChangeTierInquiry) {
      // Customer specified row, tier, cheapest, or asked to book!
      const hasMultipleDetected = effDetectedTickets.length > 1;
      const ticketsArg = hasMultipleDetected ? effDetectedTickets.map(dt => ({
        ticketTypeId: dt.ticket.id,
        ticketTypeName: dt.ticket.name,
        quantity: dt.quantity
      })) : null;

      const ticketsParam = ticketsArg ? `, tickets: ${JSON.stringify(ticketsArg)}` : '';
      const targetTier = !hasMultipleDetected ? effTargetTier : null;
      const tierParam = targetTier ? `, ticketTypeId: "${targetTier.id}", ticketTypeName: "${targetTier.name}"` : '';
      const tierDesc = hasMultipleDetected
        ? `, Các loại vé: ${effDetectedTickets.map(dt => `${dt.quantity} vé "${dt.ticket.name}" (${Number(dt.ticket.price).toLocaleString('vi-VN')} VNĐ)`).join(', ')}`
        : (targetTier ? `, Hạng vé: "${targetTier.name}" (${Number(targetTier.price).toLocaleString('vi-VN')} VNĐ)` : '');
      const excludeRowParam = excludeRow ? `, excludeRow: "${excludeRow}"` : '';
      const rowParam = requestedRow ? `, preferredRow: "${requestedRow}"` : (isCenterInMsg ? ', preferredRow: "trung tâm"' : '');
      const rowDesc = requestedRow ? `, Ưu tiên hàng: ${requestedRow}` : (excludeRow ? `, Đổi hàng khác (không lấy hàng ${excludeRow})` : (isCenterInMsg ? ', Ưu tiên hàng ghế trung tâm' : ''));

      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng yêu cầu đặt vé tự động hoặc điều chỉnh ghế cho sự kiện "${activeEvent.title}" (Số lượng: ${effQty} vé${rowDesc}${tierDesc}).
${!hasSpecificTier && hasMultiplePriceTiers && !matchedTierInMsg && !wantsCheapestInMsg ? `Khách chưa chọn hạng vé cụ thể -> Hệ thống tự động chọn hạng vé tiết kiệm nhất: "${cheapestTicket?.name}" (${Number(cheapestTicket?.price || 0).toLocaleString('vi-VN')} VNĐ). Sau khi gọi tool, bạn hãy giới thiệu rõ đã chọn trước hạng vé này cho khách và gợi ý khách có thể đổi sang các hạng khác nếu muốn nhé!` : ''}
Bạn BẮT BUỘC PHẢI GỌI TOOL proposeSmartBooking({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}", quantity: ${effQty}${ticketsParam}${rowParam}${excludeRowParam}${tierParam} }) để hệ thống phân bổ lại ghế tối ưu và tạo Đề Xuất Đặt Vé cho khách duyệt! TUYỆT ĐỐI không bảo khách tự mở sơ đồ chọn ghế khi khách đã nhờ đặt!`
      });
    } else if (activeEvent && isChangeTierInquiry && targetCandidateTickets.length > 1) {
      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng muốn tham khảo hoặc đổi loại vé cho sự kiện "${activeEvent.title}".
Danh sách các hạng vé hiện có:
${targetCandidateTickets.map(t => `- Hạng vé: "${t.name}" - Giá: ${Number(t.price).toLocaleString('vi-VN')} VNĐ`).join('\n')}
Bạn hãy liệt kê các hạng vé và mức giá trên một cách thân thiện và hỏi khách muốn đổi sang hạng vé nào để Eve hỗ trợ đặt cho bạn ngay nhé!`
      });
    } else if (activeEvent && isManualSeatMapRequest) {
      messages.push({
        role: 'system',
        content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng muốn TỰ CHỌN GHẾ trên sơ đồ. Bạn hãy gọi tool generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}" }) để mở sơ đồ ghế cho khách!`
      });
    }

    const msgClean = (message || '').trim().replace(/[\.\-\s\+]/g, '');
    const isJustPhone = msgClean.length >= 9 && msgClean.length <= 13 && /^(?:84|0)[35789]\d{8}$|^0\d{9,10}$/.test(msgClean);

    if (activeEvent && hasSeatMap) {
      if (isJustPhone) {
        if (!requireAttendeeInfo) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Sự kiện có sơ đồ chỗ ngồi và KHÔNG yêu cầu thông tin người tham gia. Bạn PHẢI GỌI NGAY tool generateBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}" }) để mở sơ đồ chọn ghế cho khách!`
          });
        } else {
          if (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0) {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}) và đã cung cấp đủ thông tin người tham gia cho cả ${seatedOrderQty} vé: [${collectedAttendees.slice(0, seatedOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Bạn PHẢI GỌI NGAY tool generatePrefillBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}", quantity: ${seatedOrderQty} }) để tạo nút chọn ghế trên sơ đồ cho khách!`
            });
          } else {
            messages.push({
              role: 'system',
              content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng vừa gửi số điện thoại liên hệ (${effectivePhone}). Bạn hãy cảm ơn khách đã gửi SĐT, TUYỆT ĐỐI KHÔNG HỎI LẠI SỐ ĐIỆN THOẠI NỮA. Sự kiện này có sơ đồ chỗ ngồi và có yêu cầu thông tin check-in riêng cho từng người tham gia. Bạn hãy hỏi khách muốn đặt mấy vé và xin Họ tên + Email của người tham gia (khách có thể nhắn "dùng thông tin của tôi" nếu tự đi một mình).`
            });
          }
        }
      } else if (!effectivePhone && !isBookingFlowActive) {
        messages.push({
          role: 'system',
          content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng muốn đặt vé nhưng tài khoản CHƯA CÓ số điện thoại liên hệ. Bạn hãy hỏi khách hàng số điện thoại liên hệ: "Dạ tài khoản của bạn hiện chưa có số điện thoại liên hệ. Bạn vui lòng cho Eve xin số điện thoại để Eve hoàn tất đặt vé giúp bạn nhé! 🥰". TUYỆT ĐỐI KHÔNG TỰ BỊA SỐ ĐIỆN THOẠI VÀ CHƯA GỌI TOOL generatePrefillBookingAction!`
        });
      } else if (requireAttendeeInfo) {
        if (collectedAttendees.length >= seatedOrderQty && collectedAttendees.length > 0) {
          messages.push({
            role: 'system',
            content: `[CHỈ DẪN HỆ THỐNG]: Khách hàng đã cung cấp ĐỦ thông tin người tham gia cho cả ${seatedOrderQty} vé: [${collectedAttendees.slice(0, seatedOrderQty).map(a => `${a.name} - ${a.email}`).join('; ')}]. Thông tin người mua tự động lấy từ tài khoản: ${userProfile?.full_name || 'Khách hàng'} (${userProfile?.email || ''}, SĐT: ${effectivePhone}).
Sự kiện có sơ đồ chỗ ngồi. Bạn BẮT BUỘC PHẢI GỌI TOOL generatePrefillBookingAction({ eventId: "${activeEvent.slug}", sessionId: "${activeSessionId}", quantity: ${seatedOrderQty} }) ngay lập tức để hoàn tất tạo thông tin vé cho khách!
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

      let response = null;
      try {
        response = await ollamaClient.chat(messages, { tools: activeTools });
      } catch (chatErr) {
        logger.warn(`[AgentLoop] ollamaClient.chat with tools error: ${chatErr.message}`);
        if (activeTools.length > 0) {
          try {
            logger.info(`[AgentLoop] Retrying ollamaClient.chat without tools...`);
            response = await ollamaClient.chat(messages, { tools: [] });
          } catch (retryErr) {
            logger.error(`[AgentLoop] Retry without tools also failed: ${retryErr.message}`);
          }
        }
      }

      if (!response) {
        // Fallback: If Ollama is completely unreachable or timed out
        if (toolExecutionContext.lastGeneratedActionTag) {
          finalContent = `Eve đã tạo đề xuất đặt vé thành công cho bạn rồi nhé! Bạn kiểm tra thông tin trên thẻ bên dưới và nhấn "Xác nhận & Đi tới Thanh toán" nhé! 🎉\n\n${toolExecutionContext.lastGeneratedActionTag}`;
          break;
        } else if (isBookingFlowActive && activeEvent) {
          try {
            logger.info(`[AgentLoop] Directly triggering proposeSmartBooking as AI model fallback...`);
            await this.executeTool(userId, 'proposeSmartBooking', {
              eventId: activeEvent.slug,
              sessionId: activeSessionId,
              quantity: effQty,
              preferredRow: requestedRow || (isCenterInMsg ? 'trung tâm' : ''),
              excludeRow,
              ticketTypeId: effTargetTier?.id,
              ticketTypeName: effTargetTier?.name
            }, toolExecutionContext);
            if (toolExecutionContext.lastGeneratedActionTag) {
              finalContent = `Eve đã tạo Đề xuất Đặt vé thành công cho bạn nè! 🎉 Bạn vui lòng kiểm tra thông tin trên thẻ đề xuất bên dưới và nhấn "Xác nhận & Đi tới Thanh toán" nhé!\n\n${toolExecutionContext.lastGeneratedActionTag}`;
              break;
            }
          } catch (fbErr) {
            logger.error(`[AgentLoop] Direct fallback proposeSmartBooking error: ${fbErr.message}`);
          }
        }

        finalContent = "Dạ hiện tại hệ thống AI đang hơi bận một chút 🥺. Bạn hãy thử nhắn lại một lần nữa hoặc tải lại trang web nhé! Eve luôn sẵn sàng hỗ trợ bạn!";
        break;
      }

      let toolCalls = response.tool_calls || [];

      // Fallback: If model returned empty content with tools enabled, re-run without tools
      if (!response.content && toolCalls.length === 0 && activeTools.length > 0) {
        logger.info(`[AgentLoop] Model returned empty with tools, retrying without tools...`);
        try {
          response = await ollamaClient.chat(messages, { tools: [] });
          toolCalls = response.tool_calls || [];
        } catch (emptyRetryErr) {
          logger.warn(`[AgentLoop] Retrying empty content without tools error: ${emptyRetryErr.message}`);
        }
      }

      logger.info(`[AgentLoop] Content: "${(response?.content || '').substring(0, 200)}"`);
      logger.info(`[AgentLoop] Tool calls: ${JSON.stringify(toolCalls.map(tc => tc.function?.name || 'unknown'))}`);

      // If model made tool calls → execute them and loop again
      if (toolCalls.length > 0) {
        // Push assistant message WITH tool_calls for Ollama's chat template
        messages.push({
          role: 'assistant',
          content: response?.content || '',
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
      finalContent = response?.content || '';
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
      .replace(/^.*(?:tôi hiểu rồi|khi khách hàng muốn đặt|tôi sẽ thực hiện như sau).*$/gim, '')
      .replace(/\[CHỈ DẪN HỆ THỐNG\][\s\S]*?(?=\n\n|$)/gi, '')
      .replace(/TUYỆT ĐỐI KHÔNG GỌI TOOL[^\n]*/gi, '')
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
      const needsToAskTier = hasMultiplePriceTiers && !hasSpecificPlacement && !hasSpecificTier && !wantsCheapestAll && !matchedTierInMsg;
      if (isBookingFlowActive && !needsToAskTier && !isChangeTierInquiry) {
        const effAutoQty = effQty;
        const hasMultipleDetected = effDetectedTickets.length > 1;
        const ticketsArg = hasMultipleDetected ? effDetectedTickets.map(dt => ({
          ticketTypeId: dt.ticket.id,
          ticketTypeName: dt.ticket.name,
          quantity: dt.quantity
        })) : undefined;
        const targetTier = !hasMultipleDetected ? effTargetTier : null;

        logger.info(`[AgentLoop] Auto-triggering proposeSmartBooking because user requested autonomous booking but model skipped tool call.`);
        await this.executeTool(userId, 'proposeSmartBooking', {
          eventId: activeEvent.slug,
          sessionId: (sessionList?.[0]?.id || eventDetail?.sessions?.[0]?.id || activeEvent.sessions?.[0]?.id || ''),
          quantity: effAutoQty,
          preferredRow: requestedRow || (isCenterInMsg ? 'trung tâm' : ''),
          ticketTypeId: targetTier?.id || null,
          ticketTypeName: targetTier?.name || '',
          tickets: ticketsArg
        }, toolExecutionContext);
      }

      let shouldAutoPrefill = false;
      let autoPrefillQty = 1;

      // Only auto-prefill manual seat map action if this is NOT an autonomous booking flow and NOT in the middle of asking about tiers!
      if (!toolExecutionContext.lastGeneratedActionTag && !isBookingFlowActive && !needsToAskTier) {
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
        if (toolExecutionContext.lastGeneratedActionTag.includes('BOOKING_PROPOSAL')) {
          finalContent += '\n\nEve đã tạo đề xuất đặt vé cho bạn rồi nè! Bạn kiểm tra thông tin trên thẻ bên dưới và nhấn "Xác nhận & Đi tới Thanh toán" nhé! 🎉';
        } else if (hasSeatMap) {
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
  } catch (fatalErr) {
    logger.error(`[AiAssistant] Unhandled error in chat(): ${fatalErr.message}\n${fatalErr.stack}`);
    return {
      role: 'assistant',
      content: 'Dạ Eve vừa gặp một chút gián đoạn kỹ thuật khi xử lý yêu cầu. Bạn hãy nhắn lại hoặc tải lại trang web (F5) để Eve phục vụ bạn tốt nhất nhé! 🥰'
    };
  }
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
      if (normPub.length >= 4 && normContent.includes(normPub)) return true;
      const keyTokens = normPub.split(/\s+/).filter(w => ['porsche', 'lemlab', 'idecaf', 'soobin'].includes(w));
      return keyTokens.some(k => normContent.includes(k));
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

const serviceInstance = new AiAssistantService();
serviceInstance.findMatchingPublishedEvent = findMatchingPublishedEvent;
serviceInstance.parseTicketsFromText = parseTicketsFromText;
serviceInstance.extractAttendeesFromText = extractAttendeesFromText;
serviceInstance.extractPhoneNumber = extractPhoneNumber;
serviceInstance.getPublishedEventsCache = getPublishedEventsCache;
serviceInstance.normalizeText = normalizeText;
serviceInstance.parseQuantityFromText = parseQuantityFromText;
serviceInstance.findLastBookingProposal = findLastBookingProposal;
serviceInstance.detectEventChangeIntent = detectEventChangeIntent;
serviceInstance.findMatchingSession = findMatchingSession;

module.exports = serviceInstance;
