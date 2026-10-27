require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const sqlPath = path.join(__dirname, '20261027_upgrade_existing_tables_business_rules.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 Running database upgrade on existing tables (ZERO new tables)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✅ Database successfully upgraded!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
