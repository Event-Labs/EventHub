const express = require('express');
const userController = require('./user.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/me', protect, userController.getProfile);
router.patch('/me', protect, userController.updateProfile);
router.patch('/me/password', protect, userController.changePassword);
router.get('/me/security-status', protect, userController.securityStatus);
router.get('/me/security-check', protect, userController.securityCheck);
router.post('/me/2fa/start', protect, userController.startTwoFactor);
router.post('/me/2fa/verify', protect, userController.verifyTwoFactor);

module.exports = router;
