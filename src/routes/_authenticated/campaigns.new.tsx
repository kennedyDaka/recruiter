import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { CampaignWizard } from "@/components/recruitment/CampaignWizard";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () => ({
    meta: [
      { title: "New campaign — RecruiterMW" },
      {
        name: "description",
        content:
          "Build a structured recruitment campaign: role, requirements, questions and scoring.",
      },
      { property: "og:title", content: "New campaign — RecruiterMW" },
      {
        property: "og:description",
        content: "Build a structured recruitment campaign step by step.",
      },
    ],
  }),
  component: NewCampaign,
});

function NewCampaign() {
  return (
    <AppShell
      title="Structured recruitment builder"
      description="Define the role, requirements and scoring standard candidates are measured against."
    >
      <CampaignWizard />
    </AppShell>
  );
}
