const organizerSubscriptionsRepository = require("./organizerSubscriptions.repository");
const subscriptionsRepository = require("../admin/subscriptions.repository");
const AppError = require("../../core/errors/AppError");
const ErrorCodes = require("../../core/errors/errorCodes");

class OrganizerSubscriptionsService {
  async getCurrentPlan(userId) {
    const current =
      await organizerSubscriptionsRepository.findCurrentSubscription(userId);

    if (!current) {
      return { active: false, plan: null, days_remaining: null };
    }

    return {
      active: true,
      plan: current,
      days_remaining: current.end_date
        ? Math.max(
            0,
            Math.ceil(
              (new Date(current.end_date) - new Date()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null,
    };
  }

  async subscribeToPlan(userId, subscriptionId) {
    const plan = await subscriptionsRepository.findById(subscriptionId);
    if (!plan || !plan.is_active) {
      throw new AppError(
        "Gói dịch vụ không tồn tại hoặc đã bị vô hiệu hoá.",
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    // Activate subscription immediately (no external payment flow)
    await organizerSubscriptionsRepository.cancelActiveSubscriptions(userId);
    const newSub =
      await organizerSubscriptionsRepository.activateNewSubscription(
        userId,
        subscriptionId,
        plan.duration_days || 30,
      );

    return newSub;
  }
}

module.exports = new OrganizerSubscriptionsService();
