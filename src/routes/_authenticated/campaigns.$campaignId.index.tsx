import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownWideNarrow,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Download,
  Mail,
  RefreshCw,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bulkMoveApplicationsStage, bulkSetApplicationsStatus } from "@/lib/recruiter.functions";
import { rescoreCampaign } from "@/lib/apply.functions";
import { EmailCandidatesDialog } from "@/components/app/EmailCandidatesDialog";
import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId/")({
  head: () => ({
    meta: [
      { title: "Campaign pipeline — Operon Recruit" },
      { name: "description", content: "Review scored applications for this recruitment campaign." },
      { property: "og:title", content: "Campaign pipeline — Operon Recruit" },
      { property: "og:description", content: "Review scored applications for this campaign." },
    ],
  }),
  component: CampaignDetail,
});

type PipelineApplication = {
  id: string;
  reference: string;
  score: number | null;
  recommendation: string | null;
  status: string | null;
  years_experience: number | null;
  highest_qualification: string | null;
  mandatory_status: string | null;
  eligibility_status: string | null;
  created_at: string | null;
  stage_id: string | null;
  score_breakdown: unknown;
  score_reasons: unknown;
  candidates: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  } | null;
};

type SortKey = "score" | "name" | "recent" | "experience" | "qualification";

const RECOMMENDATIONS = [
  "Excellent Match",
  "Strong Match",
  "Good Match",
  "Moderate Match",
  "Weak Match",
  "Unscored",
];

function candidateName(application: PipelineApplication) {
  const candidate = application.candidates;
  if (!candidate) return application.reference;
  return [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || "Unnamed";
}

type PipelineBreakdownItem = { dimension: string; label: string; score: number; max: number };

function parseBreakdown(value: unknown): PipelineBreakdownItem[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is PipelineBreakdownItem =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof (entry as PipelineBreakdownItem).score === "number" &&
        typeof (entry as PipelineBreakdownItem).max === "number",
      ),
    )
    .map((entry) => ({
      dimension: String((entry as PipelineBreakdownItem).dimension ?? ""),
      label: String((entry as PipelineBreakdownItem).label ?? ""),
      score: (entry as PipelineBreakdownItem).score,
      max: (entry as PipelineBreakdownItem).max,
    }));
}

function parseReasons(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((reason): reason is string => typeof reason === "string")
    : [];
}

function CampaignDetail() {
  const { campaignId } = Route.useParams();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [recommendationFilter, setRecommendationFilter] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkStageId, setBulkStageId] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const [campaign, applications, stages] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle(),
        supabase
          .from("applications")
          .select(
            "id, reference, score, recommendation, status, years_experience, highest_qualification, mandatory_status, eligibility_status, created_at, stage_id, candidate_id, score_breakdown, score_reasons, candidates(first_name, last_name, email, phone, location)",
          )
          .eq("campaign_id", campaignId)
          .order("score", { ascending: false }),
        supabase
          .from("recruitment_stages")
          .select("id, name, position")
          .eq("campaign_id", campaignId)
          .order("position"),
      ]);
      return {
        campaign: campaign.data,
        applications: (applications.data ?? []) as unknown as PipelineApplication[],
        stages: stages.data ?? [],
      };
    },
  });

  const campaign = data?.campaign;
  const allApplications = data?.applications ?? [];
  const stages = (data?.stages ?? []) as { id: string; name: string; position: number }[];
  const stageNameById = useMemo(
    () => Object.fromEntries(stages.map((stage) => [stage.id, stage.name])),
    [stages],
  );
  const stageName = (application: PipelineApplication) =>
    application.stage_id ? (stageNameById[application.stage_id] ?? null) : null;

  const totalApplications = allApplications.length;
  const averageScore = totalApplications
    ? Math.round(
        allApplications.reduce((sum, application) => sum + (application.score ?? 0), 0) /
          totalApplications,
      )
    : 0;
  const strongMatches = allApplications.filter(
    (application) =>
      application.recommendation === "Excellent Match" ||
      application.recommendation === "Strong Match",
  ).length;
  const screeningPassed = allApplications.filter(
    (application) =>
      application.mandatory_status !== "failed" &&
      application.eligibility_status !== "not_eligible",
  ).length;
  const recommendationCounts = RECOMMENDATIONS.slice(0, 5).map((recommendation) => ({
    recommendation,
    count: allApplications.filter((application) => application.recommendation === recommendation)
      .length,
  }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minScore);
    return allApplications.filter((application) => {
      if (stageFilter !== "all" && application.stage_id !== stageFilter) return false;
      if (recommendationFilter !== "all") {
        const actual = application.recommendation ?? "Unscored";
        if (recommendationFilter === "Unscored") {
          if (actual !== "Unscored") return false;
        } else if (actual !== recommendationFilter) return false;
      }
      if (Number.isFinite(min) && (application.score ?? 0) < min) return false;
      if (q) {
        const haystack = [
          application.reference,
          candidateName(application),
          application.candidates?.email ?? "",
          application.highest_qualification ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allApplications, query, stageFilter, recommendationFilter, minScore]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortKey) {
      case "name":
        copy.sort((a, b) => candidateName(a).localeCompare(candidateName(b)));
        break;
      case "recent":
        copy.sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        );
        break;
      case "experience":
        copy.sort((a, b) => (b.years_experience ?? 0) - (a.years_experience ?? 0));
        break;
      case "qualification":
        copy.sort((a, b) =>
          (b.highest_qualification ?? "").localeCompare(a.highest_qualification ?? ""),
        );
        break;
      default:
        copy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    return copy;
  }, [filtered, sortKey]);

  const selectedRows = allApplications.filter((application) => selected.has(application.id));
  const allFilteredSelected =
    sorted.length > 0 && sorted.every((application) => selected.has(application.id));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });

  const bulkMove = useMutation({
    mutationFn: async (stageId: string) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage || !campaign) return null;
      return bulkMoveApplicationsStage({
        data: {
          tenantId: campaign.tenant_id,
          applicationIds: [...selected],
          stageId,
          fromStageNames: Object.fromEntries(
            selectedRows.map((application) => [application.id, stageName(application)]),
          ),
          toStageName: stage.name,
        },
      });
    },
    onSuccess: (result: { count: number } | null) => {
      setSelected(new Set());
      setBulkStageId("");
      toast.success(`Moved ${result?.count ?? selectedRows.length} candidate(s)`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkStatus = useMutation({
    mutationFn: async (status: "shortlisted" | "rejected") => {
      if (!campaign) return null;
      return bulkSetApplicationsStatus({
        data: {
          tenantId: campaign.tenant_id,
          applicationIds: [...selected],
          status,
        },
      });
    },
    onSuccess: (result: { count: number } | null, status) => {
      const count = result?.count ?? selectedRows.length;
      setSelected(new Set());
      toast.success(
        `${status === "shortlisted" ? "Shortlisted" : "Rejected"} ${count} candidate(s)`,
      );
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rescore = useMutation({
    mutationFn: async () => {
      if (!campaign) return null;
      return rescoreCampaign({ data: { campaignId: campaign.id } });
    },
    onSuccess: (result: { rescored: number; version: string } | null) => {
      toast.success(`Re-scored ${result?.rescored ?? 0} application(s) — ${result?.version ?? ""}`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const downloadCsv = (rows: PipelineApplication[]) => {
    if (!rows.length) {
      toast.error("No candidates to export.");
      return;
    }
    const header = [
      "Reference",
      "Name",
      "Email",
      "Phone",
      "Location",
      "Stage",
      "Status",
      "Score",
      "Recommendation",
      "Qualification",
      "Years experience",
      "Applied",
    ];
    const escapeCell = (value: unknown) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = rows.map((application) =>
      [
        application.reference,
        candidateName(application),
        application.candidates?.email,
        application.candidates?.phone,
        application.candidates?.location,
        stageName(application),
        application.status,
        application.score,
        application.recommendation,
        application.highest_qualification,
        application.years_experience,
        application.created_at ? new Date(application.created_at).toLocaleDateString() : "",
      ]
        .map(escapeCell)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(campaign?.name ?? "campaign").replace(/[^a-z0-9]+/gi, "-")}-candidates.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} candidate(s)`);
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(sorted.map((application) => application.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <AppShell
      title={campaign?.name ?? "Campaign"}
      description={
        campaign ? `${campaign.job_title} · ${campaign.location ?? "Location flexible"}` : ""
      }
    >
      <div className="mb-6 rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
        {campaign?.public_token ? (
          <p className="text-muted-foreground">
            Public application link:{" "}
            <Link
              to="/apply/$campaignId"
              params={{ campaignId: campaign.public_token }}
              className="text-primary hover:underline"
            >
              /apply/{campaign.public_token}
            </Link>
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              This campaign has not been published yet. Complete payment to generate the application link.
            </p>
            {campaign?.status === "draft" && (
              <Link to="/campaigns/$campaignId/pay" params={{ campaignId }}>
                <Button size="sm">Pay to publish</Button>
              </Link>
            )}
          </div>
        )}
        {campaign?.status === "active" && (
          <div className="mt-3 flex items-center gap-4">
            {campaign.closing_date && (
              <span className="text-xs text-muted-foreground">
                Closes: {new Date(campaign.closing_date).toLocaleDateString("en-GB")}
              </span>
            )}
            <Link to="/campaigns/$campaignId/extend" params={{ campaignId }}>
              <Button size="sm" variant="outline">
                <Calendar className="mr-2 h-4 w-4" />
                Extend campaign
              </Button>
            </Link>
          </div>
        )}
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Campaign report</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMetric icon={UsersRound} label="Applications" value={totalApplications} />
          <ReportMetric icon={Target} label="Average score" value={averageScore} />
          <ReportMetric icon={CircleCheck} label="Strong matches" value={strongMatches} />
          <ReportMetric icon={CircleCheck} label="Screening passed" value={screeningPassed} />
        </div>
        {totalApplications ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recommendationCounts.map((item) => (
              <div
                key={item.recommendation}
                className="rounded-md border border-border/70 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{item.recommendation}</span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.round((item.count / totalApplications) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, reference, email or qualification…"
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={recommendationFilter} onValueChange={setRecommendationFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All recommendations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All recommendations</SelectItem>
              {RECOMMENDATIONS.map((recommendation) => (
                <SelectItem key={recommendation} value={recommendation}>
                  {recommendation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(event) => setMinScore(event.target.value)}
            placeholder="Min score"
            className="w-28"
          />
          <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Sort: Score</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="recent">Sort: Newest</SelectItem>
              <SelectItem value="experience">Sort: Experience</SelectItem>
              <SelectItem value="qualification">Sort: Qualification</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={() => downloadCsv(sorted)}>
            <Download className="mr-2 size-4" />
            Export
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={rescore.isPending}
            onClick={() => rescore.mutate()}
          >
            <RefreshCw className={`mr-2 size-4 ${rescore.isPending ? "animate-spin" : ""}`} />
            {rescore.isPending ? "Re-scoring…" : "Re-score"}
          </Button>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium">{selected.size} selected</p>
            <Select value={bulkStageId} onValueChange={setBulkStageId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Move to stage…" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!bulkStageId || bulkMove.isPending}
              onClick={() => bulkStageId && bulkMove.mutate(bulkStageId)}
            >
              Move
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={bulkStatus.isPending}
              onClick={() => bulkStatus.mutate("shortlisted")}
            >
              Shortlist
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bulkStatus.isPending}
              onClick={() => bulkStatus.mutate("rejected")}
            >
              Reject
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
              <Mail className="mr-2 size-4" />
              Email
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => downloadCsv(selectedRows)}
            >
              <Download className="mr-2 size-4" />
              Export selected
            </Button>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all visible candidates"
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              </TableHead>
              <TableHead className="w-8" aria-label="Score details" />
              <TableHead>Candidate</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Experience</TableHead>
              <TableHead>Applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((application) => (
              <Fragment key={application.id}>
                <TableRow
                  className={`${selected.has(application.id) ? "bg-primary/5" : ""} ${expanded.has(application.id) ? "bg-secondary/30" : ""}`}
                >
                  <TableCell className="w-10">
                    <Checkbox
                      aria-label={`Select ${candidateName(application)}`}
                      checked={selected.has(application.id)}
                      onCheckedChange={(checked) => toggleOne(application.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="w-8">
                    <button
                      type="button"
                      aria-label={
                        expanded.has(application.id)
                          ? `Hide score breakdown for ${candidateName(application)}`
                          : `Show score breakdown for ${candidateName(application)}`
                      }
                      aria-expanded={expanded.has(application.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() =>
                        setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(application.id)) next.delete(application.id);
                          else next.add(application.id);
                          return next;
                        })
                      }
                    >
                      {expanded.has(application.id) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/applications/$applicationId"
                      params={{ applicationId: application.id }}
                      className="block hover:underline"
                    >
                      <p className="font-medium">{candidateName(application)}</p>
                      <p className="text-xs text-muted-foreground">
                        {application.reference} · {application.candidates?.email ?? "no email"}
                      </p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{stageName(application) ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {application.status?.replace(/_/g, " ") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-display text-base font-semibold">
                      {application.score ?? "—"}
                    </span>
                    <Badge variant="outline" className="ml-2">
                      {application.recommendation ?? "Unscored"}
                    </Badge>
                    {application.eligibility_status === "not_eligible" ? (
                      <span className="ml-1 text-xs font-medium text-destructive">
                        Not eligible
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {application.years_experience ?? 0} yrs
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {application.created_at
                      ? new Date(application.created_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
                {expanded.has(application.id) ? (
                  <TableRow className="bg-secondary/20">
                    <TableCell colSpan={8} className="px-10 py-4">
                      {(() => {
                        const items = parseBreakdown(application.score_breakdown).filter(
                          (item) => item.max > 0,
                        );
                        const reasons = parseReasons(application.score_reasons);
                        if (!items.length && !reasons.length) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No score breakdown recorded — re-score the campaign to generate one.
                            </p>
                          );
                        }
                        return (
                          <div className="grid gap-6 md:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Score breakdown
                              </p>
                              <div className="grid gap-2">
                                {items.map((item) => (
                                  <div key={item.dimension}>
                                    <div className="mb-1 flex justify-between text-xs">
                                      <span>{item.label || item.dimension}</span>
                                      <span className="text-muted-foreground">
                                        {item.score}/{item.max}
                                      </span>
                                    </div>
                                    <Progress value={(item.score / item.max) * 100} />
                                  </div>
                                ))}
                                {items.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No dimensions recorded.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Why this score
                              </p>
                              <ul className="grid gap-1.5 text-sm">
                                {reasons.map((reason, index) => (
                                  <li key={`${index}-${reason}`} className="flex items-start gap-2">
                                    <span
                                      className={
                                        reason.startsWith("\u2713")
                                          ? "text-emerald-600"
                                          : reason.startsWith("\u25b3")
                                            ? "text-amber-600"
                                            : "text-muted-foreground"
                                      }
                                    >
                                      {reason.startsWith("\u2713")
                                        ? "\u2713"
                                        : reason.startsWith("\u25b3")
                                          ? "\u25b3"
                                          : "•"}
                                    </span>
                                    <span>{reason.replace(/^[✓△]\s*/, "")}</span>
                                  </li>
                                ))}
                                {reasons.length === 0 ? (
                                  <li className="text-sm text-muted-foreground">
                                    No reasons recorded.
                                  </li>
                                ) : null}
                              </ul>
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
            {data && sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {totalApplications === 0
                    ? "No applications yet — share the public application link above."
                    : "No candidates match the current filters."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <EmailCandidatesDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        recipients={selectedRows.map((application) => ({
          email: application.candidates?.email ?? "",
          phone: application.candidates?.phone ?? "",
          name: candidateName(application),
        }))}
        onSent={() => {
          setSelected(new Set());
          void invalidate();
        }}
      />

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowDownWideNarrow className="size-3.5" />
        {sorted.length} of {totalApplications} candidate(s) shown
      </p>
    </AppShell>
  );
}

function ReportMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border/70 p-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
