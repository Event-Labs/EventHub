const ApiResponse = require('../../core/response/ApiResponse');
const ticketsService = require('./tickets.service');

class TicketsController {
  getMyTickets = async (req, res, next) => {
    try {
      const data = await ticketsService.getMyTickets(req.user.sub, req.query);
      res.status(200).json(ApiResponse.success(data, 'Tickets fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getTicketDetail = async (req, res, next) => {
    try {
      const data = await ticketsService.getTicketDetail(req.user.sub, req.params.ticketId);
      res.status(200).json(ApiResponse.success(data, 'Ticket fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  downloadTicket = async (req, res, next) => {
    try {
      const file = await ticketsService.generateTicketDownload(req.user.sub, req.params.ticketId);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.status(200).send(file.content);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new TicketsController();
