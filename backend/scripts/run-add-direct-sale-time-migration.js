const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20261111_add_direct_sale_time_to_sessions.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Direct sale time migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Direct sale time migration failed:', error.message);
  process.exit(1);
});

