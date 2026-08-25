import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/payment/failed")({
  component: PaymentFailed,
});

function PaymentFailed() {
  const [txRef, setTxRef] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [reason, setReason] = useState("Payment was not completed");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setTxRef(params.get("tx_ref") || "");
      setCampaignId(params.get("campaign_id") || "");
      setReason(params.get("reason") || "Payment was not completed");
    } catch {
      // SSR or error
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-red-50 dark:from-slate-900 dark:to-red-950 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">😔</span>
          </div>
          <h1 className="text-2xl font-bold text-red-700 dark:text-red-400">
            Payment Not Completed
          </h1>
          <p className="text-muted-foreground mt-2">
            {reason === "cancelled"
              ? "You cancelled the payment. No charges were made."
              : "Your payment could not be processed. No charges were made."}
          </p>
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
              className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
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
        <p className="text-xs text-center text-muted-foreground mt-4">
          If you were charged but see this error, please contact support with your transaction reference.
        </p>
      </div>
    </div>
  );
}
