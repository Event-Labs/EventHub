const ApiResponse = require('../../core/response/ApiResponse');
const aiFaqService = require('./aiFaq.service');
const { chatSchema } = require('./aiFaq.validation');

class AiFaqController {
  getMeta = async (req, res, next) => {
    try {
      const data = aiFaqService.getSuggestedQuestions();
      res.status(200).json(ApiResponse.success(data, 'AI FAQ metadata fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  chat = async (req, res, next) => {
    try {
      const payload = chatSchema.parse(req.body);
      const userId = req.user?.sub || null;
      const data = await aiFaqService.chat(userId, payload);
      res.status(200).json(ApiResponse.success(data, 'AI FAQ response generated'));
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req, res, next) => {
    try {
      const data = await aiFaqService.getMyHistory(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'AI chat history fetched successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AiFaqController();