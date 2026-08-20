import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/payment/success")({
  component: PaymentSuccess,
});

function PaymentSuccess() {
  // The tx_ref is passed as a query parameter from PayChangu
  const search = Route.useSearch();
  const txRef = (search as any).tx_ref;

  // Fetch payment status
  const { data: paymentStatus, isLoading } = useQuery<{
    txRef: string;
    status: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    completedAt: string | null;
  } | null>({
    queryKey: ["payment-status", txRef],
    queryFn: async () => {
      if (!txRef) return null;
      const response = await fetch(`/api/payment/status/${txRef}`);
      if (!response.ok) throw new Error("Failed to fetch payment status");
      return response.json();
    },
    enabled: !!txRef,
    refetchInterval: (query) => {
      // Stop polling once payment is confirmed
      if (query.state.data?.status === "paid") return false;
      return 2000;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <h2 className="text-xl font-semibold">Verifying Payment</h2>
              <p className="text-muted-foreground mt-2">
                Please wait while we confirm your payment...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = paymentStatus?.status === "paid";

  return (
    <div className="flex items-center justify-center min-h-[600px]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {isPaid ? (
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            ) : (
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {isPaid ? "Payment Successful!" : "Processing Payment..."}
          </CardTitle>
          <CardDescription>
            {isPaid
              ? "Your campaign has been activated and is now live."
              : "We're confirming your payment with PayChangu. This may take a moment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPaid && (
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Transaction Reference:</strong> {txRef}
              </p>
              <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                <strong>Amount:</strong>{" "}
                {new Intl.NumberFormat("en-MW", {
                  style: "currency",
                  currency: "MWK",
                }).format(paymentStatus?.amount ?? 0)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {isPaid ? (
              <>
                <Button asChild className="w-full">
                  <Link to="/campaigns">
                    View Campaigns
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/dashboard">Go to Dashboard</Link>
                </Button>
              </>
            ) : (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for confirmation...
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground mt-4">
            If you have any issues, please contact support with your transaction reference.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
