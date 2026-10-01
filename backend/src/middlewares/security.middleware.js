const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');

const securityMiddlewares = (app) => {
    app.use(helmet());

    const allowedOrigins = [
        process.env.CLIENT_URL,
        'http://localhost:5173',
        'http://localhost:3000',
        'https://event-hub-eta-tan.vercel.app'
    ].filter(Boolean);

    app.use(cors({
        origin: function (origin, callback) {
            // Cho phép requests không có origin (như curl, mobile, Postman) hoặc thuộc danh sách / đuôi .vercel.app
            if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
                return callback(null, true);
            }
            return callback(new Error(`Not allowed by CORS: ${origin}`));
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
