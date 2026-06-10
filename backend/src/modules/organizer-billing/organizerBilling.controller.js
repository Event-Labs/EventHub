const ApiResponse = require('../../core/response/ApiResponse');
const organizerBillingService = require('./organizerBilling.service');
const { z } = require('zod');

const subscribeSchema = z.object({
  subscription_id: z.string().uuid(),
});

class OrganizerBillingController {
  getCurrentPlan = async (req, res, next) => {
    try {
      const data = await organizerBillingService.getCurrentPlan(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Current plan fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  subscribe = async (req, res, next) => {
    try {
      const { subscription_id } = subscribeSchema.parse(req.body);
      const data = await organizerBillingService.subscribeToPlan(req.user.sub, subscription_id);
      res.status(200).json(ApiResponse.success(data, 'Đăng ký gói thành công!'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrganizerBillingController();
