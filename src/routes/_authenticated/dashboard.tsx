import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, FileCheck2, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Recruitment dashboard — Operon Recruit" },
      {
        name: "description",
        content: "Track campaigns, applications and shortlists in one place.",
      },
      { property: "og:title", content: "Recruitment dashboard — Operon Recruit" },
      { property: "og:description", content: "Track campaigns, applications and shortlists." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [campaigns, applications] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, job_title, status, closing_date, slug")
          .order("created_at", { ascending: false }),
        supabase
          .from("applications")
          .select("id, reference, score, recommendation, status, created_at, campaign_id")
          .order("score", { ascending: false })
          .limit(8),
      ]);
      return {
        campaigns: campaigns.data ?? [],
        applications: applications.data ?? [],
      };
    },
  });

  const campaigns = data?.campaigns ?? [];
  const applications = data?.applications ?? [];
  const active = campaigns.filter((c: any) => c.status === "active").length;
  const shortlisted = applications.filter((a: any) => a.recommendation === "Strong Match").length;
  const avg = applications.length
    ? Math.round(
        applications.reduce((sum: number, a: any) => sum + (a.score ?? 0), 0) /
          applications.length,
      )
    : 0;

  const stats = [
    { label: "Active campaigns", value: active, icon: Briefcase },
    { label: "Applications", value: applications.length, icon: FileCheck2 },
    { label: "Strong matches", value: shortlisted, icon: Star },
    { label: "Average ORS score", value: avg, icon: Users },
  ];

  return (
    <AppShell
      title="Dashboard"
      description="Your recruitment activity at a glance."
      actions={
        <Button asChild size="sm">
          <Link to="/campaigns/new">New campaign</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <stat.icon className="size-4 text-primary" />
              <p className="mt-3 font-display text-3xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Recent campaigns</h2>
          <div className="mt-4 space-y-3">
            {campaigns.slice(0, 6).map((campaign: any) => (
              <Link
                key={campaign.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: campaign.id }}
                className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm transition-colors hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{campaign.name}</span>
                  <span className="block text-xs text-muted-foreground">{campaign.job_title}</span>
                </span>
                <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                  {campaign.status}
                </Badge>
              </Link>
            ))}
            {campaigns.length === 0 && !isLoading ? (
              <p className="text-sm text-muted-foreground">
                No campaigns yet.{" "}
                <Link
                  to="/campaigns/new"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Create your first one
                </Link>
                .
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Top scoring applications</h2>
          <div className="mt-4 space-y-3">
            {applications.map((application: any) => (
              <div
                key={application.id}
                className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{application.reference}</span>
                  <span className="block text-xs text-muted-foreground">
                    {application.recommendation ?? "Pending review"}
                  </span>
                </span>
                <span className="font-display text-lg font-semibold">{application.score}</span>
              </div>
            ))}
            {applications.length === 0 && !isLoading ? (
              <p className="text-sm text-muted-foreground">No applications received yet.</p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
