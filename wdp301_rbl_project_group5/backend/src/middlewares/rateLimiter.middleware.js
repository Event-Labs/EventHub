const rateLimit = require('express-rate-limit');
const ApiResponse = require('../core/response/ApiResponse');
const ErrorCodes = require('../core/errors/errorCodes');

const createRateLimiter = (windowMs, max, message = 'Too many requests from this IP, please try again later.') => {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next) => {
            res.status(429).json(ApiResponse.error(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED));
        },
    });
};

module.exports = createRateLimiter;
