const rateLimit = require('express-rate-limit');
const ApiResponse = require('../core/response/ApiResponse');
const ErrorCodes = require('../core/errors/errorCodes');

const createRateLimiter = (windowMs, max, message = 'Too many requests from this IP, please try again later.', options = {}) => {
    const config = {
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        validate: false,
        handler: (req, res, next) => {
            res.status(429).json(ApiResponse.error(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED));
        },
        ...options,
    };

    return rateLimit(config);
};

module.exports = createRateLimiter;
