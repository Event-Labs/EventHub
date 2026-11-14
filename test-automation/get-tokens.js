const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
require(path.join(backendModules, 'dotenv')).config({ path: path.resolve(__dirname, '../backend/.env') });
const jwt = require(path.join(backendModules, 'jsonwebtoken'));
const db = require('../backend/src/infrastructure/database/db.client');

async function getTokens() {
  const users = [
    { role: 'ADMIN', email: 'nguheodet@gmail.com' },
    { role: 'ORGANIZER', email: 'TBD.company@gmail.com' },
    { role: 'STAFF', email: 'staff@example.com' },
    { role: 'CUSTOMER', email: 'de180491trannguyenminhduy@gmail.com' }
  ];

  const results = {};
  for (const item of users) {
    const { rows } = await db.query('SELECT u.id, u.email, u.full_name, u.avatar_url FROM users u WHERE u.email = $1', [item.email]);
    if (rows.length > 0) {
      const u = rows[0];
      const token = jwt.sign(
        { sub: u.id, roles: [item.role] },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '7d' }
      );
      results[item.role] = {
        token,
        user: {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          avatar_url: u.avatar_url,
          roles: [item.role.toLowerCase()],
          role: item.role.toLowerCase()
        }
      };
    }
  }
  return results;
}

getTokens().then(res => {
  const fs = require('fs');
  fs.writeFileSync(path.resolve(__dirname, 'auth-tokens.json'), JSON.stringify(res, null, 2));
  console.log('Successfully saved auth-tokens.json with all roles!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
