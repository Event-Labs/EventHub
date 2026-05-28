require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        console.log('Connecting to database...');
        const res = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users';
        `);
        console.log('Columns in "users" table:');
        console.table(res.rows);
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await pool.end();
    }
}

main();
