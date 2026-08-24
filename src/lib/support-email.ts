/**
 * Support Email — sends a support ticket via email when WhatsApp is
 * unavailable or the user prefers email. Uses the same email provider
 * (Resend/SMTP) as the rest of the app.
 */

import { sendEmail } from "@/lib/email-provider";

type SupportTicketInput = {
  /** The user's email address */
  reporterEmail: string;
  /** The user's name */
  reporterName: string;
  /** Incident reference number */
  referenceNumber: string;
  /** Issue title */
  title: string;
  /** Issue description */
  description?: string;
  /** Error type if auto-detected */
  errorType?: string;
  /** Error message if auto-detected */
  errorMessage?: string;
  /** Campaign name */
  campaignName?: string;
  /** Candidate name */
  candidateName?: string;
  /** Action that failed */
  action?: string;
  /** Channel that failed */
  channel?: string;
  /** Priority */
  priority: string;
  /** Screenshot as data URL */
  screenshotUrl?: string;
};

/**
 * Send a support ticket email to the Operon support team.
 * Returns the email send result.
 */
export async function sendSupportTicketEmail(input: SupportTicketInput) {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@operonrecruit.com";

  const priorityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    normal: "🟡",
    low: "🟢",
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0f766e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 18px;">${priorityEmoji[input.priority] || "🟡"} New Support Ticket</h1>
    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${input.referenceNumber}</p>
  </div>

  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; width: 120px;">Reporter</td>
        <td style="padding: 8px 0;"><strong>${input.reporterName}</strong> &lt;${input.reporterEmail}&gt;</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Priority</td>
        <td style="padding: 8px 0;">${priorityEmoji[input.priority]} ${input.priority.charAt(0).toUpperCase() + input.priority.slice(1)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Issue</td>
        <td style="padding: 8px 0;"><strong>${input.title}</strong></td>
      </tr>
      ${input.description ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Description</td>
        <td style="padding: 8px 0;">${input.description}</td>
      </tr>` : ""}
      ${input.campaignName ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Campaign</td>
        <td style="padding: 8px 0;">${input.campaignName}</td>
      </tr>` : ""}
      ${input.candidateName ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Candidate</td>
        <td style="padding: 8px 0;">${input.candidateName}</td>
      </tr>` : ""}
      ${input.action ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Action</td>
        <td style="padding: 8px 0;">${input.action}</td>
      </tr>` : ""}
      ${input.channel ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Channel</td>
        <td style="padding: 8px 0;">${input.channel}</td>
      </tr>` : ""}
      ${input.errorType ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Error Type</td>
        <td style="padding: 8px 0;"><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${input.errorType}</code></td>
      </tr>` : ""}
      ${input.errorMessage ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Error Message</td>
        <td style="padding: 8px 0; font-size: 13px; color: #64748b;">${input.errorMessage.slice(0, 500)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Time</td>
        <td style="padding: 8px 0;">${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
      </tr>
    </table>

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">

    <p style="font-size: 12px; color: #94a3b8; text-align: center;">
      This support ticket was submitted through Operon Recruit.
      Reference: ${input.referenceNumber}
    </p>
  </div>
</body>
</html>`;

  const text = `
Support Ticket ${input.referenceNumber}
${"=".repeat(40)}

Reporter: ${input.reporterName} <${input.reporterEmail}>
Priority: ${input.priority}
Issue: ${input.title}
${input.description ? `Description: ${input.description}\n` : ""}
${input.campaignName ? `Campaign: ${input.campaignName}\n` : ""}
${input.candidateName ? `Candidate: ${input.candidateName}\n` : ""}
${input.action ? `Action: ${input.action}\n` : ""}
${input.channel ? `Channel: ${input.channel}\n` : ""}
${input.errorType ? `Error: ${input.errorType}\n` : ""}
${input.errorMessage ? `Details: ${input.errorMessage}\n` : ""}
Time: ${new Date().toLocaleString("en-GB")}

---
Reference: ${input.referenceNumber}
Operon Recruit — Support System
`;

  // Send to support team
  const result = await sendEmail({
    to: supportEmail,
    subject: `[${input.referenceNumber}] ${input.priority.toUpperCase()}: ${input.title}`,
    text,
    html,
    fromName: "Operon Recruit Support",
  });

  // Also send confirmation to the reporter
  if (result.ok && input.reporterEmail) {
    await sendEmail({
      to: input.reporterEmail,
      subject: `Support Ticket Received — ${input.referenceNumber}`,
      text: `Hello ${input.reporterName},\n\nWe've received your support request.\n\nReference: ${input.referenceNumber}\nIssue: ${input.title}\n\nOur team is reviewing your issue. We'll get back to you as soon as possible.\n\nYou can reply to this email with additional information.\n\nBest regards,\nThe Operon Recruit Team`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0f766e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 18px;">Support Ticket Received</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p>Hello ${input.reporterName},</p>
    <p>We've received your support request.</p>
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0;"><strong>Reference:</strong> ${input.referenceNumber}</p>
      <p style="margin: 8px 0 0;"><strong>Issue:</strong> ${input.title}</p>
    </div>
    <p>Our team is reviewing your issue. We'll get back to you as soon as possible.</p>
    <p>You can reply to this email with additional information.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
    <p style="font-size: 12px; color: #94a3b8; text-align: center;">The Operon Recruit Team</p>
  </div>
</body>
</html>`,
      fromName: "Operon Recruit Support",
    });
  }

  return result;
}
