const express = require('express');
const ticketsController = require('./tickets.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('STAFF'));

router.post('/check-in/qr', ticketsController.staffCheckInByQr);
router.post('/search', ticketsController.staffSearchTickets);
router.patch('/:ticketId/check-in', ticketsController.staffCheckInTicket);

module.exports = router;
