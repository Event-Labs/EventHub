require('dotenv').config();
const { client, connectRedis } = require('./src/infrastructure/redis/redis.client');

(async () => {
    await connectRedis();
    try {
        const keys = await client.keys('*');
        console.log('Redis Keys:', keys);

        // Check if any starts with pending_user
        const pending = keys.filter(k => k.startsWith('pending_user'));
        console.log('Pending Users:', pending);

        for (const k of pending) {
            console.log(`Key ${k}:`);
            const val = await client.get(k);
            console.log(val);
        }
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
})();
