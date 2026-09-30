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

// AI Auto-Review Settings & Batch Trigger
router.get('/settings/auto-review', eventsAdminController.getAutoReviewSettings);
router.patch('/settings/auto-review', eventsAdminController.updateAutoReviewSettings);
router.post('/auto-review/batch', eventsAdminController.runBatchAutoReview);

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



