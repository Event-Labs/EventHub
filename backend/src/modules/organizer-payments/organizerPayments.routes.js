const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');
const organizerPaymentsController = require('./organizerPayments.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('organizer', 'admin', 'super_admin'));

// Rate limit: tối đa 5 requests / phút / organizer cho các thao tác lưu/test kết nối
const paymentActionLimiter = createRateLimiter(
  60 * 1000,
  5,
  'Bạn đã gửi quá nhiều yêu cầu cài đặt/kiểm tra thanh toán. Vui lòng thử lại sau 1 phút.',
  {
    keyGenerator: (req) => req.user?.sub || req.user?.id || 'anonymous',
  }
);

router.get('/channel', organizerPaymentsController.getChannel);
router.post('/channel', paymentActionLimiter, organizerPaymentsController.saveChannel);
router.post('/channel/test', paymentActionLimiter, organizerPaymentsController.testConnection);
router.post('/channel/payout', paymentActionLimiter, organizerPaymentsController.savePayoutChannel);
router.post('/channel/payout/test', paymentActionLimiter, organizerPaymentsController.testPayoutConnection);
router.get('/egress', organizerPaymentsController.getEgressGateway);

module.exports = router;

