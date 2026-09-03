/**
 * Admin Dashboard — super-admin monitoring panel.
 * Shows tenants, campaigns, applications, revenue, and payment monitoring.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentSessionFn } from "@/lib/auth/session.functions";
import { getAdminStatsFn } from "@/lib/admin.functions";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Briefcase,
  FileCheck2,
  DollarSign,
  Users,
  Activity,
  Headphones,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  Ticket,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Admin Dashboard — RecruiterMW" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const getSession = useServerFn(getCurrentSessionFn);

  const { data: session } = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => getSession(),
  });

  const isAdmin = (session as any)?.role === "super_admin";

  const fetchStats = useServerFn(getAdminStatsFn);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Access Denied" description="This page is restricted to platform administrators.">
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="size-16 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">Super Admin access required</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact the platform owner for access.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell title="Admin Dashboard" description="Loading platform metrics...">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin Dashboard"
      description="Platform-wide monitoring and metrics."
    >
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <Building2 className="size-4 text-primary" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.totalTenants ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Total Tenants
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Briefcase className="size-4 text-primary" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.activeCampaigns ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Active Campaigns
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.totalCampaigns ?? 0} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <FileCheck2 className="size-4 text-primary" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.totalApplications ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Total Applications
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.recentApplications ?? 0} in last 30 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Users className="size-4 text-primary" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.totalUsers ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Registered Users
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <DollarSign className="size-4 text-green-600" />
            <p className="mt-3 font-display text-3xl font-semibold">
              MWK {(stats?.totalRevenue ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Total Revenue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BarChart3 className="size-4 text-primary" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.avgScore ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Avg Score
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Headphones className="size-4 text-orange-500" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.openIncidents ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Open Incidents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <AlertTriangle className="size-4 text-red-500" />
            <p className="mt-3 font-display text-3xl font-semibold">
              {stats?.criticalIncidents ?? 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Critical Issues
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/contact-center"><Headphones className="mr-2 size-4" />Contact Center</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/campaigns"><Briefcase className="mr-2 size-4" />All Campaigns</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/transactions"><CreditCard className="mr-2 size-4" />All Transactions</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/promo-codes"><Ticket className="mr-2 size-4" />Promo Codes</Link>
        </Button>
      </div>

      {/* Payment Monitoring */}
      <div className="mt-6">
        <h2 className="font-display text-lg font-semibold">Payment Monitoring</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-green-600" />
                <div>
                  <p className="font-display text-2xl font-semibold">
                    {stats?.successfulPayments ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <XCircle className="size-5 text-red-500" />
                <div>
                  <p className="font-display text-2xl font-semibold">
                    {stats?.failedPayments ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="size-5 text-amber-500" />
                <div>
                  <p className="font-display text-2xl font-semibold">
                    {stats?.pendingPayments ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="size-5 text-green-600" />
                <div>
                  <p className="font-display text-2xl font-semibold">
                    MWK {(stats?.totalRevenue ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Method Breakdown */}
        {stats?.paymentByMethod && Object.keys(stats.paymentByMethod).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(stats.paymentByMethod).map(([method, count]) => (
              <Badge key={method} variant="secondary" className="text-xs">
                {method === "airtel_money"
                  ? "Airtel Money"
                  : method === "tnm_mpamba"
                    ? "TNM Mpamba"
                    : method}
                : {count}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold">Tenants</h2>
            <div className="mt-4 space-y-3">
              {stats?.tenants?.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.industry ?? "—"} · {t.country ?? "—"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
                </div>
              ))}
              {(!stats?.tenants || stats.tenants.length === 0) && <p className="text-sm text-muted-foreground">No tenants yet.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold">Recent Payments</h2>
            <div className="mt-4 space-y-3">
              {stats?.recentPayments?.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{p.currency} {p.amount?.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_method === "airtel_money"
                        ? "Airtel Money"
                        : p.payment_method === "tnm_mpamba"
                          ? "TNM Mpamba"
                          : p.payment_method ?? "Unknown"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        p.status === "success"
                          ? "default"
                          : p.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {p.status}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </div>
              ))}
              {(!stats?.recentPayments || stats.recentPayments.length === 0) && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
