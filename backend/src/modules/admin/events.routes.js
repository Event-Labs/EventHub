const express = require('express');
const eventsAdminController = require('./events.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

const eventsListAdminController = require('./events.list.controller');

// List pending review events
router.get('/pending', eventsListAdminController.listPendingReview);

// Review event (approve / reject)
router.patch('/:eventId/review', eventsAdminController.reviewEvent);

// Hide / unhide event
router.patch('/:eventId/hide',   eventsAdminController.hideEvent);
router.patch('/:eventId/unhide', eventsAdminController.unhideEvent);

module.exports = router;


