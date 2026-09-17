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

// Get event details for review
router.get('/:eventId', eventsAdminController.getEventDetail);

// Review event (approve / reject)
router.patch('/:eventId/review', eventsAdminController.reviewEvent);

// AI-assisted Review
router.get('/:eventId/ai-review', eventsAdminController.getAiReview);
router.post('/:eventId/ai-review', eventsAdminController.runAiReview);

// Hide / unhide event
router.patch('/:eventId/hide',   eventsAdminController.hideEvent);
router.patch('/:eventId/unhide', eventsAdminController.unhideEvent);

module.exports = router;



