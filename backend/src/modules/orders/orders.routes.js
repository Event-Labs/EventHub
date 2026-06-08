const express = require('express');
const ordersController = require('./orders.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/checkout', ordersController.checkout);
router.get('/:orderId/status', ordersController.status);
router.post('/:orderId/cancel', ordersController.cancel);

module.exports = router;
