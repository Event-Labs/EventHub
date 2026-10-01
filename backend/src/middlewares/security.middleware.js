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

            // Cho phép tất cả preview/production của vercel (*.vercel.app), localhost, và CLIENT_URL
            if (
                origin.includes('localhost') ||
                origin.includes('127.0.0.1') ||
                origin.endsWith('.vercel.app') ||
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
            'X-Organizer-Sensitive-Token'
        ]
    }));

    app.use(hpp());
};

module.exports = securityMiddlewares;
