const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const organizerPaymentsController = require('./organizerPayments.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('organizer', 'admin', 'super_admin'));

router.get('/channel', organizerPaymentsController.getChannel);
router.post('/channel', organizerPaymentsController.saveChannel);
router.post('/channel/test', organizerPaymentsController.testConnection);

module.exports = router;
