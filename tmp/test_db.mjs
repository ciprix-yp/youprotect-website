import { Client } from 'pg';
const client = new Client({
  connectionString: process.env.DATABASE_URL
});
async function run() {
  await client.connect();
  const res = await client.query("SELECT * FROM cms_pages LIMIT 10");
  console.log(res.rows);
  await client.end();
}
run();
