const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');
const eventsListAdminService = require('./events.list.service');
const { listEventsAdminSchema } = require('./events.list.validation');

class EventsListAdminController {
  /**
   * GET /api/admin/events/pending
   * Lists events pending review (default) or any other status via ?status=
   */
  listPendingReview = async (req, res, next) => {
    try {
      const filters = listEventsAdminSchema.parse(req.query);
      const data = await eventsListAdminService.listEvents(filters);

      res.status(200).json(
        ApiResponse.success(
          {
            items: data.items,
            pagination: {
              page: filters.page,
              limit: filters.limit,
              total: data.total,
              total_pages: Math.ceil(data.total / filters.limit),
            },
          },
          'Events fetched successfully',
        ),
      );
    } catch (err) {
      logger.error('[EventsListAdminController] listPendingReview error:', {
        message: err.message,
        stack: err.stack,
        query: req.query,
      });
      next(err);
    }
  };
}

module.exports = new EventsListAdminController();
