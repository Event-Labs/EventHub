const ApiResponse = require('../../core/response/ApiResponse');
const refundsService = require('./refunds.service');
const {
  requestRefundSchema,
  processRefundSchema,
  refundQuerySchema,
  uuidParamSchema,
} = require('./refunds.validation');

class RefundsController {
  submitRefundRequest = async (req, res, next) => {
    try {
      const payload = requestRefundSchema.parse(req.body);
      const data = await refundsService.submitRefundRequest(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Đã gửi yêu cầu hoàn tiền thành công'));
    } catch (error) {
      next(error);
    }
  };

  getMyRefundRequests = async (req, res, next) => {
    try {
      const filters = refundQuerySchema.parse(req.query);
      const data = await refundsService.getCustomerRefunds(req.user.sub, filters);
      res.status(200).json(ApiResponse.success(data, 'Danh sách yêu cầu hoàn tiền'));
    } catch (error) {
      next(error);
    }
  };

  getRefundDetail = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const data = await refundsService.getRefundDetail(id, req.user.sub, req.user.role);
      res.status(200).json(ApiResponse.success(data, 'Chi tiết yêu cầu hoàn tiền'));
    } catch (error) {
      next(error);
    }
  };

  getOrganizerRefunds = async (req, res, next) => {
    try {
      const filters = refundQuerySchema.parse(req.query);
      const data = await refundsService.getOrganizerRefunds(req.user.sub, filters, req.user.role);
      res.status(200).json(ApiResponse.success(data, 'Danh sách yêu cầu hoàn tiền của sự kiện'));
    } catch (error) {
      next(error);
    }
  };

  processRefund = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const payload = processRefundSchema.parse(req.body);
      const data = await refundsService.processRefundByOrganizer(req.user.sub, id, payload, req.user.sub, req.user.role);
      res.status(200).json(ApiResponse.success(data, 'Đã xử lý yêu cầu hoàn tiền thành công'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new RefundsController();
