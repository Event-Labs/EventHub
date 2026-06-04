const express = require('express');
const ordersController = require('./orders.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/checkout', ordersController.checkout);

module.exports = router;
