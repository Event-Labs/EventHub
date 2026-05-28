require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        console.log('Connecting to database for migration...');
        
        // 1. Add 'address' column if it does not exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS address TEXT;
        `);
        console.log('Checked/Added "address" column.');

        // 2. Add 'dob' column if it does not exist (using DATE type)
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS dob DATE;
        `);
        console.log('Checked/Added "dob" column.');

        // 3. Add 'city' column if it does not exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS city VARCHAR(100);
        `);
        console.log('Checked/Added "city" column.');

        console.log('Database migration completed successfully!');
    } catch (err) {
        console.error('Error migrating database:', err);
    } finally {
        await pool.end();
    }
}

main();
