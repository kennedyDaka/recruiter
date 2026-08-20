/**
 * Candidate email templates — one source of truth for the automated mails
 * the platform sends. Templates are rendered with simple {{token}} variables
 * so recruiters can customise the set later without touching the triggers.
 *
 * Emails are queued as `communications` rows (status "queued") and the email
 * worker marks them "sent". When SMTP credentials are configured, the send
 * helpers dispatch immediately as well.
 */

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
  { subject: string; body: string }
> = {
  application_received: {
    subject: "Application received — {{job_title}}",
    body: `Dear {{first_name}},

Thank you for applying for the role of {{job_title}} at {{company}}.

We have received your application (reference {{reference}}) and it is now being reviewed by our recruitment team. We will be in touch with the next steps.

Best regards,
The {{company}} Recruitment Team`,
  },
  shortlisted: {
    subject: "You have been shortlisted — {{job_title}}",
    body: `Dear {{first_name}},

Congratulations! You have been shortlisted for the position of {{job_title}} at {{company}}.

Our team will contact you shortly to arrange the next stage of the process.

Best regards,
The {{company}} Recruitment Team`,
  },
  interview_invitation: {
    subject: "Interview invitation — {{job_title}}",
    body: `Dear {{first_name}},

We are pleased to invite you to an interview for the position of {{job_title}} at {{company}}.

{{#if interview_time}}Date and time: {{interview_time}}{{/if}}
{{#if interview_mode}}Mode: {{interview_mode}}{{/if}}
{{#if interview_location}}Location / link: {{interview_location}}{{/if}}

Please confirm your availability by replying to this email.

Best regards,
The {{company}} Recruitment Team`,
  },
  rejected: {
    subject: "Update on your application — {{job_title}}",
    body: `Dear {{first_name}},

Thank you for your interest in the position of {{job_title}} at {{company}} and for the time you invested in the application process.

After careful consideration, we have decided to move forward with other candidates whose experience more closely matches the requirements of the role. We appreciate your interest and encourage you to apply for future openings.

Best regards,
The {{company}} Recruitment Team`,
  },
  offer: {
    subject: "Congratulations — job offer — {{job_title}}",
    body: `Dear {{first_name}},

We are delighted to offer you the position of {{job_title}} at {{company}}.

Our team will be in touch with the full offer details, including remuneration and start date. We look forward to welcoming you to the team.

Best regards,
The {{company}} Recruitment Team`,
  },
  email_verification: {
    subject: "Confirm your email — Operon Recruit",
    body: `Hello {{first_name}},

Thank you for creating your Operon Recruit account. Please confirm your email address to activate it:

{{verify_url}}

This link expires in 24 hours. If you did not create this account, you can ignore this email.

Best regards,
The Operon Recruit Team`,
  },
  password_reset: {
    subject: "Reset your password — Operon Recruit",
    body: `Hello {{first_name}},

We received a request to reset the password for your Operon Recruit account. Click the link below to choose a new password:

{{reset_url}}

This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will not change.

Best regards,
The Operon Recruit Team`,
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

/** Renders a template with {{token}} variables and simple {{#if token}}…{{/if}} blocks. */
export function renderEmail(
  template: EmailTemplateKey | { subject: string; body: string },
  vars: EmailVars,
): { subject: string; body: string } {
  const source =
    typeof template === "string" ? DEFAULT_EMAIL_TEMPLATES[template] : template;
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
    text.replace(/\{\{#if ([a-z_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, name: string, inner: string) =>
      values[name] ? inner : "",
    );

  const renderTokens = (text: string) =>
    text.replace(/\{\{([a-z_]+)\}\}/g, (match, name: string) => values[name] ?? "");

  return {
    subject: renderTokens(source.subject),
    body: renderTokens(renderSection(source.body)).trim(),
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
): { subject: string; body: string } {
  const override = overrides?.[key];
  if (override && typeof override.subject === "string" && typeof override.body === "string") {
    return { subject: override.subject, body: override.body };
  }
  return DEFAULT_EMAIL_TEMPLATES[key];
}
