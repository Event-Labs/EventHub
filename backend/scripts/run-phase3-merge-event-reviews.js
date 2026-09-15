const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260915_phase3_merge_event_reviews.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Phase 3 (merge event_reviews & event_ai_reviews into events) migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 3 migration failed:', error.message);
  process.exit(1);
});
