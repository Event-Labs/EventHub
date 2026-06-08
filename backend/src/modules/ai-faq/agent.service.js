const { GoogleGenAI } = require('@google/genai');
const systemContextService = require('./systemContext.service');
const { getApiKey, getCandidateModels, isRetryableGeminiError } = require('./gemini.utils');
const {
  normalizeHistory,
  extractJson,
  buildSourceRegistry,
  sanitizeSources,
  buildPrompt,
  createUnavailableAnswer,
} = require('./prompt.utils');

class AgentService {
  constructor() {
    this.client = null;
  }

  getClient() {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }

    return this.client;
  }

  async invokeAgent(sessionId, userId, query, options = {}) {
    const client = this.getClient();

    if (!client) {
      return createUnavailableAnswer(
        'AI Chatbox chưa được cấu hình Gemini API key trên server. Vui lòng thêm GEMINI_API_KEY hoặc GOOGLE_API_KEY để sử dụng tính năng này.',
      );
    }

    const context = await systemContextService.build(userId, query);
    const history = normalizeHistory(options.history);
    const allowedSources = buildSourceRegistry(context);

    try {
      let response = null;
      let selectedModel = null;
      let lastError = null;

      for (const model of getCandidateModels()) {
        try {
          response = await client.models.generateContent({
            model,
            contents: buildPrompt({ query, history, context, sessionId }),
            config: {
              temperature: 0.2,
              topP: 0.8,
              maxOutputTokens: 700,
              responseMimeType: 'application/json',
            },
          });
          selectedModel = model;
          break;
        } catch (error) {
          lastError = error;
          console.error(`Gemini AI chat error (${model}):`, error.message);
          if (!isRetryableGeminiError(error)) {
            throw error;
          }
        }
      }

      if (!response) {
        throw lastError;
      }

      const parsed = extractJson(response.text);
      if (!parsed?.answer) {
        return createUnavailableAnswer(
          'Gemini không trả về định dạng hợp lệ. Vui lòng thử lại sau.',
          'error',
        );
      }

      return {
        output: String(parsed.answer).trim(),
        meta: {
          intent: parsed.intent || 'general_eventhub',
          confidence: Number(parsed.confidence ?? 0.75),
          sources: sanitizeSources(parsed.sources, allowedSources),
          personalization: context.user_context,
          model: selectedModel,
        },
      };
    } catch (error) {
      console.error('Gemini AI chat error:', error.message);
      if (isRetryableGeminiError(error)) {
        return createUnavailableAnswer(
          'Gemini đang quá tải tạm thời. Tôi chưa thể tạo câu trả lời lúc này, vui lòng thử lại sau vài phút.',
          'error',
        );
      }

      return createUnavailableAnswer(
        'Gemini AI hiện chưa phản hồi được. Vui lòng kiểm tra API key/quota hoặc thử lại sau.',
        'error',
      );
    }
  }
}

module.exports = new AgentService();
