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
}

module.exports = new AdminProfileController();
