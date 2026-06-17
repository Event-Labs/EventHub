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
    max_active_events: Number(row.max_active_events || 0),
    max_tickets_per_event: Number(row.max_tickets_per_event || 0),
    max_staff_per_event: Number(row.max_staff_per_event || 0),
    max_ticket_types_per_event: Number(row.max_ticket_types_per_event || 0),
    max_promo_codes_per_event: Number(row.max_promo_codes_per_event || 0),
    subscriber_count: Number(row.subscriber_count || 0),
    promo_code_enabled: Boolean(row.promo_code_enabled),
    seat_map_enabled: Boolean(row.seat_map_enabled),
    manual_checkin_enabled: Boolean(row.manual_checkin_enabled),
    attendee_export_enabled: Boolean(row.attendee_export_enabled),
    advanced_analytics_enabled: Boolean(row.advanced_analytics_enabled),
    ai_report_enabled: Boolean(row.ai_report_enabled),
    custom_branding_enabled: Boolean(row.custom_branding_enabled),
    analytics_enabled: Boolean(row.analytics_enabled),
    priority_support: Boolean(row.priority_support),
    is_active: Boolean(row.is_active),
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
