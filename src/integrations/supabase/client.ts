/**
 * Supabase client replacement — backed by libsql query builder.
 * Provides the same API shape so existing route components work.
 */

import { from } from "@/lib/db";
import type { Session } from "@/integrations/supabase/types";
import {
  createSession,
  getSessionFromCookie,
  setSessionCookie,
  clearSession,
} from "@/lib/auth/session";

async function hashPw(password: string) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, 12);
}

async function comparePw(password: string, hash: string) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
}

export const supabase = {
  auth: {
    getUser: async () => {
      // The session lives in an httpOnly cookie, so the browser cannot read it
      // from document.cookie. Ask the server for the current session instead.
      try {
        const { getCurrentSessionFn } = await import("@/lib/auth/session.functions");
        const session = await getCurrentSessionFn();
        return {
          data: {
            user: session
              ? {
                  id: session.userId,
                  email: session.email,
                  user_metadata: {},
                  app_metadata: { tenant_id: session.tenantId },
                }
              : null,
          },
          error: null,
        };
      } catch {
        return { data: { user: null }, error: null };
      }
    },

    getSession: async () => {
      const session = await getSessionFromCookie();
      return {
        data: {
          session: session
            ? ({
                user: { id: session.userId, email: session.email },
                access_token: "",
              } as Session)
            : null,
        },
        error: null,
      };
    },

    signUp: async ({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }) => {
      try {
        const fullName =
          (options?.data?.["full_name"] as string) || email.split("@")[0];

        const existing = await from("profiles").select("id").eq("email", email).maybeSingle();
        if (existing.data) {
          return { data: null, error: { message: "An account with this email already exists." } };
        }

        const userId = crypto.randomUUID();
        const pwHash = await hashPw(password);

        const insertResult = await from("profiles").insert({
          id: userId,
          full_name: fullName,
          email,
        });
        if (insertResult.error) return { data: null, error: insertResult.error };

        await from("auth_credentials").insert({
          user_id: userId,
          password_hash: pwHash,
        });

        const token = await createSession({ userId, email });
        await setSessionCookie(token);

        return { data: { user: { id: userId, email } }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },

    signInWithPassword: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      try {
        const profile = await from("profiles")
          .select("id, tenant_id, full_name")
          .eq("email", email)
          .maybeSingle();
        if (!profile.data)
          return { data: null, error: { message: "No account found with this email." } };

        const cred = await from("auth_credentials")
          .select("password_hash")
          .eq("user_id", profile.data.id)
          .maybeSingle();
        if (!cred.data)
          return { data: null, error: { message: "No credentials found." } };

        const valid = await comparePw(password, cred.data.password_hash as string);
        if (!valid)
          return { data: null, error: { message: "Incorrect password." } };

        const token = await createSession({
          userId: profile.data.id as string,
          email,
          tenantId: (profile.data.tenant_id as string) ?? undefined,
        });
        await setSessionCookie(token);

        return {
          data: { user: { id: profile.data.id as string, email } },
          error: null,
        };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },

    signInWithOAuth: async (_options?: { provider?: string; options?: unknown }) => {
      return {
        data: null,
        error: { message: "OAuth not yet implemented." },
      };
    },

    signOut: async (_options?: { scope?: string }) => {
      await clearSession();
      return { error: null as { message: string } | null };
    },

    resend: async (_options?: { type?: string; email?: string }) => {
      return { error: null as { message: string } | null };
    },

    onAuthStateChange: (_callback?: (event: string, session: Session | null) => void) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  },
  from,
  storage: {
    from: (_bucket: string) => ({
      getSignedUrl: async () => ({ data: null, error: null }),
      createSignedUrl: async (path?: string, _expiresIn?: number) => {
        if (!path) return { data: null, error: { message: "No document path." } };
        try {
          const { applicationDocumentUrl } = await import("@/lib/documents.functions");
          const result = await applicationDocumentUrl({ data: { filePath: path } });
          return { data: result, error: null };
        } catch (e: any) {
          return { data: null, error: { message: e.message || String(e) } };
        }
      },
    }),
  },
};
