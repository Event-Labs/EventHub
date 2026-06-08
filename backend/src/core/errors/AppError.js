const ErrorCodes = require('./errorCodes');

class AppError extends Error {
    constructor(message, statusCode, errorCode = ErrorCodes.INTERNAL_SERVER_ERROR, data = null, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.data = data;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
