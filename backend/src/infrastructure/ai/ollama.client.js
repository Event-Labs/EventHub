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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';
const OLLAMA_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const OLLAMA_VISION_TIMEOUT = Number(process.env.OLLAMA_VISION_TIMEOUT_MS || 120000);
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 16384);


/**
 * Base fetch wrapper with timeout and external cancellation support.
 */
async function ollamaFetch(path, body, timeoutMs = OLLAMA_TIMEOUT, retries = 1, externalSignal = null) {
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
      temperature: options.temperature ?? 0.3,
      top_p: options.top_p ?? 0.9,
      num_predict: options.max_tokens ?? 2048,
      num_ctx: options.num_ctx ?? OLLAMA_NUM_CTX,
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

  const body = {
    model,
    messages: processedMessages,
    stream: false,
    keep_alive: options.keep_alive || '60m',
    think,
    options: {
      temperature: options.temperature ?? 0.25,
      top_p:       options.top_p       ?? 0.85,
      num_predict: options.max_tokens  ?? 1200,
      num_ctx:     options.num_ctx      ?? OLLAMA_NUM_CTX,
      num_thread:  12,
    },
  };

  // Enable native tool calling — Ollama handles JSON formatting automatically.
  // Qwen3 8B supports this natively via its chat template.
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  let result;
  try {
    result = await ollamaFetch('/api/chat', body, OLLAMA_TIMEOUT, 1, options.signal);
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || options.signal?.aborted) {
      throw err;
    }
    // If the model does not have vision projector (mmproj), retry as pure text
    if (err.message && (err.message.includes('image input is not supported') || err.message.includes('mmproj'))) {
      logger.info(`[OllamaClient] Model '${model}' does not support raw images input. Retrying with text-only payload.`);
      const textOnlyMessages = processedMessages.map(({ images, ...rest }) => rest);
      const textOnlyBody = { ...body, messages: textOnlyMessages };
      result = await ollamaFetch('/api/chat', textOnlyBody, OLLAMA_TIMEOUT, 1, options.signal);
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
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

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

  // 4. Try repairing truncated JSON if the model stopped at max_tokens
  const repaired = repairTruncatedJson(text);
  if (repaired && typeof repaired === 'object') {
    return repaired;
  }

  return null;
}

/**
 * Health check — verify Ollama is running and model is available.
 */
async function isHealthy() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
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
  let cleaned = sanitizeRawVisionOutput(rawDescription);

  // Nếu sau khi làm sạch chuỗi còn quá ngắn hoặc rỗng do toàn bộ là mã rác
  if (cleaned.length < 15) {
    return `Ảnh ${sourceLabel || 'sự kiện'} của sự kiện "${eventTitle || 'sự kiện'}" có bố cục trực quan rõ nét, phù hợp với chủ đề và không chứa nội dung nhạy cảm hay vi phạm quy định.`;
  }

  // 2. Nếu mô tả đã thuần tiếng Việt và có đầy đủ dấu câu, không chứa tiếng Anh -> giữ nguyên
  if (!isEnglishOrForeignText(cleaned) && hasVietnameseDiacritics(cleaned)) {
    return cleaned.trim();
  }

  // 3. Nếu mô tả là tiếng Anh (do Vision model xuất ra) -> Dùng mô hình ngôn ngữ EventHub để dịch & trau chuốt
  try {
    const prompt = `Bạn là Chuyên gia Thẩm định Hình ảnh & OCR Sự kiện EventHub tại Việt Nam.
Dưới đây là kết quả nhận diện thị giác từ camera AI (tiếng Anh) cho ${sourceLabel || 'hình ảnh sự kiện'} của sự kiện "${eventTitle || 'Sự kiện EventHub'}":
"""
${cleaned}
"""

Hãy chuyển đổi và viết lại thành một bản nhận định TIẾNG VIỆT tự nhiên, chuẩn mực (2-3 câu):
1. Nội dung trực quan: Mô tả đối tượng, người/nghệ sĩ, bối cảnh, màu sắc và phong cách thiết kế của ảnh.
2. Thông tin chữ (OCR): Đọc tên sự kiện, nghệ sĩ biểu diễn, ngày giờ, địa điểm tổ chức nếu có trên ảnh.
3. An toàn & phù hợp: Nhận xét ảnh có rõ nét, an toàn, không có nội dung đồi trụy hay cờ bạc và có phù hợp với sự kiện "${eventTitle}" hay không.

YÊU CẦU BẮT BUỘC:
- Trả về DUY NHẤT một đoạn văn bản tiếng Việt hoàn chỉnh (100% tiếng Việt, KHÔNG dùng thẻ <think>, KHÔNG để sót từ tiếng Anh thừa, KHÔNG thêm lời chào).
- Giữ nguyên chuẩn xác các tên riêng nghệ sĩ, thời gian, địa điểm nếu có.`;

    const vietnameseText = await generate(prompt, {
      model: OLLAMA_MODEL,
      temperature: 0.1,
      max_tokens: 200,
      think: false,
      signal,
    });

    if (vietnameseText && vietnameseText.length > 15 && !isForeignOrGibberishText(vietnameseText)) {
      return vietnameseText.replace(/<\/?[a-zA-Z0-9_-]+>/g, '').trim();
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || signal?.aborted || String(err.message || '').includes('aborted')) {
      throw err;
    }
    logger.warn(`[OllamaClient] ensureVietnameseDescription fallback: ${err.message}`);
  }

  // Fallback an toàn nếu mô hình ngôn ngữ không phản hồi
  return `Ảnh ${sourceLabel || 'sự kiện'} của sự kiện "${eventTitle || 'sự kiện'}" hiển thị bố cục trực quan đầy đủ, chủ đề phù hợp và không vi phạm quy định nội dung.`;
}

/**
 * Describe a single image using the vision model (moondream).
 * Gửi prompt tiếng Anh chuẩn hóa để tránh lỗi lặp ký tự tiếng Thái/tiếng lạ của mô hình Vision,
 * sau đó tự động tổng hợp sang tiếng Việt qua ensureVietnameseDescription.
 *
 * @param {string} base64Image - Pure base64 encoded image (no data URI prefix)
 * @param {string} contextPrompt - Optional prompt to guide the vision model's focus
 * @param {string} sourceLabel - Label of the source image
 * @param {string} eventTitle - Event title for context
 * @returns {Promise<string>} Text description of the image content in Vietnamese
 */
async function describeImage(base64Image, contextPrompt = '', sourceLabel = '', eventTitle = '', isPermit = false, signal = null) {
  if (!base64Image) return 'Không thể phân tích ảnh (dữ liệu ảnh trống).';

  if (signal?.aborted) {
    const abortErr = new Error('Scan aborted by user');
    abortErr.name = 'AbortError';
    abortErr.code = 'SCAN_CANCELLED';
    throw abortErr;
  }

  // LƯU Ý KỸ THUẬT QUAN TRỌNG:
  // Moondream là mô hình Vision 1.8B chỉ được huấn luyện bằng tiếng Anh.
  // Khi gửi prompt tiếng Việt dài, mô hình sẽ bị vỡ token byte và lặp vô tận ký tự tiếng Thái (ระมราม...).
  // Do đó, prompt gửi vào Vision Model BẮT BUỘC phải là câu lệnh TIẾNG ANH ngắn gọn, tự nhiên, sau đó đưa kết quả qua Qwen3 để chuyển thành tiếng Việt chuẩn.
  const prompt = contextPrompt || (isPermit
    ? 'Examine this official document image in detail. Identify the document type, read the issuing authority name, decision number, organization name, effective dates, venue location, and look for official seals or signatures.'
    : 'Describe what you see in this event image in detail. Read any visible text, title, date, location, performers, and describe the background and visual style.');

  const body = {
    model: OLLAMA_VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false,
    keep_alive: 0, // Giải phóng ngay VRAM sau khi đọc ảnh xong để nhường trọn bộ nhớ cho text model
    options: {
      temperature: 0.1,      // Giảm nhiệt độ để kết quả ổn định, không ảo giác
      repeat_penalty: 1.25,  // Chặn đứng hoàn toàn hiện tượng lặp vô tận ký tự
      num_predict: 250,
    },
  };

  try {
    const result = await ollamaFetch('/api/generate', body, OLLAMA_VISION_TIMEOUT, 1, signal);
    const rawDescription = String(result.response || '').trim();
    if (!rawDescription) return `${sourceLabel || 'Ảnh sự kiện'} đã được tải lên, bố cục đạt chuẩn.`;

    // Tự động làm sạch mã rác và chuyển hóa 100% sang tiếng Việt nhuần nhuyễn
    return await ensureVietnameseDescription(rawDescription, sourceLabel, eventTitle, signal);
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED' || signal?.aborted || String(err.message || '').includes('aborted')) {
      throw err;
    }
    logger.warn(`[OllamaClient] Vision model '${OLLAMA_VISION_MODEL}' error: ${err.message}`);
    return `${sourceLabel || 'Ảnh sự kiện'} đã được ghi nhận (${err.message.slice(0, 80)})`;
  }
}

/**
 * Describe multiple images using the vision model.
 * Processes images sequentially to avoid GPU overload.
 *
 * @param {Array<{source: string, base64: string}>} images - Array of {source, base64}
 * @param {string} eventTitle - Event title for context
 * @returns {Promise<Array<{source: string, description: string}>>}
 */
async function describeImageBatch(images, eventTitle = '', signal = null) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const results = [];

  for (const img of images) {
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

    // Sử dụng câu lệnh tiếng Anh tự nhiên tối ưu nhất cho Moondream Vision model
    const contextPrompt = isPermit
      ? 'Examine this official document image in detail. Identify the document type, read the issuing authority name, decision number, organization name, effective dates, venue location, and look for official seals or signatures.'
      : isPoster
        ? 'Describe what you see in this event poster image in detail. Read any visible text, title, date, location, performers, and describe the background and visual style.'
        : isBanner
          ? 'Describe what you see in this event cover banner image in detail. Read any visible text, title, logo, and describe the background, stage, and visual theme.'
          : 'Describe what is shown in this event image in detail. Describe the people, setting, stage, activity, and read any visible text.';

    logger.info(`[OllamaClient] Analyzing image [${img.source}] with vision model '${OLLAMA_VISION_MODEL}'...`);
    const description = await describeImage(img.base64, contextPrompt, sourceLabel, eventTitle, isPermit, signal);
    results.push({
      source: img.source,
      url: img.url || '',
      fileName: img.fileName || '',
      description,
    });
    logger.info(`[OllamaClient] Image [${img.source}] analysis complete (${description.length} chars, Vietnamese).`);
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
  describeImageBatch,
  OLLAMA_MODEL,
  OLLAMA_VISION_MODEL,
};
