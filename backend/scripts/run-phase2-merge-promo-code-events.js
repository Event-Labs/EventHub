const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260915_phase2_merge_promo_code_events.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Phase 2 Extension (merge promo_code_events into promo_codes) migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 2 Extension migration failed:', error.message);
  process.exit(1);
});
