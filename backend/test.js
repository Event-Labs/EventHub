const { Client } = require('pg');
const client = new Client('postgresql://postgres.fgairwjguhidrtzaktzp:EventHub123hihi@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres');
client.connect().then(() => {
  return client.query(`SELECT id, title, start_time, end_time FROM events WHERE title LIKE '%Porsche%';`);
}).then(res => {
  console.log(res.rows);
  return client.query(`SELECT start_time, end_time FROM event_sessions WHERE event_id = $1`, [res.rows[0].id]);
}).then(res => {
  console.log("Sessions:", res.rows);
  client.end();
}).catch(console.error);