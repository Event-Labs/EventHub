const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const authRepository = require('../auth/auth.repository');
const organizersRepository = require('./organizers.repository');

function mapMoney(value) {
  return Number(value || 0);
}

function mapOrganizer(row) {
  if (!row) return null;

  return {
    ...row,
    gross_revenue: mapMoney(row.gross_revenue),
    total_discount: mapMoney(row.total_discount),
    plan_price: row.plan_price !== null && row.plan_price !== undefined ? mapMoney(row.plan_price) : null,
  };
}

class AdminOrganizersService {
  async listOrganizers(filters) {
    const result = await organizersRepository.findAll(filters);
    return {
      ...result,
      organizers: result.organizers.map(mapOrganizer),
    };
  }

  async getOrganizerDetails(id) {
    const organizer = await organizersRepository.findById(id);
    if (!organizer) {
      throw new AppError('Không tìm thấy organizer.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const [events, subscriptionHistory, requestHistory, paymentChannels] = await Promise.all([
      organizersRepository.findEvents(id),
      organizersRepository.findSubscriptionHistory(id),
      organizersRepository.findRequestHistory(organizer.user_id),
      organizersRepository.findPaymentChannels(id),
    ]);

    return {
      organizer: mapOrganizer(organizer),
      events: events.map((event) => ({
        ...event,
        gross_revenue: mapMoney(event.gross_revenue),
      })),
      recent_events: events.slice(0, 5),
      subscription_history: subscriptionHistory.map((item) => ({
        ...item,
        plan_price: item.plan_price !== null && item.plan_price !== undefined ? mapMoney(item.plan_price) : null,
      })),
      request_history: requestHistory,
      payment_channels: paymentChannels,
    };
  }

  async updateOrganizerStatus(id, status) {
    const organizer = await organizersRepository.findById(id);
    if (!organizer) {
      throw new AppError('Không tìm thấy organizer.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (organizer.status === status) {
      return this.getOrganizerDetails(id);
    }

    const updated = await organizersRepository.updateStatus(id, status);
    if (!updated) {
      throw new AppError('Không thể cập nhật trạng thái organizer.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    if (status !== 'ACTIVE') {
      await authRepository.revokeAllUserSessions(updated.user_id);
    }

    return this.getOrganizerDetails(id);
  }
}

module.exports = new AdminOrganizersService();
