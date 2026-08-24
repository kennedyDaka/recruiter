/**
 * Support Center — where users see their reported incidents, track
 * status, and add notes. Also provides quick access to help resources.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listIncidentsFn,
  getIncidentFn,
  updateIncidentFn,
  addIncidentNoteFn,
} from "@/lib/incident.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LifeBuoy,
  AlertTriangle,
  Bug,
  HelpCircle,
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
  MessageSquare,
  Send,
  BookOpen,
  Video,
  ExternalLink,
} from "lucide-react";
import { ReportIssueDialog } from "@/components/support/ReportIssueDialog";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportCenterPage,
});

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  normal: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const STATUS_COLORS: Record<string, string> = {
  detected: "bg-red-100 text-red-800",
  open: "bg-blue-100 text-blue-800",
  acknowledged: "bg-purple-100 text-purple-800",
  investigating: "bg-orange-100 text-orange-800",
  waiting_for_customer: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  reopened: "bg-red-100 text-red-800",
};

function SupportCenterPage() {
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const listIncidents = useServerFn(listIncidentsFn);
  const getIncident = useServerFn(getIncidentFn);
  const updateIncident = useServerFn(updateIncidentFn);
  const addNote = useServerFn(addIncidentNoteFn);

  const { data: incidentsData, isLoading } = useQuery({
    queryKey: ["incidents", statusFilter, priorityFilter],
    queryFn: () =>
      listIncidents({
        data: {
          status: statusFilter === "all" ? undefined : statusFilter,
          priority: priorityFilter === "all" ? undefined : priorityFilter,
        },
      }),
  });

  const { data: incidentDetail } = useQuery({
    queryKey: ["incident", selectedIncident],
    queryFn: () => getIncident({ data: { id: selectedIncident! } }),
    enabled: !!selectedIncident,
  });

  const summary = incidentsData?.summary;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="size-6" />
            Support Center
          </h1>
          <p className="text-muted-foreground">
            Report issues, track incidents, and get help
          </p>
        </div>
        <Button onClick={() => setReportOpen(true)}>
          <Bug className="mr-2 size-4" />
          Report Issue
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Issues</p>
                <p className="text-3xl font-bold">{summary?.open || 0}</p>
              </div>
              <AlertTriangle className="size-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">🔴 Critical</p>
                <p className="text-3xl font-bold text-red-600">{summary?.critical || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">🟠 High</p>
                <p className="text-3xl font-bold text-orange-600">{summary?.high || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold">{summary?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="detected">Detected</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="waiting_for_customer">Waiting for Customer</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">🔴 Critical</SelectItem>
            <SelectItem value="high">🟠 High</SelectItem>
            <SelectItem value="normal">🟡 Normal</SelectItem>
            <SelectItem value="low">🟢 Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : !incidentsData?.incidents?.length ? (
            <div className="py-12 text-center">
              <LifeBuoy className="mx-auto size-12 text-muted-foreground/30" />
              <p className="mt-4 text-lg font-medium">No incidents reported</p>
              <p className="text-sm text-muted-foreground">
                Everything looks good! If you encounter an issue, click "Report Issue" above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentsData.incidents.map((inc: any) => (
                  <TableRow
                    key={inc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedIncident(inc.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      OP-{String(inc.incident_number).padStart(5, "0")}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{inc.title}</p>
                      {inc.action && (
                        <p className="text-xs text-muted-foreground">{inc.action}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_COLORS[inc.priority] || ""}>
                        {inc.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[inc.status] || ""}>
                        {inc.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inc.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Help Resources */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex items-center gap-4 p-4">
            <BookOpen className="size-8 text-primary" />
            <div>
              <p className="font-medium">Help Center</p>
              <p className="text-sm text-muted-foreground">Browse articles and guides</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex items-center gap-4 p-4">
            <Video className="size-8 text-primary" />
            <div>
              <p className="font-medium">Video Tutorials</p>
              <p className="text-sm text-muted-foreground">Watch how-to videos</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => {
            const msg = encodeURIComponent("Hello Operon Support, I need assistance with Operon Recruit.");
            window.open(`https://wa.me/?text=${msg}`, "_blank");
          }}
        >
          <CardContent className="flex items-center gap-4 p-4">
            <MessageSquare className="size-8 text-green-600" />
            <div>
              <p className="font-medium">Chat with Support</p>
              <p className="text-sm text-muted-foreground">Message us on WhatsApp</p>
            </div>
            <ExternalLink className="ml-auto size-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Report Issue Dialog */}
      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} />

      {/* Incident Detail Dialog */}
      <IncidentDetailDialog
        incident={incidentDetail}
        open={!!selectedIncident}
        onOpenChange={(open) => !open && setSelectedIncident(null)}
        onAddNote={addNote}
        onUpdateStatus={updateIncident}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["incidents"] });
          queryClient.invalidateQueries({ queryKey: ["incident", selectedIncident] });
        }}
      />
    </div>
  );
}

// ─── Incident Detail Dialog ─────────────────────────────────────────

function IncidentDetailDialog({
  incident,
  open,
  onOpenChange,
  onAddNote,
  onUpdateStatus,
  onRefresh,
}: {
  incident: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNote: any;
  onUpdateStatus: any;
  onRefresh: () => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddNote = async () => {
    if (!noteText.trim() || !incident?.incident?.id) return;
    setAdding(true);
    try {
      await onAddNote({
        data: {
          incident_id: incident.incident.id,
          body: noteText.trim(),
          is_internal: false,
        },
      });
      setNoteText("");
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  if (!incident) return null;

  const inc = incident.incident;
  const notes = incident.notes || [];
  const timeline = incident.timeline || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              OP-{String(inc.incident_number).padStart(5, "0")}
            </span>
            <Badge className={PRIORITY_COLORS[inc.priority] || ""}>{inc.priority}</Badge>
            <Badge className={STATUS_COLORS[inc.status] || ""}>
              {inc.status?.replace(/_/g, " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{inc.title}</h3>
            {inc.description && (
              <p className="mt-1 text-sm text-muted-foreground">{inc.description}</p>
            )}
          </div>

          {/* Context */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {inc.action && (
              <div>
                <span className="text-muted-foreground">Action:</span> {inc.action}
              </div>
            )}
            {inc.channel && (
              <div>
                <span className="text-muted-foreground">Channel:</span> {inc.channel}
              </div>
            )}
            {inc.error_type && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Error:</span>{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">{inc.error_type}</code>
              </div>
            )}
            {inc.error_message && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Message:</span>{" "}
                <span className="text-xs">{inc.error_message}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Source:</span>{" "}
              {inc.source?.replace(/_/g, " ")}
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>{" "}
              {new Date(inc.created_at).toLocaleString("en-GB")}
            </div>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Timeline</h4>
              <div className="space-y-2">
                {timeline.map((event: any) => (
                  <div key={event.id} className="flex items-start gap-2 text-sm">
                    <Circle className="mt-1 size-2 shrink-0" />
                    <div>
                      <span className="font-medium">{event.event_type?.replace(/_/g, " ")}</span>
                      {event.old_value && event.new_value && (
                        <span className="text-muted-foreground">
                          {" "}
                          from {event.old_value} → {event.new_value}
                        </span>
                      )}
                      {event.actor_name && (
                        <span className="text-muted-foreground"> by {event.actor_name}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString("en-GB")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <h4 className="font-medium mb-2">Notes</h4>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {notes.map((note: any) => (
                  <div
                    key={note.id}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{note.author_name || "Support"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {note.author_role}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(note.created_at).toLocaleString("en-GB")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{note.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Note */}
          {inc.status !== "closed" && (
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button
                onClick={handleAddNote}
                disabled={!noteText.trim() || adding}
                className="self-end"
              >
                <Send className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
