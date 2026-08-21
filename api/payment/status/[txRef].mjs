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
    // Extract txRef from the URL path: /api/payment/status/TX-XXXX
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const txRef = pathParts[pathParts.length - 1]; // last segment

    if (!txRef) {
      return res.status(400).json({ error: "tx_ref is required" });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT tx_ref, status, amount, currency, payment_method, completed_at, failed_at
       FROM payments WHERE tx_ref = $1 LIMIT 1`,
      [txRef]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const row = result.rows[0];
    return res.status(200).json({
      txRef: row.tx_ref,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      paymentMethod: row.payment_method,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
    });
  } catch (error) {
    console.error("Payment status error:", error?.message);
    return res.status(500).json({ error: "Failed to fetch payment status" });
  }
}
