import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, ClipboardCheck, KanbanSquare, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operon Recruit — Structured Hiring, Objectively Scored" },
      {
        name: "description",
        content:
          "Operon Recruit runs end-to-end hiring campaigns: structured applications, the Operon Recruitment Standard scoring engine and a live recruitment pipeline.",
      },
      { property: "og:title", content: "Operon Recruit — Structured Hiring, Objectively Scored" },
      {
        property: "og:description",
        content:
          "Publish campaigns, collect structured applications and rank candidates automatically with the Operon Recruitment Standard.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ClipboardCheck,
    title: "Structured applications",
    body: "Every campaign collects the same evidence: qualifications, experience, skills, documents and referees.",
  },
  {
    icon: BarChart3,
    title: "ORS scoring engine",
    body: "The Operon Recruitment Standard converts each application into a defensible 0-100 score across six dimensions.",
  },
  {
    icon: KanbanSquare,
    title: "Live recruitment pipeline",
    body: "Move candidates through your own stages, from screening to offer, with a full audit trail.",
  },
  {
    icon: ShieldCheck,
    title: "Workspace isolation",
    body: "Each company gets its own secure workspace. Candidate data never crosses tenant boundaries.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/jobs">Open roles</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Employer sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent)_0%,transparent_70%)] opacity-30" />
          <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Operon Systems
            </p>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl">
              Hiring decisions you can defend
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Operon Recruit turns job descriptions into structured campaigns, scores every
              applicant against the same standard and keeps your pipeline moving.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create a company workspace
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/jobs">Browse open roles</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Everything a recruitment team needs
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <feature.icon className="size-5 text-primary" />
                <h3 className="mt-4 font-display text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Launch your first campaign today
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Set up your company, pick a role template and start receiving scored applications in
              minutes.
            </p>
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
          <Logo variant="mark" />
          <p>© {new Date().getFullYear()} Operon Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
