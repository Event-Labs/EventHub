const express = require('express');
const organizerBillingController = require('./organizerBilling.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ORGANIZER', 'organizer'));

router.get('/current-plan', organizerBillingController.getCurrentPlan);
router.post('/subscribe', organizerBillingController.subscribe);

module.exports = router;
