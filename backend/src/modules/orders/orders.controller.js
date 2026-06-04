const ApiResponse = require('../../core/response/ApiResponse');
const ordersService = require('./orders.service');
const { checkoutSchema } = require('./orders.validation');

class OrdersController {
  checkout = async (req, res, next) => {
    try {
      const payload = checkoutSchema.parse(req.body);
      const data = await ordersService.checkout(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Order completed successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrdersController();
