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
const OLLAMA_TIMEOUT     = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
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
    options: {
      temperature: options.temperature ?? 0.3,
      top_p:       options.top_p       ?? 0.9,
      num_predict: options.max_tokens  ?? 1024,
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

  return String(result.response || '').trim();
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
    keep_alive: '15m',
    options: {
      temperature: options.temperature ?? 0.2,
      top_p:       options.top_p       ?? 0.85,
      num_predict: options.max_tokens  ?? 1200,
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
 * Parse JSON from model output safely.
 * Handles markdown code blocks, raw JSON, and truncated JSON.
 */
function extractJSON(text) {
  if (!text) return null;

  // 1. Try direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // 2. Try extracting from markdown code block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }

  // 3. Try extracting first complete JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* continue */ }
  }

  const arrMatch = text.match(/\[[\s\S]*\]/);
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
 * Describe a single image using the vision model (moondream).
 * Returns a text description of what the image contains.
 *
 * @param {string} base64Image - Pure base64 encoded image (no data URI prefix)
 * @param {string} contextPrompt - Optional prompt to guide the vision model's focus
 * @returns {Promise<string>} Text description of the image content
 */
async function describeImage(base64Image, contextPrompt = '') {
  if (!base64Image) return 'Không thể phân tích ảnh (dữ liệu ảnh trống).';

  const prompt = contextPrompt || 
    'Describe this image in detail. What objects, people, text, logos, or content do you see? ' +
    'Is there any violent, sexual, gambling, or fraudulent content? ' +
    'Respond in Vietnamese.';

  const body = {
    model: OLLAMA_VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false,
    keep_alive: 0, // Giải phóng ngay VRAM sau khi đọc ảnh xong để nhường trọn bộ nhớ cho text model
    options: {
      temperature: 0.2,
      num_predict: 250,
    },
  };

  try {
    const result = await ollamaFetch('/api/generate', body, OLLAMA_VISION_TIMEOUT);
    const description = String(result.response || '').trim();
    if (!description) return 'Model vision không trả về mô tả cho ảnh này.';
    return description;
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
    const contextPrompt = isPermit
      ? `You are an expert official document inspector and OCR analyst for EventHub. Analyze this permit/legal document (${img.fileName || 'Tài liệu giấy phép'}) for an event titled "${eventTitle}":\n` +
        `1. Document Classification: Identify document type (e.g. Event Organization Permit, Performance License from Dept of Culture / Gov authority, Business Registration Certificate, Venue Rental Contract, Partnership Agreement, Approval Decision).\n` +
        `2. OCR & Text details: Transcribe key text visible: Issuing Authority / Company name, Document title / Decision number, Venue / Location, Effective dates / Expiration, Signatures / Official Stamps.\n` +
        `3. Objective Validity: Does the document appear authentic and relevant to the event? (Be balanced and sensible; do not nitpick minor formatting or image resolution).\n` +
        `4. Status Assessment: Is it valid, needs attention, or invalid? Summarize in 2-3 clear sentences in Vietnamese.`
      : `You are an expert image content moderator and OCR reviewer for event images. Analyze this image for an event titled "${eventTitle}":\n` +
        `1. Visual content: What main objects, people, scenes, logos, and themes are shown?\n` +
        `2. Relevance: Is this image genuinely related and appropriate for "${eventTitle}"? If irrelevant, explain why.\n` +
        `3. Safety check (Sensible & Objective): Only flag explicit pornography/nudity, extreme violence, weapons, or illegal gambling/fraud. Do NOT flag swimwear, fashion, artistic performance, gym, dance, or health themes as pornography.\n` +
        `4. OCR & Text check: Transcribe visible text. Note any real spelling typos, or date/price contradictions.\n` +
        `5. Suggestions (Only when truly necessary): Note that image dimensions and aspect ratios are already standardized by the platform, so DO NOT suggest resizing. Only suggest meaningful improvements if text is unreadable or visual quality is noticeably degraded.\n` +
        `Be concise, objective and sensible. Answer in Vietnamese or English.`;

    logger.info(`[OllamaClient] Analyzing image [${img.source}] with vision model '${OLLAMA_VISION_MODEL}'...`);
    const description = await describeImage(img.base64, contextPrompt);
    results.push({
      source: img.source,
      url: img.url || '',
      fileName: img.fileName || '',
      description,
    });
    logger.info(`[OllamaClient] Image [${img.source}] analysis complete (${description.length} chars).`);
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
