import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink, Loader2, ArrowRight, PartyPopper } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/* ── Inline brand icons (no extra deps) ── */
function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
}

function FacebookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  );
}

function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  );
}

function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  );
}

export const Route = createFileRoute("/payment/success")({
  component: PaymentSuccess,
});

function PaymentSuccess() {
  const search = Route.useSearch();
  const txRef = (search as any).tx_ref;
  const campaignId = (search as any).campaign_id;
  const [copied, setCopied] = useState(false);

  // Poll payment status via Vercel API (not TanStack route — won't work on Vercel)
  const { data: paymentStatus, isLoading: paymentLoading } = useQuery({
    queryKey: ["payment-status", txRef],
    queryFn: async () => {
      if (!txRef) return null;
      const res = await fetch(`/api/payment/status/${txRef}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!txRef,
    refetchInterval: (query) => {
      if (query.state.data?.status === "completed" || query.state.data?.status === "paid") return false;
      return 2000;
    },
  });

  // Fetch campaign details including public_token
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign-publish-status", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const res = await fetch(`/api/payment/status/campaign/${campaignId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.status === "active" && (d?.publicToken || d?.public_token)) return false;
      return 2000;
    },
  });

  const isPaid = paymentStatus?.status === "completed" || paymentStatus?.status === "paid";
  const isPending = paymentStatus?.status === "pending" || paymentStatus?.status === "processing";
  const isFailed = paymentStatus?.status === "failed";
  // API returns camelCase, React checks camelCase
  const publicToken = campaign?.publicToken || campaign?.public_token;
  const shareUrl = publicToken
    ? `${window.location.origin}/share/${publicToken}`
    : null;
  const applyUrl = publicToken
    ? `${window.location.origin}/apply/${publicToken}`
    : null;

  // Build platform-specific share texts
  const campaignName = campaign?.name || "";
  const companyName = "Test Company Ltd";
  const fullShareText = shareUrl
    ? [
        `📋 ${campaignName}`,
        `🏢 ${companyName}`,
        `📍 Lilongwe, Central, Malawi`,
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
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK" }).format(amount);

  // Loading state
  if (paymentLoading || campaignLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px] bg-gradient-to-br from-slate-50 to-teal-50 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-lg shadow-lg">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-14 w-14 text-primary animate-spin mb-4" />
              <h2 className="text-xl font-semibold">Verifying Your Payment</h2>
              <p className="text-muted-foreground mt-2">
                Please wait while we confirm your payment with PayChangu...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Failed state
  if (isFailed) {
    return (
      <div className="flex items-center justify min-h-[600px] bg-gradient-to-br from-slate-50 to-red-50 dark:from-slate-900 dark:to-red-950">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <span className="text-3xl">❌</span>
              </div>
            </div>
            <CardTitle className="text-2xl text-red-700 dark:text-red-400">Payment Failed</CardTitle>
            <CardDescription>
              Your payment could not be processed. No charges were made.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {txRef && (
              <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>Transaction Reference:</strong> {txRef}
                </p>
              </div>
            )}
            <div className="space-y-2">
              {campaignId && (
                <Button asChild className="w-full" variant="outline">
                  <Link to="/campaigns/$campaignId/pay" params={{ campaignId }}>
                    Try Payment Again
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" className="w-full">
                <Link to="/dashboard">Back to Dashboard</Link>
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              If you were charged but see this error, please contact support with your transaction reference.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pending / Processing — still waiting
  if (!isPaid) {
    return (
      <div className="flex items-center justify-center min-h-[600px] bg-gradient-to-br from-slate-50 to-amber-50 dark:from-slate-900 dark:to-amber-950">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-16 w-16 text-amber-500 animate-spin" />
            </div>
            <CardTitle className="text-2xl">Processing Payment...</CardTitle>
            <CardDescription>
              We're waiting for PayChangu to confirm your payment. This may take a moment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-center text-muted-foreground">
              Please do not close this page. You'll be redirected automatically once confirmed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ PAID — Campaign published
  return (
    <div className="flex items-center justify-center min-h-[600px] bg-gradient-to-br from-slate-50 to-green-50 dark:from-slate-900 dark:to-green-950">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl text-green-700 dark:text-green-400">
            Campaign Published!
          </CardTitle>
          <CardDescription>
            Payment confirmed. Your campaign is now live and accepting applications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Payment Details */}
          <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg space-y-2">
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
            <div className="flex justify-between text-sm">
              <span className="text-green-700 dark:text-green-300">Reference</span>
              <span className="font-medium text-green-800 dark:text-green-200 text-xs">
                {txRef}
              </span>
            </div>
          </div>

          {/* Application Link — The Key Feature */}
          {shareUrl ? (
            <div className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-center text-green-700 dark:text-green-300">
                📋 Share this vacancy with candidates
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-md font-mono"
                />
                <Button size="sm" onClick={copyLink} variant="outline">
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Social Sharing with brand icons — full vacancy text for WhatsApp/Facebook/LinkedIn, short for X */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-center text-muted-foreground">
                  Share vacancy to socials
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                    onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(fullShareText)}`, "_blank");
                    }}
                  >
                    <WhatsAppIcon className="h-4 w-4 mr-1.5" />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    onClick={() => {
                      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl!)}&quote=${encodeURIComponent(fullShareText)}`, "_blank");
                    }}
                  >
                    <FacebookIcon className="h-4 w-4 mr-1.5" />
                    Facebook
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
                    onClick={() => {
                      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl!)}&text=${encodeURIComponent(shortShareText)}`, "_blank");
                    }}
                  >
                    <XIcon className="h-4 w-4 mr-1.5" />
                    Twitter / X
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                    onClick={() => {
                      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl!)}`, "_blank");
                    }}
                  >
                    <LinkedInIcon className="h-4 w-4 mr-1.5" />
                    LinkedIn
                  </Button>
                </div>
              </div>

              {/* Open vacancy page + apply page */}
              <div className="flex gap-2">
                <Button asChild className="flex-1" size="lg" variant="outline">
                  <a href={shareUrl} target="_blank" rel="noopener">
                    View Vacancy Page
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild className="flex-1" size="lg">                   <a href={applyUrl ?? undefined} target="_blank" rel="noopener">
                    Open Application
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Generating application link...
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="space-y-2 pt-2">
            <Button asChild className="w-full" variant="outline">
              <Link to="/campaigns">
                View All Campaigns
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground mt-4">
            Share the application link with candidates to start receiving applications.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
