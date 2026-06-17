const express = require('express');
const organizerOrdersController = require('./organizerOrders.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/', organizerOrdersController.listOrders);
router.get('/events/:eventId/attendees', organizerOrdersController.listAttendees);
router.get('/:orderId', organizerOrdersController.getOrderDetail);

module.exports = router;
