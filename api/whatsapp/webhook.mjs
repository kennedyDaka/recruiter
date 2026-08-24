/**
 * WhatsApp Cloud API webhook endpoint.
 *
 * Handles two things:
 *   1. GET  — Meta's verification handshake (hub.mode + hub.verify_token + hub.challenge)
 *   2. POST — Incoming message notifications from WhatsApp users
 *
 * Meta sends a GET with ?hub.mode=subscribe&hub.verify_token=<YOUR_TOKEN>&hub.challenge=<RANDOM>
 * If verify_token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN, respond with the challenge.
 *
 * For POST, Meta sends message events. We respond 200 OK and process asynchronously.
 */

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
 * GET — Webhook verification.
 * Meta sends: ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 * We must echo back the challenge if verify_token matches.
 */
async function handleVerification(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("[WhatsApp] Webhook verification failed — token mismatch");
  return res.status(403).json({ error: "Verification failed" });
}

/**
 * POST — Process incoming WhatsApp messages.
 * Logs the message and optionally replies if we have an auto-reply configured.
 */
async function handleNotification(req, res) {
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

    // Acknowledge immediately — Meta retries if we don't respond within 20s
    res.status(200).json({ received: true });

    // Process asynchronously
    processWebhookEvent(payload).catch((err) =>
      console.error("[WhatsApp] Async processing error:", err?.message)
    );
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error?.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: error?.message || "Internal error" });
    }
  }
}

/**
 * Process a WhatsApp webhook event.
 */
async function processWebhookEvent(payload) {
  if (payload.object !== "whatsapp_business_account") return;

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value || {};
      const messages = value.messages || [];
      const contacts = value.contacts || [];

      for (const msg of messages) {
        const from = msg.from; // Phone number (digits only)
        const type = msg.type;
        const contactName = contacts.find((c) => c.wa_id === from)?.profile?.name || "Unknown";

        console.log(`[WhatsApp] Message from ${contactName} (${from}): type=${type}`);

        // Log the incoming message to the database
        try {
          const pool = getPool();
          await pool.query(
            `INSERT INTO whatsapp_messages (direction, from_number, to_number, body, status, external_id, metadata)
             VALUES ('inbound', $1, $2, $3, 'received', $4, $5)`,
            [
              from,
              process.env.WHATSAPP_PHONE_NUMBER_ID || "",
              extractMessageBody(msg),
              msg.id || null,
              JSON.stringify({ contactName, type, timestamp: msg.timestamp }),
            ]
          );
        } catch (dbErr) {
          // Table might not exist yet — that's OK, just log
          console.warn("[WhatsApp] Could not log message to DB:", dbErr?.message);
        }

        // Auto-reply: send a brief acknowledgment if configured
        if (process.env.WHATSAPP_AUTO_REPLY === "true" && from) {
          try {
            const { sendWhatsAppMessage } = await import("../../src/lib/whatsapp-provider.js");
            await sendWhatsAppMessage({
              to: from,
              text: `Thank you for your message, ${contactName}. We have received it and will get back to you shortly.`,
            });
          } catch (replyErr) {
            console.warn("[WhatsApp] Auto-reply failed:", replyErr?.message);
          }
        }
      }
    }
  }
}

/**
 * Extract readable body from a WhatsApp message based on its type.
 */
function extractMessageBody(msg) {
  if (msg.type === "text" && msg.text?.body) return msg.text.body;
  if (msg.type === "image" && msg.image?.caption) return msg.image.caption;
  if (msg.type === "document" && msg.document?.caption) return msg.document.caption;
  if (msg.type === "audio") return "[Audio message]";
  if (msg.type === "video" && msg.video?.caption) return msg.video.caption;
  if (msg.type === "sticker") return "[Sticker]";
  if (msg.type === "location") return `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
  if (msg.type === "interactive") {
    if (msg.interactive?.type === "button_reply") return msg.interactive.button_reply?.title || "";
    if (msg.interactive?.type === "list_reply") return msg.interactive.list_reply?.title || "";
  }
  return `[${msg.type || "unknown"}]`;
}

export default async function handler(req, res) {
  // CORS headers for Meta
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return handleVerification(req, res);
  }

  if (req.method === "POST") {
    return handleNotification(req, res);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
