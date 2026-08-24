/**
 * ErrorWithReport — a reusable error display component that automatically
 * includes a "Report Issue" button with pre-filled context. Use this
 * anywhere an error occurs to give users an instant path to support.
 *
 * Usage:
 *   <ErrorWithReport
 *     title="Interview invitation failed"
 *     error={{ type: "WHATSAPP_TIMEOUT", message: "..." }}
 *     context={{ campaignId, campaignName, candidateName, action: "Send interview invitation", channel: "whatsapp" }}
 *   />
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bug, RefreshCw } from "lucide-react";
import { ReportIssueDialog } from "@/components/support/ReportIssueDialog";

type ErrorWithReportProps = {
  title: string;
  description?: string;
  error?: {
    type?: string;
    message?: string;
  };
  context?: {
    campaignId?: string;
    campaignName?: string;
    candidateId?: string;
    candidateName?: string;
    action?: string;
    channel?: string;
  };
  onRetry?: () => void;
  className?: string;
};

export function ErrorWithReport({
  title,
  description,
  error,
  context,
  onRetry,
  className = "",
}: ErrorWithReportProps) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <h3 className="font-medium text-red-800 dark:text-red-400">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">{description}</p>
            )}
            {error?.type && (
              <p className="mt-2 font-mono text-xs text-red-600/70">{error.type}</p>
            )}
            {error?.message && (
              <p className="mt-1 text-xs text-red-600/60">{error.message}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-1 size-3" />
              Retry
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReportOpen(true)}
          >
            <Bug className="mr-1 size-3" />
            Report Issue
          </Button>
        </div>
      </div>

      <ReportIssueDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        context={{
          title,
          errorType: error?.type,
          errorMessage: error?.message,
          ...context,
        }}
      />
    </>
  );
}
