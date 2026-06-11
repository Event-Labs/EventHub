require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        const res = await pool.query("SELECT * FROM user_roles LIMIT 1");
        console.log('User Roles sample:');
        console.table(res.rows);
        
        const res2 = await pool.query("SELECT * FROM roles LIMIT 5");
        console.log('Roles sample:');
        console.table(res2.rows);

    } catch (err) {
        console.error('ERROR CHECKING ROLES:', err.message);
    } finally {
        await pool.end();
    }
}

main();
