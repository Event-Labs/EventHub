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

// AI Auto-Review Settings, Single Run, Batch Run, Cancel & Scan Status
router.get('/settings/auto-review', eventsAdminController.getAutoReviewSettings);
router.patch('/settings/auto-review', eventsAdminController.updateAutoReviewSettings);
router.post('/auto-review/single', eventsAdminController.runSingleAutoReview);
router.post('/auto-review/batch', eventsAdminController.runBatchAutoReview);
router.post('/auto-review/cancel', eventsAdminController.cancelAutoReview);
router.get('/auto-review/scan-status', eventsAdminController.getAutoReviewScanStatus);

// AI Review Criteria Management (Điều khoản duyệt sự kiện)
router.get('/review-criteria', eventsAdminController.listReviewCriteria);
router.post('/review-criteria', eventsAdminController.createReviewCriteria);
router.post('/review-criteria/reset-defaults', eventsAdminController.resetDefaultReviewCriteria);
router.get('/review-criteria/:id', eventsAdminController.getReviewCriteriaById);
router.put('/review-criteria/:id', eventsAdminController.updateReviewCriteria);
router.delete('/review-criteria/:id', eventsAdminController.deleteReviewCriteria);

// Document inline preview proxy & text extraction
router.get('/documents/preview', eventsAdminController.previewDocument);
router.get('/documents/extract-text', eventsAdminController.extractDocumentText);

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

// Suspend / Unsuspend (Section 5.5)
router.post('/:eventId/suspend',   eventsAdminController.suspendEvent);
router.post('/:eventId/unsuspend', eventsAdminController.unsuspendEvent);

// Cancellation Requests (Section 6.5)
router.post('/:eventId/cancellation-requests/approve', eventsAdminController.approveCancellationRequest);
router.post('/:eventId/cancellation-requests/reject', eventsAdminController.rejectCancellationRequest);

// Force Cancel & Cooling-off (Section 6.6 & 15.10)
router.post('/:eventId/force-cancel', eventsAdminController.initiateForceCancel);
router.post('/:eventId/force-cancel/confirm', eventsAdminController.confirmForceCancel);
// Revisions Review (Section 4.4 & 4.5)
router.post('/:eventId/revisions/review', eventsAdminController.reviewRevision);

module.exports = router;



