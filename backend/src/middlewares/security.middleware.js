const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');

const securityMiddlewares = (app) => {
    // Tắt CORP của helmet để không chặn resources cross-origin
    app.use(helmet({
        crossOriginResourcePolicy: false,
    }));

    app.use(cors({
        origin: function (origin, callback) {
            // Cho phép requests không có origin (curl, mobile app, postman)
            if (!origin) return callback(null, true);

            // Cho phép tất cả preview/production của vercel (*.vercel.app), localhost, domain eventhub.id.vn và CLIENT_URL
            if (
                origin.includes('localhost') ||
                origin.includes('127.0.0.1') ||
                origin.endsWith('.vercel.app') ||
                origin.endsWith('.eventhub.id.vn') ||
                origin === process.env.CLIENT_URL
            ) {
                return callback(null, true);
            }

            return callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Organizer-Sensitive-Token',
            'X-Claim-Token',
            'X-Device-Id',
            'X-Device-Secret',
            'X-Mac-Address',
            'CF-Connecting-IP',
            'ngrok-skip-browser-warning',
            'Idempotency-Key',
            'idempotency-key',
            'X-Idempotency-Key',
            'x-idempotency-key'
        ]
    }));

    app.use(hpp());
};

module.exports = securityMiddlewares;
