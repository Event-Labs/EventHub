const ApiResponse = require('../../core/response/ApiResponse');
const subscriptionsService = require('./subscriptions.service');
const {
  subscriptionIdSchema,
  subscriptionPayloadSchema,
  updateSubscriptionSchema,
} = require('./subscriptions.validation');

class SubscriptionsController {
  list = async (req, res, next) => {
    try {
      const data = await subscriptionsService.listSubscriptions();
      res.status(200).json(ApiResponse.success(data, 'Subscriptions fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  create = async (req, res, next) => {
    try {
      const payload = subscriptionPayloadSchema.parse(req.body);
      const data = await subscriptionsService.createSubscription(payload);
      res.status(201).json(ApiResponse.success(data, 'Subscription created successfully'));
    } catch (err) {
      next(err);
    }
  };

  update = async (req, res, next) => {
    try {
      const { id } = subscriptionIdSchema.parse(req.params);
      const payload = updateSubscriptionSchema.parse(req.body);
      const data = await subscriptionsService.updateSubscription(id, payload);
      res.status(200).json(ApiResponse.success(data, 'Subscription updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { id } = subscriptionIdSchema.parse(req.params);
      const data = await subscriptionsService.deleteSubscription(id);
      res.status(200).json(ApiResponse.success(data, 'Subscription deleted successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new SubscriptionsController();
