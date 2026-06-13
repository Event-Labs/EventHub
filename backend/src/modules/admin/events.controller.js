const ApiResponse = require('../../core/response/ApiResponse');
const eventsAdminService = require('./events.service');
const { eventIdSchema, reviewEventSchema, hideEventSchema } = require('./events.validation');

class EventsAdminController {
  /** PATCH /api/admin/events/:eventId/review — Function 80 */
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

  /** PATCH /api/admin/events/:eventId/hide — Function 81 */
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

  /** PATCH /api/admin/events/:eventId/unhide */
  unhideEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.unhideEvent(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event restored successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventsAdminController();
