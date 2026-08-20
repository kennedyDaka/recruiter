import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Claims = Record<string, unknown> | undefined;

/**
 * Retrieves the company workspace linked to a recruiter. Workspace creation
 * is deliberately handled by company onboarding, not by ordinary navigation.
 */
export async function requireWorkspaceForUser(userId: string) {
  const profile = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.tenant_id) {
    throw new Error("Complete company setup before creating a recruitment campaign.");
  }
  return { tenantId: profile.data.tenant_id as string };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Returns the user's workspace, creating the first workspace safely when it
 * does not exist yet. This runs only in trusted server functions.
 */
export async function ensureWorkspaceForUser({
  userId,
  claims,
}: {
  userId: string;
  claims: Claims;
}) {
  const existing = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.tenant_id) {
    return { tenantId: existing.data.tenant_id as string, created: false };
  }

  const email = typeof claims?.["email"] === "string" ? claims["email"] : null;
  const metadata = (claims?.["user_metadata"] ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof metadata["full_name"] === "string" && metadata["full_name"]) ||
    (typeof metadata["name"] === "string" && metadata["name"]) ||
    email?.split("@")[0] ||
    "Recruiter";
  const companyName = email ? `${email.split("@")[1] ?? "My"} workspace` : "My workspace";
  const slug = `${slugify(companyName) || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;

  const tenant = await supabaseAdmin
    .from("tenants")
    .insert({ name: companyName, slug, email })
    .select("id")
    .single();
  if (tenant.error) throw new Error(tenant.error.message);
  const createdTenantId = tenant.data.id as string;

  // Claim an existing empty profile first. If there is no profile yet, insert
  // one. The follow-up read resolves two requests racing on a new account.
  const claimedProfile = await supabaseAdmin
    .from("profiles")
    .update({ tenant_id: createdTenantId, full_name: String(fullName), email })
    .eq("id", userId)
    .is("tenant_id", null)
    .select("tenant_id")
    .maybeSingle();
  if (claimedProfile.error) throw new Error(claimedProfile.error.message);

  if (!claimedProfile.data) {
    const createdProfile = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, tenant_id: createdTenantId, full_name: String(fullName), email })
      .select("tenant_id")
      .maybeSingle();
    if (createdProfile.error && createdProfile.error["code"] !== "23505") {
      throw new Error(createdProfile.error.message);
    }
  }

  const current = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const tenantId = current.data?.tenant_id as string | null;
  if (!tenantId) throw new Error("Could not create your workspace. Please try again.");

  if (tenantId !== createdTenantId) {
    const cleanup = await supabaseAdmin.from("tenants").delete().eq("id", createdTenantId);
    if (cleanup.error) throw new Error(cleanup.error.message);
    return { tenantId, created: false };
  }

  const role = await supabaseAdmin
    .from("user_roles")
    .upsert(
      { user_id: userId, tenant_id: tenantId, role: "company_admin" },
      { onConflict: "user_id,role" },
    );
  if (role.error) throw new Error(role.error.message);

  return { tenantId, created: true };
}
