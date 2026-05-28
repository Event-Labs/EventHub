const ApiResponse = require('../../core/response/ApiResponse');
const userService = require('./user.service');

class UserController {
    getProfile = async (req, res, next) => {
        try {
            const profile = await userService.getProfile(req.user.sub);
            res.status(200).json(ApiResponse.success(profile, 'Cấu hình hồ sơ đã được tải thành công'));
        } catch (err) {
            next(err);
        }
    };

    updateProfile = async (req, res, next) => {
        try {
            const profile = await userService.updateProfile(req.user.sub, req.body);
            res.status(200).json(ApiResponse.success(profile, 'Cập nhật hồ sơ thành công'));
        } catch (err) {
            next(err);
        }
    };

    changePassword = async (req, res, next) => {
        try {
            const { currentPassword, newPassword } = req.body;
            await userService.changePassword(req.user.sub, currentPassword, newPassword);
            res.status(200).json(ApiResponse.success(null, 'Đổi mật khẩu thành công'));
        } catch (err) {
            next(err);
        }
    };
}

module.exports = new UserController();
