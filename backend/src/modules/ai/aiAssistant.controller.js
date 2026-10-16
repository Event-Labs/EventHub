const aiAssistantService = require('./aiAssistant.service');
const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');

class AiAssistantController {
  chat = async (req, res, next) => {
    try {
      const userId = req.user?.sub || null;
      const { message, history } = req.body;
      const result = await aiAssistantService.chat(userId, message, history);
      res.status(200).json(ApiResponse.success(result, 'Chat processed'));
    } catch (err) {
      logger.error(`[AiAssistantController] Unhandled chat error: ${err.message}\n${err.stack}`);
      res.status(200).json(ApiResponse.success({
        role: 'assistant',
        content: 'Dạ Eve vừa gặp một chút gián đoạn kết nối. Bạn vui lòng thử lại sau ít giây nhé! 🥰'
      }, 'Chat processed with graceful fallback'));
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
