require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../src/infrastructure/database/db.client');

async function run() {
  const sqlPath = path.join(__dirname, '20261124_add_target_role_to_notifications.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running migration: Add target_role and metadata to notifications...');
  await db.query(sql);
  console.log('Migration completed successfully.');

  // Verify
  const { rows } = await db.query(
    `SELECT target_role, COUNT(*)::int as count FROM notifications GROUP BY target_role`
  );
  console.log('Notification counts by target_role:', rows);

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
