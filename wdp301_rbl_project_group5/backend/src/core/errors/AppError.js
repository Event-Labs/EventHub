const ErrorCodes = require('./errorCodes');

class AppError extends Error {
    constructor(message, statusCode, errorCode = ErrorCodes.INTERNAL_SERVER_ERROR, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
