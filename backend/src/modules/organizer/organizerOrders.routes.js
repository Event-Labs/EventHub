const express = require('express');
const organizerOrdersController = require('./organizerOrders.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/', organizerOrdersController.listOrders);
router.get('/revenue', organizerOrdersController.getRevenueStats);
router.get('/ticket-sales', organizerOrdersController.getTicketSalesAnalytics);
router.post('/financial-summary', organizerOrdersController.generateFinancialSummary);
router.get('/events/:eventId/attendees', organizerOrdersController.listAttendees);
router.get('/events/:eventId/checkin-stats', organizerOrdersController.getCheckinStats);
router.get('/:orderId', organizerOrdersController.getOrderDetail);

module.exports = router;
