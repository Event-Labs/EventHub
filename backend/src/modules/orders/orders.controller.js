const ApiResponse = require('../../core/response/ApiResponse');
const ordersService = require('./orders.service');
const { checkoutSchema, orderIdParamSchema } = require('./orders.validation');

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

}

module.exports = new OrdersController();
