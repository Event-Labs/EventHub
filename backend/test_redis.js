const crypto = require('crypto');
require('dotenv').config();
const { client, connectRedis } = require('./src/infrastructure/redis/redis.client');

(async () => {
    await connectRedis();
    try {
        const expiresAt = new Date(Date.now() + 3600000);
        const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        console.log('Sending setEx...');
        await client.setEx('test_key', ttlSeconds, 'hello');
        const val = await client.get('test_key');
        console.log('Got value:', val);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
})();
