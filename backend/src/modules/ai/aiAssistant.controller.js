const aiAssistantService = require('./aiAssistant.service');
const aiChatHistoryRepository = require('./aiChatHistory.repository');
const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');

class AiAssistantController {
  chat = async (req, res, next) => {
    try {
      const userId = req.user?.sub || null;
      const { message, history, sessionId, title } = req.body;
      const result = await aiAssistantService.chat(userId, message, history);

      // Auto-persist conversation to database if user is authenticated and sessionId is provided
      if (userId && sessionId) {
        try {
          const userMsg = { role: 'user', content: message };
          const assistantMsg = { role: 'assistant', content: result?.content || '' };
          const updatedMessages = [...(Array.isArray(history) ? history : []), userMsg, assistantMsg];

          let sessionTitle = title;
          if (!sessionTitle || sessionTitle === 'Đoạn chat mới') {
            sessionTitle = message.length > 28 ? message.substring(0, 28) + '...' : message;
          }

          aiChatHistoryRepository
            .upsertSession(userId, {
              sessionId,
              title: sessionTitle,
              messages: updatedMessages,
              updatedAt: Date.now(),
            })
            .catch((saveErr) => {
              logger.warn(`[AiAssistantController] Auto-save chat history warning: ${saveErr.message}`);
            });
        } catch (saveErr) {
          logger.warn(`[AiAssistantController] Failed to prepare chat auto-save: ${saveErr.message}`);
        }
      }

      res.status(200).json(ApiResponse.success(result, 'Chat processed'));
    } catch (err) {
      logger.error(`[AiAssistantController] Unhandled chat error: ${err.message}\n${err.stack}`);
      res.status(200).json(
        ApiResponse.success(
          {
            role: 'assistant',
            content: 'Dạ Eve vừa gặp một chút gián đoạn kết nối. Bạn vui lòng thử lại sau ít giây nhé! 🥰',
          },
          'Chat processed with graceful fallback',
        ),
      );
    }
  };

  getSessions = async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(200).json(ApiResponse.success([], 'No sessions for unauthenticated user'));
      }
      const sessions = await aiChatHistoryRepository.listSessions(userId);
      res.status(200).json(ApiResponse.success(sessions, 'Chat sessions retrieved'));
    } catch (err) {
      logger.error(`[AiAssistantController] getSessions error: ${err.message}`);
      next(err);
    }
  };

  saveSession = async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json(ApiResponse.error('Authentication required', 401));
      }
      const { id, sessionId, title, messages, createdAt, updatedAt } = req.body;
      const sid = sessionId || id;
      if (!sid) {
        return res.status(400).json(ApiResponse.error('Session ID is required', 400));
      }
      const saved = await aiChatHistoryRepository.upsertSession(userId, {
        sessionId: sid,
        title,
        messages,
        createdAt,
        updatedAt,
      });
      res.status(200).json(ApiResponse.success(saved, 'Session saved'));
    } catch (err) {
      logger.error(`[AiAssistantController] saveSession error: ${err.message}`);
      next(err);
    }
  };

  syncSessions = async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json(ApiResponse.error('Authentication required', 401));
      }
      const { sessions } = req.body;
      if (Array.isArray(sessions)) {
        for (const s of sessions) {
          if (s && (s.id || s.sessionId)) {
            await aiChatHistoryRepository.upsertSession(userId, {
              sessionId: s.sessionId || s.id,
              title: s.title,
              messages: s.messages,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            });
          }
        }
      }
      const allSessions = await aiChatHistoryRepository.listSessions(userId);
      res.status(200).json(ApiResponse.success(allSessions, 'Sessions synchronized'));
    } catch (err) {
      logger.error(`[AiAssistantController] syncSessions error: ${err.message}`);
      next(err);
    }
  };

  deleteSession = async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json(ApiResponse.error('Authentication required', 401));
      }
      const { sessionId } = req.params;
      await aiChatHistoryRepository.deleteSession(userId, sessionId);
      res.status(200).json(ApiResponse.success({ deleted: true }, 'Session deleted'));
    } catch (err) {
      logger.error(`[AiAssistantController] deleteSession error: ${err.message}`);
      next(err);
    }
  };

  getTrainingStats = async (req, res, next) => {
    try {
      const stats = await aiAssistantService.getCollectedTrainingStats();
      res.status(200).json(ApiResponse.success(stats, 'Training stats retrieved'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AiAssistantController();
