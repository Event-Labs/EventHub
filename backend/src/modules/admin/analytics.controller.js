const ApiResponse = require('../../core/response/ApiResponse');
const logger = require('../../core/logger');
const analyticsService = require('./analytics.service');

class AdminAnalyticsController {
  getOverviewStats = async (req, res, next) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const data = await analyticsService.getOverviewStats({
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      res.status(200).json(ApiResponse.success(data, 'Analytics overview fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getOverviewStats error:', {
        message: err.message,
        stack:   err.stack,
        userId:  req.user?.sub,
        query:   req.query,
      });
      next(err);
    }
  };

  getRevenueTrend = async (req, res, next) => {
    try {
      const { dateFrom, dateTo, groupBy } = req.query;
      const data = await analyticsService.getRevenueTrend({
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
        groupBy:  groupBy  || 'day',
      });
      res.status(200).json(ApiResponse.success(data, 'Revenue trend fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getRevenueTrend error:', err);
      next(err);
    }
  };

  getUserRegistrationTrend = async (req, res, next) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const data = await analyticsService.getUserRegistrationTrend({
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      res.status(200).json(ApiResponse.success(data, 'User registration trend fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getUserRegistrationTrend error:', err);
      next(err);
    }
  };

  getTopOrganizers = async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
      const data = await analyticsService.getTopOrganizers({ limit });
      res.status(200).json(ApiResponse.success(data, 'Top organizers fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getTopOrganizers error:', err);
      next(err);
    }
  };

  getSubscriptionRevenue = async (req, res, next) => {
    try {
      const data = await analyticsService.getSubscriptionRevenue();
      res.status(200).json(ApiResponse.success(data, 'Subscription revenue fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getSubscriptionRevenue error:', err);
      next(err);
    }
  };

  getEventsByCategory = async (req, res, next) => {
    try {
      const data = await analyticsService.getEventsByCategory();
      res.status(200).json(ApiResponse.success(data, 'Events by category fetched successfully'));
    } catch (err) {
      logger.error('[AdminAnalyticsController] getEventsByCategory error:', err);
      next(err);
    }
  };
}

module.exports = new AdminAnalyticsController();
