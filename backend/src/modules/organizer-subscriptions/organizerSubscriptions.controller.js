const ApiResponse = require('../../core/response/ApiResponse');
const organizerSubscriptionsService = require('./organizerSubscriptions.service');
const { z } = require('zod');

const subscribeSchema = z.object({
  subscription_id: z.string().uuid(),
});

class OrganizerSubscriptionsController {
  getCurrentPlan = async (req, res, next) => {
    try {
      const data = await organizerSubscriptionsService.getCurrentPlan(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Current subscription fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  subscribe = async (req, res, next) => {
    try {
      const { subscription_id } = subscribeSchema.parse(req.body);
      const data = await organizerSubscriptionsService.subscribeToPlan(req.user.sub, subscription_id);
      res.status(200).json(ApiResponse.success(data, 'Subscription activated successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrganizerSubscriptionsController();

