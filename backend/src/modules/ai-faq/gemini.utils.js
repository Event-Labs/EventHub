const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getModelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function getCandidateModels() {
  const configuredModel = getModelName();
  return Array.from(new Set([configuredModel, ...FALLBACK_MODELS]));
}

function isRetryableGeminiError(error) {
  const raw = String(error?.message || error || '');
  return (
    raw.includes('"code":503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('"code":429') ||
    raw.includes('RESOURCE_EXHAUSTED')
  );
}

module.exports = {
  getApiKey,
  getModelName,
  getCandidateModels,
  isRetryableGeminiError,
};
