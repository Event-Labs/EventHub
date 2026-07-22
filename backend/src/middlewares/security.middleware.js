const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');

const securityMiddlewares = (app) => {
    app.use(helmet());

    app.use(cors({
        origin: process.env.CLIENT_URL,
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
