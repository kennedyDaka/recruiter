import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Loader2,
  MessageCircle,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  sendBulkEmailsFn,
  sendBulkWhatsAppFn,
  verifyEmailsBulkFn,
} from "@/lib/email.functions";

/**
 * A recipient may have an email, a phone number, or both. Candidates with an
 * email get the verified-email treatment; candidates with only a phone fall
 * back to WhatsApp (when the workspace has WhatsApp enabled).
 */
export type EmailRecipient = {
  email?: string;
  phone?: string;
  name: string;
};

type EmailAssessment = {
  email: string;
  status: "valid" | "risky" | "invalid";
  reason: string;
  checks: string[];
  zeroBounce?: { status: string; sub_status?: string | null };
};

const EMAIL_TEMPLATES = [
  { value: "application_received", label: "Application received" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_invitation", label: "Interview invitation" },
  { value: "rejected", label: "Rejected" },
  { value: "offer", label: "Job offer" },
] as const;

function EmailStatusBadge({ status }: { status: EmailAssessment["status"] }) {
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        <BadgeCheck className="size-3.5" />
        Verified
      </span>
    );
  }
  if (status === "risky") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="size-3.5" />
        Risky
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
      <XCircle className="size-3.5" />
      Invalid
    </span>
  );
}

/**
 * Bulk-messaging dialog used from the campaign pipeline (selected candidates)
 * and the kanban (every candidate in a stage). Email recipients are verified
 * automatically the moment the dialog opens — no button to press — and only
 * verified addresses are sent to. Recipients with no email but a phone number
 * are messaged over WhatsApp instead. Both channels are personalised with the
 * real first name when available.
 */
export function EmailCandidatesDialog({
  open,
  onOpenChange,
  recipients,
  onSent,
  title = "Email candidates",
  description = "Recipients are verified automatically — only verified addresses are sent to.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: EmailRecipient[];
  onSent?: () => void;
  title?: string;
  description?: string;
}) {
  const verifyFn = useServerFn(verifyEmailsBulkFn);
  const sendFn = useServerFn(sendBulkEmailsFn);
  const sendWhatsAppFn = useServerFn(sendBulkWhatsAppFn);

  const [template, setTemplate] = useState<string>("shortlisted");
  const [results, setResults] = useState<EmailAssessment[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const lastVerifiedRef = useRef("");

  // Email holders (verified in this dialog) vs phone-only candidates (sent
  // over WhatsApp). A candidate with both is treated as email-first.
  const emailRecipients = useMemo(() => {
    const seen = new Set<string>();
    const list: EmailRecipient[] = [];
    for (const recipient of recipients) {
      const email = recipient.email?.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      list.push({ ...recipient, email });
    }
    return list;
  }, [recipients]);

  const whatsappRecipients = useMemo(() => {
    const seen = new Set<string>();
    const list: EmailRecipient[] = [];
    for (const recipient of recipients) {
      if (recipient.email?.trim()) continue;
      const phone = recipient.phone?.trim();
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      list.push({ ...recipient, phone });
    }
    return list;
  }, [recipients]);

  const emails = emailRecipients.map((recipient) => recipient.email ?? "");
  const signature = emails.join("\n");

  // Automatic verification on open / recipient change — no button to press.
  useEffect(() => {
    if (!emails.length) {
      setResults(null);
      setVerifying(false);
      lastVerifiedRef.current = "";
      return;
    }
    if (signature === lastVerifiedRef.current) return;
    lastVerifiedRef.current = signature;
    setVerifying(true);
    const timer = setTimeout(async () => {
      try {
        const result = (await verifyFn({
          data: { emails },
        })) as { results: EmailAssessment[] };
        setResults(result.results);
      } catch {
        setResults(null);
        toast.error("Could not verify these addresses — please try again.");
      } finally {
        setVerifying(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, emails, verifyFn]);

  const validEmails = useMemo(
    () =>
      (results ?? [])
        .filter((result) => result.status === "valid")
        .map((result) => result.email),
    [results],
  );
  const validSet = useMemo(() => new Set(validEmails), [validEmails]);
  const resultByEmail = useMemo(
    () => new Map((results ?? []).map((result) => [result.email, result])),
    [results],
  );

  const send = useMutation({
    mutationFn: async () => {
      if (!validEmails.length) throw new Error("No verified email addresses to send to.");
      return (await sendFn({
        data: {
          emails: validEmails,
          template: template as (typeof EMAIL_TEMPLATES)[number]["value"],
          names: Object.fromEntries(
            emailRecipients
              .filter((recipient) => validSet.has(recipient.email ?? ""))
              .map((recipient) => [
                recipient.email ?? "",
                (recipient.name.split(" ")[0] || recipient.name).trim(),
              ]),
          ),
        },
      })) as { queued: number; skipped: number };
    },
    onSuccess: (result) => {
      toast.success(
        result.queued > 0
          ? `${result.queued} email${result.queued === 1 ? "" : "s"} queued` +
              (result.skipped > 0 ? ` (${result.skipped} skipped)` : "")
          : "Nothing was sent — all addresses failed verification",
      );
      onSent?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendWhatsApp = useMutation({
    mutationFn: async () => {
      if (!whatsappRecipients.length)
        throw new Error("No WhatsApp recipients to message.");
      return (await sendWhatsAppFn({
        data: {
          recipients: whatsappRecipients.map((recipient) => ({
            phone: recipient.phone ?? "",
            name: recipient.name,
          })),
          template: template as (typeof EMAIL_TEMPLATES)[number]["value"],
        },
      })) as { queued: number; skipped: number };
    },
    onSuccess: (result) => {
      toast.success(
        result.queued > 0
          ? `${result.queued} WhatsApp message${result.queued === 1 ? "" : "s"} queued` +
              (result.skipped > 0 ? ` (${result.skipped} skipped)` : "")
          : "Nothing was queued — the phone numbers couldn't be used",
      );
      onSent?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalRecipients = emailRecipients.length + whatsappRecipients.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {totalRecipients === 0 ? (
          <p className="text-sm text-muted-foreground">
            None of the selected candidates have an email address or phone number.
          </p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {emailRecipients.map((recipient) => {
              const result = resultByEmail.get(recipient.email ?? "");
              return (
                <div
                  key={`email-${recipient.email}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{recipient.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{recipient.email}</p>
                  </div>
                  {verifying && !result ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : result ? (
                    <EmailStatusBadge status={result.status} />
                  ) : null}
                </div>
              );
            })}
            {whatsappRecipients.map((recipient) => (
              <div
                key={`wa-${recipient.phone}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{recipient.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{recipient.phone}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </span>
              </div>
            ))}
          </div>
        )}
        {totalRecipients > 0 ? (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">Template</p>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TEMPLATES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recruiter-customised wording from Settings is used when set; each
              message is personalised with the candidate's first name.
              {whatsappRecipients.length > 0
                ? " Candidates without an email are messaged over WhatsApp instead."
                : ""}
            </p>
          </div>
        ) : null}
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => send.mutate()}
            disabled={send.isPending || !validEmails.length || verifying}
          >
            <Send className="mr-2 size-4" />
            {send.isPending ? "Sending…" : `Send to verified (${validEmails.length})`}
          </Button>
          {whatsappRecipients.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => sendWhatsApp.mutate()}
              disabled={sendWhatsApp.isPending}
            >
              <MessageCircle className="mr-2 size-4" />
              {sendWhatsApp.isPending
                ? "Sending…"
                : `Send WhatsApp (${whatsappRecipients.length})`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
