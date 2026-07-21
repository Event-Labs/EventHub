const express = require('express');
const adminProfileController = require('./profile.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

router.get('/security-status', adminProfileController.securityStatus);
router.get('/security-check', adminProfileController.securityCheck);
router.get('/sessions', adminProfileController.sessions);
router.post('/2fa/start', adminProfileController.startTwoFactor);
router.post('/2fa/verify', adminProfileController.verifyTwoFactor);

module.exports = router;
