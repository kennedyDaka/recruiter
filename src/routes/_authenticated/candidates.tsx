import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenantCandidatesFn } from "@/lib/candidates.functions";
import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/candidates")({
  head: () => ({
    meta: [
      { title: "Candidates — Operon Recruit" },
      { name: "description", content: "Every candidate who has applied to your campaigns." },
      { property: "og:title", content: "Candidates — Operon Recruit" },
      { property: "og:description", content: "Every candidate who has applied to your campaigns." },
    ],
  }),
  component: CandidatesPage,
});

function CandidatesPage() {
  const fetchCandidates = useServerFn(getTenantCandidatesFn);
  const { data, isLoading } = useQuery({
    queryKey: ["candidates-with-applications"],
    queryFn: () => fetchCandidates(),
  });

  const applications = (data ?? []) as any[];

  return (
    <AppShell title="Candidates" description="People who have applied to your campaigns.">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead>Recommendation</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app: any) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/applications/$applicationId"
                    params={{ applicationId: app.id }}
                    className="hover:text-primary hover:underline"
                  >
                    {app.candidates
                      ? `${app.candidates.first_name} ${app.candidates.last_name}`
                      : "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{app.reference}</TableCell>
                <TableCell>
                  <span className="font-display text-lg font-semibold">{app.score}</span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      app.eligibility_status === "eligible" ? "default" : "destructive"
                    }
                    className="text-xs"
                  >
                    {app.eligibility_status === "eligible"
                      ? "Eligible"
                      : app.eligibility_status === "not_eligible"
                        ? "Not eligible"
                        : "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{app.recommendation ?? "Pending"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {app.candidates?.location ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No candidates yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
