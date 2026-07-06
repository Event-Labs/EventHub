const express = require('express');
const ordersController = require('./orders.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get(
  '/staff/direct-booking/events',
  authorize('STAFF', 'ADMIN', 'SUPER_ADMIN'),
  ordersController.staffDirectBookingEvents,
);
router.get(
  '/staff/direct-booking/:orderId/status',
  authorize('STAFF', 'ADMIN', 'SUPER_ADMIN'),
  ordersController.staffDirectBookingStatus,
);
router.post(
  '/staff/direct-booking',
  authorize('STAFF', 'ADMIN', 'SUPER_ADMIN'),
  ordersController.createStaffDirectBooking,
);
router.post('/checkout', ordersController.checkout);
router.get('/:orderId/status', ordersController.status);
router.post('/:orderId/cancel', ordersController.cancel);

module.exports = router;
