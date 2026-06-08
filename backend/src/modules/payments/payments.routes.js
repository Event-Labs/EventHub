const express = require('express');
const paymentsController = require('./payments.controller');

const router = express.Router();

router.post('/payos/webhook', paymentsController.payosWebhook);

module.exports = router;
