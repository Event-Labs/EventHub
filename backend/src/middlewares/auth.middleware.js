const jwt = require('jsonwebtoken');
const AppError = require('../core/errors/AppError');
const ErrorCodes = require('../core/errors/errorCodes');

const protect = (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.toLowerCase().startsWith('bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('Not authorized to access this route', 401, ErrorCodes.AUTH_REQUIRED));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded; // { sub: userId, roles, jti }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new AppError('Token expired', 401, ErrorCodes.AUTH_EXPIRED_TOKEN));
        }
        return next(new AppError('Invalid token', 401, ErrorCodes.AUTH_INVALID_TOKEN));
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            return next(new AppError('Roles not found in token', 403, ErrorCodes.AUTH_FORBIDDEN));
        }

        const hasRole = roles.some(role => req.user.roles.includes(role));
        if (!hasRole) {
            return next(new AppError('You do not have permission to perform this action', 403, ErrorCodes.AUTH_FORBIDDEN));
        }
        next();
    };
};

module.exports = { protect, authorize };
