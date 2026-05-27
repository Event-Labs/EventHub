const authService = require('./auth.service');
const ApiResponse = require('../../core/response/ApiResponse');
const {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verifyEmailSchema
} = require('./auth.validation');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class AuthController {
    cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    register = async (req, res, next) => {
        try {
            const validatedData = registerSchema.parse(req.body);
            const user = await authService.register(validatedData);
            res.status(201).json(ApiResponse.success(user, 'User registered. Please check email for verification.'));
        } catch (err) {
            next(err);
        }
    };

    login = async (req, res, next) => {
        try {
            const validatedData = loginSchema.parse(req.body);
            const deviceInfo = {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
            };

            const { user, accessToken, refreshToken } = await authService.login(
                validatedData.email,
                validatedData.password,
                deviceInfo
            );

            res.cookie('refresh_token', refreshToken, this.cookieOptions);
            res.status(200).json(ApiResponse.success({ user, accessToken }, 'Login successful'));
        } catch (err) {
            next(err);
        }
    };

    refresh = async (req, res, next) => {
        try {
            const token = req.cookies.refresh_token;
            if (!token) {
                throw new AppError('Refresh token not found', 401, ErrorCodes.AUTH_INVALID_TOKEN);
            }

            const deviceInfo = {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
            };

            const { accessToken, refreshToken } = await authService.refresh(token, deviceInfo);

            res.cookie('refresh_token', refreshToken, this.cookieOptions);
            res.status(200).json(ApiResponse.success({ accessToken }, 'Token refreshed'));
        } catch (err) {
            next(err);
        }
    };

    logout = async (req, res, next) => {
        try {
            const token = req.cookies.refresh_token;
            if (token) {
                await authService.logout(token);
            }
            res.clearCookie('refresh_token', { path: '/api/auth' });
            res.status(200).json(ApiResponse.success(null, 'Logged out successfully'));
        } catch (err) {
            next(err);
        }
    };

    forgotPassword = async (req, res, next) => {
        try {
            const { email } = forgotPasswordSchema.parse(req.body);
            await authService.forgotPassword(email);
            res.status(200).json(ApiResponse.success(null, 'Reset link sent if email exists'));
        } catch (err) {
            next(err);
        }
    };

    resetPassword = async (req, res, next) => {
        try {
            const { token, newPassword } = resetPasswordSchema.parse(req.body);
            await authService.resetPassword(token, newPassword);
            res.status(200).json(ApiResponse.success(null, 'Password has been reset'));
        } catch (err) {
            next(err);
        }
    };

    verifyEmail = async (req, res, next) => {
        try {
            const { token } = verifyEmailSchema.parse(req.query); // Usually from query param in link
            await authService.verifyEmail(token);
            res.status(200).json(ApiResponse.success(null, 'Email verified successfully'));
        } catch (err) {
            next(err);
        }
    };
}

module.exports = new AuthController();
