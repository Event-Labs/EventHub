const env = require('./config/env'); // Validates env on load
const app = require('./app');
const logger = require('./core/logger');
const { connectRedis } = require('./infrastructure/redis/redis.client');
const { pool } = require('./infrastructure/database/db.client');

const startServer = async () => {
    try {
        // 1. Check DB Connection
        await pool.query('SELECT NOW()');
        logger.info('Database connection verified');

        // 2. Connect to Redis (optional/graceful)
        await connectRedis();

        // 3. Start Server
        const server = app.listen(env.PORT, () => {
            logger.info(`Server running in ${env.NODE_ENV} mode on ${env.APP_URL}`);
        });

        // Handle graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down gracefully...');
            server.close(async () => {
                await pool.end();
                logger.info('Closed all database connections');
                process.exit(0);
            });
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
