const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const isRollback = process.argv.includes('--down');
  const sqlFile = isRollback
    ? '20261123_ticket_hold_security_down.sql'
    : '20261123_ticket_hold_security.sql';
  const sqlPath = path.resolve(__dirname, sqlFile);

  console.log(`[Migration] Starting ${isRollback ? 'rollback' : 'apply'} using ${sqlFile}...`);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Migration file not found: ${sqlPath}`);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log(`[Migration] Successfully completed: ${sqlFile}`);
  } catch (err) {
    console.error(`[Migration] Error executing ${sqlFile}:`, err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[Migration] Failed:', error.message);
  process.exit(1);
});
