import { useEffect, useState } from "react";
import type { Session, User } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  industry: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type Profile = {
  id: string;
  tenant_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export async function fetchWorkspace(user: User) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  let tenant: Tenant | null = null;
  if (profile?.tenant_id) {
    const { data } = await supabase
      .from("tenants")
      .select(
        "id, name, slug, logo_url, primary_color, secondary_color, industry, country, city, phone, email, website",
      )
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenant = (data as Tenant) ?? null;
  }

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);

  return {
    profile: (profile as Profile) ?? null,
    tenant,
    roles: (roles ?? []).map((r: any) => r.role as string),
  };
}
