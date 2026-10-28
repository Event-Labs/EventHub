const net = require('net');
const dns = require('dns');
// Enforce IPv4-first DNS resolution and disable Happy Eyeballs dual-stack autoSelectFamily
// to ensure outbound requests to PayOS strictly use the whitelisted IPv4 address.
try {
  if (typeof net.setDefaultAutoSelectFamily === 'function') {
    net.setDefaultAutoSelectFamily(false);
  }
} catch (e) {}

try {
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {}

const env = require('./config/env'); // Validates env on load
const app = require('./app');
const logger = require('./core/logger');
const { connectRedis } = require('./infrastructure/redis/redis.client');
const { pool } = require('./infrastructure/database/db.client');
const { startNotificationScheduler } = require('./modules/notifications/notifications.scheduler');
const { startAutoReviewScheduler } = require('./modules/admin/autoReview.scheduler');
const { startEventLifecycleScheduler } = require('./modules/events/eventLifecycle.scheduler');

const startServer = async () => {
    try {
        // 1. Check DB Connection
        await pool.query('SELECT NOW()');
        logger.info('Database connection verified');

        // 2. Connect to Redis (non-blocking)
        connectRedis().catch(err => logger.error('Initial Redis connection failed:', err));

        // 3. Start Server immediately
        const server = app.listen(env.PORT, () => {
            logger.info(`Server running in ${env.NODE_ENV} mode on ${env.APP_URL}`);
            startNotificationScheduler();
            startAutoReviewScheduler();
            startEventLifecycleScheduler();
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
