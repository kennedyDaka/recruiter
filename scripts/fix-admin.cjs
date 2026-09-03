const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Delete junglepepper account
    const jp = await c.query("SELECT id FROM profiles WHERE email = 'junglepepper@gmail.com'");
    if (jp.rows.length > 0) {
      const jpId = jp.rows[0].id;
      await c.query("DELETE FROM user_roles WHERE user_id = $1", [jpId]);
      await c.query("DELETE FROM auth_credentials WHERE user_id = $1", [jpId]);
      await c.query("DELETE FROM profiles WHERE id = $1", [jpId]);
      // Delete orphan tenant
      await c.query("DELETE FROM tenants WHERE name = 'jungle pepper' OR slug = 'jungle-pepper'");
      console.log("Deleted junglepepper account");
    } else {
      console.log("No junglepepper account found");
    }

    // 2. Update admin role to super_admin
    const adminProfile = await c.query("SELECT id FROM profiles WHERE email = 'kennedydaka93@gmail.com'");
    if (adminProfile.rows.length > 0) {
      const adminId = adminProfile.rows[0].id;
      await c.query("DELETE FROM user_roles WHERE user_id = $1", [adminId]);
      await c.query("INSERT INTO user_roles (id, user_id, tenant_id, role, created_at) VALUES ($1, $2, $3, 'super_admin', NOW())",
        [require("crypto").randomUUID(), adminId, adminId]);
      console.log("Set role to super_admin");
    }

    await c.query("COMMIT");

    // Verify
    const roles = await c.query("SELECT p.email, ur.role FROM user_roles ur JOIN profiles p ON p.id = ur.user_id");
    console.log("Final roles:", JSON.stringify(roles.rows));
    const tenantCount = await c.query("SELECT count(*) FROM tenants");
    console.log("Tenants:", tenantCount.rows[0].count);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("Error:", e.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
