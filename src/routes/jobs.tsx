import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Open roles — Operon Recruit" },
      { name: "description", content: "Browse active recruitment campaigns and apply online." },
      { property: "og:title", content: "Open roles — Operon Recruit" },
      {
        property: "og:description",
        content: "Browse active recruitment campaigns and apply online.",
      },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, job_title, location, employment_type, closing_date, status")
        .in("status", ["active", "closing_soon"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <Button asChild size="sm" variant="ghost">
            <Link to="/auth">Employer sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Open roles</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Apply once — your application is scored against the published requirements.
        </p>
        <div className="mt-8 grid gap-3">
          {(data ?? []).map((job: any) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <div>
                <h2 className="font-display text-lg font-semibold">{job.job_title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[job.location, job.employment_type].filter(Boolean).join(" · ") ||
                    "Details inside"}
                  {job.closing_date ? ` · closes ${new Date(job.closing_date).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Button asChild>
                <Link to="/apply/$campaignId" params={{ campaignId: job.id }}>
                  Apply
                </Link>
              </Button>
            </div>
          ))}
          {!isLoading && (data ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No open roles right now. Please check back soon.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
