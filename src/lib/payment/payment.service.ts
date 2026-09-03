/**
 * PaymentService — provider-agnostic billing engine for the ATS.
 *
 * Currently integrates with PayChangu for Malawi (Airtel Money, TNM Mpamba,
 * Visa, Mastercard, Bank Transfer). Designed to be extended with other
 * providers (Malipo, Stripe, etc.) without changing the calling code.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────

export type PaymentProvider = "paychangu" | "stripe" | "malipo";

export type PaymentMethod = "airtel_money" | "tnm_mpamba" | "visa" | "mastercard" | "bank_transfer";

export type InvoiceStatus =
  "pending" | "processing" | "paid" | "failed" | "cancelled" | "expired" | "refunded";

export type PaymentStatus =
  "pending" | "processing" | "success" | "failed" | "cancelled" | "refunded";

export type SubscriptionStatus = "active" | "cancelled" | "expired" | "past_due";

export interface CreateInvoiceInput {
  tenantId: string;
  planId: string;
  campaignId?: string;
  amount: number;
  currency?: string;
  dueDays?: number;
}

export interface InitiatePaymentInput {
  invoiceId: string;
  paymentMethod: PaymentMethod;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  redirectUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId: string;
  txRef: string;
  checkoutUrl?: string;
  error?: string;
}

export interface WebhookPayload {
  event: string;
  data: {
    id: string;
    tx_ref: string;
    amount: number;
    currency: string;
    status: string;
    charge_id?: string;
    payment_method?: string;
    customer?: {
      email?: string;
      name?: string;
    };
    metadata?: Record<string, unknown>;
  };
}

// ─── Configuration ─────────────────────────────────────────────────

const PAYCHANGU_CONFIG = {
  baseUrl: "https://api.paychangu.com",
  testBaseUrl: "https://api.paychangu.com", // PayChangu uses same base for test/prod
  apiKey: process.env["PAYCHANGU_API_KEY"] ?? "",
  secretKey: process.env["PAYCHANGU_SECRET_KEY"] ?? "",
  webhookSecret: process.env["PAYCHANGU_WEBHOOK_SECRET"] ?? "",
  testMode: process.env["PAYCHANGU_TEST_MODE"] === "true",
};

// ─── Invoice Management ────────────────────────────────────────────

/**
 * Creates a new invoice for a campaign plan purchase.
 */
export const createInvoice = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      planId: z.string().uuid(),
      campaignId: z.string().uuid().optional(),
      amount: z.number().int().positive(),
      currency: z.string().default("MWK"),
      dueDays: z.number().int().positive().default(7),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");

    // The tenant is always the signed-in session's own tenant — never caller
    // supplied.
    const session = await getSessionFromCookieServer();
    if (!session) throw new Error("Sign in required to create an invoice.");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) throw new Error("No tenant is bound to this account.");

    if (data.campaignId) {
      const campaign = await supabaseAdmin
        .from("campaigns")
        .select("id, tenant_id")
        .eq("id", data.campaignId)
        .maybeSingle();
      if (campaign.error || !campaign.data) throw new Error("Campaign not found.");
      if (campaign.data.tenant_id !== tenantId) {
        throw new Error("Campaign not found.");
      }
    }

    // Verify plan exists and is active
    const planRes = await supabaseAdmin
      .from("plans")
      .select("id, name, active")
      .eq("id", data.planId)
      .eq("active", true)
      .maybeSingle();

    if (planRes.error) throw new Error(planRes.error.message);
    if (!planRes.data) throw new Error("Plan not found or inactive");

    // Generate unique invoice number
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + data.dueDays);

    const invoiceRes = await supabaseAdmin
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        plan_id: data.planId,
        campaign_id: data.campaignId ?? null,
        invoice_number: invoiceNumber,
        amount: data.amount,
        currency: data.currency,
        status: "pending",
        due_at: dueAt.toISOString(),
      })
      .select("id, invoice_number, amount, currency, status, due_at")
      .single();

    if (invoiceRes.error) throw new Error(invoiceRes.error.message);

    return invoiceRes.data;
  });

// ─── PayChangu Integration ─────────────────────────────────────────

/**
 * Initiates a PayChangu checkout session for an invoice.
 */
export const initiatePayChanguPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      invoiceId: z.string().uuid(),
      paymentMethod: z.enum(["airtel_money", "tnm_mpamba", "visa", "mastercard", "bank_transfer"]),
      customerEmail: z.string().email(),
      customerName: z.string().min(1),
      customerPhone: z.string().optional(),
      redirectUrl: z.string().url().optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<PaymentResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");

    // Only the invoice's owner tenant may pay it.
    const session = await getSessionFromCookieServer();
    if (!session) throw new Error("Sign in required to initiate a payment.");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) throw new Error("No tenant is bound to this account.");

    // Fetch invoice with plan details
    const invoiceRes = await supabaseAdmin
      .from("invoices")
      .select("id, amount, currency, status, tenant_id, plan:plans(name)")
      .eq("id", data.invoiceId)
      .maybeSingle();

    if (invoiceRes.error) throw new Error(invoiceRes.error.message);
    const invoice = invoiceRes.data;
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.tenant_id !== tenantId) throw new Error("Invoice not found");
    if (invoice.status !== "pending") {
      return {
        success: false,
        paymentId: "",
        txRef: "",
        error: `Invoice is ${invoice.status}, cannot initiate payment`,
      };
    }

    // Generate transaction reference
    const txRef = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Create payment record
    const paymentRes = await supabaseAdmin
      .from("payments")
      .insert({
        tenant_id: invoice.tenant_id,
        invoice_id: invoice.id,
        provider: "paychangu",
        tx_ref: txRef,
        amount: invoice.amount,
        currency: invoice.currency,
        payment_method: data.paymentMethod,
        status: "pending",
        metadata: JSON.stringify({
          customer_email: data.customerEmail,
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
        }),
      })
      .select("id, tx_ref")
      .single();

    if (paymentRes.error) throw new Error(paymentRes.error.message);

    // Update invoice status
    await supabaseAdmin.from("invoices").update({ status: "processing" }).eq("id", invoice.id);

    // Call PayChangu API to create checkout session
    try {
      const planName = Array.isArray(invoice.plan)
        ? ((invoice.plan[0] as { name: string })?.name ?? "Campaign Plan")
        : "Campaign Plan";

      // PayChangu API: POST https://api.paychangu.com/payment
      // Body uses flat first_name/last_name/email fields (not nested customer object)
      const nameParts = data.customerName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? data.customerName;
      const lastName = nameParts.slice(1).join(" ") || firstName;

      const paychanguResponse = await fetch(`${PAYCHANGU_CONFIG.baseUrl}/payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYCHANGU_CONFIG.secretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount: String(invoice.amount),
          currency: invoice.currency,
          tx_ref: txRef,
          first_name: firstName,
          last_name: lastName,
          email: data.customerEmail,
          callback_url: `${process.env["APP_URL"]}/api/payment/webhook`,
          return_url: `${process.env["APP_URL"]}/payment/success?tx_ref=${txRef}`,
          customization: {
            title: "RecruiterMW — " + planName,
            description: "Payment for " + planName,
          },
          meta: {
            invoice_id: invoice.id,
            plan_name: planName,
          },
        }),
      });

      const paychanguData = await paychanguResponse.json();

      if (!paychanguResponse.ok || !paychanguData.data?.checkout_url) {
        throw new Error(paychanguData.message ?? "Failed to create PayChangu checkout");
      }

      return {
        success: true,
        paymentId: paymentRes.data.id,
        txRef,
        checkoutUrl: paychanguData.data.checkout_url,
      };
    } catch (error) {
      // Update payment status to failed
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          failed_at: new Date().toISOString(),
        })
        .eq("tx_ref", txRef);

      await supabaseAdmin.from("invoices").update({ status: "failed" }).eq("id", invoice.id);

      return {
        success: false,
        paymentId: paymentRes.data.id,
        txRef,
        error: error instanceof Error ? error.message : "Payment initiation failed",
      };
    }
  });

// ─── Webhook Handling ──────────────────────────────────────────────

/**
 * Processes PayChangu webhook notifications.
 * Verifies transaction server-side before marking as paid.
 */
export const processPayChanguWebhook = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      payload: z.record(z.unknown()),
      signature: z.string().optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Determine event type — handle both checkout and direct charge formats
    const eventType =
      (data.payload["event_type"] as string) ??
      (data.payload["event"] as string) ??
      "unknown";

    // Log webhook for audit trail
    const webhookLogRes = await supabaseAdmin
      .from("webhook_logs")
      .insert({
        provider: "paychangu",
        event_type: eventType,
        payload: JSON.stringify(data.payload),
        signature: data.signature ?? null,
      })
      .select("id")
      .single();

    if (webhookLogRes.error) {
      console.error("Failed to log webhook:", webhookLogRes.error);
    }

    // Only process successful payments
    // checkout: "charge.success"  |  direct charge: "api.charge.payment"
    const isSuccess =
      eventType === "charge.success" || eventType === "api.charge.payment";

    if (!isSuccess) {
      // Mark webhook as processed but not actionable
      if (webhookLogRes.data) {
        await supabaseAdmin
          .from("webhook_logs")
          .update({ processed: true })
          .eq("id", webhookLogRes.data.id);
      }
      return { processed: true, action: "ignored" };
    }

    // Extract identifiers — direct charges use a flat structure, checkout wraps in "data"
    const webhookData = (data.payload["data"] as Record<string, unknown>) ?? data.payload;
    const txRef = webhookData["tx_ref"] as string;
    const chargeId = webhookData["charge_id"] as string;

    // For direct charges, charge_id is the primary identifier; tx_ref may be absent
    if (!txRef && !chargeId) {
      return { processed: false, error: "Missing tx_ref and charge_id in webhook" };
    }

    // Find the payment record — try tx_ref first, then charge_id
    let paymentRes;
    if (txRef) {
      paymentRes = await supabaseAdmin
        .from("payments")
        .select("id, invoice_id, status, amount, currency, charge_id")
        .eq("tx_ref", txRef)
        .maybeSingle();
    }
    if (!paymentRes?.data && chargeId) {
      paymentRes = await supabaseAdmin
        .from("payments")
        .select("id, invoice_id, status, amount, currency, charge_id")
        .eq("charge_id", chargeId)
        .maybeSingle();
    }
    if (!paymentRes || paymentRes.error || !paymentRes.data) {
      return { processed: false, error: "Payment not found" };
    }

    const payment = paymentRes.data;

    // Skip if already processed
    if (payment.status === "success") {
      return { processed: true, action: "already_verified" };
    }

    // SERVER-SIDE VERIFICATION with PayChangu
    // This is critical — never trust the browser/webhook alone
    try {
      let verifyData: Record<string, unknown>;

      if (payment.charge_id) {
        // Direct charge — verify via charge endpoint
        const verifyResponse = await fetch(
          `${PAYCHANGU_CONFIG.baseUrl}/mobile-money/payments/${payment.charge_id}/verify`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${PAYCHANGU_CONFIG.secretKey}`,
              Accept: "application/json",
            },
          },
        );
        verifyData = await verifyResponse.json();

        if (!verifyResponse.ok || (verifyData.data as Record<string, unknown>)?.status !== "success") {
          await supabaseAdmin
            .from("payments")
            .update({
              status: "failed",
              error_message: `Verification failed: ${(verifyData as Record<string, unknown>).message ?? "Unknown error"}`,
              verified_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          await supabaseAdmin
            .from("invoices")
            .update({ status: "failed" })
            .eq("id", payment.invoice_id);

          return { processed: false, error: "Verification failed" };
        }
      } else {
        // Checkout — verify via tx_ref endpoint
        const verifyResponse = await fetch(
          `${PAYCHANGU_CONFIG.baseUrl}/verify-payment/${txRef}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${PAYCHANGU_CONFIG.secretKey}`,
              Accept: "application/json",
            },
          },
        );
        verifyData = await verifyResponse.json();

        if (!verifyResponse.ok || (verifyData.data as Record<string, unknown>)?.status !== "success") {
          await supabaseAdmin
            .from("payments")
            .update({
              status: "failed",
              error_message: `Verification failed: ${(verifyData.data as Record<string, unknown>)?.message ?? "Unknown error"}`,
              verified_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          await supabaseAdmin
            .from("invoices")
            .update({ status: "failed" })
            .eq("id", payment.invoice_id);

          return { processed: false, error: "Verification failed" };
        }
      }

      // Verify amount matches
      const verifiedAmount = (verifyData.data as Record<string, unknown>)?.amount as number;
      if (verifiedAmount !== payment.amount) {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "failed",
            error_message: `Amount mismatch: expected ${payment.amount}, got ${verifiedAmount}`,
            verified_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        return { processed: false, error: "Amount mismatch" };
      }

      // Payment verified! Update records
      await supabaseAdmin
        .from("payments")
        .update({
          status: "success",
          provider_transaction_id: chargeId,
          verified_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          webhook_received_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      // Update invoice status
      await supabaseAdmin
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", payment.invoice_id);

      // Fetch invoice + metadata to determine num_days for campaign activation
      const invoiceRes = await supabaseAdmin
        .from("invoices")
        .select("id, plan_id, campaign_id, tenant_id, amount, metadata")
        .eq("id", payment.invoice_id)
        .maybeSingle();

      if (invoiceRes.data) {
        const invoice = invoiceRes.data;
        const meta = invoice.metadata ? JSON.parse(invoice.metadata as string) : {};
        const numDays: number = meta.num_days ?? 30;

        // Create subscription record for audit
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + numDays);

        await supabaseAdmin.from("subscriptions").insert({
          tenant_id: invoice.tenant_id,
          plan_id: invoice.plan_id,
          invoice_id: invoice.id,
          campaign_id: invoice.campaign_id,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: "active",
        });

        // Activate or extend campaign — the public token is only generated
        // on first activation. The link is the product: no payment = no link.
        if (invoice.campaign_id) {
          const campaignRes = await supabaseAdmin
            .from("campaigns")
            .select("id, status, closing_date")
            .eq("id", invoice.campaign_id)
            .maybeSingle();

          if (campaignRes.data) {
            if (campaignRes.data.status === "pending_payment") {
              // NEW CAMPAIGN — generate public token and activate
              const publicToken = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
              const closingDate = new Date();
              closingDate.setDate(closingDate.getDate() + numDays);

              await supabaseAdmin
                .from("campaigns")
                .update({
                  status: "active",
                  published_at: new Date().toISOString(),
                  public_token: publicToken,
                  closing_date: closingDate.toISOString(),
                })
                .eq("id", invoice.campaign_id);
            } else if (campaignRes.data.status === "active") {
              // EXTENSION — extend the closing date from current closing or today
              const currentClose = campaignRes.data.closing_date
                ? new Date(campaignRes.data.closing_date)
                : new Date();
              const baseDate = currentClose > new Date() ? currentClose : new Date();
              const newClosing = new Date(baseDate.getTime() + numDays * 86_400_000);

              await supabaseAdmin
                .from("campaigns")
                .update({
                  closing_date: newClosing.toISOString(),
                })
                .eq("id", invoice.campaign_id);
            }
          }
        }
      }

      // Mark webhook as processed
      if (webhookLogRes.data) {
        await supabaseAdmin
          .from("webhook_logs")
          .update({ processed: true })
          .eq("id", webhookLogRes.data.id);
      }

      return { processed: true, action: "activated" };
    } catch (error) {
      // Verification API call failed
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          error_message: `Verification error: ${error instanceof Error ? error.message : "Unknown"}`,
        })
        .eq("id", payment.id);

      return { processed: false, error: "Verification API error" };
    }
  });

// ─── Utility Functions ─────────────────────────────────────────────

/**
 * Checks if a campaign has an active subscription.
 */
export async function isCampaignActive(campaignId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const res = await supabaseAdmin
    .from("subscriptions")
    .select("id, end_date, status")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .maybeSingle();

  if (!res.data) return false;

  // Check if subscription hasn't expired
  const endDate = new Date(res.data.end_date);
  return endDate > new Date();
}

/**
 * Gets the active subscription for a campaign.
 */
export async function getActiveSubscription(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const res = await supabaseAdmin
    .from("subscriptions")
    .select("id, start_date, end_date, status, plans(name, duration_days, price)")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .maybeSingle();

  return res.data;
}

/**
 * Checks and updates expired subscriptions.
 * Should be run periodically (e.g., via cron job).
 */
export async function expireSubscriptions(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date().toISOString();

  // Find active subscriptions that have expired
  const expiredRes = await supabaseAdmin
    .from("subscriptions")
    .select("id, campaign_id, end_date")
    .eq("status", "active");
  // Filter in JS since QueryBuilder lacks .lt()
  if (expiredRes.data) {
    expiredRes.data = expiredRes.data.filter(
      (sub: { end_date?: unknown }) => typeof sub.end_date === "string" && sub.end_date < now,
    );
  }

  if (!expiredRes.data?.length) return 0;

  // Update each expired subscription
  for (const sub of expiredRes.data) {
    await supabaseAdmin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);

    // Deactivate campaign if linked
    if (sub.campaign_id) {
      await supabaseAdmin.from("campaigns").update({ status: "expired" }).eq("id", sub.campaign_id);
    }
  }

  return expiredRes.data.length;
}

/**
 * Seed default plans for a new tenant.
 */
export async function seedDefaultPlans(): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const defaultPlans = [
    {
      name: "3-Day Campaign",
      slug: "3-day",
      description: "Quick 3-day recruitment campaign",
      duration_days: 3,
      price: 45000,
      currency: "MWK",
      candidate_limit: 50,
      recruiter_limit: 2,
      features: JSON.stringify(["basic_scoring", "email_notifications"]),
      active: true,
      sort_order: 1,
    },
    {
      name: "7-Day Campaign",
      slug: "7-day",
      description: "Standard 1-week recruitment campaign",
      duration_days: 7,
      price: 95000,
      currency: "MWK",
      candidate_limit: 100,
      recruiter_limit: 3,
      features: JSON.stringify(["advanced_scoring", "email_notifications", "auto_pipeline"]),
      active: true,
      sort_order: 2,
    },
    {
      name: "30-Day Campaign",
      slug: "30-day",
      description: "Full month recruitment campaign",
      duration_days: 30,
      price: 350000,
      currency: "MWK",
      candidate_limit: 500,
      recruiter_limit: 5,
      features: JSON.stringify([
        "advanced_scoring",
        "email_notifications",
        "auto_pipeline",
        "interview_scheduling",
        "bulk_actions",
      ]),
      active: true,
      sort_order: 3,
    },
    {
      name: "90-Day Campaign",
      slug: "90-day",
      description: "Quarterly recruitment campaign",
      duration_days: 90,
      price: 900000,
      currency: "MWK",
      candidate_limit: 2000,
      recruiter_limit: 10,
      features: JSON.stringify([
        "advanced_scoring",
        "email_notifications",
        "auto_pipeline",
        "interview_scheduling",
        "bulk_actions",
        "analytics",
        "priority_support",
      ]),
      active: true,
      sort_order: 4,
    },
  ];

  for (const plan of defaultPlans) {
    // Upsert by slug
    await supabaseAdmin.from("plans").upsert(plan, { onConflict: "slug" });
  }
}
