/**
 * Incident Management — server functions for creating, listing, updating,
 * and adding notes to support incidents.
 *
 * Incidents can be:
 *  - Auto-detected: system catches an error and creates an incident automatically
 *  - User-reported: user clicks "Report Issue" and submits details
 *  - Support-agent: created by internal support team
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase.server";
import { requireAuth } from "@/lib/auth/session.server";

// ─── Constants ───────────────────────────────────────────────────────

const PRIORITY_WEIGHTS = { critical: 0, high: 1, normal: 2, low: 3 };
const SLA_HOURS = {
  critical: { response: 0.25, resolution: 4 },
  high: { response: 0.5, resolution: 8 },
  normal: { response: 2, resolution: 24 },
  low: { response: 4, resolution: 48 },
};

const ISSUE_TYPES = [
  "technical",
  "incorrect_info",
  "how_to_question",
] as const;

const CATEGORIES = [
  "recruitment",
  "communication",
  "account",
  "billing",
  "integrations",
  "documents",
  "other",
] as const;

const STATUSES = [
  "detected",
  "open",
  "acknowledged",
  "investigating",
  "waiting_for_customer",
  "resolved",
  "closed",
  "reopened",
] as const;

// ─── Create Incident ────────────────────────────────────────────────

const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  source: z.enum(["user_reported", "auto_detected", "system_monitoring", "support_agent"]).default("user_reported"),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
  issue_type: z.enum(ISSUE_TYPES).default("technical"),
  category: z.enum(CATEGORIES).default("other"),
  error_type: z.string().max(200).optional(),
  error_message: z.string().max(1000).optional(),
  campaign_id: z.string().uuid().optional(),
  candidate_id: z.string().uuid().optional(),
  action: z.string().max(200).optional(),
  channel: z.string().max(50).optional(),
  reference_ids: z.record(z.string()).optional(),
  screenshot_url: z.string().max(5000).optional(),
});

export const createIncidentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => createIncidentSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.tenantId) throw new Error("No workspace");

    const supabase = await getSupabaseClient();
    const now = new Date().toISOString();
    const slaResponse = new Date(Date.now() + SLA_HOURS[data.priority].response * 3600000).toISOString();
    const slaResolution = new Date(Date.now() + SLA_HOURS[data.priority].resolution * 3600000).toISOString();

    // Get next incident number
    const { data: lastIncident } = await supabase
      .from("incidents" as any)
      .select("incident_number")
      .order("incident_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = ((lastIncident as any)?.incident_number || 0) + 1;

    const incidentData = {
      tenant_id: auth.tenantId,
      incident_number: nextNumber,
      source: data.source,
      priority: data.priority,
      status: data.source === "auto_detected" ? "detected" : "open",
      issue_type: data.issue_type,
      category: data.category,
      title: data.title,
      description: data.description || null,
      error_type: data.error_type || null,
      error_message: data.error_message || null,
      campaign_id: data.campaign_id || null,
      candidate_id: data.candidate_id || null,
      action: data.action || null,
      channel: data.channel || null,
      reference_ids: data.reference_ids ? JSON.stringify(data.reference_ids) : null,
      reported_by: auth.userId,
      reporter_name: auth.profile?.full_name || null,
      reporter_email: auth.profile?.email || null,
      screenshot_url: data.screenshot_url || null,
      sla_response_deadline: slaResponse,
      sla_resolution_deadline: slaResolution,
      created_at: now,
      updated_at: now,
    };

    const { data: incident, error } = await supabase
      .from("incidents" as any)
      .insert(incidentData as any)
      .select()
      .single();

    if (error) {
      console.error("[Incident] Create error:", error.message);
      throw new Error("Failed to create incident");
    }

    // Log the creation event
    await supabase.from("incident_events" as any).insert({
      incident_id: (incident as any).id,
      event_type: "created",
      new_value: "open",
      actor_id: auth.userId,
      actor_name: auth.profile?.full_name || null,
      metadata: JSON.stringify({ source: data.source }),
    } as any);

    return {
      incident: incident as any,
      referenceNumber: `OP-${String(nextNumber).padStart(5, "0")}`,
    };
  });

// ─── List Incidents ─────────────────────────────────────────────────

const listIncidentsSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export const listIncidentsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listIncidentsSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.tenantId) throw new Error("No workspace");

    const supabase = await getSupabaseClient();
    let query = supabase
      .from("incidents" as any)
      .select("*", { count: "exact" })
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.priority) query = query.eq("priority", data.priority);
    if (data.category) query = query.eq("category", data.category);

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;
    query = query.range(from, to);

    const { data: incidents, count, error } = await query;

    if (error) {
      console.error("[Incident] List error:", error.message);
      throw new Error("Failed to list incidents");
    }

    // Get summary counts
    const { data: allIncidents } = await supabase
      .from("incidents" as any)
      .select("status, priority")
      .eq("tenant_id", auth.tenantId);

    const summary = {
      total: count || 0,
      open: 0,
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
      byStatus: {} as Record<string, number>,
    };

    if (allIncidents) {
      for (const inc of allIncidents as any[]) {
        summary.byStatus[inc.status] = (summary.byStatus[inc.status] || 0) + 1;
        if (inc.status === "open" || inc.status === "detected" || inc.status === "acknowledged" || inc.status === "investigating" || inc.status === "reopened") {
          summary.open++;
        }
        if (inc.priority in summary) {
          (summary as any)[inc.priority]++;
        }
      }
    }

    return {
      incidents: (incidents as any[]) || [],
      total: count || 0,
      page: data.page,
      limit: data.limit,
      summary,
    };
  });

// ─── Get Single Incident ────────────────────────────────────────────

export const getIncidentFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.tenantId) throw new Error("No workspace");

    const supabase = await getSupabaseClient();

    const { data: incident, error } = await supabase
      .from("incidents" as any)
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", auth.tenantId)
      .single();

    if (error || !incident) throw new Error("Incident not found");

    // Get notes
    const { data: notes } = await supabase
      .from("incident_notes" as any)
      .select("*")
      .eq("incident_id", data.id)
      .order("created_at", { ascending: true });

    // Get timeline
    const { data: timeline } = await supabase
      .from("incident_events" as any)
      .select("*")
      .eq("incident_id", data.id)
      .order("created_at", { ascending: true });

    return {
      incident: incident as any,
      notes: (notes as any[]) || [],
      timeline: (timeline as any[]) || [],
    };
  });

// ─── Update Incident Status ─────────────────────────────────────────

const updateIncidentSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  assigned_to: z.string().optional(),
  resolution_note: z.string().max(2000).optional(),
});

export const updateIncidentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateIncidentSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.tenantId) throw new Error("No workspace");

    const supabase = await getSupabaseClient();
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };

    // Get current incident for comparison
    const { data: current } = await supabase
      .from("incidents" as any)
      .select("status, priority")
      .eq("id", data.id)
      .eq("tenant_id", auth.tenantId)
      .single();

    if (data.status) {
      updates.status = data.status;
      if (data.status === "acknowledged") updates.acknowledged_at = now;
      if (data.status === "resolved") {
        updates.resolved_at = now;
        updates.sla_met = true; // simplified
      }
      if (data.status === "closed") updates.closed_at = now;
    }

    if (data.priority) updates.priority = data.priority;
    if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to;
    if (data.resolution_note) updates.resolution_note = data.resolution_note;

    const { error } = await supabase
      .from("incidents" as any)
      .update(updates)
      .eq("id", data.id)
      .eq("tenant_id", auth.tenantId);

    if (error) throw new Error("Failed to update incident");

    // Log status change
    const events: any[] = [];
    if (data.status && current && (current as any).status !== data.status) {
      events.push({
        incident_id: data.id,
        event_type: "status_change",
        old_value: (current as any).status,
        new_value: data.status,
        actor_id: auth.userId,
        actor_name: auth.profile?.full_name || null,
      });
    }
    if (data.priority && current && (current as any).priority !== data.priority) {
      events.push({
        incident_id: data.id,
        event_type: "priority_change",
        old_value: (current as any).priority,
        new_value: data.priority,
        actor_id: auth.userId,
        actor_name: auth.profile?.full_name || null,
      });
    }

    if (events.length) {
      await supabase.from("incident_events" as any).insert(events as any);
    }

    return { ok: true };
  });

// ─── Add Note ───────────────────────────────────────────────────────

const addNoteSchema = z.object({
  incident_id: z.string().uuid(),
  body: z.string().min(1).max(2000),
  is_internal: z.boolean().default(false),
});

export const addIncidentNoteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => addNoteSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.tenantId) throw new Error("No workspace");

    const supabase = await getSupabaseClient();

    const { error } = await supabase.from("incident_notes" as any).insert({
      incident_id: data.incident_id,
      author_id: auth.userId,
      author_name: auth.profile?.full_name || null,
      author_role: "support",
      body: data.body,
      is_internal: data.is_internal,
    } as any);

    if (error) throw new Error("Failed to add note");

    // Log the event
    await supabase.from("incident_events" as any).insert({
      incident_id: data.incident_id,
      event_type: "note_added",
      actor_id: auth.userId,
      actor_name: auth.profile?.full_name || null,
      metadata: JSON.stringify({ is_internal: data.is_internal }),
    } as any);

    return { ok: true };
  });

// ─── Auto-detect Error Helper ───────────────────────────────────────
// Call this from any workflow that encounters an error to automatically
// create an incident with full context.

export async function autoCreateIncident(params: {
  tenantId: string;
  userId: string;
  userName?: string;
  title: string;
  errorType: string;
  errorMessage: string;
  campaignId?: string;
  candidateId?: string;
  action: string;
  channel?: string;
  priority?: "critical" | "high" | "normal" | "low";
  category?: string;
}) {
  try {
    const supabase = await getSupabaseClient();
    const now = new Date().toISOString();
    const priority = params.priority || "normal";
    const slaResponse = new Date(Date.now() + SLA_HOURS[priority].response * 3600000).toISOString();
    const slaResolution = new Date(Date.now() + SLA_HOURS[priority].resolution * 3600000).toISOString();

    const { data: lastIncident } = await supabase
      .from("incidents" as any)
      .select("incident_number")
      .order("incident_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = ((lastIncident as any)?.incident_number || 0) + 1;

    const { data: incident, error } = await supabase
      .from("incidents" as any)
      .insert({
        tenant_id: params.tenantId,
        incident_number: nextNumber,
        source: "auto_detected",
        priority,
        status: "detected",
        issue_type: "technical",
        category: params.category || "other",
        title: params.title,
        error_type: params.errorType,
        error_message: params.errorMessage?.slice(0, 1000) || null,
        campaign_id: params.campaignId || null,
        candidate_id: params.candidateId || null,
        action: params.action,
        channel: params.channel || null,
        reported_by: params.userId,
        reporter_name: params.userName || null,
        sla_response_deadline: slaResponse,
        sla_resolution_deadline: slaResolution,
        created_at: now,
        updated_at: now,
      } as any)
      .select()
      .single();

    if (error) {
      console.error("[AutoIncident] Failed:", error.message);
      return null;
    }

    // Log creation event
    await supabase.from("incident_events" as any).insert({
      incident_id: (incident as any).id,
      event_type: "created",
      new_value: "detected",
      metadata: JSON.stringify({ source: "auto_detected", action: params.action }),
    } as any);

    return {
      id: (incident as any).id,
      referenceNumber: `OP-${String(nextNumber).padStart(5, "0")}`,
    };
  } catch (err) {
    console.error("[AutoIncident] Error:", err);
    return null;
  }
}
