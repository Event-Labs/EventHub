const express = require('express');
const authController = require('./auth.controller');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

// Rate limiters
const authLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many login attempts, please try again after 15 minutes.');
const registerLimiter = createRateLimiter(60 * 60 * 1000, 5, 'Too many accounts created from this IP, please try again after an hour.');
const tokenLimiter = createRateLimiter(60 * 60 * 1000, 3, 'Too many requests, please try again after an hour.');

router.post('/register', registerLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/verify-admin-otp', authLimiter, authController.verifyAdminOtp);
router.post('/google', authLimiter, authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

router.post('/forgot-password', tokenLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

module.exports = router;
