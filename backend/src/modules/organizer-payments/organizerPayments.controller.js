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

  async savePayoutChannel(req, res, next) {
    try {
      const channel = await organizerPaymentsService.savePayoutChannel(req.user.sub, req.body);
      res.json(ApiResponse.success(channel, 'Cập nhật cài đặt Kênh chi thành công.'));
    } catch (error) {
      next(error);
    }
  }

  async testPayoutConnection(req, res, next) {
    try {
      const result = await organizerPaymentsService.testPayoutConnection(req.user.sub);
      res.json(ApiResponse.success(result, result.message || 'Kết nối Kênh chi thành công.'));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrganizerPaymentsController();
