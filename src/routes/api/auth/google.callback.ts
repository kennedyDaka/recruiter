import { createFileRoute } from "@tanstack/react-router";
import { createSession } from "@/lib/auth/session";
import { dbQueryFirst, dbExecute } from "@/lib/db";
import crypto from "crypto";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const googleError = url.searchParams.get("error");

          if (googleError) {
            return new Response(null, {
              status: 302,
              headers: { Location: `/auth?error=${encodeURIComponent(googleError)}` },
            });
          }

          if (!code) {
            return new Response(JSON.stringify({ error: "Missing authorization code" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

          if (!clientId || !clientSecret) {
            return new Response(JSON.stringify({ error: "Google OAuth is not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const proto = url.protocol.replace(":", "");
          const host = url.host;
          const origin = `${proto}://${host}`;
          const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

          // 1. Exchange authorization code for tokens
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });

          const tokenData = await tokenRes.json();

          if (!tokenData.access_token) {
            console.error("Google token exchange failed:", JSON.stringify(tokenData));
            return new Response(null, {
              status: 302,
              headers: { Location: "/auth?error=google_token_exchange_failed" },
            });
          }

          // 2. Get user info from Google
          const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });

          const googleUser = await userRes.json();

          if (!googleUser.email) {
            console.error("Failed to get Google user info:", JSON.stringify(googleUser));
            return new Response(null, {
              status: 302,
              headers: { Location: "/auth?error=google_user_info_failed" },
            });
          }

          // 3. Find or create user
          const email = googleUser.email.toLowerCase();
          const existing = (await dbQueryFirst(
            "SELECT id, tenant_id, email_verified FROM profiles WHERE lower(email) = $1",
            [email],
          )) as { id: string; tenant_id: string | null; email_verified: unknown } | null;

          let profileId: string;
          let tenantId: string | null = null;

          if (existing) {
            profileId = existing.id;
            tenantId = existing.tenant_id;

            // Ensure email is verified
            if (!existing.email_verified) {
              await dbExecute(
                "UPDATE profiles SET email_verified = true, verify_token = NULL, verify_expires_at = NULL WHERE id = $1",
                [existing.id],
              );
            }

            // Upsert google_id
            await dbExecute(
              `INSERT INTO auth_credentials (user_id, google_id, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (user_id) DO UPDATE SET google_id = $2, updated_at = NOW()`,
              [existing.id, googleUser.id],
            );
          } else {
            // Create new profile
            profileId = crypto.randomUUID();
            const fullName = googleUser.name || email.split("@")[0];
            await dbExecute(
              `INSERT INTO profiles (id, full_name, email, email_verified, avatar_url, updated_at)
               VALUES ($1, $2, $3, true, $4, NOW())`,
              [profileId, fullName, email, googleUser.picture || null],
            );

            await dbExecute(
              `INSERT INTO auth_credentials (user_id, google_id, updated_at)
               VALUES ($1, $2, NOW())`,
              [profileId, googleUser.id],
            );
          }

          // 4. Create session
          const token = await createSession({
            userId: profileId,
            email,
            sessionVersion: 0,
            ...(tenantId ? { tenantId } : {}),
          });

          // 5. Set cookie and redirect
          const destination = state && state.startsWith("/") ? state : "/";
          const cookie = `hf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;

          return new Response(null, {
            status: 302,
            headers: {
              Location: destination,
              "Set-Cookie": cookie,
            },
          });
        } catch (err) {
          console.error("Google OAuth callback error:", err);
          return new Response(null, {
            status: 302,
            headers: { Location: "/auth?error=google_oauth_failed" },
          });
        }
      },
    },
  },
});
