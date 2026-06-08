const express = require('express');
const aiFaqController = require('./aiFaq.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

const chatLimiter = createRateLimiter(
  15 * 60 * 1000,
  40,
  'Too many AI FAQ requests. Please wait before trying again.',
);

router.get('/meta', aiFaqController.getMeta);
router.post('/chat', chatLimiter, optionalAuth, aiFaqController.chat);
router.get('/history/me', protect, aiFaqController.getHistory);

module.exports = router;