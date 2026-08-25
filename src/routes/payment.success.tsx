import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";

export const Route = createFileRoute("/payment/success")({
  component: PaymentSuccess,
});

function PaymentSuccess() {
  const [txRef, setTxRef] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [copied, setCopied] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    try {
      setIsClient(true);
      const params = new URLSearchParams(window.location.search);
      setTxRef(params.get("tx_ref") || "");
      setCampaignId(params.get("campaign_id") || "");
    } catch {
      // SSR or error — leave defaults
    }
  }, []);

  const { data: paymentStatus, isLoading: paymentLoading } = useQuery({
    queryKey: ["payment-status", txRef],
    queryFn: async () => {
      if (!txRef) return null;
      const res = await fetch(`/api/payment/status/${txRef}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!txRef,
    refetchInterval: (query: any) => {
      if (query.state.data?.status === "completed" || query.state.data?.status === "paid") return false;
      return 2000;
    },
  });

  const resolvedCampaignId = campaignId || paymentStatus?.campaignId || null;

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign-publish-status", resolvedCampaignId],
    queryFn: async () => {
      if (!resolvedCampaignId) return null;
      const res = await fetch(`/api/payment/status/campaign/${resolvedCampaignId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!resolvedCampaignId,
    refetchInterval: (query: any) => {
      const d = query.state.data;
      if (d?.status === "active" && (d?.publicToken || d?.public_token)) return false;
      return 2000;
    },
  });

  const isPaid = paymentStatus?.status === "completed" || paymentStatus?.status === "paid";
  const isPending = paymentStatus?.status === "pending" || paymentStatus?.status === "processing";
  const isFailed = paymentStatus?.status === "failed";

  const publicToken = campaign?.publicToken || campaign?.public_token;
  const shareUrl = isClient && publicToken
    ? `${window.location.origin}/share/${publicToken}`
    : null;
  const applyUrl = isClient && publicToken
    ? `${window.location.origin}/apply/${publicToken}`
    : null;

  const campaignName = campaign?.name || "";
  const companyName = campaign?.companyName || "Your Company";
  const fullShareText = shareUrl
    ? [
        `📋 ${campaignName}`,
        `🏢 ${companyName}`,
        ``,
        `Apply here 👇`,
        shareUrl,
      ].join("\n")
    : "";
  const shortShareText = `${campaignName} at ${companyName}`;

  const copyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK" }).format(amount);

  // ── Loading state ──
  if (!isClient || paymentLoading || (txRef && campaignLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center">
          <div className="animate-spin h-14 w-14 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Verifying Your Payment</h2>
          <p className="text-muted-foreground mt-2">
            Please wait while we confirm your payment...
          </p>
        </div>
      </div>
    );
  }

  // ── Failed ──
  if (isFailed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-red-50 dark:from-slate-900 dark:to-red-950 p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-400">Payment Failed</h1>
            <p className="text-muted-foreground mt-2">Your payment could not be processed. No charges were made.</p>
          </div>
          {txRef && (
            <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg mb-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Transaction Reference:</strong> {txRef}
              </p>
            </div>
          )}
          <div className="space-y-2">
            {campaignId && (
              <a
                href={`/campaigns/${campaignId}/pay`}
                className="block w-full text-center px-4 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
              >
                Try Payment Again →
              </a>
            )}
            <a
              href="/dashboard"
              className="block w-full text-center px-4 py-3 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Pending / Processing ──
  if (!isPaid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-amber-50 dark:from-slate-900 dark:to-amber-950 p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center">
          <div className="animate-spin h-16 w-16 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Processing Payment...</h1>
          <p className="text-muted-foreground mt-2">
            We're waiting for payment confirmation. This may take a moment.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Please do not close this page.
          </p>
        </div>
      </div>
    );
  }

  // ── ✅ PAID — Campaign Published ──
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-green-50 dark:from-slate-900 dark:to-green-950 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎉</span>
          </div>
          <h1 className="text-2xl font-bold text-green-700 dark:text-green-400">
            Campaign Published!
          </h1>
          <p className="text-muted-foreground mt-2">
            Payment confirmed. Your campaign is now live and accepting applications.
          </p>
        </div>

        {/* Payment Details */}
        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg space-y-2 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-green-700 dark:text-green-300">Campaign</span>
            <span className="font-medium text-green-800 dark:text-green-200">
              {campaign?.name || campaignId}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-green-700 dark:text-green-300">Amount Paid</span>
            <span className="font-medium text-green-800 dark:text-green-200">
              {paymentStatus?.amount ? fmt(paymentStatus.amount) : "—"}
            </span>
          </div>
          {txRef && (
            <div className="flex justify-between text-sm">
              <span className="text-green-700 dark:text-green-300">Reference</span>
              <span className="font-medium text-green-800 dark:text-green-200 text-xs">
                {txRef}
              </span>
            </div>
          )}
        </div>

        {/* Share Link */}
        {shareUrl ? (
          <div className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 space-y-3 mb-6">
            <p className="text-sm font-medium text-center text-green-700 dark:text-green-300">
              📋 Share this vacancy with candidates
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-green-200 dark:border-green-800 rounded-md font-mono"
              />
              <button
                onClick={copyLink}
                className="px-3 py-2 border border-border rounded-md hover:bg-accent transition-colors"
              >
                {copied ? "✅" : "📋"}
              </button>
            </div>

            {/* Social sharing buttons */}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(fullShareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(fullShareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-sm transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shortShareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-sm transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Twitter / X
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-sm transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
            </div>

            <div className="flex gap-2 pt-2">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center px-4 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
              >
                View Vacancy Page →
              </a>
              {applyUrl && (
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  Open Application →
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg text-center mb-6">
            <div className="animate-spin h-5 w-5 border-2 border-amber-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Generating application link...
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="space-y-2">
          <a
            href="/campaigns"
            className="block w-full text-center px-4 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
          >
            View All Campaigns →
          </a>
          <a
            href="/dashboard"
            className="block w-full text-center px-4 py-3 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Share the application link with candidates to start receiving applications.
        </p>
      </div>
    </div>
  );
}
