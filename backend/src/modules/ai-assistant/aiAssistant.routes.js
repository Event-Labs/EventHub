const express = require('express');
const aiAssistantController = require('./aiAssistant.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');

const router = express.Router();

router.post('/chat', optionalAuth, aiAssistantController.chat);

module.exports = router;
