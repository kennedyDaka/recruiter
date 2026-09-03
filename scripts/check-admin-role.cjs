const { Pool } = require("pg");

async function main() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.log("ERROR: No DATABASE_URL");
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    max: 1,
  });
  
  const c = await pool.connect();
  
  try {
    const res = await c.query(
      `SELECT ur.user_id, ur.role, p.email, p.full_name 
       FROM user_roles ur 
       LEFT JOIN profiles p ON p.id = ur.user_id
       ORDER BY ur.created_at DESC 
       LIMIT 10`
    );
    console.log("All roles in DB:");
    res.rows.forEach(r => {
      console.log(`  ${r.email} (${r.user_id}): role=${r.role}, name=${r.full_name}`);
    });
    
    if (res.rows.length === 0) {
      console.log("\nNO ROLES FOUND IN DATABASE!");
    }
    
    // Check for kennedydaka93@gmail.com specifically
    const adminRes = await c.query(
      `SELECT p.id, p.email, p.full_name, p.tenant_id, ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.email = 'kennedydaka93@gmail.com'`
    );
    console.log("\nAdmin user lookup:");
    if (adminRes.rows.length === 0) {
      console.log("  NOT FOUND - no profile for kennedydaka93@gmail.com");
    } else {
      adminRes.rows.forEach(r => {
        console.log(`  ID: ${r.id}`);
        console.log(`  Email: ${r.email}`);
        console.log(`  Name: ${r.full_name}`);
        console.log(`  Role: ${r.role}`);
        console.log(`  Tenant: ${r.tenant_id}`);
      });
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
