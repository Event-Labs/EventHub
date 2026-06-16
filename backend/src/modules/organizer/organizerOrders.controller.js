const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');
const organizerOrdersService = require('./organizerOrders.service');
const {
  listOrdersSchema,
  orderIdParamSchema,
  eventIdParamSchema,
  listAttendeesSchema,
} = require('./organizerOrders.validation');

class OrganizerOrdersController {

  listOrders = async (req, res, next) => {
    try {
      const filters = listOrdersSchema.parse(req.query);
      const { items, total } = await organizerOrdersService.listOrders(req.user.sub, filters);

      res.status(200).json(
        ApiResponse.success(
          {
            items,
            pagination: {
              page: filters.page,
              limit: filters.limit,
              total,
              total_pages: Math.ceil(total / filters.limit),
            },
          },
          'Orders fetched successfully',
        ),
      );
    } catch (err) {
      logger.error('[OrganizerOrdersController] listOrders error:', {
        message: err.message,
        stack: err.stack,
        userId: req.user?.sub,
        query: req.query,
      });
      next(err);
    }
  };

  getOrderDetail = async (req, res, next) => {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      const data = await organizerOrdersService.getOrderDetail(req.user.sub, orderId);

      res.status(200).json(ApiResponse.success(data, 'Order fetched successfully'));
    } catch (err) {
      logger.error('[OrganizerOrdersController] getOrderDetail error:', {
        message: err.message,
        stack: err.stack,
        userId: req.user?.sub,
        params: req.params,
      });
      next(err);
    }
  };

  listAttendees = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const filters = listAttendeesSchema.parse(req.query);
      const { items, total } = await organizerOrdersService.listAttendees(
        req.user.sub,
        eventId,
        filters,
      );

      res.status(200).json(
        ApiResponse.success(
          {
            items,
            pagination: {
              page: filters.page,
              limit: filters.limit,
              total,
              total_pages: Math.ceil(total / filters.limit),
            },
          },
          'Attendees fetched successfully',
        ),
      );
    } catch (err) {
      logger.error('[OrganizerOrdersController] listAttendees error:', {
        message: err.message,
        stack: err.stack,
        userId: req.user?.sub,
        params: req.params,
        query: req.query,
      });
      next(err);
    }
  };
}

module.exports = new OrganizerOrdersController();
