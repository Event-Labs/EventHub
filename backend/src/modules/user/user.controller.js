const ApiResponse = require('../../core/response/ApiResponse');
const userService = require('./user.service');

class UserController {
    getProfile = async (req, res, next) => {
        try {
            const profile = await userService.getProfile(req.user.sub);
            res.status(200).json(ApiResponse.success(profile, 'Cau hinh ho so da duoc tai thanh cong'));
        } catch (err) {
            next(err);
        }
    };

    updateProfile = async (req, res, next) => {
        try {
            const profile = await userService.updateProfile(req.user.sub, req.body);
            res.status(200).json(ApiResponse.success(profile, 'Cap nhat ho so thanh cong'));
        } catch (err) {
            next(err);
        }
    };

    changePassword = async (req, res, next) => {
        try {
            const { currentPassword, newPassword } = req.body;
            await userService.changePassword(req.user.sub, currentPassword, newPassword);
            res.status(200).json(ApiResponse.success(null, 'Doi mat khau thanh cong'));
        } catch (err) {
            next(err);
        }
    };

    securityStatus = async (req, res, next) => {
        try {
            const data = await userService.getSecurityStatus(req.user.sub);
            res.status(200).json(ApiResponse.success(data, 'Trang thai bao mat tai khoan'));
        } catch (err) {
            next(err);
        }
    };

    securityCheck = async (req, res, next) => {
        try {
            const data = await userService.checkSecurity(req.user.sub);
            res.status(200).json(ApiResponse.success(data, 'Kiem tra bao mat thanh cong'));
        } catch (err) {
            next(err);
        }
    };

    startTwoFactor = async (req, res, next) => {
        try {
            const data = await userService.startTwoFactorSetup(req.user.sub, req.body?.enabled);
            res.status(200).json(ApiResponse.success(data, 'Ma OTP da duoc gui den email'));
        } catch (err) {
            next(err);
        }
    };

    verifyTwoFactor = async (req, res, next) => {
        try {
            const data = await userService.verifyTwoFactorSetup(
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

module.exports = new UserController();
