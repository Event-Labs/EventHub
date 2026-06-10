const jwt = require('jsonwebtoken');
const AppError = require('../core/errors/AppError');
const ErrorCodes = require('../core/errors/errorCodes');
const authRepository = require('../modules/auth/auth.repository');

const protect = async (req, res, next) => {
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
        
        // --- REAL-TIME STATUS CHECK ---
        const user = await authRepository.findUserById(decoded.sub);
        
        if (!user || user.status === 'LOCKED') {
            const isPermanent = user && user.locked_until === null;
            throw new AppError('Account is locked', 403, ErrorCodes.ACCOUNT_LOCKED, {
                lockReason: user?.lock_reason || 'Tài khoản bị khóa bởi hệ thống',
                lockedAt: user?.locked_at ? new Date(user.locked_at).toISOString() : null,
                lockedUntil: user?.locked_until ? new Date(user.locked_until).toISOString() : null,
                isPermanentLock: isPermanent
            });
        }
        
        req.user = decoded; // { sub: userId, roles, jti }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new AppError('Token expired', 401, ErrorCodes.AUTH_EXPIRED_TOKEN));
        }
        if (err.statusCode === 403) return next(err);
        return next(new AppError('Invalid token', 401, ErrorCodes.AUTH_INVALID_TOKEN));
    }
};

const normalizeRole = (role) => String(role).toUpperCase();

const authorize = (...roles) => {
    const requiredRoles = roles.map(normalizeRole);

    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            return next(new AppError('Roles not found in token', 403, ErrorCodes.AUTH_FORBIDDEN));
        }

        const userRoles = req.user.roles.map(normalizeRole);
        const hasRole = requiredRoles.some((role) => userRoles.includes(role));
        if (!hasRole) {
            return next(new AppError('You do not have permission to perform this action', 403, ErrorCodes.AUTH_FORBIDDEN));
        }
        next();
    };
};

module.exports = { protect, authorize };
