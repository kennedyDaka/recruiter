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

const DAILY_RATE = 15_000;
const MIN_DAYS = 3;

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

function json(res, data, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  return res.json(data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, { error: "Method not allowed" }, 405);
  }

  try {
    // Parse body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { campaignId, numDays, customer } = body;

    if (!campaignId || typeof campaignId !== "string") {
      return json(res, { error: "campaignId is required" }, 400);
    }
    if (!numDays || typeof numDays !== "number" || numDays < MIN_DAYS) {
      return json(res, { error: `numDays must be at least ${MIN_DAYS}` }, 400);
    }
    if (!customer?.name || !customer?.email) {
      return json(res, { error: "customer.name and customer.email are required" }, 400);
    }

    // Verify JWT session from cookie
    const cookie = req.headers.cookie || "";
    const sessionMatch = cookie.match(/(?:^|;\s*)hf_session=([^;]+)/);
    if (!sessionMatch) {
      return json(res, { error: "Sign in required to start a payment." }, 401);
    }

    const { jwtVerify } = await import("jose");
    let sessionPayload;
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(sessionMatch[1], secret, { issuer: "hire-flow" });
      sessionPayload = payload;
    } catch {
      return json(res, { error: "Invalid or expired session." }, 401);
    }

    const userId = sessionPayload.userId;
    if (!userId) {
      return json(res, { error: "Invalid session." }, 401);
    }

    const pool = getPool();

    // Get tenant ID from profile
    const profileRes = await pool.query(
      "SELECT tenant_id FROM profiles WHERE id = (SELECT profile_id FROM auth_credentials WHERE user_id = $1) LIMIT 1",
      [userId]
    );
    const tenantId = profileRes.rows[0]?.tenant_id;
    if (!tenantId) {
      return json(res, { error: "No tenant bound to this account." }, 403);
    }

    // Campaign must exist and belong to this tenant
    const campRes = await pool.query(
      "SELECT id, tenant_id, name FROM campaigns WHERE id = $1",
      [campaignId]
    );
    if (campRes.rows.length === 0) {
      return json(res, { error: "Campaign not found." }, 404);
    }
    if (campRes.rows[0].tenant_id !== tenantId) {
      return json(res, { error: "Campaign not found." }, 404);
    }

    const amount = numDays * DAILY_RATE;

    // Get active plan as FK reference
    const planRes = await pool.query(
      "SELECT id FROM plans WHERE active = true ORDER BY sort_order LIMIT 1"
    );
    if (planRes.rows.length === 0) {
      return json(res, { error: "No active plan configured" }, 500);
    }
    const planId = planRes.rows[0].id;

    // Create invoice
    const invNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const invoiceRes = await pool.query(
      `INSERT INTO invoices (tenant_id, plan_id, campaign_id, invoice_number, amount, currency, status, due_at, metadata)
       VALUES ($1, $2, $3, $4, $5, 'MWK', 'pending', NOW() + INTERVAL '7 days', $6)
       RETURNING id, invoice_number, amount, currency`,
      [tenantId, planId, campaignId, invNumber, amount, JSON.stringify({ num_days: numDays, daily_rate: DAILY_RATE })]
    );
    const invoice = invoiceRes.rows[0];

    // Generate tx_ref
    const txRef = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Create payment record
    const payRes = await pool.query(
      `INSERT INTO payments (tenant_id, invoice_id, provider, tx_ref, amount, currency, status, metadata)
       VALUES ($1, $2, 'paychangu', $3, $4, 'MWK', 'pending', $5)
       RETURNING id, tx_ref`,
      [tenantId, invoice.id, txRef, invoice.amount, JSON.stringify({ customer_email: customer.email, customer_name: customer.name })]
    );

    // Mark invoice as processing
    await pool.query("UPDATE invoices SET status = 'processing' WHERE id = $1", [invoice.id]);

    // Call PayChangu API
    const nameParts = customer.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? customer.name;
    const lastName = nameParts.slice(1).join(" ") || firstName;

    const apiUrl = process.env.PAYCHANGU_API_URL || "https://api.paychangu.com";
    const paychanguResponse = await fetch(`${apiUrl}/payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        amount: String(invoice.amount),
        currency: invoice.currency,
        tx_ref: txRef,
        first_name: firstName,
        last_name: lastName,
        email: customer.email,
        callback_url: `${process.env.APP_URL}/api/payment/webhook`,
        return_url: `${process.env.APP_URL}/payment/success?tx_ref=${txRef}`,
        customization: {
          title: "Operon Recruit",
          description: `${numDays}-day campaign activation`,
        },
        meta: {
          invoice_id: invoice.id,
          campaign_id: campaignId,
          campaign_name: campRes.rows[0].name,
          num_days: numDays,
        },
      }),
    });

    const paychanguData = await paychanguResponse.json();

    if (!paychanguResponse.ok || !paychanguData.data?.checkout_url) {
      await pool.query(
        "UPDATE payments SET status = 'failed', error_message = $1, failed_at = NOW() WHERE id = $2",
        [paychanguData.message || "Failed to create checkout", payRes.rows[0].id]
      );
      await pool.query("UPDATE invoices SET status = 'failed' WHERE id = $1", [invoice.id]);
      console.error("PayChangu error:", JSON.stringify(paychanguData));
      return json(res, { error: "Failed to initiate payment" }, 500);
    }

    return json(res, {
      success: true,
      paymentId: payRes.rows[0].id,
      txRef,
      checkoutUrl: paychanguData.data.checkout_url,
    });
  } catch (error) {
    console.error("Payment initiation error:", error?.message, error?.stack);
    return json(res, { error: error?.message || "Internal server error" }, 500);
  }
}
