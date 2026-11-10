require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ACCOUNTS = [
  { email: 'customer@example.com', name: 'K6 Test Customer', role: 'CUSTOMER', roleId: 1 },
  { email: 'staff@example.com', name: 'K6 Test Staff', role: 'STAFF', roleId: 3 },
  { email: 'organizer@example.com', name: 'K6 Test Organizer', role: 'ORGANIZER', roleId: 2 },
  { email: 'admin@example.com', name: 'K6 Test Admin', role: 'ADMIN', roleId: 4 },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('--- KHỞI TẠO TÀI KHOẢN KIỂM THỬ K6 CHO EVENTHUB ---');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password@123', salt);

    for (const acc of ACCOUNTS) {
      // 1. Kiểm tra tài khoản đã tồn tại chưa
      const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [acc.email]);
      let userId;

      if (checkUser.rows.length > 0) {
        userId = checkUser.rows[0].id;
        await client.query(`
          UPDATE users 
          SET password_hash = $1, status = 'ACTIVE', email_verified = true, two_factor_enabled = false
          WHERE id = $2
        `, [passwordHash, userId]);
        console.log(`[CẬP NHẬT] ${acc.email} -> Password@123 (Role: ${acc.role})`);
      } else {
        const insertUser = await client.query(`
          INSERT INTO users (email, password_hash, full_name, status, email_verified, two_factor_enabled)
          VALUES ($1, $2, $3, 'ACTIVE', true, false)
          RETURNING id
        `, [acc.email, passwordHash, acc.name]);
        userId = insertUser.rows[0].id;
        console.log(`[TẠO MỚI] ${acc.email} -> Password@123 (Role: ${acc.role})`);
      }

      // 2. Gán Role chính xác
      await client.query(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [userId, acc.roleId]);
      await client.query(`
        DELETE FROM user_roles WHERE user_id = $1 AND role_id != $2
      `, [userId, acc.roleId]);

      // 3. Nếu là Organizer, đảm bảo có hồ sơ trong bảng organizers
      if (acc.role === 'ORGANIZER') {
        await client.query(`
          INSERT INTO organizers (id, user_id, organization_name, status, request_type, terms_accepted)
          VALUES (gen_random_uuid(), $1, 'K6 Test Organizer Co', 'ACTIVE', 'INDIVIDUAL', true)
          ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE'
        `, [userId]);
        console.log(`[HỒ SƠ ORGANIZER] Đã tạo/kích hoạt hồ sơ cho ${acc.email}`);
      }
    }

    console.log('===> ĐÃ KHỞI TẠO THÀNH CÔNG 4 TÀI KHOẢN CHO K6!');
  } catch (err) {
    console.error('Lỗi khi tạo tài khoản test:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
