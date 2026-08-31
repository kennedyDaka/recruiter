/**
 * AiHealthDashboard — admin panel showing real-time AI system metrics:
 * queue depth, throughput, performance, per-tenant usage, and trends.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  Clock,
  Database,
  Layers,
  Loader2,
  RefreshCcw,
  Shield,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { getAiHealthFn, getAiMetricsFn, resetAiCircuitFn } from "@/lib/ai.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Stat({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
    </div>
  );
}

export function AiHealthDashboard() {
  const queryClient = useQueryClient();
  const getHealth = useServerFn(getAiHealthFn);
  const getMetrics = useServerFn(getAiMetricsFn);
  const resetCircuit = useServerFn(resetAiCircuitFn);

  const health = useQuery({
    queryKey: ["ai-health"],
    queryFn: async () => await getHealth(),
    refetchInterval: 15_000,
  });

  const metrics = useQuery({
    queryKey: ["ai-metrics"],
    queryFn: async () => await getMetrics(),
    refetchInterval: 15_000,
  });

  const resetMutation = useMutation({
    mutationFn: async () => await resetCircuit(),
    onSuccess: (data) => {
      toast.success(data.healthCheck ? "Circuit breaker reset. Gemini responding." : "Reset done, but Gemini is not responding.");
      queryClient.invalidateQueries({ queryKey: ["ai-health"] });
      queryClient.invalidateQueries({ queryKey: ["ai-metrics"] });
    },
    onError: () => toast.error("Failed to reset circuit breaker."),
  });

  const m = metrics.data?.metrics;
  const h = health.data;
  const loading = health.isLoading || metrics.isLoading;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading AI metrics...
      </div>
    );
  }

  if (!m) {
    return (
      <div className="text-muted-foreground py-8">
        AI metrics unavailable. Ensure AI tables exist in the database.
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    degraded: "bg-yellow-500",
    unavailable: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      {/* ── Real-Time Queue ─────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4" />
          Real-Time Queue
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Queued" value={m.queue.depth} icon={<Clock className="h-3.5 w-3.5" />} />
          <Stat label="Processing" value={m.queue.processing} icon={<Zap className="h-3.5 w-3.5" />} color={m.queue.processing > 0 ? "text-blue-600" : ""} />
          <Stat label="Retry Pending" value={m.queue.retryScheduled} icon={<RefreshCcw className="h-3.5 w-3.5" />} color={m.queue.retryScheduled > 0 ? "text-yellow-600" : ""} />
        </div>
        {m.activeJobs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Currently Processing</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {m.activeJobs.map((job: any) => (
                <div key={job.id} className="flex items-center gap-2 text-xs font-mono">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  <span className="text-muted-foreground w-24 shrink-0">{job.id.slice(0, 8)}...</span>
                  <span className="truncate">{job.applicationId ?? job.jobType}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{job.elapsedSec}s</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Throughput ──────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4" />
          Throughput
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Last 1h" value={m.throughput.last1h} icon={<Clock className="h-3.5 w-3.5" />} />
          <Stat label="Last 6h" value={m.throughput.last6h} icon={<Clock className="h-3.5 w-3.5" />} />
          <Stat label="Last 24h" value={m.throughput.last24h} icon={<Clock className="h-3.5 w-3.5" />} />
          <Stat label="Last 7d" value={m.throughput.last7d} icon={<Database className="h-3.5 w-3.5" />} />
        </div>
      </div>

      {/* ── Outcomes & Performance ──────────────────────────── */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4" />
          Outcomes & Performance
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat label="AI Successful" value={m.outcomes.aiSuccess} icon={<CheckCircle className="h-3.5 w-3.5" />} color="text-green-600" />
          <Stat label="Fallback Used" value={m.outcomes.fallbackCompleted} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="text-yellow-600" />
          <Stat label="Failed" value={m.outcomes.failed} icon={<XCircle className="h-3.5 w-3.5" />} color="text-red-600" />
        </div>
        <div className="flex gap-4 text-sm mb-3">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">{m.outcomes.totalAllTime}</span>
          </div>
          <Badge variant={Number(m.outcomes.successRate) > 80 ? "default" : "destructive"}>
            Success: {m.outcomes.successRate}
          </Badge>
          <Badge variant={Number(m.outcomes.fallbackRate) > 20 ? "destructive" : "secondary"}>
            Fallback: {m.outcomes.fallbackRate}
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Avg Response</p>
            <p className="font-medium">{m.performance.avgResponseMs}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">P50</p>
            <p className="font-medium">{m.performance.p50ResponseMs}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">P95</p>
            <p className="font-medium">{m.performance.p95ResponseMs}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg Retries</p>
            <p className="font-medium">{m.performance.avgRetries}</p>
          </div>
        </div>
      </div>

      {/* ── Hourly Trend (last 24h) ────────────────────────── */}
      {m.hourlyTrend.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" />
            Hourly Trend (24h)
          </h3>
          <div className="flex items-end gap-1 h-20">
            {m.hourlyTrend.map((h: any, i: number) => {
              const maxVal = Math.max(...m.hourlyTrend.map((t) => t.total), 1);
              const height = (h.total / maxVal) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary/20 hover:bg-primary/40 transition-colors relative group"
                  style={{ height: `${Math.max(height, 4)}%` }}
                  title={`${new Date(h.hour).toLocaleTimeString()}: ${h.total} total, ${h.successful} ok, ${h.failed} failed`}
                >
                  {h.failed > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t bg-red-500/60"
                      style={{ height: `${(h.failed / maxVal) * 100}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{m.hourlyTrend.length > 0 ? new Date(m.hourlyTrend[0]!.hour).toLocaleTimeString([], { hour: "2-digit" }) : ""}</span>
            <span>{m.hourlyTrend.length > 0 ? new Date(m.hourlyTrend[m.hourlyTrend.length - 1]!.hour).toLocaleTimeString([], { hour: "2-digit" }) : ""}</span>
          </div>
        </div>
      )}

      {/* ── Per-Tenant Usage ────────────────────────────────── */}
      {m.tenantUsage.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Users className="h-4 w-4" />
            Per-Tenant Usage (Top 10)
          </h3>
          <div className="space-y-2">
            {m.tenantUsage.map((t) => {
              const maxJobs = m.tenantUsage[0]?.totalJobs ?? 1;
              const width = (t.totalJobs / maxJobs) * 100;
              return (
                <div key={t.tenantId} className="text-sm">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium truncate max-w-[200px]">{t.tenantName}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.totalJobs} jobs ({t.successful} ok, {t.failed} failed)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Provider Status & Actions ──────────────────────── */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Provider: {m.provider.provider}
          </h3>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${statusColors[m.provider.status] ?? "bg-gray-400"}`} />
            <span className="text-sm capitalize">{m.provider.status}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
          <div>
            <p className="text-muted-foreground text-xs">Circuit</p>
            <p className="font-medium">{h?.circuitStatus?.state ?? "closed"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Interval</p>
            <p className="font-medium">{m.provider.requestInterval / 1000}s</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg Response</p>
            <p className="font-medium">{m.provider.avgResponseMs}ms</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="gap-2"
          >
            {resetMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Reset Circuit Breaker
          </Button>
        </div>
      </div>

      {/* ── Recent Logs ─────────────────────────────────────── */}
      {h?.recentLogs && h.recentLogs.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono">
            {h.recentLogs.map((log: Record<string, any>) => (
              <div key={log["id"]} className="flex items-center gap-2 py-0.5">
                <span className="text-muted-foreground w-32 shrink-0">
                  {new Date(log["created_at"]).toLocaleTimeString()}
                </span>
                <Badge
                  variant={log["status"] === "success" ? "default" : log["status"] === "error" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {log["event_type"]}
                </Badge>
                <span className="truncate">{log["input_summary"] || log["error_code"] || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
