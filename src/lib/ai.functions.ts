/**
 * AI Server Functions — TanStack Start server functions for AI integration.
 * Placed in src/lib/ to follow the existing codebase convention.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVacancyStructuring } from "@/lib/ai/service";
import {
  getAiHealthDashboard,
  getRecentLogs,
  getAiMetrics,
} from "@/lib/ai/logging";
import { getCircuitStatus, resetCircuit, runHealthCheck } from "@/lib/ai/circuit-breaker";

// ─── Vacancy Structuring ──────────────────────────────────────────

const vacancyInputSchema = z.object({
  rawVacancy: z
    .string()
    .min(10, "Vacancy text must be at least 10 characters")
    .max(20000, "Vacancy text is too long"),
});

/**
 * Structure an unstructured vacancy using AI.
 * Requires authentication — only recruiters can use this.
 */
export const structureVacancyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => vacancyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context.tenantId) {
      return { success: false, vacancy: null, error: "No workspace is linked to this account yet." };
    }

    const result = await processVacancyStructuring({
      tenantId: context.tenantId,
      rawVacancy: data.rawVacancy,
    });

    return {
      success: result.success,
      vacancy: result.vacancy ? JSON.stringify(result.vacancy) : null,
      error: result.error ?? null,
    };
  });

// ─── Health Monitoring ────────────────────────────────────────────

/**
 * Get AI system health dashboard data.
 */
export const getAiHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.tenantId) {
      return { dashboard: null, circuitStatus: null, recentLogs: [] };
    }

    const dashboard = await getAiHealthDashboard("gemini");
    const circuitStatus = await getCircuitStatus("gemini");
    const recentLogs = await getRecentLogs(context.tenantId, 20);

    return { dashboard, circuitStatus, recentLogs };
  });

/**
 * Force-reset the AI circuit breaker and trigger a health check.
 */
export const resetAiCircuitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.tenantId) {
      return { reset: false, healthCheck: false, status: null };
    }

    await resetCircuit("gemini");
    const isHealthy = await runHealthCheck("gemini");
    const status = await getCircuitStatus("gemini");

    return { reset: true, healthCheck: isHealthy, status };
  });

// ─── Admin Metrics ────────────────────────────────────────────────

/**
 * Comprehensive AI metrics: queue depth, throughput, trends, per-tenant usage.
 * Admin-only endpoint for real-time monitoring.
 */
export const getAiMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.tenantId) {
      return { metrics: null };
    }

    const metrics = await getAiMetrics();
    return { metrics };
  });
