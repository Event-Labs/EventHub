class ApiResponse {
    constructor(statusCode, data, message, errorCode = null) {
        this.success = statusCode < 400;
        this.statusCode = statusCode;
        this.message = message;
        if (data !== undefined) this.data = data;
        if (errorCode) this.errorCode = errorCode;
    }

    static success(data, message = 'Success', statusCode = 200) {
        return new ApiResponse(statusCode, data, message);
    }

    static error(message = 'Error', statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', data = null) {
        return new ApiResponse(statusCode, data, message, errorCode);
    }
}

module.exports = ApiResponse;
