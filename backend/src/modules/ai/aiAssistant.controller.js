const aiAssistantService = require('./aiAssistant.service');
const ApiResponse = require('../../core/response/ApiResponse');

class AiAssistantController {
  chat = async (req, res, next) => {
    try {
      const userId = req.user?.sub || null;
      const { message, history } = req.body;
      const result = await aiAssistantService.chat(userId, message, history);
      res.status(200).json(ApiResponse.success(result, 'Chat processed'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AiAssistantController();
