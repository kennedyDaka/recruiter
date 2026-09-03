/**
 * Domain Configuration
 * ====================
 * Official domain: recruitermw.com
 */

export const DOMAIN_CONFIG = {
  /** Primary app domain — used in OG tags, email links, PayChangu callbacks, etc. */
  APP_URL: process.env.APP_URL || "https://recruitermw.com",

  /** Short brand name for emails and UI */
  BRAND_NAME: "RecruiterMW",

  /** Support email */
  SUPPORT_EMAIL: "support@recruitermw.com",

  /** Google OAuth redirect (must match Google Cloud Console) */
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ||
    "https://recruitermw.com/api/auth/google/callback",

  /** PayChangu webhook URL (must match PayChangu dashboard) */
  PAYCHANGU_WEBHOOK_URL:
    process.env.PAYCHANGU_WEBHOOK_URL ||
    "https://recruitermw.com/api/payment/webhook",

  /** PayChangu callback URL (where PayChangu redirects browser after payment) */
  PAYCHANGU_CALLBACK_URL:
    process.env.PAYCHANGU_CALLBACK_URL ||
    "https://recruitermw.com/api/payment/webhook",

  /** PayChangu cancel URL (where PayChangu redirects on cancel/failure) */
  PAYCHANGU_CANCEL_URL:
    process.env.PAYCHANGU_CANCEL_URL ||
    "https://recruitermw.com/payment/failed",

  /** LinkedIn OAuth redirect (must match LinkedIn App Console) */
  LINKEDIN_REDIRECT_URI:
    process.env.LINKEDIN_REDIRECT_URI ||
    "https://recruitermw.com/api/auth/linkedin/callback",
} as const;
