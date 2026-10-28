/**
 * Backfill script for existing tickets:
 * - Snapshots original_price from ticket_types.price if null
 * - Sets ticket_source: FREE if ticket_types.price == 0 else STANDARD
 * - For orders with discount_amount > 0: allocates discount proportionally across tickets:
 *   floor(discount * price / subtotal), remainder +1 VND distributed by price DESC, id ASC.
 * - Supports backup table creation & rollback.
 *
 * NOTE: Dry-run by default. To apply changes, run with: node backfill_ticket_pricing_and_source.js --apply
 * To rollback, run with: node backfill_ticket_pricing_and_source.js --rollback
 */
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const isApply = process.argv.includes('--apply');
  const isRollback = process.argv.includes('--rollback');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    if (isRollback) {
      console.log('Rolling back ticket pricing from backup table...');
      await client.query('BEGIN');
      const backupExists = await client.query(`
        SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets_backup_pre_pricing'
      `);
      if (backupExists.rows.length === 0) {
        throw new Error('Backup table tickets_backup_pre_pricing does not exist!');
      }
      await client.query(`
        UPDATE tickets t
        SET
          ticket_source = b.ticket_source,
          original_price = b.original_price,
          discount_allocated = b.discount_allocated,
          payable_price = b.payable_price
        FROM tickets_backup_pre_pricing b
        WHERE t.id = b.id;
      `);
      await client.query('COMMIT');
      console.log('Rollback completed successfully.');
      return;
    }

    console.log(`Starting ticket pricing backfill check (mode: ${isApply ? 'APPLY' : 'DRY-RUN'})...`);

    // 1. Check unbackfilled tickets
    const unbackfilledRes = await client.query(`
      SELECT t.id, t.ticket_code, tt.price as tt_price, t.ticket_source, t.original_price
      FROM tickets t
      LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE t.original_price IS NULL OR t.ticket_source IS NULL;
    `);

    console.log(`Found ${unbackfilledRes.rows.length} tickets needing initial snapshot/source.`);

    // 2. Check orders with discount_amount > 0
    const discountedOrders = await client.query(`
      SELECT o.id, o.order_code, o.subtotal, o.discount_amount
      FROM orders o
      WHERE o.discount_amount > 0;
    `);
    console.log(`Found ${discountedOrders.rows.length} orders with discount_amount > 0.`);

    if (!isApply) {
      console.log('\n[DRY RUN ONLY] No database modifications were performed.');
      console.log('To execute real update, user confirmation is required, then run with --apply.');
      return;
    }

    // Apply with transaction and backup
    await client.query('BEGIN');

    // Create backup table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets_backup_pre_pricing AS
      SELECT id, ticket_code, ticket_source, original_price, discount_allocated, payable_price, now() as backup_time
      FROM tickets;
    `);

    // Backfill standard/free prices
    await client.query(`
      UPDATE tickets t
      SET
        ticket_source = CASE WHEN COALESCE(tt.price, 0) = 0 THEN 'FREE' ELSE 'STANDARD' END,
        original_price = COALESCE(tt.price, 0),
        discount_allocated = 0,
        payable_price = COALESCE(tt.price, 0)
      FROM ticket_types tt
      WHERE t.ticket_type_id = tt.id
        AND (t.original_price IS NULL OR t.ticket_source IS NULL);
    `);

    // Allocate discount for each discounted order
    for (const order of discountedOrders.rows) {
      const ticketsRes = await client.query(`
        SELECT t.id, t.original_price
        FROM tickets t
        JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY t.original_price DESC, t.id ASC;
      `, [order.id]);

      const tickets = ticketsRes.rows;
      if (tickets.length === 0) continue;

      const totalDiscount = Math.round(Number(order.discount_amount));
      const orderSubtotal = Math.round(Number(order.subtotal)) || 1;

      let allocatedSum = 0;
      const allocations = tickets.map((t) => {
        const orig = Math.round(Number(t.original_price));
        const alloc = Math.min(orig, Math.floor((totalDiscount * orig) / orderSubtotal));
        allocatedSum += alloc;
        return { id: t.id, original_price: orig, discount_allocated: alloc };
      });

      let remainder = totalDiscount - allocatedSum;
      for (let i = 0; i < allocations.length && remainder > 0; i++) {
        if (allocations[i].discount_allocated < allocations[i].original_price) {
          allocations[i].discount_allocated += 1;
          remainder -= 1;
        }
      }

      for (const alloc of allocations) {
        const payable = alloc.original_price - alloc.discount_allocated;
        await client.query(`
          UPDATE tickets
          SET
            discount_allocated = $1,
            payable_price = $2
          WHERE id = $3;
        `, [alloc.discount_allocated, payable, alloc.id]);
      }
    }

    await client.query('COMMIT');
    console.log('Ticket pricing and discount backfill applied successfully!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backfill error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
