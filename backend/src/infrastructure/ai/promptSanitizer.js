// backend/src/infrastructure/ai/promptSanitizer.js
// Shared sanitization & validation utilities for Qwen3/Ollama prompt pipelines.

const INJECTION_TOKENS = ['</s>', '<|im_start|>', '<|im_end|>', '<|endoftext|>'];

// Unicode Cc control chars U+0000–U+001F and U+007F–U+009F,
// excluding \t (U+0009) and \n (U+000A) which are safe whitespace.
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

const THINK_BLOCK_REGEX = /<think>[\s\S]*?<\/think>/g;

const PROTO_POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Sanitize a user/organizer-supplied string for inclusion in Qwen3 prompts.
 *
 * Steps (in order):
 *   1. Return '' for non-string input
 *   2. Strip null bytes (\x00)
 *   3. Strip Unicode Cc control chars (keeps \t and \n)
 *   4. Strip known LLM injection tokens
 *   5. Truncate to maxLen characters
 *
 * @param {string} input
 * @param {number} [maxLen=500]  Maximum character length after sanitization
 * @returns {string}
 */
function sanitizeInput(input, maxLen = 500) {
  if (typeof input !== 'string') return '';

  let s = input;

  // Strip null bytes
  s = s.replace(/\x00/g, '');

  // Strip control characters (keep \t U+0009 and \n U+000A)
  s = s.replace(CONTROL_CHAR_REGEX, '');

  // Strip injection tokens
  for (const token of INJECTION_TOKENS) {
    s = s.split(token).join('');
  }

  // Truncate to maxLen
  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
  }

  return s;
}

/**
 * Strip <think>...</think> blocks from Qwen3 extended-thinking responses.
 * The regex is multiline-safe ([\s\S]*? matches newlines too).
 *
 * @param {string} text
 * @returns {string}
 */
function stripThinkBlocks(text) {
  if (!text) return '';
  return text.replace(THINK_BLOCK_REGEX, '').trim();
}

/**
 * Validate a parsed JSON value has no prototype-polluting keys.
 * Recursively checks all nested objects; arrays are iterated but not
 * themselves checked for poisoned keys (they have no own string keys).
 *
 * @param {any} obj
 * @returns {boolean}  true if safe, false if a poisoned key is found
 */
function validateJSON(obj) {
  if (obj === null || typeof obj !== 'object') return true;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (!validateJSON(item)) return false;
    }
    return true;
  }

  for (const key of Object.keys(obj)) {
    if (PROTO_POISON_KEYS.has(key)) return false;
    if (!validateJSON(obj[key])) return false;
  }

  return true;
}

/**
 * Estimate the total character count across an array of prompt parts.
 * Non-string elements are silently skipped.
 *
 * @param {Array<any>} parts
 * @returns {number}
 */
function estimatePromptSize(parts) {
  return parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : 0), 0);
}

/**
 * Strip HTML tags that are not in the allowlist.
 * Allowed tags: p, strong, em, ul, ol, li, br  (case-insensitive).
 * Allowed tags are kept as-is (including any attributes on opening tags);
 * all other tags are replaced with empty string.
 *
 * @param {string} html
 * @returns {string}
 */
function stripUnsafeHtml(html) {
  if (!html) return '';
  const ALLOWED = /^(p|strong|em|ul|ol|li|br)$/i;
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    return ALLOWED.test(tag) ? match : '';
  });
}

module.exports = {
  sanitizeInput,
  stripThinkBlocks,
  validateJSON,
  estimatePromptSize,
  stripUnsafeHtml,
};
