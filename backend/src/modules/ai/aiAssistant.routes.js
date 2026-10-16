const express = require('express');
const aiAssistantController = require('./aiAssistant.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/chat', optionalAuth, aiAssistantController.chat);
router.get('/sessions', protect, aiAssistantController.getSessions);
router.post('/sessions', protect, aiAssistantController.saveSession);
router.post('/sessions/sync', protect, aiAssistantController.syncSessions);
router.delete('/sessions/:sessionId', protect, aiAssistantController.deleteSession);
router.get('/training-stats', aiAssistantController.getTrainingStats);

module.exports = router;
