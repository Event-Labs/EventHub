const express = require('express');
const multer = require('multer');
const organizerRequestsController = require('./organizerRequests.controller');
const cccdController = require('../cccd/cccd.controller');
const { protect } = require('../../middlewares/auth.middleware');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

const cccdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận tệp ảnh định dạng JPG, PNG hoặc WEBP.'), false);
    }
  },
});

const cccdRateLimiter = createRateLimiter(
  5 * 60 * 1000,
  15,
  'Bạn đã gửi quá nhiều yêu cầu quét CCCD. Vui lòng thử lại sau 5 phút.'
);

router.get('/verify-business-email', organizerRequestsController.verifyBusinessEmail);
router.post('/cccd/scan', protect, cccdRateLimiter, cccdUpload.single('card_image'), cccdController.scanCccd);
router.post('/me', protect, organizerRequestsController.submitMine);
router.get('/me', protect, organizerRequestsController.getMine);
router.get('/me/history', protect, organizerRequestsController.listMine);
router.post('/me/profile-update', protect, organizerRequestsController.submitProfileUpdate);
router.put('/me/:id', protect, organizerRequestsController.updateMine);

module.exports = router;
