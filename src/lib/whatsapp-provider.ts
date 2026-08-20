/**
 * WhatsApp provider layer — one place that dispatches WhatsApp messages via
 * Meta's WhatsApp Cloud API (the official, free-to-start API — no reseller).
 *
 * Two modes, resolved per send:
 *   - api  : real dispatch through the Graph API (WHATSAPP_TOKEN +
 *            WHATSAPP_PHONE_NUMBER_ID). Platform-level credentials from env,
 *            like the email provider.
 *   - log  : no credentials configured — render + record, but don't dispatch.
 *            Keeps development and demo tenants working without secrets.
 *
 * The rest of the app only ever calls sendWhatsAppMessage(); the Cloud API
 * endpoint, auth and error handling live here.
 */

export type WhatsAppConfig = {
  token: string | null;
  phoneNumberId: string | null;
};

export type SendWhatsAppInput = {
  /** International-format phone number (digits only, country code first). */
  to: string;
  /** Plain-text message body (WhatsApp has no subject line). */
  text: string;
};

export type SendWhatsAppResult = {
  ok: boolean;
  provider: "whatsapp" | "log";
  /** Message id when a real provider accepted the message. */
  messageId?: string;
  error?: string;
};

const env = () => process.env ?? {};

/** Resolves the platform-level WhatsApp config from the environment. */
export function resolveWhatsAppConfig(): WhatsAppConfig {
  const e = env();
  return {
    token: e["WHATSAPP_TOKEN"] || null,
    phoneNumberId: e["WHATSAPP_PHONE_NUMBER_ID"] || null,
  };
}

/** True when real dispatch is possible (token + phone number id present). */
export function whatsAppConfigured(config: WhatsAppConfig): boolean {
  return Boolean(config.token && config.phoneNumberId);
}

/** Human-readable status line for the Settings page. */
export function whatsAppStatus(config: WhatsAppConfig): {
  label: string;
  configured: boolean;
} {
  if (whatsAppConfigured(config)) {
    return {
      label: "WhatsApp Cloud API — ready to send",
      configured: true,
    };
  }
  return {
    label: "Not configured — WhatsApp messages are recorded but not dispatched",
    configured: false,
  };
}

/**
 * Normalizes a candidate phone number to the international digits-only format
 * the WhatsApp Cloud API expects (country code first, no +, no spaces).
 * - "+265 998 777 555" → "265998777555"
 * - "0998777555"       → "265998777555" (local number → Malawi country code)
 * - "00 1 555 0100"    → "15550100" (00 international prefix stripped)
 * Returns null when the number can't be made usable (too short / too long).
 */
export function normalizeWhatsAppPhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `265${digits.slice(1)}`;
  if (digits.length < 9 || digits.length > 15) return null;
  return digits;
}

/**
 * Sends one WhatsApp text message through the Cloud API. In log mode it never
 * dispatches — the caller decides what to record.
 */
export async function sendWhatsAppMessage(
  input: SendWhatsAppInput,
  config?: WhatsAppConfig,
): Promise<SendWhatsAppResult> {
  const resolved = config ?? resolveWhatsAppConfig();

  if (!whatsAppConfigured(resolved)) {
    console.log(`[WhatsApp:log-mode] To: ${input.to}`);
    return { ok: true, provider: "log", messageId: "log-mode" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${resolved.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "text",
          text: { body: input.text, preview_url: false },
        }),
      },
    );

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw.slice(0, 200);
      try {
        const parsed = JSON.parse(raw) as {
          error?: { message?: string; error_user_msg?: string };
        };
        message = parsed.error?.error_user_msg ?? parsed.error?.message ?? message;
      } catch {
        // Keep the raw body when it isn't JSON.
      }
      return {
        ok: false,
        provider: "whatsapp",
        error: `WhatsApp ${response.status}: ${message}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
    };
    const result: SendWhatsAppResult = { ok: true, provider: "whatsapp" };
    if (data.messages?.[0]?.id) result.messageId = data.messages[0].id;
    return result;
  } catch (error) {
    return {
      ok: false,
      provider: "whatsapp",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
