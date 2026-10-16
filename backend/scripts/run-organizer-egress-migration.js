const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20261015_create_organizer_egress_gateways.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Organizer egress gateways migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Organizer egress gateways migration failed:', error.message);
  process.exit(1);
});
