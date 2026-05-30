const express = require('express');
const feedbacksController = require('../feedbacks/feedbacks.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/events', feedbacksController.getOrganizerEvents);
router.get('/events/:eventId/report', feedbacksController.getEventReport);

module.exports = router;
