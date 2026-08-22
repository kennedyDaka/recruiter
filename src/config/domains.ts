/**
 * Domain Configuration
 * ====================
 * Update these values when the official domain is ready.
 * This is the single source of truth for all domain-related URLs.
 *
 * Currently:  operon-recruit-psi.vercel.app  (Vercel preview)
 * Future:     your-domain.mw  or  your-domain.com
 */

export const DOMAIN_CONFIG = {
  /** Primary app domain — used in OG tags, email links, PayChangu callbacks, etc. */
  APP_URL: process.env.APP_URL || "https://operon-recruit-psi.vercel.app",

  /** Short brand name for emails and UI */
  BRAND_NAME: "Operon Recruit",

  /** Support email */
  SUPPORT_EMAIL: "support@operon-recruit-psi.vercel.app", // Update when domain is ready

  /** Google OAuth redirect (must match Google Cloud Console) */
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ||
    "https://operon-recruit-psi.vercel.app/api/auth/google/callback",

  /** PayChangu webhook URL (must match PayChangu dashboard) */
  PAYCHANGU_WEBHOOK_URL:
    process.env.PAYCHANGU_WEBHOOK_URL ||
    "https://operon-recruit-psi.vercel.app/api/payment/webhook",

  /** PayChangu callback URL (where PayChangu redirects browser after payment) */
  PAYCHANGU_CALLBACK_URL:
    process.env.PAYCHANGU_CALLBACK_URL ||
    "https://operon-recruit-psi.vercel.app/api/payment/webhook",

  /** PayChangu cancel URL (where PayChangu redirects on cancel/failure) */
  PAYCHANGU_CANCEL_URL:
    process.env.PAYCHANGU_CANCEL_URL ||
    "https://operon-recruit-psi.vercel.app/payment/failed",
} as const;

/**
 * Domain Migration Checklist
 * ==========================
 * When you get the official domain:
 *
 * 1. Update APP_URL, SUPPORT_EMAIL, GOOGLE_REDIRECT_URI, PAYCHANGU_*_URL above
 * 2. Add the domain in Vercel → Settings → Domains
 * 3. Configure DNS:
 *    - A record:    76.76.21.21
 *    - CNAME:       cname.vercel-dns.com
 * 4. Update Google Cloud Console:
 *    - Add new domain to authorized origins
 *    - Update redirect URI to new callback URL
 * 5. Update PayChangu dashboard:
 *    - Update webhook URL
 *    - Update callback URL
 *    - Update cancel URL
 * 6. Set environment variables in Vercel:
 *    - APP_URL=https://your-domain.com
 *    - GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
 *    - PAYCHANGU_WEBHOOK_URL=https://your-domain.com/api/payment/webhook
 *    - PAYCHANGU_CALLBACK_URL=https://your-domain.com/api/payment/webhook
 *    - PAYCHANGU_CANCEL_URL=https://your-domain.com/payment/failed
 */
