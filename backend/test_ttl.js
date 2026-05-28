require('dotenv').config();
console.log('ENV:', process.env.EMAIL_VERIFY_EXPIRES_IN);
const e = parseInt(process.env.EMAIL_VERIFY_EXPIRES_IN);
console.log('e:', e);
const expiresAt = new Date(Date.now() + (e * 1000));
const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
console.log('expiresAt:', expiresAt, 'ttl:', ttl);
