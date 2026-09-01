import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicJobsFn } from "@/lib/jobs.functions";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

/** Capitalise the first letter of each word */
function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const fetchJobs = useServerFn(getPublicJobsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["public-jobs"],
    queryFn: () => fetchJobs(),
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
              <div className="flex items-center gap-4">
                {(job.tenants?.logo_data || job.tenants?.logo_url) ? (
                  <img
                    src={job.tenants?.logo_data || job.tenants?.logo_url}
                    alt="Company logo"
                    className="size-12 rounded-lg object-contain"
                  />
                ) : (
                  <div className="size-12 rounded-lg bg-secondary grid place-items-center text-xs font-medium text-muted-foreground">
                    {(job.tenants?.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-display text-lg font-bold" style={{ color: '#000000' }}>
                    {toTitleCase(job.job_title)}
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {job.tenants?.name || ''}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[job.location, job.employment_type].filter(Boolean).join(" · ") ||
                      "Details inside"}
                    {job.closing_date ? ` · closes ${new Date(job.closing_date).toLocaleDateString()}` : ""}
                  </p>
                </div>
              </div>
              <Button asChild style={{ backgroundColor: job.tenants?.brand_color || '#2563eb', color: '#fff' }}>
                <Link to="/apply/$campaignId" params={{ campaignId: (job as any).public_token || job.id }}>
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
