'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/infrastructure/database/db.client');
const fieldCrypto = require('../src/core/security/fieldCrypto');

const COLUMNS_CONFIG = [
  { column: 'api_key_encrypted', field: 'payos_api_key' },
  { column: 'checksum_key_encrypted', field: 'payos_checksum_key' },
  { column: 'payout_api_key_encrypted', field: 'payos_payout_api_key' },
  { column: 'payout_checksum_key_encrypted', field: 'payos_payout_checksum_key' },
  { column: 'bank_account_number', field: 'bank_account_number' },
];

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[DATA_MIGRATION] Bắt đầu script mã hóa bảng organizer_payment_channels (Chế độ: ${isDryRun ? 'DRY-RUN' : 'LIVE RUN'})...`);

  const { rows } = await pool.query('SELECT * FROM organizer_payment_channels ORDER BY created_at ASC');
  console.log(`[DATA_MIGRATION] Tìm thấy tổng cộng ${rows.length} kênh thanh toán.`);

  let totalRowsNeedUpdate = 0;
  let totalFieldsEncrypted = 0;

  for (const row of rows) {
    const orgId = row.organizer_id;
    const updates = {};
    let rowNeedsUpdate = false;

    for (const config of COLUMNS_CONFIG) {
      const val = row[config.column];
      if (val === null || val === undefined || String(val).trim() === '') {
        continue;
      }

      if (fieldCrypto.isEncrypted(val)) {
        continue; // Đã được mã hóa trước đó -> an toàn / idempotent
      }

      // Cần mã hóa
      const originalPlain = String(val).trim();
      const ciphertext = fieldCrypto.encrypt(originalPlain, orgId, config.field);

      // Verify bằng cách giải mã lại trước khi ghi
      const decrypted = fieldCrypto.decrypt(ciphertext, orgId, config.field);
      if (decrypted !== originalPlain) {
        throw new Error(
          `[DATA_MIGRATION_ABORT] Xác thực thất bại! Giá trị giải mã không khớp với bản gốc tại row id=${row.id}, field=${config.column}`
        );
      }

      updates[config.column] = ciphertext;
      rowNeedsUpdate = true;
      totalFieldsEncrypted++;
    }

    if (rowNeedsUpdate) {
      totalRowsNeedUpdate++;
      if (!isDryRun) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Tên cột lấy từ danh sách cố định COLUMNS_CONFIG, dùng parameterized query
          const setClauses = [];
          const queryParams = [orgId];
          let paramIdx = 2;

          for (const config of COLUMNS_CONFIG) {
            if (updates[config.column] !== undefined) {
              setClauses.push(`${config.column} = $${paramIdx}`);
              queryParams.push(updates[config.column]);
              paramIdx++;
            }
          }

          setClauses.push('updated_at = NOW()');
          const sql = `UPDATE organizer_payment_channels SET ${setClauses.join(', ')} WHERE organizer_id = $1`;
          await client.query(sql, queryParams);
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          client.release();
          throw txErr;
        } finally {
          client.release();
        }
      }
    }
  }

  console.log('\n--- KẾT QUẢ ---');
  console.log(`Số dòng cần cập nhật: ${totalRowsNeedUpdate}/${rows.length}`);
  console.log(`Số trường dữ liệu cần mã hóa: ${totalFieldsEncrypted}`);
  if (isDryRun) {
    console.log('[DRY-RUN] Không có dữ liệu nào bị thay đổi trong database.');
  } else {
    console.log('[LIVE RUN] Toàn bộ dữ liệu nhạy cảm đã được mã hóa an toàn.');
  }
}

run()
  .catch((err) => {
    console.error('[DATA_MIGRATION_ERROR]', err.message);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
