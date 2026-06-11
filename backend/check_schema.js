require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:');
        console.table(tables.rows);

        const promoCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'promo_codes'");
        console.log('Promo Codes Columns:');
        console.table(promoCols.rows);
        
        const orgCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizers'");
        console.log('Organizers Columns:');
        console.table(orgCols.rows);

        const eventCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'events'");
        console.log('Events Columns:');
        console.table(eventCols.rows);

        const userRoleCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_roles'");
        console.log('User Roles Columns:');
        console.table(userRoleCols.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
