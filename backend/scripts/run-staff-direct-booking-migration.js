const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260724_staff_direct_booking_fields.sql');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(fs.readFileSync(sqlPath, 'utf8'));
    console.log('Staff direct-booking migration completed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Staff direct-booking migration failed:', error.message);
  process.exit(1);
});
