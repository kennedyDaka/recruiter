import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
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
  const { data, isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, first_name, last_name, email, phone, location, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Candidates" description="People who have applied to your campaigns.">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((candidate: any) => (
              <TableRow key={candidate.id}>
                <TableCell className="font-medium">
                  {candidate.first_name} {candidate.last_name}
                </TableCell>
                <TableCell className="text-muted-foreground">{candidate.email}</TableCell>
                <TableCell className="text-muted-foreground">{candidate.phone ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{candidate.location ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!isLoading && (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
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
