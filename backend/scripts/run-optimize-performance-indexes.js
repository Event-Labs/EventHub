const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260917_optimize_performance_indexes.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    console.log('Applying performance indexes to database...');
    await client.query(sql);
    console.log('✅ High-performance indexes migration completed successfully!');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});
