/**
 * Email provider layer — one place that actually dispatches email.
 *
 * Three modes, resolved per send (tenant settings override env defaults):
 *   - smtp   : nodemailer against any SMTP server (Gmail, Brevo, Mailgun, Zoho, …)
 *   - resend : Resend HTTP API (EMAIL_API_KEY)
 *   - log    : no provider configured — render + record, but don't dispatch.
 *              Keeps development and demo tenants working without secrets.
 *
 * The rest of the app only ever calls sendEmail(); provider selection,
 * transport setup and error handling live here.
 */

export type EmailProviderMode = "smtp" | "resend" | "log";

export type EmailProviderConfig = {
  mode: EmailProviderMode;
  from: string;
  fromName?: string | null;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
  resendApiKey?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  /** Optional per-send override; falls back to the resolved config "from". */
  from?: string;
};

export type SendEmailResult = {
  ok: boolean;
  provider: EmailProviderMode;
  /** Message id when a real provider accepted the mail. */
  messageId?: string;
  error?: string;
};

const env = () => process.env ?? {};

/** Resolves the provider config, preferring tenant settings over env defaults. */
export function resolveEmailConfig(
  tenantConfig?: Partial<EmailProviderConfig> | null,
): EmailProviderConfig {
  const e = env();

  // Tenant settings (set on the Settings page) win when present.
  if (tenantConfig?.mode && tenantConfig.mode !== "log") {
    return normalizeConfig(tenantConfig);
  }

  const envMode = (e["EMAIL_PROVIDER"] ?? "").toLowerCase();
  const mode: EmailProviderMode =
    envMode === "smtp" ? "smtp" : envMode === "resend" ? "resend" : "log";

  const smtp: NonNullable<EmailProviderConfig["smtp"]> = {
    host: e["SMTP_HOST"] ?? "",
    port: Number(e["SMTP_PORT"] ?? 587),
    secure: e["SMTP_SECURE"] === "true",
  };
  if (e["SMTP_USER"]) smtp.user = e["SMTP_USER"];
  if (e["SMTP_PASS"]) smtp.pass = e["SMTP_PASS"];

  const config: Partial<EmailProviderConfig> = {
    mode,
    from: e["EMAIL_FROM"] || "noreply@operonrecruit.com",
    smtp,
  };
  if (e["EMAIL_API_KEY"]) config.resendApiKey = e["EMAIL_API_KEY"];

  // The provider/credentials are platform-level; tenants only brand the
  // from address/name used on their sends.
  if (tenantConfig?.from) config.from = tenantConfig.from;
  if (tenantConfig?.fromName) config.fromName = tenantConfig.fromName;

  return normalizeConfig(config);
}

function normalizeConfig(config: Partial<EmailProviderConfig>): EmailProviderConfig {
  const base: EmailProviderConfig = {
    mode: config.mode ?? "log",
    from: config.from || "noreply@operonrecruit.com",
    fromName: config.fromName ?? null,
  };
  if (config.mode === "smtp") {
    const smtp: NonNullable<EmailProviderConfig["smtp"]> = {
      host: config.smtp?.host ?? "",
      port: config.smtp?.port ?? 587,
      secure: config.smtp?.secure ?? false,
    };
    if (config.smtp?.user) smtp.user = config.smtp.user;
    if (config.smtp?.pass) smtp.pass = config.smtp.pass;
    base.smtp = smtp;
  }
  if (config.mode === "resend" && config.resendApiKey)
    base.resendApiKey = config.resendApiKey;
  return base;
}

/** True when the config is usable (has credentials), false when it falls back to log mode. */
export function emailProviderConfigured(config: EmailProviderConfig): boolean {
  if (config.mode === "smtp") return Boolean(config.smtp?.host);
  if (config.mode === "resend") return Boolean(config.resendApiKey);
  return false;
}

/** Human-readable status line for the Settings page. */
export function emailProviderStatus(config: EmailProviderConfig): {
  label: string;
  configured: boolean;
} {
  if (config.mode === "smtp" && config.smtp?.host)
    return { label: `SMTP — ${config.smtp.host}:${config.smtp.port}`, configured: true };
  if (config.mode === "resend" && config.resendApiKey)
    return {
      label: "Resend API — verify your sending domain at resend.com/domains",
      configured: true,
    };
  return {
    label: "Not configured — emails are recorded but not dispatched",
    configured: false,
  };
}

let smtpTransport: ReturnType<typeof import("nodemailer").createTransport> | null = null;

async function getSmtpTransport(config: EmailProviderConfig) {
  const nodemailer = await import("nodemailer");
  const smtp = config.smtp!;
  smtpTransport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
  });
  return smtpTransport;
}

async function sendViaSmtp(
  config: EmailProviderConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  try {
    const transport = await getSmtpTransport(config);
    const from =
      config.fromName && config.fromName !== "Operon Recruit"
        ? `"${config.fromName}" <${input.from ?? config.from}>`
        : input.from ?? config.from;
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true, provider: "smtp", messageId: String(info.messageId ?? "") };
  } catch (error) {
    return {
      ok: false,
      provider: "smtp",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendViaResend(
  config: EmailProviderConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? config.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        provider: "resend",
        error: `Resend ${response.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await response.json().catch(() => ({}))) as { id?: string };
    const result: SendEmailResult = { ok: true, provider: "resend" };
    if (data.id) result.messageId = data.id;
    return result;
  } catch (error) {
    return {
      ok: false,
      provider: "resend",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sends one email through the resolved provider. In log mode it never
 * dispatches — the caller decides what to record.
 */
export async function sendEmail(
  input: SendEmailInput,
  tenantConfig?: Partial<EmailProviderConfig> | null,
): Promise<SendEmailResult> {
  const config = resolveEmailConfig(tenantConfig);

  if (config.mode === "smtp") return sendViaSmtp(config, input);
  if (config.mode === "resend") return sendViaResend(config, input);

  // Log mode: pretend it worked so the queue drains cleanly in dev.
  console.log(`[Email:log-mode] To: ${input.to} | Subject: ${input.subject}`);
  return { ok: true, provider: "log", messageId: "log-mode" };
}
