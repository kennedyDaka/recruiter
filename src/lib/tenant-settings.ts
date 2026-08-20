/**
 * Tenant-level configuration, stored as a JSON string in tenants.settings.
 * Everything here is opt-in — defaults keep the classic manual pipeline.
 */

export type AutoPipelineSettings = {
  /** Master switch. Off by default; recruiters enable it explicitly. */
  enabled: boolean;
  /** Eligible applications with score >= this go straight to Shortlisted. */
  shortlistMin: number;
  /** Eligible applications with score >= this go to Manual Review. */
  reviewMin: number;
};

/**
 * Tenant email preferences. Providers and API keys are platform-level (env:
 * EMAIL_PROVIDER / EMAIL_API_KEY / SMTP_* / ZEROBOUNCE_API_KEY) — tenants only
 * brand the from address and toggle automatic verification. Recruiters are
 * not expected to configure SMTP/Resend/ZeroBounce themselves.
 */
export type EmailSettings = {
  /** Optional from-address override; platform default (EMAIL_FROM) used when empty. */
  from: string;
  fromName: string;
  /** Master switch for automatic email verification (default on). */
  verifyEmails: boolean;
};

/**
 * Optional recruiter overrides for the automated email templates. Only keys
 * present here replace the platform default — `null` explicitly means "use
 * the default", so an empty object keeps everything on the built-ins.
 */
export type EmailTemplateOverride = { subject: string; body: string } | null;

export type EmailTemplateOverrides = Record<string, EmailTemplateOverride>;

/**
 * Tenant WhatsApp preferences. Credentials are platform-level (env:
 * WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID) — tenants only opt in. When
 * enabled, candidates without an email address get automated messages over
 * WhatsApp instead of being silently skipped.
 */
export type WhatsAppSettings = {
  enabled: boolean;
};

/**
 * Where published campaigns are distributed. Everything is opt-in but the
 * free channels (Google Jobs via structured data, the public job feed for
 * Indeed/aggregators) default to on so publishing actually reaches the
 * web. LinkedIn job posting needs an approved partner API, so it is
 * surfaced in settings as a pending integration.
 */
export type DistributionSettings = {
  googleJobs: boolean;
  jobFeed: boolean;
  linkedin: boolean;
};

export type TenantSettings = {
  autoPipeline: AutoPipelineSettings;
  email: EmailSettings;
  emailTemplates: EmailTemplateOverrides;
  whatsapp: WhatsAppSettings;
  distribution: DistributionSettings;
};

export function defaultTenantSettings(): TenantSettings {
  return {
    autoPipeline: { enabled: false, shortlistMin: 80, reviewMin: 60 },
    email: {
      from: "",
      fromName: "",
      verifyEmails: true,
    },
    emailTemplates: {},
    whatsapp: { enabled: false },
    distribution: { googleJobs: true, jobFeed: true, linkedin: false },
  };
}

export function parseTenantSettings(value: unknown): TenantSettings {
  const fallback = defaultTenantSettings();
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<TenantSettings> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const auto = parsed.autoPipeline;
    if (!auto || typeof auto !== "object") return fallback;
    const shortlistMin =
      typeof auto.shortlistMin === "number" && auto.shortlistMin > 0
        ? Math.min(100, Math.round(auto.shortlistMin))
        : fallback.autoPipeline.shortlistMin;
    const reviewMin =
      typeof auto.reviewMin === "number" && auto.reviewMin > 0
        ? Math.min(100, Math.round(auto.reviewMin))
        : fallback.autoPipeline.reviewMin;
    const email = parsed.email;
    const emailSettings: EmailSettings = {
      from: typeof email?.from === "string" ? email.from : "",
      fromName: typeof email?.fromName === "string" ? email.fromName : "",
      // Legacy stored settings may carry provider/key fields — they are inert
      // now and deliberately dropped here.
      verifyEmails:
        typeof email?.verifyEmails === "boolean" ? email.verifyEmails : true,
    };

    // Only carry template keys that are real overrides (subject+body strings);
    // null/absent entries mean "use the default".
    const emailTemplates: EmailTemplateOverrides = {};
    const rawTemplates = parsed.emailTemplates;
    if (rawTemplates && typeof rawTemplates === "object" && !Array.isArray(rawTemplates)) {
      for (const [key, value] of Object.entries(rawTemplates)) {
        if (
          value &&
          typeof value === "object" &&
          typeof (value as { subject?: unknown }).subject === "string" &&
          typeof (value as { body?: unknown }).body === "string"
        ) {
          emailTemplates[key] = {
            subject: (value as { subject: string }).subject,
            body: (value as { body: string }).body,
          };
        }
      }
    }

    const whatsappRaw = parsed.whatsapp;
    const whatsapp: WhatsAppSettings = {
      enabled:
        whatsappRaw && typeof whatsappRaw === "object"
          ? Boolean((whatsappRaw as { enabled?: unknown }).enabled)
          : false,
    };

    const distributionRaw = parsed.distribution;
    const distribution: DistributionSettings = {
      googleJobs:
        distributionRaw && typeof distributionRaw === "object"
          ? Boolean((distributionRaw as { googleJobs?: unknown }).googleJobs)
          : fallback.distribution.googleJobs,
      jobFeed:
        distributionRaw && typeof distributionRaw === "object"
          ? Boolean((distributionRaw as { jobFeed?: unknown }).jobFeed)
          : fallback.distribution.jobFeed,
      linkedin:
        distributionRaw && typeof distributionRaw === "object"
          ? Boolean((distributionRaw as { linkedin?: unknown }).linkedin)
          : fallback.distribution.linkedin,
    };

    return {
      autoPipeline: {
        enabled: Boolean(auto.enabled),
        shortlistMin,
        reviewMin: Math.min(reviewMin, shortlistMin),
      },
      email: emailSettings,
      emailTemplates,
      whatsapp,
      distribution,
    };
  } catch {
    return fallback;
  }
}

/**
 * Maps tenant email settings to provider-layer overrides. The provider and
 * its credentials always come from the platform env — tenants only override
 * the from address/name used on their sends.
 */
export function emailConfigFromSettings(
  settings: TenantSettings,
): Partial<import("./email-provider").EmailProviderConfig> | null {
  const email = settings.email;
  if (!email) return null;
  const base: Partial<import("./email-provider").EmailProviderConfig> = {};
  if (email.from) base.from = email.from;
  if (email.fromName) base.fromName = email.fromName;
  return Object.keys(base).length ? base : null;
}

export function serialiseTenantSettings(settings: TenantSettings): string {
  return JSON.stringify(settings);
}
