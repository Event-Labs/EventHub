const express = require('express');
const refundsController = require('./refunds.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/', refundsController.submitRefundRequest);
router.post('/payout-info', refundsController.submitPayoutInfo);
router.post('/:id/dispute', refundsController.disputeRefund);
router.post('/:id/confirm', refundsController.confirmReceivedRefund);
router.get('/preview', refundsController.previewRefund);
router.get('/my-requests', refundsController.getMyRefundRequests);
router.get('/:id', refundsController.getRefundDetail);

module.exports = router;
