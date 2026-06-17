const express = require('express');
const OrganizerSubscriptionsController = require('./organizerSubscriptions.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

// PayOS webhook — no auth middleware
router.post('/payos/webhook', async (req, res) => {
  try {
    const organizerSubscriptionsService = require('./organizerSubscriptions.service');
    const result = await organizerSubscriptionsService.handlePayosWebhook(req.body);
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message });
  }
});

router.use(protect, authorize('ORGANIZER', 'organizer'));

router.get('/current-plan',                         OrganizerSubscriptionsController.getCurrentPlan);
router.post('/subscribe',                           OrganizerSubscriptionsController.subscribe);
router.get('/payment-status/:paymentId',            OrganizerSubscriptionsController.getPaymentStatus);

module.exports = router;
