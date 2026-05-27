const express = require('express');
const cookieParser = require('cookie-parser');
const securityMiddlewares = require('./middlewares/security.middleware');
const errorMiddleware = require('./middlewares/error.middleware');
const authRoutes = require('./modules/auth/auth.routes');
const ApiResponse = require('./core/response/ApiResponse');

const app = express();

// Security Middlewares
securityMiddlewares(app);

// JSON and URL parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie Parser
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json(ApiResponse.success(null, 'Server is healthy'));
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json(ApiResponse.error('Route not found', 404, 'RESOURCE_NOT_FOUND'));
});

// Global Error Handler
app.use(errorMiddleware);

module.exports = app;
