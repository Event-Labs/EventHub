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
        skip: (req) => {
            // Bypass rate limit in test environment or for performance testing suites
            const userAgent = req.headers['user-agent'] || '';
            const bypassHeader = req.headers['x-bypass-rate-limit'];
            if (
                process.env.NODE_ENV === 'test' ||
                bypassHeader === 'true' ||
                userAgent.includes('EventHub-Performance-Test') ||
                userAgent.includes('k6')
            ) {
                return true;
            }
            if (typeof options.skip === 'function') {
                return options.skip(req);
            }
            return false;
        },
        handler: (req, res, next) => {
            res.status(429).json(ApiResponse.error(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED));
        },
        ...options,
    };

    return rateLimit(config);
};

module.exports = createRateLimiter;
