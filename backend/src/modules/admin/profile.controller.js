const ApiResponse = require('../../core/response/ApiResponse');
const adminProfileService = require('./profile.service');

class AdminProfileController {
  securityCheck = async (req, res, next) => {
    try {
      const data = await adminProfileService.securityCheck(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Kiểm tra bảo mật thành công'));
    } catch (err) {
      next(err);
    }
  };

  securityStatus = async (req, res, next) => {
    try {
      const data = await adminProfileService.getSecurityStatus(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Trạng thái kiểm tra bảo mật'));
    } catch (err) {
      next(err);
    }
  };

  sessions = async (req, res, next) => {
    try {
      const data = await adminProfileService.listSessions(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Danh sách phiên đăng nhập'));
    } catch (err) {
      next(err);
    }
  };

  startTwoFactor = async (req, res, next) => {
    try {
      const data = await adminProfileService.startTwoFactorSetup(req.user.sub, req.body?.enabled);
      res.status(200).json(ApiResponse.success(data, 'Ma OTP da duoc gui den email quan tri'));
    } catch (err) {
      next(err);
    }
  };

  verifyTwoFactor = async (req, res, next) => {
    try {
      const data = await adminProfileService.verifyTwoFactorSetup(
        req.user.sub,
        String(req.body?.challengeId || ''),
        String(req.body?.otp || ''),
      );
      res.status(200).json(ApiResponse.success(data, 'Cap nhat xac thuc 2 lop thanh cong'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AdminProfileController();
