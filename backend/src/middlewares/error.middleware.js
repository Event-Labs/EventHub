const ApiResponse = require('../core/response/ApiResponse');
const logger = require('../core/logger');

const MESSAGE_MAP = {
    'Invalid request data': 'Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
    'Something went wrong!': 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    'Route not found': 'Không tìm thấy chức năng yêu cầu.',
    'User not found': 'Không tìm thấy người dùng.',
    'Authentication required': 'Vui lòng đăng nhập để tiếp tục.',
    'Not authorized to access this route': 'Bạn không có quyền truy cập chức năng này.',
    'Account is locked': 'Tài khoản của bạn đã bị khóa.',
    'Forbidden': 'Bạn không có quyền thực hiện thao tác này.',
    'Refresh token not found': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    'No valid fields to update': 'Không có thông tin hợp lệ để cập nhật.',
    'Event not found': 'Không tìm thấy sự kiện.',
    'Organizer profile not found': 'Không tìm thấy hồ sơ nhà tổ chức.',
    'Organizer profile not found or inactive.': 'Hồ sơ nhà tổ chức không tồn tại hoặc chưa hoạt động.',
    'Venue not found': 'Không tìm thấy địa điểm.',
    'Venue name is required': 'Vui lòng nhập tên địa điểm.',
    'Address is required': 'Vui lòng nhập địa chỉ.',
    'Seat map not found': 'Không tìm thấy sơ đồ ghế.',
    'Seat map name is required': 'Vui lòng nhập tên sơ đồ ghế.',
    'Seat map must have at least one seat': 'Sơ đồ ghế cần có ít nhất một ghế.',
    'Order not found': 'Không tìm thấy đơn hàng.',
    'Promo code already exists': 'Mã khuyến mãi đã tồn tại.',
    'Promo code not found': 'Không tìm thấy mã khuyến mãi.',
    'Cloudinary is not configured': 'Hệ thống tải tệp chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
};

function normalizeMessage(message, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') {
    if (!message) return fallback;
    const value = String(message).trim();
    if (!value) return fallback;
    if (MESSAGE_MAP[value]) return MESSAGE_MAP[value];
    if (/[À-ỹ]/.test(value)) return value;
    if (/[A-Za-z]{3,}/.test(value)) return fallback;
    return value;
}

function normalizeIssues(issues) {
    if (!Array.isArray(issues)) return issues;
    return issues.map((issue) => ({
        ...issue,
        message: normalizeMessage(issue.message, 'Dữ liệu chưa hợp lệ.'),
    }));
}

const errorMiddleware = (err, req, res, next) => {
    if (err.name === 'ZodError') {
        return res.status(400).json(
            ApiResponse.error('Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.', 400, 'VALIDATION_ERROR', normalizeIssues(err.issues))
        );
    }

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';

    // Always return flat ACCOUNT_LOCKED response regardless of NODE_ENV
    if (err.errorCode === 'ACCOUNT_LOCKED') {
        const response = {
            success: false,
            error: 'ACCOUNT_LOCKED',
            message: normalizeMessage(err.message, 'Tài khoản của bạn đã bị khóa.'),
            ...(err.data || {})
        };
        return res.status(err.statusCode).json(response);
    }

    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            success: false,
            statusCode: err.statusCode,
            errorCode: err.errorCode,
            message: normalizeMessage(err.message),
            stack: err.stack,
            error: err,
        });
    }

    // Production error logging
    if (err.statusCode === 500) {
        logger.error('Unexpected Error:', err);
    }

    return res.status(err.statusCode).json(
        ApiResponse.error(
            err.isOperational ? normalizeMessage(err.message) : 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
            err.statusCode,
            err.errorCode,
            normalizeIssues(err.data)
        )
    );
};

module.exports = errorMiddleware;
