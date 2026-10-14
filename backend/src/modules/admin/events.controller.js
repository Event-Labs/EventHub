const ApiResponse = require('../../core/response/ApiResponse');
const eventsAdminService = require('./events.service');
const {
  eventIdSchema,
  reviewEventSchema,
  hideEventSchema,
  reviewCriteriaIdSchema,
  createReviewCriteriaSchema,
  updateReviewCriteriaSchema,
} = require('./events.validation');

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

  getAutoReviewSettings = async (req, res, next) => {
    try {
      const data = await eventsAdminService.getAutoReviewSettings();
      res.status(200).json(ApiResponse.success(data, 'AI auto-review settings retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateAutoReviewSettings = async (req, res, next) => {
    try {
      const data = await eventsAdminService.updateAutoReviewSettings(req.user.sub, req.body);
      res.status(200).json(ApiResponse.success(data, 'AI auto-review settings updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  runBatchAutoReview = async (req, res, next) => {
    try {
      const data = await eventsAdminService.runBatchAutoReview(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Batch AI auto-review completed successfully'));
    } catch (err) {
      next(err);
    }
  };

  listReviewCriteria = async (req, res, next) => {
    try {
      const data = await eventsAdminService.listReviewCriteria(req.query);
      res.status(200).json(ApiResponse.success(data, 'Review criteria list retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  getReviewCriteriaById = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const data = await eventsAdminService.getReviewCriteriaById(id);
      res.status(200).json(ApiResponse.success(data, 'Review criteria retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  createReviewCriteria = async (req, res, next) => {
    try {
      const payload = createReviewCriteriaSchema.parse(req.body);
      const data = await eventsAdminService.createReviewCriteria(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Review criteria created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateReviewCriteria = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const payload = updateReviewCriteriaSchema.parse(req.body);
      const data = await eventsAdminService.updateReviewCriteria(req.user.sub, id, payload);
      res.status(200).json(ApiResponse.success(data, 'Review criteria updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deleteReviewCriteria = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const data = await eventsAdminService.deleteReviewCriteria(id);
      res.status(200).json(ApiResponse.success(data, 'Review criteria deleted successfully'));
    } catch (err) {
      next(err);
    }
  };

  resetDefaultReviewCriteria = async (req, res, next) => {
    try {
      const data = await eventsAdminService.resetDefaultReviewCriteria(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Default review criteria restored successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventsAdminController();

