import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { getPaymentHistoryFn } from "@/lib/payment/payment-history.functions";
import { formatMWK } from "@/lib/payment/pricing";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentHistory,
});

function PaymentHistory() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const fetchHistory = useServerFn(getPaymentHistoryFn);
  const { data, isLoading } = useQuery({
    queryKey: ["payment-history", page],
    queryFn: () => fetchHistory({ data: { limit, offset: page * limit } }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const methodLabel = (m: string | null) => {
    if (m === "airtel_money") return "Airtel Money";
    if (m === "tnm_mpamba") return "TNM Mpamba";
    if (m === "visa") return "Visa";
    if (m === "mastercard") return "Mastercard";
    return m ?? "Unknown";
  };

  const statusVariant = (s: string) => {
    if (s === "success") return "default" as const;
    if (s === "failed") return "destructive" as const;
    if (s === "processing") return "secondary" as const;
    return "secondary" as const;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-MW", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Payment History</h1>
        <p className="mt-2 text-muted-foreground">
          View all your transactions and payment records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Transactions
            <Badge variant="secondary" className="ml-auto">
              {total} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No payment records found.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Campaign</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Method</th>
                      <th className="pb-3 font-medium">Duration</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3 text-muted-foreground">
                          {fmtDate(item.created_at)}
                        </td>
                        <td className="py-3 font-medium">
                          {item.campaign_name ?? "—"}
                        </td>
                        <td className="py-3">{formatMWK(item.amount)}</td>
                        <td className="py-3">{methodLabel(item.payment_method)}</td>
                        <td className="py-3">
                          {item.num_days ? `${item.num_days} days` : "—"}
                        </td>
                        <td className="py-3">
                          <Badge variant={statusVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
