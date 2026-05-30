const express = require('express');
const ordersController = require('./orders.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/checkout', ordersController.checkout);
router.get('/tickets/me', ordersController.getMyTickets);

module.exports = router;
