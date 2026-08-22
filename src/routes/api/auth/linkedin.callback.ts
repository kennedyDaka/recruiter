import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pool } from "pg";
import crypto from "crypto";

/**
 * LinkedIn OAuth callback — exchanges code for tokens, creates/finds user, sets session.
 * This route only exists for local development. On Vercel, the
 * api/auth/linkedin/callback.mjs serverless function handles this instead.
 */

let _pool: any = null;
function getPool() {
  if (_pool) return _pool;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10000,
  });
  return _pool;
}

const SESSION_COOKIE = "hf_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

async function createSessionToken({
  userId,
  email,
  tenantId,
  sessionVersion = 0,
}: {
  userId: string;
  email: string;
  tenantId?: string | null;
  sessionVersion?: number;
}) {
  const { SignJWT } = await import("jose");
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const key = new TextEncoder().encode(secret);
  const payload: Record<string, unknown> = { userId, email, sessionVersion };
  if (tenantId) payload.tenantId = tenantId;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .setIssuer("hire-flow")
    .sign(key);
}

async function findOrCreateLinkedInUser(
  pool: any,
  {
    email,
    fullName,
    linkedinId,
    avatarUrl,
  }: {
    email: string;
    fullName: string;
    linkedinId: string;
    avatarUrl?: string | null;
  },
) {
  const existing = await pool.query(
    "SELECT id, tenant_id, full_name, email, email_verified FROM profiles WHERE lower(email) = lower($1)",
    [email],
  );

  if (existing.rows.length > 0) {
    const profile = existing.rows[0];
    if (!profile.email_verified) {
      await pool.query(
        "UPDATE profiles SET email_verified = true, verify_token = NULL, verify_expires_at = NULL WHERE id = $1",
        [profile.id],
      );
    }
    await pool.query(
      `INSERT INTO auth_credentials (user_id, linkedin_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET linkedin_id = $2, updated_at = NOW()`,
      [profile.id, linkedinId],
    );
    return profile;
  }

  const userId = crypto.randomUUID();
  const insertResult = await pool.query(
    `INSERT INTO profiles (id, full_name, email, email_verified, avatar_url, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW())
     RETURNING id, tenant_id, full_name, email, email_verified`,
    [userId, fullName, email, avatarUrl || null],
  );

  await pool.query(
    `INSERT INTO auth_credentials (user_id, linkedin_id, updated_at)
     VALUES ($1, $2, NOW())`,
    [userId, linkedinId],
  );

  return insertResult.rows[0];
}

export const Route = createFileRoute("/api/auth/linkedin/callback")({
  server: {
    loaders: async ({ request }) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        throw redirect({ to: "/auth", search: { mode: "signin" } });
      }

      if (!code) {
        throw redirect({ to: "/auth", search: { mode: "signin" } });
      }

      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw redirect({ to: "/auth", search: { mode: "signin" } });
      }

      const proto = url.protocol.replace(":", "");
      const host = url.host;
      const origin = `${proto}://${host}`;
      const redirectUri = `${origin}/api/auth/linkedin/callback`;

      // Exchange code for access token
      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
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
        throw redirect({ to: "/auth", search: { mode: "signin" } });
      }

      // Get user info
      const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const linkedinUser = await userRes.json();
      if (!linkedinUser.email) {
        throw redirect({ to: "/auth", search: { mode: "signin" } });
      }

      // Find or create user
      const pool = getPool();
      const profile = await findOrCreateLinkedInUser(pool, {
        email: linkedinUser.email,
        fullName: linkedinUser.name || linkedinUser.email.split("@")[0],
        linkedinId: linkedinUser.sub,
        avatarUrl: linkedinUser.picture || null,
      });

      // Create session
      const sessionToken = await createSessionToken({
        userId: profile.id,
        email: profile.email || linkedinUser.email,
        tenantId: profile.tenant_id,
        sessionVersion: 0,
      });

      // Redirect with session cookie set via headers
      const destination = state && state.startsWith("/") ? state : "/";
      const cookie = [
        `${SESSION_COOKIE}=${sessionToken}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${SESSION_MAX_AGE}`,
      ].join("; ");

      throw redirect({
        to: destination,
        headers: { "Set-Cookie": cookie },
      } as any);
    },
  },
});
