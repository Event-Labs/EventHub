require('dotenv').config();
const db = require('./src/infrastructure/database/db.client');

async function run() {
    try {
        const client = await db.getClient();
        console.log('Adding missing stage columns to seat_maps...');

        await client.query(`
      ALTER TABLE seat_maps
      ADD COLUMN IF NOT EXISTS stage_position VARCHAR(20) DEFAULT 'BOTTOM',
      ADD COLUMN IF NOT EXISTS custom_stage_x FLOAT,
      ADD COLUMN IF NOT EXISTS custom_stage_y FLOAT,
      ADD COLUMN IF NOT EXISTS custom_stage_width FLOAT,
      ADD COLUMN IF NOT EXISTS custom_stage_height FLOAT;
    `);

        console.log('Columns added successfully.');
        client.release();
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
}

run();
