const ApiResponse = require('../../core/response/ApiResponse');
const ordersService = require('./orders.service');
const { checkoutSchema, orderIdParamSchema, staffDirectBookingSchema } = require('./orders.validation');

class OrdersController {
  checkout = async (req, res, next) => {
    try {
      const payload = checkoutSchema.parse(req.body);
      const data = await ordersService.checkout(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Order created. Waiting for PayOS payment.'));
    } catch (err) {
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
