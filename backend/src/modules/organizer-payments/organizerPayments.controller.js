const organizerPaymentsService = require('./organizerPayments.service');
const ApiResponse = require('../../core/response/ApiResponse');

class OrganizerPaymentsController {
  async getChannel(req, res, next) {
    try {
      const channel = await organizerPaymentsService.getChannel(req.user.sub);
      res.json(ApiResponse.success(channel));
    } catch (error) {
      next(error);
    }
  }

  async saveChannel(req, res, next) {
    try {
      const channel = await organizerPaymentsService.saveChannel(req.user.sub, req.body);
      res.json(ApiResponse.success(channel));
    } catch (error) {
      next(error);
    }
  }

  async testConnection(req, res, next) {
    try {
      const channel = await organizerPaymentsService.testConnection(req.user.sub);
      res.json(ApiResponse.success(channel, 'Kết nối thành công. Kênh đã ACTIVE.'));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrganizerPaymentsController();
