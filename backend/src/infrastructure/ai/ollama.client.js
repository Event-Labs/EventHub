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

const OLLAMA_BASE_URL    = process.env.OLLAMA_BASE_URL    || 'http://localhost:11434';
const OLLAMA_MODEL       = process.env.OLLAMA_MODEL       || 'qwen3:4b';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';
const OLLAMA_TIMEOUT     = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const OLLAMA_VISION_TIMEOUT = Number(process.env.OLLAMA_VISION_TIMEOUT_MS || 120000);


/**
 * Base fetch wrapper with timeout.
 */
async function ollamaFetch(path, body, timeoutMs = OLLAMA_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    if (err.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
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

  // Qwen3 thinking control via /no_think token
  const finalPrompt = think ? prompt : `${prompt}\n/no_think`;

  const body = {
    model,
    prompt: finalPrompt,
    stream: false,
    keep_alive: options.keep_alive || '60m',
    ...(options.format ? { format: options.format } : {}),
    options: {
      temperature: options.temperature ?? 0.3,
      top_p:       options.top_p       ?? 0.9,
      num_predict: options.max_tokens  ?? 2048,
      num_ctx:     options.num_ctx      ?? 4096,
    },
  };

  if (Array.isArray(options.images) && options.images.length > 0) {
    body.images = options.images;
  }

  let result;
  try {
    result = await ollamaFetch('/api/generate', body);
  } catch (err) {
    if (err.message && (err.message.includes('image input is not supported') || err.message.includes('mmproj'))) {
      logger.info(`[OllamaClient] Model '${model}' does not support raw images in generate. Retrying with text-only payload.`);
      delete body.images;
      result = await ollamaFetch('/api/generate', body);
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
 * @returns {{ content: string, model: string }}
 */
async function chat(messages, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const think = options.think === true;

  // Add /no_think to last user message if thinking is disabled, and attach options.images if provided
  const processedMessages = messages.map((msg, idx) => {
    const isLastUser = msg.role === 'user' && idx === messages.length - 1;
    const content = !think && isLastUser ? `${msg.content}\n/no_think` : msg.content;
    const images = msg.images || (isLastUser && Array.isArray(options.images) && options.images.length > 0 ? options.images : undefined);

    const updated = { ...msg, content };
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
    options: {
      temperature: options.temperature ?? 0.2,
      top_p:       options.top_p       ?? 0.85,
      num_predict: options.max_tokens  ?? 1200,
      num_ctx:     options.num_ctx      ?? 4096,
    },
  };

  if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
    body.tools = options.tools;
  }

  let result;
  try {
    result = await ollamaFetch('/api/chat', body);
  } catch (err) {
    // If the model does not have vision projector (mmproj), retry as pure text
    if (err.message && (err.message.includes('image input is not supported') || err.message.includes('mmproj'))) {
      logger.info(`[OllamaClient] Model '${model}' does not support raw images input. Retrying with text-only payload.`);
      const textOnlyMessages = processedMessages.map(({ images, ...rest }) => rest);
      const textOnlyBody = { ...body, messages: textOnlyMessages };
      result = await ollamaFetch('/api/chat', textOnlyBody);
    } else {
      throw err;
    }
  }

  const content = String(result.message?.content || '').trim();

  // Strip <think>...</think> blocks if thinking leaked through
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return {
    content:    cleaned,
    model:      result.model || model,
    eval_count: result.eval_count,
    tool_calls: result.message?.tool_calls || [],
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
 * Kiểm tra xem đoạn văn bản có chứa nhiều từ tiếng Anh hay không
 */
function isEnglishOrForeignText(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const englishIndicators = [
    'the image', 'this image', 'shows a', 'depicts', 'there is', 'there are',
    'contains', 'consists of', 'a poster for', 'a flyer for', 'in the background',
    'in the foreground', 'wearing a', 'standing in front', 'written on it',
    'legal document', 'business registration', 'official seal', 'license',
    'validity', 'is valid', 'appears to be'
  ];
  return englishIndicators.some((indicator) => lower.includes(indicator));
}

/**
 * Trau chuốt và chuẩn hóa mô tả sang tiếng Việt tự nhiên, chuyên nghiệp bằng model ngôn ngữ chính
 */
async function ensureVietnameseDescription(rawDescription, sourceLabel = '', eventTitle = '') {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return 'Không có mô tả chi tiết cho hình ảnh này.';
  }

  // Nếu mô tả đã thuần tiếng Việt và không chứa các cấu trúc tiếng Anh điển hình -> giữ nguyên
  if (!isEnglishOrForeignText(rawDescription)) {
    return rawDescription.trim();
  }

  try {
    const prompt = `Bạn là Chuyên gia Thẩm định Hình ảnh & Văn bản Sự kiện EventHub tại Việt Nam.
Hãy dịch và trau chuốt lại bản phân tích hình ảnh sau đây thành TIẾNG VIỆT tự nhiên, chuẩn xác, chuyên nghiệp và đầy đủ ngữ cảnh sự kiện Việt Nam.
Ngữ cảnh sự kiện: "${eventTitle || 'Sự kiện EventHub'}" - Nguồn ảnh: ${sourceLabel || 'Ảnh sự kiện'}.

Nội dung cần chuyển ngữ:
"""
${rawDescription}
"""

Yêu cầu bắt buộc:
1. Trả về DUY NHẤT đoạn văn bản tiếng Việt hoàn chỉnh (100% tiếng Việt, KHÔNG để sót từ tiếng Anh thừa, KHÔNG dùng <think>, KHÔNG thêm lời chào hay giải thích ngoài).
2. Giữ nguyên chuẩn xác các tên riêng (nghệ sĩ, ca sĩ, ban nhạc), địa danh tại Việt Nam, ngày giờ, số liệu giá vé, số quyết định hoặc tên cơ quan cấp phép nếu có.`;

    const vietnameseText = await generate(prompt, {
      model: OLLAMA_MODEL,
      temperature: 0.1,
      max_tokens: 350,
      think: false,
    });

    if (vietnameseText && vietnameseText.length > 10) {
      return vietnameseText.replace(/<\/?[a-zA-Z0-9_-]+>/g, '').trim();
    }
  } catch (err) {
    logger.warn(`[OllamaClient] ensureVietnameseDescription fallback: ${err.message}`);
  }

  return rawDescription.trim();
}

/**
 * Describe a single image using the vision model (moondream).
 * Returns a text description of what the image contains in Vietnamese.
 *
 * @param {string} base64Image - Pure base64 encoded image (no data URI prefix)
 * @param {string} contextPrompt - Optional prompt to guide the vision model's focus
 * @param {string} sourceLabel - Label of the source image
 * @param {string} eventTitle - Event title for context
 * @returns {Promise<string>} Text description of the image content in Vietnamese
 */
async function describeImage(base64Image, contextPrompt = '', sourceLabel = '', eventTitle = '') {
  if (!base64Image) return 'Không thể phân tích ảnh (dữ liệu ảnh trống).';

  const prompt = contextPrompt || 
    'Bạn là chuyên gia phân tích ảnh sự kiện tại Việt Nam. Hãy quan sát và mô tả chi tiết hình ảnh này BẰNG TIẾNG VIỆT:\n' +
    '1. Mô tả nội dung trực quan: Các đối tượng, con người, cảnh quan, nghệ sĩ, chủ đề sự kiện.\n' +
    '2. Đọc toàn bộ chữ xuất hiện trên ảnh (OCR tiếng Việt): Tiêu đề, ngày giờ, địa điểm, giá vé, nhà tài trợ.\n' +
    '3. Kiểm tra an toàn: Có yếu tố vi phạm (bạo lực, khiêu dâm, cờ bạc, lừa đảo) hay không?\n' +
    'Bắt buộc trả lời hoàn toàn bằng tiếng Việt.';

  const body = {
    model: OLLAMA_VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false,
    keep_alive: 0, // Giải phóng ngay VRAM sau khi đọc ảnh xong để nhường trọn bộ nhớ cho text model
    options: {
      temperature: 0.2,
      num_predict: 300,
    },
  };

  try {
    const result = await ollamaFetch('/api/generate', body, OLLAMA_VISION_TIMEOUT);
    const rawDescription = String(result.response || '').trim();
    if (!rawDescription) return 'Mô hình AI Vision không trả về mô tả cho ảnh này.';

    // Tự động chuẩn hóa và trau chuốt 100% sang tiếng Việt nhuần nhuyễn
    return await ensureVietnameseDescription(rawDescription, sourceLabel, eventTitle);
  } catch (err) {
    logger.warn(`[OllamaClient] Vision model '${OLLAMA_VISION_MODEL}' error: ${err.message}`);
    return `Không thể phân tích ảnh bằng vision model (${err.message.slice(0, 100)})`;
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
async function describeImageBatch(images, eventTitle = '') {
  if (!Array.isArray(images) || images.length === 0) return [];

  const results = [];

  for (const img of images) {
    const isPermit = img.source && img.source.startsWith('PERMIT');
    const sourceLabel = img.source === 'MAIN_POSTER'
      ? 'Ảnh đại diện chính (Poster)'
      : img.source === 'COVER_BANNER'
        ? 'Ảnh bìa (Cover Banner)'
        : isPermit
          ? `Tài liệu giấy phép (${img.fileName || 'Hồ sơ pháp lý'})`
          : `Ảnh trong mô tả (${img.source})`;

    const contextPrompt = isPermit
      ? `Bạn là chuyên gia thẩm định hồ sơ pháp lý và OCR tài liệu sự kiện tại Việt Nam cho EventHub. Hãy phân tích tệp tài liệu giấy phép này (${img.fileName || 'Tài liệu'}) thuộc sự kiện "${eventTitle}":\n` +
        `1. Phân loại tài liệu: Nhận diện loại văn bản (Giấy phép biểu diễn / tổ chức từ Sở Văn hóa & Thể thao, UBND; Giấy chứng nhận ĐKKD; Hợp đồng thuê địa điểm/mặt bằng; Quyết định phê duyệt).\n` +
        `2. Đọc chữ (OCR tiếng Việt): Trích xuất tên cơ quan ban hành, số quyết định, tên đơn vị tổ chức, địa điểm tổ chức tại Việt Nam, thời hạn hiệu lực, dấu mộc đỏ hoặc chữ ký.\n` +
        `3. Tính hợp lệ & liên quan: Tài liệu có khớp với sự kiện "${eventTitle}" không? Có dấu hiệu giả mạo, hết hạn hoặc lạc đề không?\n` +
        `4. Kết luận ngắn gọn trong 2-3 câu. BẮT BUỘC TRẢ LỜI HOÀN TOÀN BẰNG TIẾNG VIỆT.`
      : `Bạn là chuyên gia kiểm duyệt hình ảnh và OCR cho các sự kiện tại Việt Nam. Hãy phân tích hình ảnh này cho sự kiện "${eventTitle}":\n` +
        `1. Nội dung trực quan: Nhận diện người, nghệ sĩ biểu diễn, sân khấu, chủ đề và bối cảnh sự kiện.\n` +
        `2. Mức độ phù hợp: Hình ảnh có phù hợp và khớp với chủ đề của sự kiện "${eventTitle}" tại Việt Nam không?\n` +
        `3. Đọc chữ trên ảnh (OCR tiếng Việt): Đọc các thông tin chữ trên poster/banner (Tên sự kiện, ca sĩ/khách mời, ngày giờ, địa điểm tổ chức, giá vé, đơn vị tài trợ). Phát hiện lỗi chính tả tiếng Việt hoặc mâu thuẫn thông tin nếu có.\n` +
        `4. An toàn nội dung: Chỉ gắn cờ nếu chứa nội dung đồi trụy, cờ bạc lừa đảo, bạo lực máu me hoặc chất cấm. KHÔNG gắn cờ ảnh nghệ thuật, thời trang, bơi lội, ca múa nhạc lành mạnh.\n` +
        `BẮT BUỘC TRẢ LỜI HOÀN TOÀN BẰNG TIẾNG VIỆT.`;

    logger.info(`[OllamaClient] Analyzing image [${img.source}] with vision model '${OLLAMA_VISION_MODEL}' in Vietnamese...`);
    const description = await describeImage(img.base64, contextPrompt, sourceLabel, eventTitle);
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
