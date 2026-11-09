const ApiResponse = require('../../core/response/ApiResponse');
const refundsService = require('./refunds.service');
const {
  requestRefundSchema,
  processRefundSchema,
  refundQuerySchema,
  uuidParamSchema,
} = require('./refunds.validation');

const eventBusinessRulesService = require('../events/eventBusinessRules.service');

const getUserRole = (user) => {
  if (!user) return 'CUSTOMER';
  if (Array.isArray(user.roles)) {
    if (user.roles.includes('ADMIN')) return 'ADMIN';
    if (user.roles.includes('ORGANIZER')) return 'ORGANIZER';
    return user.roles[0] || 'CUSTOMER';
  }
  return user.role || 'CUSTOMER';
};

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

  submitPayoutInfo = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.submitPayoutInfo(req.user.sub, req.body);
      res.status(200).json(ApiResponse.success(data, 'Đã ghi nhận thông tin tài khoản nhận tiền hoàn'));
    } catch (error) {
      next(error);
    }
  };

  disputeRefund = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.disputeRefund(req.user.sub, req.params.id, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã ghi nhận khiếu nại chưa nhận được tiền'));
    } catch (error) {
      next(error);
    }
  };

  confirmReceivedRefund = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.confirmReceivedRefund(req.user.sub, req.params.id);
      res.status(200).json(ApiResponse.success(data, 'Đã xác nhận nhận tiền thành công'));
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
      const data = await refundsService.getRefundDetail(id, req.user.sub, getUserRole(req.user));
      res.status(200).json(ApiResponse.success(data, 'Chi tiết yêu cầu hoàn tiền'));
    } catch (error) {
      next(error);
    }
  };

  getOrganizerRefunds = async (req, res, next) => {
    try {
      const filters = refundQuerySchema.parse(req.query);
      const data = await refundsService.getOrganizerRefunds(req.user.sub, filters, getUserRole(req.user));
      res.status(200).json(ApiResponse.success(data, 'Danh sách yêu cầu hoàn tiền của sự kiện'));
    } catch (error) {
      next(error);
    }
  };

  processRefund = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const payload = processRefundSchema.parse(req.body);
      const data = await refundsService.processRefundByOrganizer(req.user.sub, id, payload, req.user.sub, getUserRole(req.user));
      res.status(200).json(ApiResponse.success(data, 'Đã xử lý yêu cầu hoàn tiền thành công'));
    } catch (error) {
      next(error);
    }
  };

  batchProcessRefunds = async (req, res, next) => {
    try {
      const { refund_ids, action = 'APPROVE', refund_method = 'PAYOS', organizer_note } = req.body || {};
      if (!Array.isArray(refund_ids) || refund_ids.length === 0) {
        throw new AppError('Vui lòng chọn ít nhất một yêu cầu hoàn tiền để xử lý.', 400, ErrorCodes.INVALID_INPUT);
      }
      if (refund_method !== 'PAYOS') {
        throw new AppError(
          'Xử lý hàng loạt chỉ hỗ trợ phương thức "Hoàn tiền tự động qua PayOS". Với hình thức chuyển khoản thủ công, Ban tổ chức vui lòng xử lý từng yêu cầu để nhập mã giao dịch và tải lên biên lai đối soát theo đúng quy định.',
          400,
          ErrorCodes.INVALID_INPUT,
        );
      }
      const data = await refundsService.batchProcessRefundsByOrganizer(
        req.user.sub,
        refund_ids,
        { action, refund_method: 'PAYOS', organizer_note },
        req.user.sub,
        getUserRole(req.user),
      );
      res.status(200).json(ApiResponse.success(data, `Đã xử lý xong ${data.successCount}/${data.total} yêu cầu hoàn tiền.`));
    } catch (error) {
      next(error);
    }
  };

  previewRefund = async (req, res, next) => {
    try {
      const ticketId = req.query.ticket_id || null;
      const orderId = req.query.order_id || null;
      const data = await refundsService.previewRefund(req.user.sub, ticketId, orderId);
      res.status(200).json(ApiResponse.success(data, 'Thông tin xem trước hoàn tiền'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new RefundsController();
