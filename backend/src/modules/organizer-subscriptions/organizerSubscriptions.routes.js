const express = require('express');
const organizerSubscriptionsController = require('./organizerSubscriptions.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ORGANIZER', 'organizer'));

router.get('/current-plan', organizerSubscriptionsController.getCurrentPlan);
router.post('/subscribe', organizerSubscriptionsController.subscribe);

module.exports = router;

