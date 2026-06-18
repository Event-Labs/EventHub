const express = require('express');
const analyticsController = require('./analytics.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/overview',               analyticsController.getOverviewStats);
router.get('/revenue-trend',          analyticsController.getRevenueTrend);
router.get('/user-registration-trend', analyticsController.getUserRegistrationTrend);
router.get('/top-organizers',          analyticsController.getTopOrganizers);
router.get('/subscription-revenue',    analyticsController.getSubscriptionRevenue);
router.get('/events-by-category',      analyticsController.getEventsByCategory);

module.exports = router;
