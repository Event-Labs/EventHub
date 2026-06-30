const express = require('express');
const organizerRequestsController = require('./organizerRequests.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/verify-business-email', organizerRequestsController.verifyBusinessEmail);
router.post('/me', protect, organizerRequestsController.submitMine);
router.get('/me', protect, organizerRequestsController.getMine);

module.exports = router;
