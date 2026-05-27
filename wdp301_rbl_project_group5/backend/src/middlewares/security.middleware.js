const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');

const securityMiddlewares = (app) => {
    // Set security HTTP headers
    app.use(helmet());

    // Enable CORS
    app.use(cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    }));

    // Prevent HTTP Parameter Pollution
    app.use(hpp());
};

module.exports = securityMiddlewares;
