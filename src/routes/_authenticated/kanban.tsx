import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GripVertical, KanbanSquare, Mail, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/recruiter.functions";
import { AppShell } from "@/components/app/AppShell";
import { EmailCandidatesDialog } from "@/components/app/EmailCandidatesDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Campaign = {
  id: string;
  name: string;
  job_title: string;
  status: string;
};

type Stage = {
  id: string;
  name: string;
  position: number;
};

type PipelineApplication = {
  id: string;
  tenant_id: string;
  reference: string;
  stage_id: string | null;
  score: number;
  recommendation: string | null;
  eligibility_status: string | null;
  years_experience: number;
  highest_qualification: string | null;
  submitted_at: string | null;
  candidates: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
  } | null;
};

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({
    meta: [
      { title: "Recruitment Kanban — Operon Recruit" },
      {
        name: "description",
        content: "Move candidates through each stage of your recruitment pipeline.",
      },
      { property: "og:title", content: "Recruitment Kanban — Operon Recruit" },
      {
        property: "og:description",
        content: "Review and move candidates through the recruitment pipeline.",
      },
    ],
  }),
  component: KanbanPage,
});

function KanbanPage() {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [emailStage, setEmailStage] = useState<Stage | null>(null);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["kanban-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, job_title, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
  });

  useEffect(() => {
    const firstCampaign = campaigns[0];
    if (!campaignId && firstCampaign) setCampaignId(firstCampaign.id);
  }, [campaignId, campaigns]);

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ["kanban-pipeline", campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const [stagesResult, applicationsResult] = await Promise.all([
        supabase
          .from("recruitment_stages")
          .select("id, name, position")
          .eq("campaign_id", campaignId)
          .order("position"),
        supabase
          .from("applications")
          .select(
            "id, tenant_id, reference, stage_id, score, recommendation, eligibility_status, years_experience, highest_qualification, submitted_at, candidates(first_name, last_name, email, phone, location)",
          )
          .eq("campaign_id", campaignId)
          .order("score", { ascending: false }),
      ]);
      if (stagesResult.error) throw stagesResult.error;
      if (applicationsResult.error) throw applicationsResult.error;

      return {
        stages: stagesResult.data as Stage[],
        applications: applicationsResult.data as unknown as PipelineApplication[],
      };
    },
  });

  const moveStage = useServerFn(moveApplicationStage);

  const moveApplication = useMutation({
    mutationFn: async ({
      application,
      stageId,
    }: {
      application: PipelineApplication;
      stageId: string;
    }) => {
      const stages = pipeline?.stages ?? [];
      if (application.stage_id === stageId) return;

      const from = stages.find((stage) => stage.id === application.stage_id)?.name ?? null;
      const to = stages.find((stage) => stage.id === stageId)?.name;
      if (!to) throw new Error("The destination stage is unavailable.");

      await moveStage({
        data: {
          applicationId: application.id,
          tenantId: application.tenant_id,
          stageId,
          fromStage: from,
          toStage: to,
        },
      });
    },
    onSuccess: () => {
      toast.success("Candidate moved");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["kanban-pipeline", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const stages = pipeline?.stages ?? [];
  const applications = pipeline?.applications ?? [];

  const emailStageRecipients = emailStage
    ? applications
        .filter((application) => application.stage_id === emailStage.id)
        .map((application) => ({
          email: application.candidates?.email ?? "",
          phone: application.candidates?.phone ?? "",
          name: application.candidates
            ? `${application.candidates.first_name} ${application.candidates.last_name}`.trim() ||
              application.reference
            : application.reference,
        }))
    : [];

  return (
    <AppShell
      title="Recruitment Kanban"
      description="Review candidates by stage and keep every move in the pipeline history."
      actions={
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="size-4" />
            Create campaign
          </Link>
        </Button>
      }
    >
      {campaignsLoading ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Loading campaigns…
        </p>
      ) : campaigns.length === 0 ? (
        <EmptyKanban />
      ) : (
        <div className="grid gap-6">
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Campaign pipeline</p>
              <p className="text-xs text-muted-foreground">
                {selectedCampaign
                  ? `${selectedCampaign.job_title || "Job not set"} · ${selectedCampaign.status.replace(/_/g, " ")}`
                  : "Choose a campaign to review its candidates."}
              </p>
            </div>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {pipelineLoading ? (
            <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Loading pipeline…
            </p>
          ) : stages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              This campaign has no recruitment stages yet.
            </p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {stages.map((stage) => {
                const stageApplications = applications.filter(
                  (application) => application.stage_id === stage.id,
                );
                return (
                  <section
                    key={stage.id}
                    className="flex w-80 shrink-0 flex-col rounded-xl border border-border bg-secondary/40"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const application = applications.find(
                        (item) => item.id === draggedApplicationId,
                      );
                      if (application) moveApplication.mutate({ application, stageId: stage.id });
                      setDraggedApplicationId(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Email ${stage.name}`}
                          title={`Email every candidate in ${stage.name}`}
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setEmailStage(stage)}
                        >
                          <Mail className="size-4" />
                        </button>
                        <Badge variant="secondary">{stageApplications.length}</Badge>
                      </div>
                    </div>
                    <div className="grid min-h-32 gap-3 p-3">
                      {stageApplications.map((application) => (
                        <CandidateCard
                          key={application.id}
                          application={application}
                          stages={stages}
                          isMoving={moveApplication.isPending}
                          onDragStart={() => setDraggedApplicationId(application.id)}
                          onMove={(stageId) => moveApplication.mutate({ application, stageId })}
                        />
                      ))}
                      {stageApplications.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border bg-background/50 p-4 text-center text-xs text-muted-foreground">
                          Drop a candidate here
                        </p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      <EmailCandidatesDialog
        open={emailStage !== null}
        onOpenChange={(open) => {
          if (!open) setEmailStage(null);
        }}
        recipients={emailStageRecipients}
        title={emailStage ? `Email ${emailStage.name}` : "Email candidates"}
        description={`Every candidate currently in ${emailStage?.name ?? "this stage"} — recipients are verified automatically, only verified addresses are sent to.`}
        onSent={() =>
          void queryClient.invalidateQueries({ queryKey: ["kanban-pipeline", campaignId] })
        }
      />
    </AppShell>
  );
}

function CandidateCard({
  application,
  stages,
  isMoving,
  onDragStart,
  onMove,
}: {
  application: PipelineApplication;
  stages: Stage[];
  isMoving: boolean;
  onDragStart: () => void;
  onMove: (stageId: string) => void;
}) {
  const candidateName = application.candidates
    ? `${application.candidates.first_name} ${application.candidates.last_name}`
    : application.reference;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      className="cursor-grab rounded-lg border border-border bg-card p-4 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/applications/$applicationId"
          params={{ applicationId: application.id }}
          className="font-medium hover:text-primary hover:underline"
        >
          {candidateName}
        </Link>
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{application.reference}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge variant="secondary">{application.recommendation ?? "Unscored"}</Badge>
        <span className="font-display text-xl font-semibold">{application.score}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge
          variant={application.eligibility_status === "eligible" ? "default" : "destructive"}
          className="text-[10px]"
        >
          {application.eligibility_status === "eligible" ? "Eligible" : application.eligibility_status === "not_eligible" ? "Not eligible" : "—"}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {application.highest_qualification ?? "No qualification"} ·{" "}
        {application.years_experience} yrs
      </p>
      {application.candidates?.location ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {application.candidates.location}
        </p>
      ) : null}
      <Select
        {...(application.stage_id ? { value: application.stage_id } : {})}
        onValueChange={onMove}
        disabled={isMoving}
      >
        <SelectTrigger className="mt-4 h-8 w-full text-xs">
          <SelectValue placeholder="Move to stage" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              Move to {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </article>
  );
}

function EmptyKanban() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center shadow-sm">
      <KanbanSquare className="mx-auto size-8 text-muted-foreground" />
      <h2 className="mt-4 font-display text-lg font-semibold">No campaign pipeline yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Create your first recruitment campaign to receive applications and manage candidates by
        stage.
      </p>
      <Button asChild className="mt-5">
        <Link to="/campaigns/new">
          <UsersRound className="size-4" />
          Create campaign
        </Link>
      </Button>
    </div>
  );
}
