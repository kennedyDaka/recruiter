import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId")({
  component: CampaignDetailLayout,
});

function CampaignDetailLayout() {
  return <Outlet />;
}
