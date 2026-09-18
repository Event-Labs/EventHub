require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/infrastructure/database/db.client');

async function run() {
  const sqlPath = path.join(__dirname, '20260918_add_zone_to_event_staffs.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running migration: Add zone column to event_staffs...');
  await db.query(sql);
  console.log('Migration completed successfully.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
