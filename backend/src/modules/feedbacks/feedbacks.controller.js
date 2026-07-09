const ApiResponse = require('../../core/response/ApiResponse');
const feedbacksService = require('./feedbacks.service');
const {
  eventIdParamSchema,
  submitFeedbackSchema,
} = require('./feedbacks.validation');

class FeedbacksController {
  getEligibleEvents = async (req, res, next) => {
    try {
      const data = await feedbacksService.getEligibleEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Đã tải danh sách sự kiện có thể phản hồi.'));
    } catch (err) {
      next(err);
    }
  };

  submit = async (req, res, next) => {
    try {
      const payload = submitFeedbackSchema.parse(req.body);
      const data = await feedbacksService.submitFeedback(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Cảm ơn bạn! Phản hồi đã được gửi thành công.'));
    } catch (err) {
      next(err);
    }
  };

  getOrganizerEvents = async (req, res, next) => {
    try {
      const data = await feedbacksService.getOrganizerEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Đã tải danh sách phản hồi theo sự kiện.'));
    } catch (err) {
      next(err);
    }
  };

  getEventReport = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const data = await feedbacksService.getEventFeedbackReport(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Đã tải báo cáo phản hồi sự kiện.'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new FeedbacksController();
