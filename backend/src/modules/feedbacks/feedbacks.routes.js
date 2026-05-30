const express = require('express');
const feedbacksController = require('./feedbacks.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/eligible-events', feedbacksController.getEligibleEvents);
router.post('/', feedbacksController.submit);

module.exports = router;
