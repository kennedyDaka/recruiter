import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  BarChart3,
  KanbanSquare,
  ShieldCheck,
  ChevronDown,
  Check,
  FileText,
  Send,
  Search,
  Users,
  Calendar,
  MessageSquare,
  PieChart,
  Lock,
  Eye,
  Database,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RecruiterMW — Recruitment, Organised from Vacancy to Hire" },
      {
        name: "description",
        content:
          "Create vacancies, collect applications and identify the candidates who actually match your requirements. Built for organisations in Malawi and beyond.",
      },
      { property: "og:title", content: "RecruiterMW — Recruitment, Organised from Vacancy to Hire" },
      {
        property: "og:description",
        content:
          "Structured applications, automated candidate scoring and a live recruitment pipeline. From vacancy to shortlist.",
      },
      { property: "og:image", content: "https://recruitermw.com/recruitermw-logo.png" },
      { property: "og:url", content: "https://recruitermw.com" },
      { name: "twitter:title", content: "RecruiterMW — Recruitment, Organised from Vacancy to Hire" },
      {
        name: "twitter:description",
        content:
          "Structured applications, automated candidate scoring and a live recruitment pipeline. From vacancy to shortlist.",
      },
      { name: "twitter:image", content: "https://recruitermw.com/recruitermw-logo.png" },
    ],
  }),
  component: Landing,
});

/* ─── Scroll Animation Hook ─────────────────────────────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Navigation ────────────────────────────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur"
      style={{
        boxShadow: scrolled
          ? "0 1px 3px oklch(0.25 0.05 250 / 0.08)"
          : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          <a
            href="#platform"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Platform
          </a>
          <a
            href="#how-it-works"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#pricing"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            FAQ
          </a>
          <Link
            to="/jobs"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Open roles
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-accent)_0%,transparent_70%)] opacity-[0.07]" />
      <div className="relative mx-auto max-w-6xl px-6 pt-6 pb-16 sm:pt-8 sm:pb-20">
        <div className="max-w-3xl">
          <Logo variant="mark" size="xl" />
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Recruitment, organised from vacancy to hire.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Create vacancies, collect applications and identify the candidates
            who actually match your requirements.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>

        {/* Product UI Screenshot — Candidates */}
        <FadeIn className="mt-16" delay={0.2}>
          <div className="relative rounded-xl border border-border bg-card shadow-card overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2.5">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
              </div>
              <div className="flex-1 rounded-md bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                recruitermw.com/candidates
              </div>
            </div>
            <img
              src="/screenshots/candidates.png"
              alt="RecruiterMW candidates dashboard showing scored applicants"
              className="w-full object-cover"
              loading="eager"
            />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Trust Strip ───────────────────────────────────────────────── */

function TrustStrip() {
  const categories = [
    "Companies",
    "NGOs",
    "Recruitment Agencies",
    "Government",
    "SMEs",
  ];
  return (
    <section className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-10 text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Built for organisations that hire
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {categories.map((cat) => (
            <span
              key={cat}
              className="text-sm font-medium text-muted-foreground/70"
            >
              {cat}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Product Story: From Vacancy to Shortlist ──────────────────── */

function ProductStory() {
  const steps = [
    {
      num: "01",
      title: "Create",
      desc: "Create a vacancy or paste an existing job description.",
      icon: FileText,
      visual: (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <img
            src="/screenshots/campaign-detail.png"
            alt="Creating a new vacancy in RecruiterMW"
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      ),
    },
    {
      num: "02",
      title: "Publish",
      desc: "Generate an application link and launch the campaign.",
      icon: Send,
      visual: (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <img
            src="/screenshots/campaigns.png"
            alt="Published campaigns in RecruiterMW"
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      ),
    },
    {
      num: "03",
      title: "Screen",
      desc: "Applications are automatically evaluated.",
      icon: Search,
      visual: (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <img
            src="/screenshots/kanban.png"
            alt="Recruitment pipeline kanban view"
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      ),
    },
    {
      num: "04",
      title: "Shortlist",
      desc: "Recruiters see the strongest candidates first.",
      icon: Users,
      visual: (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <img
            src="/screenshots/candidates.png"
            alt="Scored candidates ranked by eligibility"
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From vacancy to shortlist.
          </h2>
        </FadeIn>
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <FadeIn key={step.num} delay={i * 0.1}>
              <div className="relative">
                <span className="font-display text-5xl font-bold text-border/80">
                  {step.num}
                </span>
                <div className="mt-3 flex items-center gap-2">
                  <step.icon className="size-4 text-accent" />
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
                <div className="mt-4">{step.visual}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Paste Your Vacancy ────────────────────────────────────────── */

function PasteVacancy() {
  const [pasting, setPasting] = useState(false);
  const [structured, setStructured] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPasting(true), 1500);
    const t2 = setTimeout(() => setStructured(true), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const items = [
    "Job title",
    "Education",
    "Required experience",
    "Required skills",
    "Preferred skills",
    "Application questions",
  ];

  return (
    <section className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            AI-powered vacancy structuring
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Paste your vacancy.
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Paste any job description and RecruiterMW structures it into a publishable
            campaign in seconds.
          </p>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.15}>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Paste */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your job description
              </p>
              <div className="min-h-[200px] rounded-lg border border-border/60 bg-background p-4">
                <p
                  className="text-sm leading-relaxed text-foreground/90"
                  style={{
                    opacity: pasting ? 1 : 0,
                    transition: "opacity 0.6s ease",
                  }}
                >
                  <span className="font-display font-semibold">
                    Logistics Officer
                  </span>
                  <br />
                  <br />
                  We are looking for an experienced Logistics Officer responsible
                  for fleet management, route optimisation, fuel monitoring and
                  driver supervision. The ideal candidate holds a Bachelor's
                  degree in Logistics or Supply Chain Management with at least 3
                  years of relevant experience.
                </p>
                {!pasting && (
                  <div className="flex h-[120px] items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      Pasting...
                    </div>
                  </div>
                )}
              </div>
              <Button className="mt-4 w-full" size="sm" disabled={!pasting}>
                Continue
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            </div>

            {/* Right: Structured */}
            <div className="rounded-xl border border-accent/30 bg-card p-6 shadow-card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
                Vacancy structured
              </p>
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-4 py-2.5"
                    style={{
                      opacity: structured ? 1 : 0,
                      transform: structured ? "translateX(0)" : "translateX(-12px)",
                      transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s`,
                    }}
                  >
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15"
                    >
                      <Check
                        className="h-3 w-3 text-success"
                        style={{
                          opacity: structured ? 1 : 0,
                          transition: `opacity 0.3s ease ${0.3 + i * 0.1}s`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-center"
                style={{
                  opacity: structured ? 1 : 0,
                  transition: "opacity 0.5s ease 0.8s",
                }}
              >
                <p className="text-sm font-semibold text-success">
                  Ready to publish
                </p>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Scoring Engine Visual ─────────────────────────────────────── */

function ScoringVisual() {
  return (
    <section id="platform" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Scoring engine
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            You define what qualified means.
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            RecruiterMW evaluates every candidate against the same criteria. No bias.
            No guesswork. Just defensible scores.
          </p>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.1}>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Candidate evaluation */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Candidate Evaluation
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-foreground">
                    Chimwemwe Banda
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl font-bold text-success">
                    87%
                  </p>
                  <p className="text-xs font-semibold text-success">
                    Strong Match
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Education", status: "pass", detail: "BSc in Logistics — meets requirement" },
                  { label: "Relevant Experience", status: "pass", detail: "4 years / 3 required" },
                  { label: "Required Skills", status: "pass", detail: "5 / 6 matched" },
                  { label: "Preferred Skills", status: "pass", detail: "3 / 4 bonus" },
                  { label: "Experience Match", status: "pass", detail: "Strong — exact role" },
                  { label: "Location", status: "pass", detail: "Based in Lilongwe" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15">
                        <Check className="h-3 w-3 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-success">
                      Pass
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Eligibility gate */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Eligibility Gate
              </p>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15">
                    <Check className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Eligible
                    </p>
                    <p className="text-xs text-muted-foreground">
                      All required criteria met
                    </p>
                  </div>
                </div>
              </div>

              <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Score Breakdown
              </p>
              <div className="space-y-2.5">
                {[
                  { dim: "Education", score: 20, max: 20 },
                  { dim: "Experience", score: 28, max: 30 },
                  { dim: "Skills", score: 23, max: 25 },
                  { dim: "Position Relevance", score: 9, max: 10 },
                  { dim: "Certifications", score: 5, max: 10 },
                  { dim: "Industry", score: 4, max: 5 },
                ].map((d) => (
                  <div key={d.dim}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        {d.dim}
                      </span>
                      <span className="text-muted-foreground">
                        {d.score}/{d.max}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(d.score / d.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-lg bg-secondary/50 p-4">
                <p className="text-xs font-medium text-foreground">
                  Why this score?
                </p>
                <ul className="mt-2 space-y-1">
                  <li className="text-xs text-muted-foreground">
                    ✓ Bachelor's in Logistics — exact field match
                  </li>
                  <li className="text-xs text-muted-foreground">
                    ✓ 4 years in Fleet Manager role — exact position
                  </li>
                  <li className="text-xs text-muted-foreground">
                    ✓ 5 of 6 required skills matched
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── AI Positioning ────────────────────────────────────────────── */

function AIPositioning() {
  const flow = [
    { label: "CV", icon: FileText },
    { label: "AI", icon: Zap },
    { label: "Candidate Info", icon: Users },
    { label: "RecruiterMW Engine", icon: BarChart3 },
    { label: "Recruiter", icon: Eye },
  ];

  return (
    <section className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            AI where it helps
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            AI where it helps. Rules where they matter.
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            AI helps understand applications. Your recruitment criteria remain
            in control.
          </p>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.1}>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {flow.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3 sm:gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                    <step.icon className="size-6 text-accent" />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {step.label}
                  </span>
                </div>
                {i < flow.length - 1 && (
                  <ArrowRight className="size-4 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Recruiter Workspace ───────────────────────────────────────── */

function RecruiterWorkspace() {
  const vacancies = [
    { title: "Logistics Officer", applicants: 184, shortlisted: 32 },
    { title: "Accountant", applicants: 96, shortlisted: 18 },
    { title: "Operations Manager", applicants: 73, shortlisted: 11 },
  ];

  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Recruiter workspace
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your entire recruitment process. One place.
          </h2>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.1}>
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Open vacancies
            </p>
            <div className="space-y-3">
              {vacancies.map((v) => (
                <div
                  key={v.title}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.applicants} applicants
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-success">
                        {v.shortlisted}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        shortlisted
                      </p>
                    </div>
                    <div className="h-8 w-8 shrink-0 rounded-full bg-success/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Features ──────────────────────────────────────────────────── */

function Features() {
  const features = [
    {
      icon: FileText,
      title: "Vacancy Management",
      desc: "Create and manage recruitment campaigns with structured requirements.",
    },
    {
      icon: Search,
      title: "Candidate Screening",
      desc: "Evaluate candidates automatically against configured requirements.",
    },
    {
      icon: KanbanSquare,
      title: "Candidate Pipeline",
      desc: "Move candidates through your hiring stages with a full audit trail.",
    },
    {
      icon: Calendar,
      title: "Interviews",
      desc: "Schedule and manage interviews within the platform.",
    },
    {
      icon: MessageSquare,
      title: "Automated Communication",
      desc: "Keep candidates informed automatically at every stage.",
    },
    {
      icon: PieChart,
      title: "Reports",
      desc: "Understand your recruitment pipeline with clear analytics.",
    },
  ];

  return (
    <section className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything a recruitment team needs.
          </h2>
        </FadeIn>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.06}>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <f.icon className="size-5 text-accent" />
                <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Trust / Security ──────────────────────────────────────────── */

function TrustSecurity() {
  const items = [
    { icon: Lock, title: "Secure candidate data", desc: "Encrypted at rest and in transit." },
    { icon: Eye, title: "Controlled recruiter access", desc: "Role-based permissions for every team member." },
    { icon: Database, title: "Organisation-level isolation", desc: "Your data never crosses tenant boundaries." },
    { icon: ShieldCheck, title: "Reliable processing", desc: "Every application is processed and logged." },
  ];

  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Recruitment data deserves protection.
          </h2>
        </FadeIn>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <FadeIn key={item.title} delay={i * 0.08}>
              <div className="rounded-xl border border-border bg-card p-5">
                <item.icon className="size-5 text-accent" />
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ───────────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <FadeIn>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Pricing
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Recruitment when you need it.
          </h2>
        </FadeIn>

        <FadeIn className="mt-10" delay={0.1}>
          <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 shadow-card">
            <p className="font-display text-4xl font-bold text-foreground">
              MWK 15,000
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / day
              </span>
            </p>
            <ul className="mt-6 space-y-2.5 text-left">
              {[
                "Application portal",
                "Candidate management",
                "Screening",
                "Ranking",
                "Recruiter workspace",
                "Reports",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                  <Check className="size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full" size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start a campaign
              </Link>
            </Button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────── */

function FAQ() {
  const faqs = [
    {
      q: "Can I paste an existing vacancy?",
      a: "Yes. Paste any job description and RecruiterMW will structure it into a publishable campaign with education, experience, skills and screening questions.",
    },
    {
      q: "Can recruitment agencies use RecruiterMW?",
      a: "Yes. Each agency gets its own isolated workspace. Candidate data never crosses tenant boundaries.",
    },
    {
      q: "How does candidate screening work?",
      a: "RecruiterMW evaluates every candidate against the same configured requirements — education, experience, skills and certifications — and produces a 0-100 score.",
    },
    {
      q: "Can I see why a candidate received their score?",
      a: "Yes. Every score comes with a breakdown showing exactly which criteria the candidate met or missed.",
    },
    {
      q: "Can candidates apply from their phones?",
      a: "Yes. The application portal is fully responsive and works on any device.",
    },
    {
      q: "What happens if AI cannot process a CV?",
      a: "RecruiterMW falls back to the structured application data. AI enhances the process but never blocks it.",
    },
    {
      q: "Can I manage interviews?",
      a: "Yes. Schedule and manage interviews directly within the recruitment pipeline.",
    },
    {
      q: "How is candidate information protected?",
      a: "Data is encrypted at rest, access is role-based and each organisation's data is fully isolated.",
    },
  ];

  return (
    <section id="faq" className="border-b border-border/60">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <FadeIn>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently asked questions
          </h2>
        </FadeIn>

        <FadeIn className="mt-10" delay={0.1}>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-border bg-card px-5"
              >
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline hover:text-accent">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Final CTA ─────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <FadeIn>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Your next hire starts here.
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="mailto:hello@recruitermw.com">Talk to us</a>
            </Button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <Logo />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <a href="#platform" className="hover:text-foreground">
              Platform
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
            <Link to="/jobs" className="hover:text-foreground">
              Open roles
            </Link>
            <a href="mailto:hello@recruitermw.com" className="hover:text-foreground">
              Contact
            </a>
            <a href="#" className="hover:text-foreground">
              Privacy
            </a>
            <a href="#" className="hover:text-foreground">
              Terms
            </a>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground/60 sm:text-left">
          © {new Date().getFullYear()} RecruiterMW. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ─── Landing Page ──────────────────────────────────────────────── */

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <ProductStory />
        <PasteVacancy />
        <ScoringVisual />
        <AIPositioning />
        <RecruiterWorkspace />
        <Features />
        <TrustSecurity />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
