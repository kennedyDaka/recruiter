/**
 * AiHealthDashboard — admin panel showing AI system health, queue status,
 * circuit breaker state, and fallback metrics.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle,
  Loader2,
  RefreshCcw,
  Shield,
  XCircle,
} from "lucide-react";
import { getAiHealthFn, resetAiCircuitFn } from "@/lib/ai.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AiHealthDashboard() {
  const queryClient = useQueryClient();
  const getHealth = useServerFn(getAiHealthFn);
  const resetCircuit = useServerFn(resetAiCircuitFn);

  const health = useQuery({
    queryKey: ["ai-health"],
    queryFn: async () => {
      const result = await getHealth();
      return result;
    },
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await resetCircuit();
    },
    onSuccess: (data) => {
      toast.success(
        data.healthCheck
          ? "Circuit breaker reset. Gemini is responding."
          : "Circuit breaker reset, but Gemini is not responding.",
      );
      queryClient.invalidateQueries({ queryKey: ["ai-health"] });
    },
    onError: () => {
      toast.error("Failed to reset circuit breaker.");
    },
  });

  const dashboard = health.data?.dashboard;
  const circuit = health.data?.circuitStatus;
  const loading = health.isLoading;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading AI status...
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-muted-foreground py-8">
        AI monitoring data unavailable. Ensure AI tables exist in the database.
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    degraded: "bg-yellow-500",
    unavailable: "bg-red-500",
    unknown: "bg-gray-400",
  };
  const statusColor = statusColors[dashboard.status] ?? "bg-gray-400";

  const circuitIcons: Record<string, React.ReactNode> = {
    closed: <CheckCircle className="h-4 w-4 text-green-500" />,
    open: <XCircle className="h-4 w-4 text-red-500" />,
    half_open: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  };
  const circuitIcon = circuitIcons[circuit?.state ?? "closed"] ?? <Activity className="h-4 w-4" />;

  return (
    <div className="space-y-6">
      {/* Provider Status */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Provider
          </h3>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span className="text-sm capitalize">{dashboard.status}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Circuit</p>
            <p className="font-medium flex items-center gap-1">
              {circuitIcon}
              {circuit?.state ?? "closed"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Provider</p>
            <p className="font-medium capitalize">{dashboard.provider}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Response</p>
            <p className="font-medium">{dashboard.avgResponseMs}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground">Request Interval</p>
            <p className="font-medium">{dashboard.requestInterval / 1000}s</p>
          </div>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4" />
          Processing Queue
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Waiting</p>
            <p className="text-2xl font-bold">{dashboard.queueWaiting}</p>
          </div>
          <div>
            <p className="text-muted-foreground">AI Successful</p>
            <p className="text-2xl font-bold text-green-600">{dashboard.aiSuccessful}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fallback Used</p>
            <p className="text-2xl font-bold text-yellow-600">{dashboard.fallbackCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold text-red-600">{dashboard.failed}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Total processed: {dashboard.processedTotal}
          </span>
          <Badge variant={Number(dashboard.fallbackRate) > 20 ? "destructive" : "secondary"}>
            Fallback rate: {dashboard.fallbackRate}
          </Badge>
        </div>
      </div>

      {/* Recent Logs */}
      {health.data?.recentLogs && health.data.recentLogs.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono">
            {health.data.recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-2 py-0.5">
                <span className="text-muted-foreground w-32 shrink-0">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <Badge variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                  {log.event_type}
                </Badge>
                <span className="truncate">
                  {log.input_summary || log.error_code || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          className="gap-2"
        >
          {resetMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Reset Circuit Breaker
        </Button>
      </div>
    </div>
  );
}
