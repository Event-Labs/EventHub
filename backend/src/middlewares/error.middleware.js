const ApiResponse = require('../core/response/ApiResponse');
const logger = require('../core/logger');

const errorMiddleware = (err, req, res, next) => {
    if (err.name === 'ZodError') {
        return res.status(400).json(
            ApiResponse.error('Invalid request data', 400, 'VALIDATION_ERROR', err.issues)
        );
    }

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';

    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            success: false,
            statusCode: err.statusCode,
            errorCode: err.errorCode,
            message: err.message,
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
            err.isOperational ? err.message : 'Something went wrong!',
            err.statusCode,
            err.errorCode
        )
    );
};

module.exports = errorMiddleware;
