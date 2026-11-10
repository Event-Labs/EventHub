const express = require('express');
const aiAssistantController = require('./aiAssistant.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

// Rate limiter for AI chat: 30 requests per minute per IP to prevent DoS & resource exhaustion
const chatRateLimiter = createRateLimiter(
  60 * 1000,
  30,
  'Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau giây lát để Eve kịp phản hồi nhé! 🥰'
);

router.post('/chat', chatRateLimiter, optionalAuth, aiAssistantController.chat);
router.get('/sessions', protect, aiAssistantController.getSessions);
router.post('/sessions', protect, aiAssistantController.saveSession);
router.post('/sessions/sync', protect, aiAssistantController.syncSessions);
router.delete('/sessions/:sessionId', protect, aiAssistantController.deleteSession);
router.get('/training-stats', protect, aiAssistantController.getTrainingStats);

module.exports = router;
