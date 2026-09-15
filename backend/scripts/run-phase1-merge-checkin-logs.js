const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260915_phase1_merge_checkin_logs.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Phase 1 (merge checkin_logs into tickets) migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 1 migration failed:', error.message);
  process.exit(1);
});
