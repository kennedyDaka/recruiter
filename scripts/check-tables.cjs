const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const c = await pool.connect();
  const tables = await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'promo%'");
  console.log("Promo tables:", tables.rows.map((r) => r.tablename));
  c.release();
  await pool.end();
})();
