const { createClient } = require('redis');
const logger = require('../../core/logger');

const client = createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
});

client.on('error', (err) => logger.error('Redis Client Error', err));
client.on('connect', () => logger.info('Connected to Redis'));

const connectRedis = async () => {
    try {
        await client.connect();
    } catch (err) {
        logger.error('Failed to connect to Redis', err);
    }
};

module.exports = {
    client,
    connectRedis,
};
