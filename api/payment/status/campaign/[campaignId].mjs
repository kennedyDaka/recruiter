import { Pool } from "pg";

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10000,
  });
  return _pool;
}

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const campaignId = pathParts[pathParts.length - 1];

    if (!campaignId) {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, status, public_token, closing_date, published_at
       FROM campaigns WHERE id = $1 LIMIT 1`,
      [campaignId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const row = result.rows[0];
    return res.status(200).json({
      id: row.id,
      name: row.name,
      status: row.status,
      publicToken: row.public_token,
      closingDate: row.closing_date,
      publishedAt: row.published_at,
    });
  } catch (error) {
    console.error("Campaign status error:", error?.message);
    return res.status(500).json({ error: "Failed to fetch campaign status" });
  }
}
