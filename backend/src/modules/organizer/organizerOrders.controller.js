const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');
const organizerOrdersService = require('./organizerOrders.service');
const {
  listOrdersSchema,
  orderIdParamSchema,
  eventIdParamSchema,
  financialSummarySchema,
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

  exportAttendees = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const filters = listAttendeesSchema.parse(req.query);
      const { filename, content } = await organizerOrdersService.exportAttendees(
        req.user.sub,
        eventId,
        filters,
      );

      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendee-list.csv"; filename*=UTF-8''${encodedFilename}`,
      );
      res.status(200).send(content);
    } catch (err) {
      logger.error('[OrganizerOrdersController] exportAttendees error:', {
        message: err.message,
        stack: err.stack,
        userId: req.user?.sub,
        params: req.params,
        query: req.query,
      });
      next(err);
    }
  };

  getCheckinStats = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const data = await organizerOrdersService.getCheckinStats(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Check-in stats fetched successfully'));
    } catch (err) {
      logger.error('[OrganizerOrdersController] getCheckinStats error:', err);
      next(err);
    }
  };

  getRevenueStats = async (req, res, next) => {
    try {
      const { eventId, dateFrom, dateTo } = req.query;
      const data = await organizerOrdersService.getRevenueStats(req.user.sub, {
        eventId: eventId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      res.status(200).json(ApiResponse.success(data, 'Revenue stats fetched successfully'));
    } catch (err) {
      logger.error('[OrganizerOrdersController] getRevenueStats error:', err);
      next(err);
    }
  };

  getTicketSalesAnalytics = async (req, res, next) => {
    try {
      const { eventId, dateFrom, dateTo } = req.query;
      const data = await organizerOrdersService.getTicketSalesAnalytics(req.user.sub, {
        eventId:  eventId  || null,
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      res.status(200).json(ApiResponse.success(data, 'Ticket sales analytics fetched successfully'));
    } catch (err) {
      logger.error('[OrganizerOrdersController] getTicketSalesAnalytics error:', err);
      next(err);
    }
  };

  generateFinancialSummary = async (req, res, next) => {
    try {
      const payload = financialSummarySchema.parse(req.body);
      const data = await organizerOrdersService.generateFinancialSummary(req.user.sub, {
        eventId: payload.eventId,
        dateFrom: payload.dateFrom || null,
        dateTo: payload.dateTo || null,
      });
      res.status(200).json(ApiResponse.success(data, 'Financial summary generated successfully'));
    } catch (err) {
      logger.error('[OrganizerOrdersController] generateFinancialSummary error:', {
        message: err.message,
        stack: err.stack,
        userId: req.user?.sub,
        body: req.body,
      });
      next(err);
    }
  };
}

module.exports = new OrganizerOrdersController();
