const express = require('express');
const ticketsController = require('./tickets.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/me', ticketsController.getMyTickets);
router.get('/:ticketId', ticketsController.getTicketDetail);
router.get('/:ticketId/download', ticketsController.downloadTicket);

module.exports = router;
