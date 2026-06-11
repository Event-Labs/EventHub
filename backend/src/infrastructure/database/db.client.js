const { Pool } = require('pg');
const logger = require('../../core/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Increased to 5s
});

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
    // Do not exit process, let the pool handle it
});

pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool,
};
