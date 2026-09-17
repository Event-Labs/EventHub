const express = require('express');
const refundsController = require('./refunds.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin'));

router.get('/', refundsController.getOrganizerRefunds);
router.get('/:id', refundsController.getRefundDetail);
router.patch('/:id/process', refundsController.processRefund);

module.exports = router;
