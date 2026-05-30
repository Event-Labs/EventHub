const subscriptionsRepository = require('./subscriptions.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

function mapSubscription(row) {
  if (!row) return row;

  return {
    ...row,
    price: Number(row.price),
    duration_days: Number(row.duration_days || 30),
    event_limit: Number(row.event_limit || 0),
    staff_limit: Number(row.staff_limit || 0),
    subscriber_count: Number(row.subscriber_count || 0),
    features: Array.isArray(row.features) ? row.features : [],
    is_active: Boolean(row.is_active),
    analytics_enabled: Boolean(row.analytics_enabled),
    priority_support: Boolean(row.priority_support),
  };
}

class SubscriptionsService {
  async listSubscriptions() {
    const rows = await subscriptionsRepository.findAll();
    return rows.map(mapSubscription);
  }

  async createSubscription(payload) {
    const subscription = await subscriptionsRepository.create(payload);
    return mapSubscription(subscription);
  }

  async updateSubscription(id, payload) {
    const subscription = await subscriptionsRepository.findById(id);
    if (!subscription) {
      throw new AppError('Subscription not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const updated = await subscriptionsRepository.update(id, payload);
    return mapSubscription(updated);
  }

  async deleteSubscription(id) {
    const subscription = await subscriptionsRepository.findById(id);
    if (!subscription) {
      throw new AppError('Subscription not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    await subscriptionsRepository.softDelete(id);
    return { id, deleted: true };
  }
}

module.exports = new SubscriptionsService();
