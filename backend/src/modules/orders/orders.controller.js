const ApiResponse = require('../../core/response/ApiResponse');
const ordersService = require('./orders.service');
const waitingRoomService = require('../waiting-room/waitingRoom.service');
const idempotencyService = require('../../core/security/idempotency.service');
const { getClientIp } = require('../../core/security/ipResolver');
const {
  checkoutSchema,
  orderIdParamSchema,
  staffDirectBookingSchema,
  staffComplimentaryBookingSchema,
} = require('./orders.validation');

class OrdersController {
  checkout = async (req, res, next) => {
    const idempotencyKey =
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body?.idempotency_key ||
      null;

    let idempotencyLock = null;
    try {
      const payload = checkoutSchema.parse(req.body);

      if (idempotencyKey) {
        idempotencyLock = await idempotencyService.lockOrGetCached(
          idempotencyKey,
          req.user?.sub,
          'POST',
          req.path,
          payload,
        );
        if (idempotencyLock && idempotencyLock.isCached) {
          return res.status(idempotencyLock.response.statusCode || 201).json(idempotencyLock.response.data);
        }
      }

      const clientIp = getClientIp(req);
      const data = await ordersService.checkout(req.user?.sub, {
        ...payload,
        idempotency_key: idempotencyKey,
        client_ip: clientIp,
      });
      const message = data.is_completed
        ? 'Đặt vé thành công.'
        : 'Order created. Waiting for PayOS payment.';

      // Release waiting room active slot upon successful checkout transition
      const token =
        req.headers['x-booking-token'] ||
        req.headers['x-queue-token'] ||
        req.body?.booking_token ||
        null;
      if (token && payload.event_id) {
        waitingRoomService
          .releaseActiveSlot({ eventId: payload.event_id, token })
          .catch(() => {});
      }

      const responseBody = ApiResponse.success(data, message);

      if (idempotencyKey) {
        await idempotencyService.saveResponse(
          idempotencyKey,
          idempotencyLock?.requestHash,
          responseBody,
          201,
          idempotencyLock?.lockToken,
        );
      }

      res.status(201).json(responseBody);
    } catch (err) {
      if (idempotencyKey) {
        await idempotencyService.clearLock(idempotencyKey, idempotencyLock?.lockToken);
      }
      next(err);
    }
  };

  status = async (req, res, next) => {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      const data = await ordersService.getStatus(req.user.sub, orderId);
      res.status(200).json(ApiResponse.success(data, 'Order status fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req, res, next) => {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      const data = await ordersService.cancel(req.user.sub, orderId);
      res.status(200).json(ApiResponse.success(data, 'Order cancelled successfully'));
    } catch (err) {
      next(err);
    }
  };

  staffDirectBookingEvents = async (req, res, next) => {
    try {
      const data = await ordersService.getStaffDirectBookingEvents(req.user.sub, req.user.roles || []);
      res.status(200).json(ApiResponse.success(data, 'Staff direct booking events fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  createStaffDirectBooking = async (req, res, next) => {
    try {
      const payload = staffDirectBookingSchema.parse(req.body);
      const data = await ordersService.createStaffDirectBooking(req.user.sub, req.user.roles || [], payload);
      res.status(201).json(ApiResponse.success(data, 'Staff direct booking created successfully'));
    } catch (err) {
      next(err);
    }
  };

  createStaffComplimentaryBooking = async (req, res, next) => {
    try {
      const payload = staffComplimentaryBookingSchema.parse(req.body);
      const data = await ordersService.createStaffComplimentaryBooking(req.user.sub, req.user.roles || [], payload);
      res.status(201).json(ApiResponse.success(data, 'Cấp vé mời nhân sự thành công'));
    } catch (err) {
      next(err);
    }
  };

  staffDirectBookingStatus = async (req, res, next) => {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      const data = await ordersService.getStaffDirectBookingStatus(req.user.sub, req.user.roles || [], orderId);
      res.status(200).json(ApiResponse.success(data, 'Staff direct booking status fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

}

module.exports = new OrdersController();
