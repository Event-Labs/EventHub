const express = require('express');
const ticketsController = require('./tickets.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/me', ticketsController.getMyTickets);
router.post('/staff/check-in/qr', authorize('STAFF'), ticketsController.staffCheckInByQr);
router.post('/staff/search', authorize('STAFF'), ticketsController.staffSearchTickets);
router.patch('/staff/:ticketId/check-in', authorize('STAFF'), ticketsController.staffCheckInTicket);
router.get('/:ticketId', ticketsController.getTicketDetail);
router.get('/:ticketId/download', ticketsController.downloadTicket);

module.exports = router;
