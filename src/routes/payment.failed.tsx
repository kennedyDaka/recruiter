import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, Home } from "lucide-react";

export const Route = createFileRoute("/payment/failed")({
  component: PaymentFailed,
});

function PaymentFailed() {
  const search = Route.useSearch();
  const txRef = (search as any).tx_ref;
  const campaignId = (search as any).campaign_id;
  const reason = (search as any).reason || "Payment was not completed";

  return (
    <div className="flex items-center justify-center min-h-[600px] bg-gradient-to-br from-slate-50 to-red-50 dark:from-slate-900 dark:to-red-950">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <span className="text-3xl">😔</span>
            </div>
          </div>
          <CardTitle className="text-2xl text-red-700 dark:text-red-400">
            Payment Not Completed
          </CardTitle>
          <CardDescription>
            {reason === "cancelled"
              ? "You cancelled the payment. No charges were made."
              : "Your payment could not be processed. No charges were made."}
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

          <p className="text-sm text-center text-muted-foreground">
            You can retry the payment or return to your dashboard.
          </p>

          <div className="space-y-2">
            {campaignId && (
              <Button asChild className="w-full" size="lg">
                <Link to="/campaigns/$campaignId/pay" params={{ campaignId }}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try Payment Again
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link to="/campaigns">
                View Campaigns
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground mt-4">
            If you continue to experience issues, please contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
