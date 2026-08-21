import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Lazy-load pg to avoid cold-start issues
let _pool = null;
async function getPool() {
  if (_pool) return _pool;
  const { Pool } = await import("pg");
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return _pool;
}

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const payload = JSON.parse(rawBody);
    const signature = req.headers["x-paychangu-signature"] || "";

    // Verify HMAC signature
    const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
    const testMode = process.env.PAYCHANGU_TEST_MODE === "true";

    if (!webhookSecret && !testMode) {
      console.error("PAYCHANGU_WEBHOOK_SECRET is not configured");
      return res.status(503).json({ error: "Webhook not configured" });
    }

    if (webhookSecret) {
      const crypto = await import("node:crypto");
      const expectedHex = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const provided = Buffer.from(signature, "utf8");
      const expected = Buffer.from(expectedHex, "utf8");
      const valid =
        provided.length === expected.length &&
        crypto.timingSafeEqual(provided, expected);
      if (!valid) {
        console.error("Webhook signature verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Process the event
    const event = payload.event;
    const data = payload.data;

    if (event === "charge.success" && data?.tx_ref) {
      const pool = await getPool();

      // Find the payment record
      const paymentResult = await pool.query(
        "SELECT id, invoice_id, campaign_id, status FROM payments WHERE tx_ref = $1 LIMIT 1",
        [data.tx_ref]
      );

      if (paymentResult.rows.length === 0) {
        console.error("No payment found for tx_ref:", data.tx_ref);
        return res.status(200).json({ received: true, note: "Unknown tx_ref" });
      }

      const payment = paymentResult.rows[0];

      if (payment.status === "completed") {
        return res.status(200).json({ received: true, note: "Already processed" });
      }

      // Update payment status
      await pool.query(
        `UPDATE payments SET
          status = 'completed',
          provider = 'paychangu',
          provider_transaction_id = $1,
          completed_at = NOW()
        WHERE id = $2`,
        [data.id, payment.id]
      );

      // Update invoice
      if (payment.invoice_id) {
        await pool.query(
          `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1`,
          [payment.invoice_id]
        );
      }

      // Activate campaign
      if (payment.campaign_id) {
        await pool.query(
          `UPDATE campaigns SET
            status = 'active',
            published_at = COALESCE(published_at, NOW()),
            updated_at = NOW()
          WHERE id = $1`,
          [payment.campaign_id]
        );

        console.log(`Campaign ${payment.campaign_id} activated via webhook`);
      }

      return res.status(200).json({ received: true });
    }

    // For other events, just acknowledge
    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
