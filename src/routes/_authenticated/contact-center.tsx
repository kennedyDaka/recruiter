/**
 * Contact Center — internal support dashboard for Operon's support team.
 * Shows all incidents across all tenants with filtering, priority sorting,
 * and quick actions (assign, resolve, escalate).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentSessionFn } from "@/lib/auth/session.functions";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Headphones,
  AlertTriangle,
  Clock,
  CheckCircle2,
  MessageSquare,
  Send,
  ArrowUpCircle,
  UserCheck,
  Eye,
  Timer,
  TrendingUp,
} from "lucide-react";
import { ReportIssueDialog } from "@/components/support/ReportIssueDialog";

export const Route = createFileRoute("/_authenticated/contact-center")({
  component: ContactCenterPage,
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

function ContactCenterPage() {
  const queryClient = useQueryClient();
  const getSession = useServerFn(getCurrentSessionFn);
  const { data: session } = useQuery({
    queryKey: ["cc-session"],
    queryFn: () => getSession(),
  });
  const isAdmin = (session as any)?.role === "super_admin";

  if (session && !isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30">
        <div className="text-center">
          <Headphones className="mx-auto size-12 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">Access Restricted</p>
          <p className="mt-1 text-sm text-muted-foreground">The Contact Center is only available to platform administrators.</p>
        </div>
      </div>
    );
  }

  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);

  const listIncidents = useServerFn(listIncidentsFn);
  const getIncident = useServerFn(getIncidentFn);
  const updateIncident = useServerFn(updateIncidentFn);
  const addNote = useServerFn(addIncidentNoteFn);

  // For "active" we show everything except resolved and closed
  const effectiveStatus = statusFilter === "active" ? undefined : statusFilter;

  const { data: incidentsData, isLoading } = useQuery({
    queryKey: ["incidents", statusFilter, priorityFilter],
    queryFn: () =>
      listIncidents({
        data: {
          status: effectiveStatus,
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

  // Filter active incidents (not resolved/closed) for the stats
  const activeIncidents = (incidentsData?.incidents || []).filter(
    (inc: any) => !["resolved", "closed"].includes(inc.status),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Headphones className="size-6" />
            Contact Center
          </h1>
          <p className="text-muted-foreground">
            Manage customer incidents and support requests
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Issues</p>
                <p className="text-3xl font-bold">{activeIncidents.length}</p>
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
                <p className="text-3xl font-bold text-red-600">
                  {activeIncidents.filter((i: any) => i.priority === "critical").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">🟠 High</p>
                <p className="text-3xl font-bold text-orange-600">
                  {activeIncidents.filter((i: any) => i.priority === "high").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">🟡 Normal</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {activeIncidents.filter((i: any) => i.priority === "normal").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">🟢 Waiting</p>
                <p className="text-3xl font-bold text-green-600">
                  {activeIncidents.filter((i: any) => i.status === "waiting_for_customer").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active (Open)</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="detected">Detected</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="waiting_for_customer">Waiting for Customer</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
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
          <CardTitle className="flex items-center justify-between">
            <span>All Incidents</span>
            <span className="text-sm font-normal text-muted-foreground">
              {incidentsData?.total || 0} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : !incidentsData?.incidents?.length ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto size-12 text-green-500/30" />
              <p className="mt-4 text-lg font-medium">All clear!</p>
              <p className="text-sm text-muted-foreground">No incidents found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentsData.incidents.map((inc: any) => {
                  const isOverdue =
                    inc.sla_resolution_deadline &&
                    new Date(inc.sla_resolution_deadline) < new Date() &&
                    !["resolved", "closed"].includes(inc.status);
                  return (
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
                        {inc.error_type && (
                          <p className="text-xs font-mono text-red-600">{inc.error_type}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inc.source?.replace(/_/g, " ")}
                        </Badge>
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
                        {isOverdue ? (
                          <Badge className="bg-red-100 text-red-800">
                            <Timer className="mr-1 size-3" />
                            Overdue
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {inc.sla_resolution_deadline
                              ? new Date(inc.sla_resolution_deadline).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                })
                              : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Eye className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

// ─── Incident Detail Dialog (Contact Center version with actions) ────

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
  const [resolutionNote, setResolutionNote] = useState("");

  if (!incident) return null;

  const inc = incident.incident;
  const notes = incident.notes || [];
  const timeline = incident.timeline || [];

  const handleAddNote = async () => {
    if (!noteText.trim() || !inc?.id) return;
    setAdding(true);
    try {
      await onAddNote({
        data: { incident_id: inc.id, body: noteText.trim(), is_internal: false },
      });
      setNoteText("");
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    await onUpdateStatus({
      data: {
        id: inc.id,
        status: newStatus,
        ...(newStatus === "resolved" ? { resolution_note: resolutionNote } : {}),
      },
    });
    onRefresh();
  };

  const nextStatus: Record<string, string> = {
    detected: "acknowledged",
    open: "acknowledged",
    acknowledged: "investigating",
    investigating: "resolved",
    waiting_for_customer: "investigating",
    reopened: "investigating",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
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

          {/* Context Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
            <div>
              <span className="text-muted-foreground">Source:</span>{" "}
              <Badge variant="outline" className="text-xs">{inc.source?.replace(/_/g, " ")}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Category:</span> {inc.category}
            </div>
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
              <span className="text-muted-foreground">Reporter:</span>{" "}
              {inc.reporter_name || "System"} ({inc.reporter_email || "auto"})
            </div>
            <div>
              <span className="text-muted-foreground">Assigned:</span>{" "}
              {inc.assigned_to || "Unassigned"}
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>{" "}
              {new Date(inc.created_at).toLocaleString("en-GB")}
            </div>
            <div>
              <span className="text-muted-foreground">SLA Deadline:</span>{" "}
              {inc.sla_resolution_deadline
                ? new Date(inc.sla_resolution_deadline).toLocaleString("en-GB")
                : "—"}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            {nextStatus[inc.status] && (
              <Button
                size="sm"
                onClick={() => handleStatusChange(nextStatus[inc.status])}
              >
                <ArrowUpCircle className="mr-1 size-3" />
                Move to {nextStatus[inc.status].replace(/_/g, " ")}
              </Button>
            )}
            {inc.status !== "waiting_for_customer" && inc.status !== "resolved" && inc.status !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusChange("waiting_for_customer")}
              >
                <MessageSquare className="mr-1 size-3" />
                Waiting for Customer
              </Button>
            )}
            {inc.status === "resolved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusChange("closed")}
              >
                <CheckCircle2 className="mr-1 size-3" />
                Close
              </Button>
            )}
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Timeline</h4>
              <div className="space-y-2">
                {timeline.map((event: any) => (
                  <div key={event.id} className="flex items-start gap-2 text-sm">
                    <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <span className="font-medium">
                        {event.event_type?.replace(/_/g, " ")}
                      </span>
                      {event.old_value && event.new_value && (
                        <span className="text-muted-foreground">
                          {" "}from <code>{event.old_value}</code> → <code>{event.new_value}</code>
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
                  <div key={note.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{note.author_name || "System"}</span>
                      <Badge variant="outline" className="text-[10px]">{note.author_role}</Badge>
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
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note or reply to the customer..."
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
