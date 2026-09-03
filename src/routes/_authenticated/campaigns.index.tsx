import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenantCampaignsFn } from "@/lib/campaigns.functions";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campaigns — RecruiterMW" },
      { name: "description", content: "Create and manage your recruitment campaigns." },
      { property: "og:title", content: "Campaigns — RecruiterMW" },
      { property: "og:description", content: "Create and manage recruitment campaigns." },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const fetchCampaigns = useServerFn(getTenantCampaignsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns(),
  });

  return (
    <AppShell
      title="Campaigns"
      description="Every hiring campaign in your workspace."
      actions={
        <Button asChild size="sm">
          <Link to="/campaigns/new">New campaign</Link>
        </Button>
      }
    >
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Closing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((campaign: any) => (
              <TableRow key={campaign.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/campaigns/$campaignId"
                    params={{ campaignId: campaign.id }}
                    className="hover:underline"
                  >
                    {campaign.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{campaign.job_title}</TableCell>
                <TableCell className="text-muted-foreground">{campaign.location ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {campaign.closing_date ? new Date(campaign.closing_date).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                    {campaign.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {campaign.status === "pending_payment" && (
                    <Link to="/campaigns/$campaignId/pay" params={{ campaignId: campaign.id }}>
                      <Button size="sm" variant="outline">Pay to publish</Button>
                    </Link>
                  )}
                  {campaign.status === "active" && (
                    <Link to="/campaigns/$campaignId/extend" params={{ campaignId: campaign.id }}>
                      <Button size="sm" variant="outline">Extend</Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No campaigns yet. Create your first campaign to start receiving applications.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
