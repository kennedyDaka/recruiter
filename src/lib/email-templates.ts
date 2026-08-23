/**
 * Candidate email templates — one source of truth for the automated mails
 * the platform sends. Each template has both a plain-text `body` and an
 * HTML `html` version for rich rendering in modern email clients.
 *
 * Templates are rendered with simple {{token}} variables so recruiters
 * can customise the set later without touching the triggers.
 *
 * Emails are queued as `communications` rows (status "queued") and the email
 * worker marks them "sent". When SMTP credentials are configured, the send
 * helpers dispatch immediately as well.
 */

import {
  emailLayout,
  heading,
  paragraph,
  ctaButton,
  infoBox,
  divider,
  detailRow,
  badge,
} from "./email-html";

export type EmailTemplateKey =
  | "application_received"
  | "shortlisted"
  | "interview_invitation"
  | "rejected"
  | "offer"
  | "email_verification"
  | "password_reset";

export type EmailVars = {
  first_name: string;
  last_name?: string | null;
  job_title?: string | null;
  company?: string | null;
  reference?: string | null;
  location?: string | null;
  /** ISO date/time for interview invitations. */
  interview_time?: string | null;
  interview_mode?: string | null;
  interview_location?: string | null;
  /** Full verification link for the email_verification template. */
  verify_url?: string | null;
  /** Full reset link for the password_reset template. */
  reset_url?: string | null;
};

export const DEFAULT_EMAIL_TEMPLATES: Record<
  EmailTemplateKey,
  { subject: string; body: string; html?: string }
> = {
  // ─── Candidate application received ────────────────────────────────────
  application_received: {
    subject: "Application received — {{job_title}}",
    body: `Dear {{first_name}},\n\nThank you for applying for the role of {{job_title}} at {{company}}.\n\nWe have received your application (reference {{reference}}) and it is now being reviewed by our recruitment team. We will be in touch with the next steps.\n\nBest regards,\nThe {{company}} Recruitment Team`,
    // html is generated dynamically in renderEmail()
  },

  // ─── Shortlisted ───────────────────────────────────────────────────────
  shortlisted: {
    subject: "You have been shortlisted — {{job_title}}",
    body: `Dear {{first_name}},\n\nCongratulations! You have been shortlisted for the position of {{job_title}} at {{company}}.\n\nOur team will contact you shortly to arrange the next stage of the process.\n\nBest regards,\nThe {{company}} Recruitment Team`,
  },

  // ─── Interview invitation ──────────────────────────────────────────────
  interview_invitation: {
    subject: "Interview invitation — {{job_title}}",
    body: `Dear {{first_name}},\n\nWe are pleased to invite you to an interview for the position of {{job_title}} at {{company}}.\n\n{{#if interview_time}}Date and time: {{interview_time}}{{/if}}\n{{#if interview_mode}}Mode: {{interview_mode}}{{/if}}\n{{#if interview_location}}Location / link: {{interview_location}}{{/if}}\n\nPlease confirm your availability by replying to this email.\n\nBest regards,\nThe {{company}} Recruitment Team`,
  },

  // ─── Rejected ──────────────────────────────────────────────────────────
  rejected: {
    subject: "Update on your application — {{job_title}}",
    body: `Dear {{first_name}},\n\nThank you for your interest in the position of {{job_title}} at {{company}} and for the time you invested in the application process.\n\nAfter careful consideration, we have decided to move forward with other candidates whose experience more closely matches the requirements of the role. We appreciate your interest and encourage you to apply for future openings.\n\nBest regards,\nThe {{company}} Recruitment Team`,
  },

  // ─── Job offer ─────────────────────────────────────────────────────────
  offer: {
    subject: "Congratulations — job offer — {{job_title}}",
    body: `Dear {{first_name}},\n\nWe are delighted to offer you the position of {{job_title}} at {{company}}.\n\nOur team will be in touch with the full offer details, including remuneration and start date. We look forward to welcoming you to the team.\n\nBest regards,\nThe {{company}} Recruitment Team`,
  },

  // ─── Email verification (account signup) ───────────────────────────────
  email_verification: {
    subject: "Confirm your email — Operon Recruit",
    body: `Hello {{first_name}},\n\nThank you for creating your Operon Recruit account. Please confirm your email address to activate it:\n\n{{verify_url}}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.\n\nBest regards,\nThe Operon Recruit Team`,
  },

  // ─── Password reset ────────────────────────────────────────────────────
  password_reset: {
    subject: "Reset your password — Operon Recruit",
    body: `Hello {{first_name}},\n\nWe received a request to reset the password for your Operon Recruit account. Click the link below to choose a new password:\n\n{{reset_url}}\n\nThis link expires in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will not change.\n\nBest regards,\nThe Operon Recruit Team`,
  },
};

function formatInterviewTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── HTML template generators ─────────────────────────────────────────────

function htmlApplicationReceived(v: Record<string, string>): string {
  return emailLayout({
    body: `
      ${heading("Application Received")}
      ${paragraph(`Dear <strong>${v.first_name}</strong>,`)}
      ${paragraph(`Thank you for applying for the role of <strong>${v.job_title}</strong> at <strong>${v.company}</strong>.`)}
      ${paragraph("We have received your application and it is now being reviewed by our recruitment team. We will be in touch with the next steps.")}
      ${infoBox(`<strong>Reference:</strong> ${v.reference}`, "info")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph(`<strong>The ${v.company} Recruitment Team</strong>`, { muted: true })}
    `,
  });
}

function htmlShortlisted(v: Record<string, string>): string {
  return emailLayout({
    success: true,
    body: `
      ${heading("You've Been Shortlisted!")}
      ${paragraph(`Dear <strong>${v.first_name}</strong>,`)}
      ${paragraph(`<strong>Congratulations!</strong> You have been shortlisted for the position of <strong>${v.job_title}</strong> at <strong>${v.company}</strong>.`)}
      ${infoBox("Our team will contact you shortly to arrange the next stage of the process.", "success")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph(`<strong>The ${v.company} Recruitment Team</strong>`, { muted: true })}
    `,
  });
}

function htmlInterviewInvitation(v: Record<string, string>): string {
  const details = [
    v.interview_time ? `<strong>Date &amp; Time:</strong> ${v.interview_time}` : "",
    v.interview_mode ? `<strong>Mode:</strong> ${v.interview_mode}` : "",
    v.interview_location ? `<strong>Location:</strong> ${v.interview_location}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  return emailLayout({
    success: true,
    body: `
      ${heading("Interview Invitation")}
      ${paragraph(`Dear <strong>${v.first_name}</strong>,`)}
      ${paragraph(`We are pleased to invite you to an interview for the position of <strong>${v.job_title}</strong> at <strong>${v.company}</strong>.`)}
      ${details ? infoBox(details, "info") : ""}
      ${paragraph("Please confirm your availability by replying to this email.")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph(`<strong>The ${v.company} Recruitment Team</strong>`, { muted: true })}
    `,
  });
}

function htmlRejected(v: Record<string, string>): string {
  return emailLayout({
    warning: true,
    body: `
      ${heading("Application Update")}
      ${paragraph(`Dear <strong>${v.first_name}</strong>,`)}
      ${paragraph(`Thank you for your interest in the position of <strong>${v.job_title}</strong> at <strong>${v.company}</strong> and for the time you invested in the application process.`)}
      ${paragraph("After careful consideration, we have decided to move forward with other candidates whose experience more closely matches the requirements of the role. We appreciate your interest and encourage you to apply for future openings.")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph(`<strong>The ${v.company} Recruitment Team</strong>`, { muted: true })}
    `,
  });
}

function htmlOffer(v: Record<string, string>): string {
  return emailLayout({
    success: true,
    body: `
      ${heading("🎉 Job Offer")}
      ${paragraph(`Dear <strong>${v.first_name}</strong>,`)}
      ${paragraph(`<strong>We are delighted to offer you the position of ${v.job_title} at ${v.company}.</strong>`)}
      ${paragraph("Our team will be in touch with the full offer details, including remuneration and start date. We look forward to welcoming you to the team.")}
      ${infoBox("Please review your offer details and reply to confirm your acceptance.", "success")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph(`<strong>The ${v.company} Recruitment Team</strong>`, { muted: true })}
    `,
  });
}

function htmlEmailVerification(v: Record<string, string>): string {
  return emailLayout({
    body: `
      ${heading("Confirm Your Email")}
      ${paragraph(`Hello <strong>${v.first_name}</strong>,`)}
      ${paragraph("Thank you for creating your Operon Recruit account. Please click the button below to confirm your email address and activate your account.")}
      ${ctaButton("Confirm Email Address", v.verify_url)}
      ${divider()}
      ${infoBox("This link expires in <strong>24 hours</strong>. If you did not create this account, you can safely ignore this email.", "warning")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph("<strong>The Operon Recruit Team</strong>", { muted: true })}
    `,
  });
}

function htmlPasswordReset(v: Record<string, string>): string {
  return emailLayout({
    warning: true,
    body: `
      ${heading("Reset Your Password")}
      ${paragraph(`Hello <strong>${v.first_name}</strong>,`)}
      ${paragraph("We received a request to reset the password for your Operon Recruit account. Click the button below to choose a new password.")}
      ${ctaButton("Reset Password", v.reset_url)}
      ${divider()}
      ${infoBox("This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.", "warning")}
      ${paragraph("Best regards,", { mt: 20 })}
      ${paragraph("<strong>The Operon Recruit Team</strong>", { muted: true })}
    `,
  });
}

const HTML_GENERATORS: Record<EmailTemplateKey, (v: Record<string, string>) => string> = {
  application_received: htmlApplicationReceived,
  shortlisted: htmlShortlisted,
  interview_invitation: htmlInterviewInvitation,
  rejected: htmlRejected,
  offer: htmlOffer,
  email_verification: htmlEmailVerification,
  password_reset: htmlPasswordReset,
};

// ─── Public render function ───────────────────────────────────────────────

/** Renders a template with {{token}} variables and simple {{#if token}}…{{/if}} blocks. */
export function renderEmail(
  template: EmailTemplateKey | { subject: string; body: string; html?: string },
  vars: EmailVars,
): { subject: string; body: string; html: string } {
  const values: Record<string, string> = {
    first_name: vars.first_name ?? "there",
    last_name: vars.last_name ?? "",
    job_title: vars.job_title ?? "the role",
    company: vars.company ?? "our company",
    reference: vars.reference ?? "",
    location: vars.location ?? "",
    interview_time: formatInterviewTime(vars.interview_time) ?? "",
    interview_mode: vars.interview_mode ?? "",
    interview_location: vars.interview_location ?? "",
    verify_url: vars.verify_url ?? "",
    reset_url: vars.reset_url ?? "",
  };

  const renderSection = (text: string) =>
    text.replace(/\{\{#if ([a-z_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, name: string, inner: string) =>
      values[name] ? inner : "",
    );

  const renderTokens = (text: string) =>
    text.replace(/\{\{([a-z_]+)\}\}/g, (_match, name: string) => values[name] ?? "");

  if (typeof template === "string") {
    const source = DEFAULT_EMAIL_TEMPLATES[template];
    const generator = HTML_GENERATORS[template];

    const body = renderTokens(renderSection(source.body)).trim();
    const html = generator(values);

    return {
      subject: renderTokens(source.subject),
      body,
      html,
    };
  }

  // Custom template override (from tenant settings)
  const body = renderTokens(renderSection(template.body)).trim();
  return {
    subject: renderTokens(template.subject),
    body,
    // Custom templates get a simple HTML wrapper
    html: emailLayout({
      body: `
        ${heading("Operon Recruit")}
        ${body.split("\n").map((line) => paragraph(line)).join("\n")}
      `,
    }),
  };
}

/**
 * Resolves a template key to its effective source — the tenant's override
 * when present, otherwise the platform default. Overrides carry the same
 * {{variable}} syntax, so a recruiter can keep the default subject but
 * rewrite the body and the {{tokens}} still fill in.
 */
export function resolveEmailTemplate(
  key: EmailTemplateKey,
  overrides?: Record<string, { subject: string; body: string } | null> | null,
): { subject: string; body: string; html?: string } {
  const override = overrides?.[key];
  if (override && typeof override.subject === "string" && typeof override.body === "string") {
    return { subject: override.subject, body: override.body };
  }
  return DEFAULT_EMAIL_TEMPLATES[key];
}
