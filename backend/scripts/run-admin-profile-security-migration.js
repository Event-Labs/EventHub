const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.resolve(__dirname, '20260715_admin_profile_security_fields.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Admin profile security migration completed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Admin profile security migration failed:', error.message);
  process.exit(1);
});
