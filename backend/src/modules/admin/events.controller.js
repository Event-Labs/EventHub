const ApiResponse = require('../../core/response/ApiResponse');
const eventsAdminService = require('./events.service');
const { eventIdSchema, reviewEventSchema, hideEventSchema } = require('./events.validation');

class EventsAdminController {
  getEventDetail = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.getEventDetail(eventId);
      res.status(200).json(ApiResponse.success(data, 'Event detail retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  reviewEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const payload = reviewEventSchema.parse(req.body);
      const data = await eventsAdminService.reviewEvent(req.user.sub, eventId, payload);
      res.status(200).json(ApiResponse.success(data, 'Event reviewed successfully'));
    } catch (err) {
      next(err);
    }
  };

  hideEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const payload = hideEventSchema.parse(req.body);
      const data = await eventsAdminService.hideEvent(req.user.sub, eventId, payload);
      res.status(200).json(ApiResponse.success(data, 'Event hidden successfully'));
    } catch (err) {
      next(err);
    }
  };

  unhideEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.unhideEvent(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event restored successfully'));
    } catch (err) {
      next(err);
    }
  };

  getAiReview = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.getAiReview(eventId);
      res.status(200).json(ApiResponse.success(data, 'AI review fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  runAiReview = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.runAiReview(eventId);
      res.status(200).json(ApiResponse.success(data, 'AI review generated successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventsAdminController();

