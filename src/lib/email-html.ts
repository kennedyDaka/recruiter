/**
 * Professional HTML email layout system for Operon Recruit.
 *
 * Every email sent from the platform gets a consistent branded look:
 *   - Clean header with Operon Recruit logo
 *   - Content body
 *   - Footer with company info
 *
 * The design uses table-based layout for maximum email client compatibility.
 */

const BRAND = {
  primary: "#2563eb",       // Blue-600
  primaryDark: "#1d4ed8",   // Blue-700
  bg: "#f8fafc",            // Slate-50
  card: "#ffffff",
  text: "#1e293b",          // Slate-800
  muted: "#64748b",         // Slate-500
  border: "#e2e8f0",        // Slate-200
  success: "#16a34a",       // Green-600
  successBg: "#f0fdf4",     // Green-50
  warning: "#d97706",       // Amber-600
  warningBg: "#fffbeb",     // Amber-50
  danger: "#dc2626",        // Red-600
  dangerBg: "#fef2f2",      // Red-50
  accent: "#7c3aed",        // Violet-600
};

type EmailLayoutOpts = {
  /** Pre-rendered HTML content body (inside the card). */
  body: string;
  /** If true, show a green success banner at the top. */
  success?: boolean;
  /** If true, show a warning banner at the top. */
  warning?: boolean;
};

/**
 * Wraps content in a professional branded email shell.
 * All styles are inline for email client compatibility.
 */
export function emailLayout(opts: EmailLayoutOpts): string {
  const banner = opts.success
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.success};border-radius:8px 8px 0 0;">
         <tr><td style="padding:12px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-align:center;">✓&nbsp; Action completed successfully</td></tr>
       </table>`
    : opts.warning
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.warning};border-radius:8px 8px 0 0;">
         <tr><td style="padding:12px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-align:center;">⚠&nbsp; Please review this message</td></tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${BRAND.bg};">
<tr><td align="center" style="padding:32px 16px;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">

  <!-- Header -->
  <tr><td style="padding-bottom:24px;text-align:center;">
    <a href="https://operon-recruit-psi.vercel.app" style="text-decoration:none;">
      <span style="font-family:Arial,sans-serif;font-size:26px;font-weight:800;color:${BRAND.primary};letter-spacing:-0.5px;">Operon Recruit</span>
    </a>
  </td></tr>

  <!-- Card -->
  <tr><td style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    ${banner}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="padding:32px;">
        ${opts.body}
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;text-align:center;">
    <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
      This is an automated message from Operon Recruit — intelligent hiring for Africa.
    </p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
      © ${new Date().getFullYear()} Operon Recruit. All rights reserved.
    </p>
  </td></tr>

</table>
<!-- /Outer wrapper -->

</td></tr>
</table>
</body>
</html>`;
}

// ─── Reusable styled components ──────────────────────────────────────────

/** Styled heading inside the card. */
export function heading(text: string, level: 1 | 2 = 1): string {
  const size = level === 1 ? "22px" : "18px";
  const color = BRAND.text;
  return `<h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:${size};font-weight:700;color:${color};">${text}</h1>`;
}

/** Styled paragraph. */
export function paragraph(text: string, opts?: { muted?: boolean; mt?: number }): string {
  const color = opts?.muted ? BRAND.muted : BRAND.text;
  const mt = opts?.mt ?? 12;
  return `<p style="margin:${mt}px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:${color};">${text}</p>`;
}

/** Primary CTA button. */
export function ctaButton(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 0;">
    <tr><td style="background-color:${BRAND.primary};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

/** Info box (colored background). */
export function infoBox(text: string, variant: "success" | "warning" | "danger" | "info" = "info"): string {
  const colors = {
    success: { bg: BRAND.successBg, border: "#bbf7d0", text: BRAND.success },
    warning: { bg: BRAND.warningBg, border: "#fde68a", text: BRAND.warning },
    danger:  { bg: BRAND.dangerBg,  border: "#fecaca", text: BRAND.danger },
    info:    { bg: "#eff6ff",       border: "#bfdbfe", text: BRAND.primary },
  };
  const c = colors[variant];
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0 0;border:1px solid ${c.border};border-radius:8px;background-color:${c.bg};">
    <tr><td style="padding:16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:${c.text};">${text}</td></tr>
  </table>`;
}

/** Divider line. */
export function divider(): string {
  return `<hr style="margin:24px 0;border:none;border-top:1px solid ${BRAND.border};" />`;
}

/** Badge (inline colored tag). */
export function badge(text: string, color: string = BRAND.primary): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;color:#ffffff;background-color:${color};">${text}</span>`;
}

/** Key-value detail row (label: value). */
export function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-family:Arial,sans-serif;font-size:13px;color:${BRAND.muted};width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-family:Arial,sans-serif;font-size:14px;color:${BRAND.text};font-weight:500;">${value}</td>
  </tr>`;
}
