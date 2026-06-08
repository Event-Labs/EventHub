const paymentsService = require('./payments.service');

class PaymentsController {
  payosWebhook = async (req, res, next) => {
    try {
      const data = await paymentsService.handlePayosWebhook(req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new PaymentsController();
