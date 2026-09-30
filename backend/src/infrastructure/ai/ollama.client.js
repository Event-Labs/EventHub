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
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'qwen3:4b';
const OLLAMA_TIMEOUT  = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);

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

  const result = await ollamaFetch('/api/generate', body);
  let content = String(result.response || '').trim();
  if (!think) {
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  return content;
}

/**
 * Multi-turn chat completion.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {{ content: string, model: string }}
 */
async function chat(messages, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const think = options.think === true;

  // Add /no_think to last user message if thinking is disabled
  const processedMessages = messages.map((msg, idx) => {
    if (!think && msg.role === 'user' && idx === messages.length - 1) {
      return { ...msg, content: `${msg.content}\n/no_think` };
    }
    return msg;
  });

  const body = {
    model,
    messages: processedMessages,
    stream: false,
    keep_alive: options.keep_alive || '60m',
    options: {
      temperature: options.temperature ?? 0.35,
      top_p:       options.top_p       ?? 0.85,
      num_predict: options.max_tokens  ?? 1200,
      num_ctx:     options.num_ctx      ?? 4096,
    },
  };

  if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const result = await ollamaFetch('/api/chat', body);
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

module.exports = {
  generate,
  chat,
  extractJSON,
  isHealthy,
  getModels,
  OLLAMA_MODEL,
};
