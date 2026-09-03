/**
 * Admin — All Transactions page.
 * Shows all payments across all tenants with pagination, search, and filters.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentSessionFn } from "@/lib/auth/session.functions";
import { getAllTransactionsFn } from "@/lib/admin-transactions.functions";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  head: () => ({ meta: [{ title: "All Transactions — Admin" }] }),
  component: AdminTransactions,
});

function AdminTransactions() {
  const getSession = useServerFn(getCurrentSessionFn);
  const { data: session } = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => getSession(),
  });
  const isAdmin = (session as any)?.role === "super_admin";

  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 20;

  const fetchTransactions = useServerFn(getAllTransactionsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", page, statusFilter, search],
    queryFn: () =>
      fetchTransactions({ data: { limit, offset: page * limit, status: statusFilter, search } }),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Access Denied" description="Super admin access required.">
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="size-16 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">Super Admin access required</p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const statusBadge = (s: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      success: "default",
      completed: "default",
      paid: "default",
      failed: "destructive",
      pending: "secondary",
      processing: "secondary",
      promo_bypass: "outline",
    };
    return <Badge variant={variants[s] ?? "secondary"}>{s}</Badge>;
  };

  const methodLabel = (m: string | null) => {
    if (!m) return "—";
    const labels: Record<string, string> = {
      airtel_money: "Airtel Money",
      tnm_mpamba: "TNM Mpamba",
      card: "Card",
      promo_bypass: "Promo Bypass",
    };
    return labels[m] ?? m;
  };

  return (
    <AppShell
      title="All Transactions"
      description="Platform-wide payment history across all tenants."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="mr-2 size-4" />Back to Admin
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by tx_ref, tenant, campaign, phone..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                setPage(0);
              }
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="promo_bypass">Promo Bypass</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="mb-4 text-sm text-muted-foreground">
        {data?.total ?? 0} total transactions
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Tenant</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Tx Ref</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Promo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.items?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <CreditCard className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                    No transactions found.
                  </td>
                </tr>
              ) : (
                data?.items?.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">{t.tenant_name ?? "—"}</td>
                    <td className="px-4 py-3">{t.campaign_name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.tx_ref}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {t.currency} {t.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {methodLabel(t.payment_method)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(t.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.promo_code_used ? (
                        <Badge variant="outline" className="text-xs">
                          {t.promo_code_used}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
