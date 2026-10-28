const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const isDown = process.argv.includes('--down');
  const sqlFile = isDown
    ? '20261028_zero_amount_and_free_tickets_down.sql'
    : '20261028_zero_amount_and_free_tickets.sql';
  const sqlPath = path.resolve(__dirname, sqlFile);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    if (!isDown) {
      // 1. Add enum value outside transaction block (PostgreSQL requirement)
      console.log('Ensuring order_status_enum contains CONFIRMED...');
      try {
        await client.query("ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'CONFIRMED'");
      } catch (enumErr) {
        // If enum already has CONFIRMED or command is not allowed in tx, handle gracefully
        if (!enumErr.message.includes('already exists')) {
          console.warn('Enum notice:', enumErr.message);
        }
      }
    }

    console.log(`Running migration: ${sqlFile}...`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`Migration ${sqlFile} completed successfully.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Migration ${sqlFile} failed:`, error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

