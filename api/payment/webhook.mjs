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
  maxDuration: 30,
};

/**
 * Process a successful payment: update payments, invoices, activate campaign.
 */
async function processSuccessfulPayment(pool, txRef, providerChargeId) {
  const paymentResult = await pool.query(
    `SELECT p.id, p.status, p.invoice_id, i.campaign_id
     FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.tx_ref = $1 LIMIT 1`,
    [txRef]
  );

  if (paymentResult.rows.length === 0) {
    console.error("No payment found for tx_ref:", txRef);
    return null;
  }

  const payment = paymentResult.rows[0];

  // Already processed
  if (payment.status === "completed" || payment.status === "paid") {
    return payment.campaign_id;
  }

  // Mark payment completed
  await pool.query(
    `UPDATE payments SET status = 'completed', provider = 'paychangu',
     provider_transaction_id = $1, completed_at = NOW() WHERE id = $2`,
    [providerChargeId || "verified", payment.id]
  );

  // Mark invoice paid
  if (payment.invoice_id) {
    await pool.query(
      `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1`,
      [payment.invoice_id]
    );
  }

  // Activate campaign
  if (payment.campaign_id) {
    const campResult = await pool.query(
      "SELECT status, public_token FROM campaigns WHERE id = $1",
      [payment.campaign_id]
    );
    if (campResult.rows.length > 0) {
      const camp = campResult.rows[0];
      if (!camp.public_token) {
        const rand = () => Math.random().toString(36).slice(2, 10);
        const publicToken = rand() + rand();
        await pool.query(
          `UPDATE campaigns SET
            status = 'active',
            published_at = COALESCE(published_at, NOW()),
            updated_at = NOW(),
            public_token = $1,
            closing_date = NOW() + '30 days'::interval
          WHERE id = $2`,
          [publicToken, payment.campaign_id]
        );
        console.log("Campaign", payment.campaign_id, "activated with token", publicToken);
      } else {
        await pool.query(
          `UPDATE campaigns SET
            status = 'active',
            updated_at = NOW(),
            closing_date = GREATEST(closing_date, NOW()) + '30 days'::interval
          WHERE id = $1`,
          [payment.campaign_id]
        );
        console.log("Campaign", payment.campaign_id, "extended");
      }
    }
  }

  return payment.campaign_id;
}

/**
 * Verify payment directly with PayChangu API.
 * GET https://api.paychangu.com/verify-payment/{tx_ref}
 */
async function verifyWithPayChangu(txRef) {
  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const response = await fetch(
      `https://api.paychangu.com/verify-payment/${encodeURIComponent(txRef)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
      }
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("PayChangu verification error:", error?.message);
    return null;
  }
}

export default async function handler(req, res) {
  // ---------------------------------------------------------------
  // GET: PayChangu redirects the browser to callback_url after
  // a successful payment. We verify with PayChangu server-side,
  // process the payment, and redirect to our success page.
  //
  // Per PayChangu docs:
  //   callback_url → redirect after SUCCESS (with tx_ref appended)
  //   return_url   → redirect after CANCEL/FAILED (with tx_ref & status=failed)
  // ---------------------------------------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const txRef = url.searchParams.get("tx_ref") || "";
    const status = url.searchParams.get("status") || "";

    // PayChangu appends status=failed when redirecting to return_url on cancel
    if (status === "failed" || status === "cancelled") {
      return res.redirect(
        302,
        `/payment/failed?tx_ref=${encodeURIComponent(txRef)}&reason=${encodeURIComponent(status)}`
      );
    }

    if (!txRef) {
      return res.redirect(302, "/payment/failed?reason=missing_reference");
    }

    try {
      const pool = getPool();

      // Check if already processed
      const existing = await pool.query(
        `SELECT p.status, p.invoice_id, i.campaign_id
         FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
         WHERE p.tx_ref = $1 LIMIT 1`,
        [txRef]
      );

      let campaignId = existing.rows[0]?.campaign_id || "";
      const alreadyPaid =
        existing.rows[0]?.status === "completed" ||
        existing.rows[0]?.status === "paid";

      if (!alreadyPaid) {
        // Verify directly with PayChangu before trusting the redirect
        const verification = await verifyWithPayChangu(txRef);
        const payStatus = verification?.data?.status;
        const chargeId = verification?.data?.reference || "";

        if (payStatus === "success") {
          // Process the payment
          campaignId = await processSuccessfulPayment(pool, txRef, chargeId) || campaignId;
          return res.redirect(
            302,
            `/payment/success?tx_ref=${encodeURIComponent(txRef)}&campaign_id=${encodeURIComponent(campaignId)}`
          );
        } else {
          // Payment not successful according to PayChangu
          return res.redirect(
            302,
            `/payment/failed?tx_ref=${encodeURIComponent(txRef)}&campaign_id=${encodeURIComponent(campaignId)}&reason=not_confirmed`
          );
        }
      }

      // Already paid — just redirect to success
      return res.redirect(
        302,
        `/payment/success?tx_ref=${encodeURIComponent(txRef)}&campaign_id=${encodeURIComponent(campaignId)}`
      );
    } catch (error) {
      console.error("GET redirect error:", error?.message);
      // On error, still redirect to success page — it will poll and show loading
      return res.redirect(302, `/payment/success?tx_ref=${encodeURIComponent(txRef)}`);
    }
  }

  // ---------------------------------------------------------------
  // POST: PayChangu webhook (server-to-server IPN notification)
  // ---------------------------------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const signature = req.headers["x-paychangu-signature"] || "";

    // Verify HMAC signature
    const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
    const testMode = process.env.PAYCHANGU_TEST_MODE === "true";

    if (!webhookSecret && !testMode) {
      console.error("PAYCHANGU_WEBHOOK_SECRET is not configured");
      return res.status(503).json({ error: "Webhook not configured" });
    }

    if (webhookSecret) {
      const { createHmac, timingSafeEqual } = await import("node:crypto");
      const expectedHex = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const provided = Buffer.from(signature, "utf8");
      const expected = Buffer.from(expectedHex, "utf8");
      const valid =
        provided.length === expected.length &&
        timingSafeEqual(provided, expected);
      if (!valid) {
        console.error("Webhook signature verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = payload.event;
    const data = payload.data;

    if (event === "charge.success" && data?.tx_ref) {
      const pool = getPool();
      await processSuccessfulPayment(pool, data.tx_ref, data.id || "");
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error("Webhook error:", error?.message, error?.stack);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
