/**
 * Incident Management — server functions for creating, listing, updating,
 * and adding notes to support incidents.
 *
 * Uses the standard requireSupabaseAuth middleware + from() from @/lib/db.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { from } from "@/lib/db";

// ─── Constants ───────────────────────────────────────────────────────

const SLA_HOURS = {
  critical: { response: 0.25, resolution: 4 },
  high: { response: 0.5, resolution: 8 },
  normal: { response: 2, resolution: 24 },
  low: { response: 4, resolution: 48 },
};

const STATUSES = [
  "detected", "open", "acknowledged", "investigating",
  "waiting_for_customer", "resolved", "closed", "reopened",
] as const;

// ─── Create Incident ────────────────────────────────────────────────

const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  source: z.enum(["user_reported", "auto_detected", "system_monitoring", "support_agent"]).default("user_reported"),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
  issue_type: z.enum(["technical", "incorrect_info", "how_to_question"]).default("technical"),
  category: z.enum(["recruitment", "communication", "account", "billing", "integrations", "documents", "other"]).default("other"),
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createIncidentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context;
    if (!tenantId) throw new Error("No workspace");

    const now = new Date().toISOString();
    const slaResponse = new Date(Date.now() + SLA_HOURS[data.priority].response * 3600000).toISOString();
    const slaResolution = new Date(Date.now() + SLA_HOURS[data.priority].resolution * 3600000).toISOString();

    // Get next incident number
    const lastIncident = await from("incidents")
      .select("incident_number")
      .order("incident_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = ((lastIncident as any)?.data?.incident_number || 0) + 1;

    const incidentData: Record<string, any> = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
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
      reported_by: userId,
      reporter_name: (context as any).claims?.email || null,
      reporter_email: (context as any).claims?.email || null,
      screenshot_url: data.screenshot_url || null,
      sla_response_deadline: slaResponse,
      sla_resolution_deadline: slaResolution,
      created_at: now,
      updated_at: now,
    };

    const result = await from("incidents").insert(incidentData as any);
    if (result.error) {
      console.error("[Incident] Create error:", result.error.message);
      throw new Error("Failed to create incident");
    }

    // Log the creation event
    await from("incident_events").insert({
      id: crypto.randomUUID(),
      incident_id: incidentData.id,
      event_type: "created",
      new_value: "open",
      actor_id: userId,
      actor_name: (context as any).claims?.email || null,
      metadata: JSON.stringify({ source: data.source }),
      created_at: now,
    } as any);

    return {
      incident: incidentData,
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listIncidentsSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    if (!tenantId) throw new Error("No workspace");

    let query = from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .eq("tenant_id", tenantId);

    if (data.status) query = query.eq("status", data.status);
    if (data.priority) query = query.eq("priority", data.priority);
    if (data.category) query = query.eq("category", data.category);
    query = query.limit(data.limit);

    const { data: incidents, error } = await query;

    if (error) {
      console.error("[Incident] List error:", error.message);
      throw new Error("Failed to list incidents");
    }

    // Get summary counts from all incidents for this tenant
    const allResult = await from("incidents")
      .select("status, priority")
      .eq("tenant_id", tenantId);

    const summary = {
      total: (incidents as any[])?.length || 0,
      open: 0,
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
      byStatus: {} as Record<string, number>,
    };

    const allRows = (allResult.data || []) as any[];
    for (const inc of allRows) {
      summary.byStatus[inc.status] = (summary.byStatus[inc.status] || 0) + 1;
      if (["open", "detected", "acknowledged", "investigating", "reopened"].includes(inc.status)) {
        summary.open++;
      }
      if (inc.priority in summary) {
        (summary as any)[inc.priority]++;
      }
    }
    summary.total = allRows.length;

    return {
      incidents: (incidents as any[]) || [],
      total: summary.total,
      page: data.page,
      limit: data.limit,
      summary,
    };
  });

// ─── Get Single Incident ────────────────────────────────────────────

export const getIncidentFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    if (!tenantId) throw new Error("No workspace");

    const { data: incident, error } = await from("incidents")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !incident) throw new Error("Incident not found");

    // Get notes
    const { data: notes } = await from("incident_notes")
      .select("*")
      .eq("incident_id", data.id)
      .order("created_at", { ascending: true });

    // Get timeline
    const { data: timeline } = await from("incident_events")
      .select("*")
      .eq("incident_id", data.id)
      .order("created_at", { ascending: true });

    return {
      incident,
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateIncidentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context;
    if (!tenantId) throw new Error("No workspace");

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };

    // Get current incident
    const { data: current } = await from("incidents")
      .select("status, priority")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (data.status) {
      updates.status = data.status;
      if (data.status === "acknowledged") updates.acknowledged_at = now;
      if (data.status === "resolved") { updates.resolved_at = now; updates.sla_met = true; }
      if (data.status === "closed") updates.closed_at = now;
    }

    if (data.priority) updates.priority = data.priority;
    if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to;
    if (data.resolution_note) updates.resolution_note = data.resolution_note;

    const { error } = await from("incidents")
      .update(updates)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);

    if (error) throw new Error("Failed to update incident");

    // Log events
    const events: any[] = [];
    if (data.status && current && (current as any).status !== data.status) {
      events.push({
        id: crypto.randomUUID(),
        incident_id: data.id,
        event_type: "status_change",
        old_value: (current as any).status,
        new_value: data.status,
        actor_id: userId,
        actor_name: (context as any).claims?.email || null,
        created_at: now,
      });
    }
    if (data.priority && current && (current as any).priority !== data.priority) {
      events.push({
        id: crypto.randomUUID(),
        incident_id: data.id,
        event_type: "priority_change",
        old_value: (current as any).priority,
        new_value: data.priority,
        actor_id: userId,
        actor_name: (context as any).claims?.email || null,
        created_at: now,
      });
    }

    if (events.length) {
      for (const event of events) {
        await from("incident_events").insert(event);
      }
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context;
    if (!tenantId) throw new Error("No workspace");

    const now = new Date().toISOString();

    const { error } = await from("incident_notes").insert({
      id: crypto.randomUUID(),
      incident_id: data.incident_id,
      author_id: userId,
      author_name: (context as any).claims?.email || null,
      author_role: "support",
      body: data.body,
      is_internal: data.is_internal,
      created_at: now,
    } as any);

    if (error) throw new Error("Failed to add note");

    // Log the event
    await from("incident_events").insert({
      id: crypto.randomUUID(),
      incident_id: data.incident_id,
      event_type: "note_added",
      actor_id: userId,
      actor_name: (context as any).claims?.email || null,
      metadata: JSON.stringify({ is_internal: data.is_internal }),
      created_at: now,
    } as any);

    return { ok: true };
  });
