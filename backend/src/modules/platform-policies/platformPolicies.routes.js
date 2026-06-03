const express = require('express');
const platformFinanceController = require('../admin/platformFinance.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/', platformFinanceController.listActivePolicies);
router.get(
  '/organizer',
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
  platformFinanceController.listActivePolicies,
);

module.exports = router;
