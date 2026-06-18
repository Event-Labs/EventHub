const ApiResponse = require('../../core/response/ApiResponse');
const organizerSubscriptionsService = require('./organizerSubscriptions.service');
const logger = require('../../core/logger');
const { z } = require('zod');

const subscribeSchema = z.object({
  subscription_id: z.string().uuid(),
});

const paymentIdSchema = z.object({
  paymentId: z.string().uuid(),
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
      const message = data.requires_payment
        ? 'Payment link created. Please complete payment via PayOS.'
        : 'Subscription activated successfully';
      res.status(200).json(ApiResponse.success(data, message));
    } catch (err) {
      logger.error('[OrganizerSubscriptionsController] subscribe error:', err);
      next(err);
    }
  };

  getPaymentStatus = async (req, res, next) => {
    try {
      const { paymentId } = paymentIdSchema.parse(req.params);
      const data = await organizerSubscriptionsService.getPaymentStatus(req.user.sub, paymentId);
      res.status(200).json(ApiResponse.success(data, 'Payment status fetched'));
    } catch (err) {
      logger.error('[OrganizerSubscriptionsController] getPaymentStatus error:', err);
      next(err);
    }
  };

  // Called by PayOS webhook (no auth)
  static handleWebhook = async (req, res) => {
    try {
      const result = await organizerSubscriptionsService.handlePayosWebhook(req.body);
      res.status(200).json({ ok: true, result });
    } catch (err) {
      logger.error('[OrganizerSubscriptionsController] webhook error:', err);
      res.status(200).json({ ok: false, error: err.message }); // always 200 to PayOS
    }
  };
}

module.exports = new OrganizerSubscriptionsController();
