import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink, Loader2, ArrowRight, PartyPopper } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  const applyUrl = publicToken
    ? `${window.location.origin}/apply/${publicToken}`
    : null;

  const copyLink = () => {
    if (applyUrl) {
      navigator.clipboard.writeText(applyUrl);
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
          {applyUrl ? (
            <div className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-center text-green-700 dark:text-green-300">
                📋 Share this link with candidates
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={applyUrl}
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

              {/* Social Sharing */}
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
                      const text = encodeURIComponent(`To apply click the link below:\n\n${applyUrl}`);
                      window.open(`https://wa.me/?text=${text}`, "_blank");
                    }}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    onClick={() => {
                      const url = encodeURIComponent(applyUrl);
                      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
                    }}
                  >
                    Facebook
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
                    onClick={() => {
                      const url = encodeURIComponent(applyUrl);
                      const text = encodeURIComponent("To apply click the link below");
                      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank");
                    }}
                  >
                    Twitter / X
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                    onClick={() => {
                      const url = encodeURIComponent(applyUrl);
                      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
                    }}
                  >
                    LinkedIn
                  </Button>
                </div>
              </div>

              <Button asChild className="w-full" size="lg">
                <a href={applyUrl} target="_blank" rel="noopener">
                  Open Application Page
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
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
