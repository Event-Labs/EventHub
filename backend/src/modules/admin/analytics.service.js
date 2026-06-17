const analyticsRepository = require('./analytics.repository');

class AdminAnalyticsService {
  async getOverviewStats(filters = {}) {
    return analyticsRepository.getOverviewStats(filters);
  }

  async getRevenueTrend(filters = {}) {
    return analyticsRepository.getRevenueTrend(filters);
  }

  async getUserRegistrationTrend(filters = {}) {
    return analyticsRepository.getUserRegistrationTrend(filters);
  }

  async getTopOrganizers(filters = {}) {
    return analyticsRepository.getTopOrganizers(filters);
  }

  async getSubscriptionRevenue() {
    return analyticsRepository.getSubscriptionRevenue();
  }

  async getEventsByCategory() {
    return analyticsRepository.getEventsByCategory();
  }
}

module.exports = new AdminAnalyticsService();
