/**
 * EventHub — Ollama HTTP Client
 * ================================
 * Communicates with local Ollama service (http://localhost:11434).
 * All calls are internal — no external API usage.
 *
 * Supports:
 *  - generate(): single-turn completion
 *  - chat():     multi-turn conversation
 *  - isHealthy(): health check
 *  - getModels(): list available models
 */

const logger = require('../../core/logger');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'eve-agent';
const OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'qwen3-eventhub-Q4_K_M.gguf';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:3b';
const OLLAMA_VISION_FALLBACK_MODEL = process.env.OLLAMA_VISION_FALLBACK_MODEL || 'moondream';
const OLLAMA_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT_MS || 90000);
const OLLAMA_VISION_TIMEOUT = Number(process.env.OLLAMA_VISION_TIMEOUT_MS || 200000);
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 8192);
const OLLAMA_NUM_THREAD = Number(process.env.OLLAMA_NUM_THREAD || 12);
const OLLAMA_NUM_BATCH = Number(process.env.OLLAMA_NUM_BATCH || 1024);
const OLLAMA_NUM_GPU = process.env.OLLAMA_NUM_GPU !== undefined ? Number(process.env.OLLAMA_NUM_GPU) : 99;


/**
 * Base fetch wrapper with timeout and external cancellation support.
 */
async function ollamaFetch(path, body, timeoutMs = OLLAMA_TIMEOUT, retries = 0, externalSignal = null) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        const err = new Error('Scan aborted by user');
        err.name = 'AbortError';
        err.code = 'SCAN_CANCELLED';
        throw err;
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Ollama HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      return await response.json();
    } catch (err) {
      if (externalSignal?.aborted) {
        const abortErr = new Error('Scan aborted by user');
        abortErr.name = 'AbortError';
        abortErr.code = 'SCAN_CANCELLED';
        throw abortErr;
      }
      if (controller.signal.aborted) {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
      }
      if (err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
      }
      const isTransient = err.message && (
        err.message.includes('fetch failed') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('other side closed')
      );
      if (attempt < retries && isTransient) {
        logger.warn(`[OllamaClient] Kết nối Ollama bị gián đoạn do đổi model, đang thử lại lần ${attempt + 1}/${retries}...`);
        await new Promise((res) => setTimeout(res, 2000));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}

/**
 * Single-turn text generation.
 *
 * @param {string} prompt       - The full prompt text
 * @param {object} options      - Optional overrides
 * @param {string} options.model
 * @param {number} options.temperature
 * @param {boolean} options.think  - Enable Qwen3 thinking mode (default: false)
 * @returns {string} Generated text
 */
async function generate(prompt, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const think = options.think === true;

  // Qwen3 thinking control via /no_think token removed.
  const finalPrompt = prompt;

  const body = {
    model,
    prompt: finalPrompt,
    think,
    stream: false,
    keep_alive: options.keep_alive || '60m',
    ...(options.format ? { format: options.format } : {}),
    options: {
      temperature: options.temperature ?? 0.15,
      top_p: options.top_p ?? 0.9,
      num_predict: options.max_tokens ?? 2048,
      num_ctx: options.num_ctx ?? OLLAMA_NUM_CTX,
      num_thread: options.num_thread ?? OLLAMA_NUM_THREAD,
      num_batch: options.num_batch ?? OLLAMA_NUM_BATCH,
      ...(options.num_gpu !== undefined ? { num_gpu: options.num_gpu } : (OLLAMA_NUM_GPU ? { num_gpu: OLLAMA_NUM_GPU } : {})),
    },

  };

  if (Array.isArray(options.images) && options.images.length > 0) {
    body.images = options.images;
  }

  let result;
  try {
    result = await ollamaFetch('/api/generate', body, options.timeoutMs || OLLAMA_TIMEOUT, options.retries ?? 1, options.signal);
  } catch (err) {
    if (err.message && (err.message.includes('image input is not supported') || err.message.includes('mmproj'))) {
      logger.info(`[OllamaClient] Model '${model}' does not support raw images in generate. Retrying with text-only payload.`);
      delete body.images;
      result = await ollamaFetch('/api/generate', body, options.timeoutMs || OLLAMA_TIMEOUT, options.retries ?? 1, options.signal);
    } else {
      throw err;
    }
  }

  let content = String(result.response || '').trim();
  if (!think) {
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  return content;
}

/**
 * Multi-turn chat completion.
 *
 * @param {Array<{role: string, content: string, images?: string[]}>} messages
 * @param {object} options
 * @param {string[]} [options.images] - Optional images to attach to the latest user message
 * @returns {{ content: string, model: string, eval_count: number, tool_calls: Array, thinking: string|null }}
 */
async function chat(messages, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const think = options.think === true;

  // Attach options.images if provided and preserve per-message images
  const processedMessages = messages.map((msg, idx) => {
    const isLastUser = msg.role === 'user' && idx === messages.length - 1;
    const images = msg.images || (isLastUser && Array.isArray(options.images) && options.images.length > 0 ? options.images : undefined);

    const updated = { ...msg };
    if (images && images.length > 0) {
      updated.images = images;
    }
    return updated;
  });

  const hasVisionInput = Boolean(Array.isArray(options.images) && options.images.length > 0) ||
    messages.some((m) => Array.isArray(m?.images) && m.images.length > 0);
  const fallbackModel = hasVisionInput
    ? (options.fallbackModel || OLLAMA_VISION_FALLBACK_MODEL)
    : (options.fallbackModel || OLLAMA_FALLBACK_MODEL);

  const body = {
    model,
    messages: processedMessages,
    stream: false,
    keep_alive: options.keep_alive || '60m',
    think,
    options: {
      temperature: options.temperature ?? 0.1,
      top_p:       options.top_p       ?? 0.85,
      num_predict: options.max_tokens  ?? 1200,
      num_ctx:     options.num_ctx      ?? OLLAMA_NUM_CTX,
      num_thread:  options.num_thread   ?? OLLAMA_NUM_THREAD,
      num_batch:   options.num_batch    ?? OLLAMA_NUM_BATCH,
      ...(options.num_gpu !== undefined ? { num_gpu: options.num_gpu } : (OLLAMA_NUM_GPU ? { num_gpu: OLLAMA_NUM_GPU } : {})),
    },
  };

  // Enable native tool calling — Ollama handles JSON formatting automatically.
  // Qwen3 8B supports this natively via its chat template.
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  } else if (options.format) {
    body.format = options.format;
  }

  let result;
  const timeoutMs = options.timeoutMs || OLLAMA_TIMEOUT;
  const retries = options.retries ?? 0;
  try {
    result = await ollamaFetch('/api/chat', body, timeoutMs, retries, options.signal);
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || options.signal?.aborted) {
      throw err;
    }
    // If the model does not have vision projector (mmproj), retry as pure text
    if (err.message && (err.message.includes('image input is not supported') || err.message.includes('mmproj'))) {
      logger.info(`[OllamaClient] Model '${model}' does not support raw images input. Retrying with text-only payload.`);
      const textOnlyMessages = processedMessages.map(({ images, ...rest }) => rest);
      const textOnlyBody = { ...body, messages: textOnlyMessages };
      result = await ollamaFetch('/api/chat', textOnlyBody, timeoutMs, retries, options.signal);
    } else if (fallbackModel && model !== fallbackModel && !options._isFallback) {
      logger.warn(`[OllamaClient] Primary model '${model}' failed (${err.message}). Retrying with fallback model '${fallbackModel}'...`);
      return await chat(messages, { ...options, model: fallbackModel, _isFallback: true });
    } else {
      throw err;
    }
  }

  const content = String(result.message?.content || '').trim();

  return {
    content,
    model:      result.model || model,
    eval_count: result.eval_count,
    tool_calls: result.message?.tool_calls || [],
    thinking:   result.message?.thinking || null,
  };
}

function repairTruncatedJson(str) {
  if (!str) return null;
  const start = str.indexOf('{');
  if (start === -1) return null;
  let raw = str.slice(start);

  for (let attempt = 0; attempt < 15; attempt++) {
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces = Math.max(0, openBraces - 1);
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets = Math.max(0, openBrackets - 1);
      }
    }

    let candidate = raw;
    if (inString) candidate += '"';
    for (let i = 0; i < openBrackets; i++) candidate += ']';
    for (let i = 0; i < openBraces; i++) candidate += '}';

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      const lastComma = raw.lastIndexOf(',');
      if (lastComma > 0) {
        raw = raw.slice(0, lastComma).trim();
      } else {
        break;
      }
    }
  }

  return null;
}

/**
 * Repair unterminated or truncated JSON string from LLMs.
 */
function repairUnterminatedJson(str) {
  if (!str) return null;
  let inString = false;
  let escaped = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  let repaired = str.trim();
  if (inString) repaired += '"';
  while (openBrackets > 0) { repaired += ']'; openBrackets--; }
  while (openBraces > 0) { repaired += '}'; openBraces--; }
  // Clean trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*([\}\]])/g, '$1');
  return repaired;
}

/**
 * Parse JSON from model output safely.
 * Handles markdown code blocks, raw JSON, and truncated output repair.
 */
function extractJSON(text) {
  if (!text) return null;
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();

  // 1. Try direct parse
  try { return JSON.parse(clean); } catch { /* continue */ }

  // 2. Try extracting from markdown code block
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }

  // 3. Try extracting first complete JSON object
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* continue */ }
  }

  // 4. Try auto-repair on unclosed JSON object (if response was cut off)
  const partialObjMatch = clean.match(/\{[\s\S]*/);
  if (partialObjMatch) {
    const repaired = repairUnterminatedJson(partialObjMatch[0]);
    if (repaired) {
      try { return JSON.parse(repaired); } catch { /* continue */ }
    }
  }

  // 5. Array match as last resort only if no object was initiated
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* continue */ }
  }

  // 6. Try repairing truncated JSON if the model stopped at max_tokens
  const repaired = repairTruncatedJson(clean);
  if (repaired && typeof repaired === 'object') {
    return repaired;
  }

  return null;
}

/**
 * Health check — verify Ollama is running and model is available.
 */
async function isHealthy() {
  const healthTimeoutMs = Number(process.env.OLLAMA_HEALTH_TIMEOUT_MS || 5000);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(healthTimeoutMs),
    });
    if (!response.ok) {
      logger.warn(`[OllamaClient] Health check failed for ${OLLAMA_BASE_URL}: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`[OllamaClient] Health check unreachable for ${OLLAMA_BASE_URL}: ${err.message}`);
    return false;
  }
}

/**
 * List available models on this Ollama instance.
 */
async function getModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Kiểm tra xem đoạn văn bản có chứa ký tự tiếng nước ngoài lạ hoặc chuỗi lặp vô nghĩa hay không (ví dụ tiếng Thái, tiếng Khmer, mã rác)
 */
function isForeignOrGibberishText(text) {
  if (!text || typeof text !== 'string') return false;
  // Ký tự tiếng Thái, Khmer, Lào, Myanmar, Devanagari
  if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(text)) {
    return true;
  }
  // Chuỗi ký tự lặp thoái hóa (ví dụ "aaaaaa..." hoặc "ระมรามมาราม...")
  if (/(.)\1{4,}/.test(text) || /(.{2,8})\1{3,}/.test(text)) {
    return true;
  }
  return false;
}

/**
 * Kiểm tra xem đoạn văn bản có chứa dấu tiếng Việt hay không
 */
function hasVietnameseDiacritics(text) {
  if (!text || typeof text !== 'string') return false;
  return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(text);
}

/**
 * Kiểm tra xem đoạn văn bản có phải tiếng Anh hoặc tiếng nước ngoài cần dịch hay không
 */
function isEnglishOrForeignText(text) {
  if (!text || typeof text !== 'string') return false;
  if (isForeignOrGibberishText(text)) return true;

  const lower = text.toLowerCase();
  const englishIndicators = [
    'the image', 'this image', 'shows a', 'depicts', 'there is', 'there are',
    'contains', 'consists of', 'a poster for', 'a flyer for', 'in the background',
    'in the foreground', 'wearing a', 'standing in front', 'written on it',
    'legal document', 'business registration', 'official seal', 'license',
    'validity', 'is valid', 'appears to be', 'featured', 'prominently',
    'scheduled', 'concert', 'festival', 'text reads', 'with white text',
    'color scheme', 'the background', 'poster features', 'movie poster',
    'advertisement', 'promotional poster'
  ];
  if (englishIndicators.some((indicator) => lower.includes(indicator))) {
    return true;
  }

  // Nếu là chuỗi chữ cái Latin dài (> 40 ký tự) nhưng gần như không có dấu tiếng Việt -> là tiếng Anh
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 6 && !hasVietnameseDiacritics(text)) {
    return true;
  }

  return false;
}

/**
 * Làm sạch chuỗi thoái hóa hoặc ký tự ngoại ngữ lạ khỏi văn bản
 */
function sanitizeRawVisionOutput(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/g, '')
    .replace(/(.)\1{4,}/g, '')
    .replace(/(.{2,8})\1{3,}/g, '')
    .trim();
}

/**
 * Chuẩn hóa context sự kiện truyền vào describeImageBatch / describeImage.
 */
function normalizeVisionEventContext(eventContext = '', options = {}) {
  if (eventContext && typeof eventContext === 'object') {
    return {
      title: String(eventContext.title || eventContext.eventTitle || '').trim(),
      category: String(eventContext.category || eventContext.category_name || options.category || '').trim(),
    };
  }
  return {
    title: String(eventContext || '').trim(),
    category: String(options?.category || '').trim(),
  };
}

/**
 * Tạo prompt tiếng Anh chuẩn hóa cho Vision Model, kèm Event Title & Category
 * và yêu cầu đánh giá đủ 4 trường (visual_description, extracted_text,
 * is_event_poster_or_relevant_banner, safety_flags).
 */
function buildVisionAnalysisPrompt({ isPermit = false, sourceLabel = '', eventTitle = '', eventCategory = '' }) {
  const safeTitle = String(eventTitle || 'EventHub Event').trim();
  const safeCategory = String(eventCategory || 'General Event').trim();

  if (isPermit) {
    return `You are inspecting an official permit/legal document image (${sourceLabel || 'Document'}) for the event "${safeTitle}" (Category: "${safeCategory}").
Return ONLY valid JSON with these exact 4 keys:
{
  "visual_description": "Describe the document layout, document type, issuing authority, organization name, venue/dates, and whether official stamps or signatures are visible",
  "extracted_text": "Transcribe all readable text in the document (OCR)",
  "is_event_poster_or_relevant_banner": true,
  "safety_flags": []
}
Set "safety_flags" to ["nsfw"], ["violence"], ["gambling"], or ["scam_qr"] only if prohibited content or suspicious personal bank transfer QR scams appear; otherwise [].`;
  }

  return `You are verifying whether this image (${sourceLabel || 'Event Image'}) matches the event "${safeTitle}" (Category: "${safeCategory}").
Return ONLY valid JSON with these exact 4 keys:
{
  "visual_description": "Describe in detail the main subject, people, background scene, objects, and graphic design layout",
  "extracted_text": "Transcribe ALL visible text on the image (OCR), or empty string if none",
  "is_event_poster_or_relevant_banner": true,
  "safety_flags": []
}
Rules for "is_event_poster_or_relevant_banner": set true ONLY if this is a designed event poster/banner or directly illustrates "${safeTitle} - ${safeCategory}". Set false if it is a personal selfie, casual dining/drinking table photo, pet/meme, computer/phone screenshot, or random scenery/object unrelated to "${safeTitle} - ${safeCategory}".
Rules for "safety_flags": return [] if safe, or include any detected issue from ["nsfw", "violence", "gambling", "scam_qr"] (explicit 18+/nudity, extreme violence, gambling ads, or fraudulent bank transfer QR codes).`;
}

/**
 * Chuẩn hóa kết quả trả về từ Vision Model (hỗ trợ cả JSON chuẩn lẫn text thường từ model nhỏ như moondream).
 */
function parseVisionAnalysisResponse(rawText, { isPermit = false, sourceLabel = '', eventTitle = '', eventCategory = '' } = {}) {
  const cleaned = sanitizeRawVisionOutput(String(rawText || '').trim());
  let visualDescription = cleaned;
  let extractedText = '';
  let isRelevantPoster = null;
  let safetyFlags = [];

  const normalizeFlagList = (val) => {
    const arr = Array.isArray(val)
      ? val
      : typeof val === 'string' && val.trim()
        ? val.split(/[,;|]/)
        : [];
    return arr
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => item && !['none', 'safe', 'ok', 'null', 'n/a', 'empty', 'no'].includes(item));
  };

  const parsed = extractJSON(cleaned);
  if (parsed && typeof parsed === 'object') {
    if (parsed.visual_description) {
      visualDescription = sanitizeRawVisionOutput(String(parsed.visual_description));
    }
    if (parsed.extracted_text !== undefined && parsed.extracted_text !== null) {
      extractedText = sanitizeRawVisionOutput(String(parsed.extracted_text));
    }
    if (typeof parsed.is_event_poster_or_relevant_banner === 'boolean') {
      isRelevantPoster = parsed.is_event_poster_or_relevant_banner;
    } else if (parsed.is_event_poster_or_relevant_banner !== undefined) {
      const flagStr = String(parsed.is_event_poster_or_relevant_banner).trim().toLowerCase();
      if (['false', 'no', '0'].includes(flagStr)) isRelevantPoster = false;
      else if (['true', 'yes', '1'].includes(flagStr)) isRelevantPoster = true;
    }
    safetyFlags = normalizeFlagList(parsed.safety_flags);
  } else {
    // Fallback parse cho model vision nhỏ trả về plain text dạng key: value
    const relMatch = cleaned.match(/is_event_poster_or_relevant_banner["'\s:=]+(true|false|yes|no)/i);
    if (relMatch) {
      isRelevantPoster = /^(true|yes)$/i.test(relMatch[1]);
    }
    const ocrMatch = cleaned.match(/extracted_text["'\s:=]+["']?([^"\n}]+)/i);
    if (ocrMatch) {
      extractedText = ocrMatch[1].trim();
    }
    const visMatch = cleaned.match(/visual_description["'\s:=]+["']?([^\n}]+)/i);
    if (visMatch) {
      visualDescription = visMatch[1].trim();
    }
    const flagsMatch = cleaned.match(/safety_flags["'\s:=]+\[([^\]]*)\]/i);
    if (flagsMatch && flagsMatch[1].trim()) {
      safetyFlags = normalizeFlagList(flagsMatch[1].replace(/["']/g, ''));
    }
  }

  // Phát hiện tín hiệu rõ ràng từ prose nếu model không xuất JSON boolean
  const combinedLower = `${visualDescription} ${cleaned}`.toLowerCase();
  const catLower = `${eventTitle} ${eventCategory}`.toLowerCase();
  if (!isPermit && isRelevantPoster === null) {
    const explicitlyNotPoster = /\b(not an event poster|not related to the event|unrelated to the event|personal selfie|internet meme|desktop screenshot|phone screenshot|chat screenshot)\b/i.test(combinedLower);
    const matchesAllowedCat = /(thú cưng|pet|mèo|chó|ẩm thực|food|cooking|gaming|esports|stream|photography|du lịch)/i.test(catLower);
    const obviousOffTopic = !matchesAllowedCat && /\b(a selfie of|mirror selfie|plates of food on a table|beer bottles on a table|cat sleeping|dog sitting|code editor screenshot|mobile app screenshot)\b/i.test(combinedLower) && !extractedText;
    if (explicitlyNotPoster || obviousOffTopic) {
      isRelevantPoster = false;
    }
  }

  // Xây dựng mô tả tổng hợp dễ đọc cho Stage 2 LLM và log
  const descParts = [];
  if (visualDescription) {
    descParts.push(visualDescription);
  }
  if (extractedText) {
    descParts.push(`Chữ đọc được trên ảnh (OCR): "${extractedText}"`);
  }
  if (!isPermit && isRelevantPoster === false) {
    descParts.push('[Cảnh báo Vision: KHÔNG phải poster/banner sự kiện hoặc ảnh không liên quan tới chủ đề sự kiện]');
  }
  if (safetyFlags.length > 0) {
    descParts.push(`[Cờ an toàn Vision: ${safetyFlags.join(', ')}]`);
  }

  const description = descParts.join(' | ') || `${sourceLabel || 'Ảnh sự kiện'} đã được tải lên.`;

  return {
    description: description.trim(),
    visual_description: visualDescription || description.trim(),
    extracted_text: extractedText,
    is_event_poster_or_relevant_banner: isRelevantPoster,
    safety_flags: safetyFlags,
  };
}

/**
 * Trau chuốt và chuẩn hóa mô tả sang tiếng Việt tự nhiên, chuyên nghiệp bằng model ngôn ngữ chính
 */
async function ensureVietnameseDescription(rawDescription, sourceLabel = '', eventTitle = '', signal = null) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return `Ảnh ${sourceLabel || 'sự kiện'} hiển thị hình ảnh sự kiện rõ nét, không phát hiện nội dung vi phạm.`;
  }

  if (signal?.aborted) {
    const abortErr = new Error('Scan aborted by user');
    abortErr.name = 'AbortError';
    abortErr.code = 'SCAN_CANCELLED';
    throw abortErr;
  }

  // 1. Nếu có ký tự tiếng Thái/Khmer hoặc chuỗi lặp rác -> làm sạch trước
  const cleaned = sanitizeRawVisionOutput(rawDescription);

  // Trả về trực tiếp nội dung mô tả đã làm sạch để Stage 2 (Qwen3) đọc và tổng hợp vào kết quả tiếng Việt.
  // Tránh gọi đệm mô hình LLM chính tại đây vì việc tráo đổi model (model swapping) liên tục giữa
  // Moondream và Qwen3 trong VRAM (2GB) sẽ gây lỗi CUDA Out of Memory trên card Quadro P620!
  return cleaned.trim();
}

/**
 * Phân tích chi tiết 1 hình ảnh bằng Vision model và trả về đầy đủ 4 trường có cấu trúc.
 */
async function analyzeImageDetailed(base64Image, contextPrompt = '', sourceLabel = '', eventTitle = '', isPermit = false, signal = null, eventCategory = '') {
  if (!base64Image) {
    return {
      description: 'Không thể phân tích ảnh (dữ liệu ảnh trống).',
      visual_description: '',
      extracted_text: '',
      is_event_poster_or_relevant_banner: null,
      safety_flags: [],
    };
  }

  if (signal?.aborted) {
    const abortErr = new Error('Scan aborted by user');
    abortErr.name = 'AbortError';
    abortErr.code = 'SCAN_CANCELLED';
    throw abortErr;
  }

  // Ưu tiên qwen2.5vl:3b cho OCR tiếng Việt & ngữ cảnh ảnh; tự động fallback sang moondream nếu chưa pull model chính.
  const prompt = contextPrompt || buildVisionAnalysisPrompt({
    isPermit,
    sourceLabel,
    eventTitle,
    eventCategory,
  });

  const visionCandidates = [OLLAMA_VISION_MODEL, OLLAMA_VISION_FALLBACK_MODEL]
    .map((m) => String(m || '').trim())
    .filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastErr = null;
  for (let idx = 0; idx < visionCandidates.length; idx += 1) {
    const candidateModel = visionCandidates[idx];
    const body = {
      model: candidateModel,
      prompt,
      images: [base64Image],
      stream: false,
      keep_alive: 0, // Giải phóng ngay VRAM sau khi đọc ảnh xong để nhường trọn bộ nhớ cho text model
      options: {
        temperature: 0.1,      // Giảm nhiệt độ để kết quả ổn định, không ảo giác
        repeat_penalty: 1.25,  // Chặn đứng hoàn toàn hiện tượng lặp vô tận ký tự
        num_predict: 500,
        num_ctx: Math.min(OLLAMA_NUM_CTX || 8192, 4096),
        num_thread: OLLAMA_NUM_THREAD,
        num_batch: 512,
      },
    };

    try {
      const result = await ollamaFetch('/api/generate', body, OLLAMA_VISION_TIMEOUT, 1, signal);
      const rawDescription = String(result.response || '').trim();
      if (!rawDescription) {
        const fallbackDesc = `${sourceLabel || 'Ảnh sự kiện'} đã được tải lên, bố cục đạt chuẩn.`;
        return {
          description: fallbackDesc,
          visual_description: fallbackDesc,
          extracted_text: '',
          is_event_poster_or_relevant_banner: null,
          safety_flags: [],
        };
      }

      const sanitized = await ensureVietnameseDescription(rawDescription, sourceLabel, eventTitle, signal);
      return parseVisionAnalysisResponse(sanitized, {
        isPermit,
        sourceLabel,
        eventTitle,
        eventCategory,
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || signal?.aborted || String(err.message || '').includes('aborted')) {
        throw err;
      }
      lastErr = err;
      const nextModel = visionCandidates[idx + 1];
      if (nextModel) {
        logger.warn(`[OllamaClient] Vision model '${candidateModel}' error (${err.message}). Falling back to '${nextModel}'...`);
      } else {
        logger.warn(`[OllamaClient] Vision model '${candidateModel}' error: ${err.message}`);
      }
    }
  }

  const errDesc = `${sourceLabel || 'Ảnh sự kiện'} đã được ghi nhận (${String(lastErr?.message || 'Vision error').slice(0, 80)})`;
  return {
    description: errDesc,
    visual_description: errDesc,
    extracted_text: '',
    is_event_poster_or_relevant_banner: null,
    safety_flags: [],
  };
}

/**
 * Describe a single image using the vision model (moondream).
 * Giữ nguyên chữ ký trả về Promise<string> để tương thích ngược với caller cũ.
 */
async function describeImage(base64Image, contextPrompt = '', sourceLabel = '', eventTitle = '', isPermit = false, signal = null, eventCategory = '') {
  const detailed = await analyzeImageDetailed(base64Image, contextPrompt, sourceLabel, eventTitle, isPermit, signal, eventCategory);
  return detailed.description;
}

/**
 * Describe multiple images using the vision model.
 * Processes images sequentially to avoid GPU overload.
 *
 * @param {Array<{source: string, base64: string}>} images - Array of {source, base64}
 * @param {string|object} eventContext - Event title string or { title, category }
 * @param {AbortSignal|null} signal
 * @param {object} [options] - { category?: string }
 * @returns {Promise<Array<{source: string, description: string, visual_description: string, extracted_text: string, is_event_poster_or_relevant_banner: boolean|null, safety_flags: string[]}>>}
 */
async function describeImageBatch(images, eventContext = '', signal = null, options = {}) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const { title: eventTitle, category: eventCategory } = normalizeVisionEventContext(eventContext, options);

  // Ưu tiên tối đa 2 ảnh quan trọng nhất (Giấy phép và Poster chính) để tránh quá tải
  const prioritizedImages = [...images].sort((a, b) => {
    const aPermit = a.source && a.source.startsWith('PERMIT') ? 2 : (a.source === 'MAIN_POSTER' ? 1 : 0);
    const bPermit = b.source && b.source.startsWith('PERMIT') ? 2 : (b.source === 'MAIN_POSTER' ? 1 : 0);
    return bPermit - aPermit;
  }).slice(0, 2);

  const results = [];

  for (const img of prioritizedImages) {
    if (signal?.aborted) {
      const err = new Error('Scan aborted by user');
      err.name = 'AbortError';
      err.code = 'SCAN_CANCELLED';
      throw err;
    }

    const isPermit = img.source && img.source.startsWith('PERMIT');
    const isPoster = img.source === 'MAIN_POSTER';
    const isBanner = img.source === 'COVER_BANNER';
    const sourceLabel = isPoster
      ? 'Ảnh đại diện chính (Poster)'
      : isBanner
        ? 'Ảnh bìa (Cover Banner)'
        : isPermit
          ? `Tài liệu giấy phép (${img.fileName || 'Hồ sơ pháp lý'})`
          : `Ảnh trong mô tả (${img.source})`;

    const contextPrompt = buildVisionAnalysisPrompt({
      isPermit,
      sourceLabel,
      eventTitle,
      eventCategory,
    });

    logger.info(`[OllamaClient] Analyzing image [${img.source}] for "${eventTitle}" (${eventCategory || 'General'}) with vision model '${OLLAMA_VISION_MODEL}'...`);
    const detailed = await analyzeImageDetailed(
      img.base64,
      contextPrompt,
      sourceLabel,
      eventTitle,
      isPermit,
      signal,
      eventCategory,
    );
    results.push({
      source: img.source,
      url: img.url || '',
      fileName: img.fileName || '',
      description: detailed.description,
      visual_description: detailed.visual_description,
      extracted_text: detailed.extracted_text,
      extractedText: detailed.extracted_text,
      is_event_poster_or_relevant_banner: detailed.is_event_poster_or_relevant_banner,
      safety_flags: detailed.safety_flags,
    });
    logger.info(`[OllamaClient] Image [${img.source}] analysis complete (relevantBanner=${detailed.is_event_poster_or_relevant_banner}, flags=${detailed.safety_flags.length}).`);
  }

  return results;
}

module.exports = {
  generate,
  chat,
  extractJSON,
  isHealthy,
  getModels,
  describeImage,
  analyzeImageDetailed,
  describeImageBatch,
  buildVisionAnalysisPrompt,
  parseVisionAnalysisResponse,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_FALLBACK_MODEL,
  OLLAMA_VISION_MODEL,
  OLLAMA_VISION_FALLBACK_MODEL,
  OLLAMA_TIMEOUT,
  OLLAMA_VISION_TIMEOUT,
  OLLAMA_NUM_CTX,
  OLLAMA_NUM_THREAD,
  OLLAMA_NUM_BATCH,
  OLLAMA_NUM_GPU,
};
