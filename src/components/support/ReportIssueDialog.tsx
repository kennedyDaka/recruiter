/**
 * Report Issue dialog — shown when a user encounters an error or wants
 * to report a problem. Pre-fills technical context so the user doesn't
 * have to explain from scratch.
 *
 * If WhatsApp is configured, offers "Report via WhatsApp" which opens
 * a pre-filled wa.me link. Always offers "Report in-app" as the default.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Bug,
  HelpCircle,
  MessageCircle,
  Send,
  Camera,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createIncidentFn } from "@/lib/incident.functions";

type ErrorContext = {
  title?: string;
  errorType?: string;
  errorMessage?: string;
  campaignId?: string;
  campaignName?: string;
  candidateId?: string;
  candidateName?: string;
  action?: string;
  channel?: string;
};

type ReportIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: ErrorContext;
};

export function ReportIssueDialog({
  open,
  onOpenChange,
  context,
}: ReportIssueDialogProps) {
  const [issueType, setIssueType] = useState<"technical" | "incorrect_info" | "how_to_question">(
    context?.errorType ? "technical" : "technical",
  );
  const [title, setTitle] = useState(context?.title || "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "normal" | "low">("normal");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [incidentRef, setIncidentRef] = useState("");

  const createIncident = useServerFn(createIncidentFn);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setScreenshot(null);
    setSubmitted(false);
    setIncidentRef("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const result = await createIncident({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          source: "user_reported",
          priority,
          issue_type: issueType,
          category: "other",
          error_type: context?.errorType,
          error_message: context?.errorMessage,
          campaign_id: context?.campaignId,
          candidate_id: context?.candidateId,
          action: context?.action,
          channel: context?.channel,
          reference_ids: {
            ...(context?.campaignName ? { campaign: context.campaignName } : {}),
            ...(context?.candidateName ? { candidate: context.candidateName } : {}),
          },
          screenshot_url: screenshot || undefined,
        },
      });
      setIncidentRef(result?.referenceNumber || "OP-00000");
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to create incident:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    const msg = buildWhatsAppMessage();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const buildWhatsAppMessage = () => {
    const lines = [
      "Hello RecruiterMW Support, I need help with an issue.",
      "",
      `Issue: ${title || "Not specified"}`,
      ...(context?.campaignName ? [`Campaign: ${context.campaignName}`] : []),
      ...(context?.candidateName ? [`Candidate: ${context.candidateName}`] : []),
      ...(context?.action ? [`Action: ${context.action}`] : []),
      ...(context?.channel ? [`Channel: ${context.channel}`] : []),
      `Time: ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
      ...(context?.errorType ? [`Error: ${context.errorType}`] : []),
      ...(context?.errorMessage ? [`Details: ${context.errorMessage.slice(0, 200)}`] : []),
      "",
      "Please assist.",
    ];
    return lines.join("\n");
  };

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScreenshot(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const icons = {
    technical: Bug,
    incorrect_info: AlertTriangle,
    how_to_question: HelpCircle,
  };
  const IssueIcon = icons[issueType];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <span className="text-2xl">✅</span> Report Submitted
              </DialogTitle>
              <DialogDescription>
                Your issue has been recorded and our team will review it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm font-medium">Reference Number</p>
                <p className="text-2xl font-bold tracking-wider">{incidentRef}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Save this reference number. You can track the status in{" "}
                <strong>Support Center</strong> from the sidebar.
              </p>
              {context?.errorMessage && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">System Error</p>
                  <p className="mt-1 font-mono text-xs">{context.errorMessage}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IssueIcon className="size-5" />
                Report Issue
              </DialogTitle>
              <DialogDescription>
                {context?.errorType
                  ? "We detected a problem. Describe it below or report via WhatsApp."
                  : "Tell us what went wrong and we'll get back to you."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Pre-filled error context */}
              {context?.errorType && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
                  <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
                    Detected Error
                  </p>
                  <p className="mt-1 font-mono text-xs">{context.errorType}</p>
                  {context.errorMessage && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {context.errorMessage}
                    </p>
                  )}
                </div>
              )}

              {/* Issue Type */}
              <div className="space-y-2">
                <Label>What happened?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "technical", label: "Something isn't working", icon: Bug },
                    { value: "incorrect_info", label: "Something looks wrong", icon: AlertTriangle },
                    { value: "how_to_question", label: "I need help", icon: HelpCircle },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setIssueType(value)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors ${
                        issueType === value
                          ? "border-primary bg-primary/5 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Icon className="size-4" />
                      <span className="text-center leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="issue-title">Title</Label>
                <Input
                  id="issue-title"
                  placeholder="Brief summary of the issue"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="issue-desc">Description (optional)</Label>
                <Textarea
                  id="issue-desc"
                  placeholder="Additional details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">🔴 Critical — Blocking work</SelectItem>
                    <SelectItem value="high">🟠 High — Major issue</SelectItem>
                    <SelectItem value="normal">🟡 Normal — Standard</SelectItem>
                    <SelectItem value="low">🟢 Low — Minor or cosmetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Screenshot */}
              <div className="space-y-2">
                <Label>Screenshot (optional)</Label>
                {screenshot ? (
                  <div className="relative">
                    <img
                      src={screenshot}
                      alt="Screenshot"
                      className="max-h-32 rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted">
                    <Camera className="size-4" />
                    Attach screenshot
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshot}
                    />
                  </label>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="mr-2 size-4" />
                  Report via WhatsApp
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!title.trim() || submitting}
                >
                  <Send className="mr-2 size-4" />
                  {submitting ? "Submitting..." : "Submit Report"}
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
