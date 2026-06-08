const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const aiFaqRepository = require('./aiFaq.repository');
const agentService = require('./agent.service');

const MAX_HISTORY_MESSAGES = 40;
const DEFAULT_ASSISTANT_META = {
  mode: 'gemini_grounded',
  confidence: 0.95,
  intent: 'agent_routed',
  sources: [],
  personalization: null,
};

class AiFaqService {
  getSuggestedQuestions() {
    return {
      capabilities: {
        can_help_with: [
          'Vé, mã QR, tải vé',
          'Thanh toán và trạng thái đơn hàng',
          'Hoàn vé / hoàn tiền',
          'Check-in tại sự kiện',
          'Địa điểm, lịch trình sự kiện',
          'Tài khoản cá nhân',
        ],
        cannot_help_with: [
          'Nội dung không liên quan đến dữ liệu EventHub',
          'Thông tin không có trong hệ thống hoặc không truy xuất được',
          'Tư vấn chung ngoài domain như code, bài văn, tin tức...',
        ],
        technique: 'Gemini Grounded System Chat',
      },
      suggested_questions: [
        { question: 'Hãy đề xuất một số sự kiện sắp diễn ra', category: 'events' },
        { question: 'Tôi có vé sắp tới nào không?', category: 'tickets' },
        { question: 'Check-in sự kiện bằng QR như thế nào?', category: 'checkin' },
        { question: 'Tôi có thể làm gì trên EventHub?', category: 'platform' },
      ],
    };
  }

  async chat(userId, payload) {
    const resolvedSessionId = payload.session_id || aiFaqRepository.generateSessionId();

    const result = await agentService.invokeAgent(
      resolvedSessionId,
      userId,
      payload.message,
      { history: payload.history || [] },
    );
    const answer = typeof result === 'string' ? result : result.output;
    const meta = {
      ...DEFAULT_ASSISTANT_META,
      ...(typeof result === 'string' ? {} : result.meta),
    };
    const responseMode = meta.intent === 'out_of_scope' ? 'refusal' : DEFAULT_ASSISTANT_META.mode;

    if (userId) {
      let session = await aiFaqRepository.findSession(userId, resolvedSessionId);

      if (!session) {
        session = await aiFaqRepository.createSession(userId, resolvedSessionId);
      }

      const conversation = session.conversation || { session_id: resolvedSessionId, messages: [] };
      const timestamp = new Date().toISOString();

      conversation.messages.push({
        role: 'user',
        content: payload.message,
        created_at: timestamp,
      });
      conversation.messages.push({
        role: 'assistant',
        content: answer,
        mode: responseMode,
        confidence: meta.confidence,
        intent: meta.intent,
        sources: meta.sources,
        created_at: timestamp,
      });

      if (conversation.messages.length > MAX_HISTORY_MESSAGES) {
        conversation.messages = conversation.messages.slice(-MAX_HISTORY_MESSAGES);
      }

      await aiFaqRepository.updateSession(session.id, conversation);
    }

    return {
      session_id: resolvedSessionId,
      answer,
      mode: responseMode,
      confidence: meta.confidence,
      intent: meta.intent,
      sources: meta.sources,
      personalization: meta.personalization,
      model: meta.model,
    };
  }

  async getMyHistory(userId) {
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.AUTH_REQUIRED);
    }

    const sessions = await aiFaqRepository.listRecentSessions(userId, 5);
    return sessions.map((row) => ({
      id: row.id,
      session_id: row.conversation?.session_id,
      message_count: row.conversation?.messages?.length || 0,
      last_message: row.conversation?.messages?.slice(-1)[0] || null,
      created_at: row.created_at,
    }));
  }
}

module.exports = new AiFaqService();
