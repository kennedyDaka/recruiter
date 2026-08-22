/**
 * LinkedIn OAuth callback — exchanges code for tokens, creates/finds user, sets session.
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_REDIRECT_URI  (must match what was sent to LinkedIn)
 *   JWT_SECRET             (same as the app's session secret)
 *   DATABASE_URL           (PostgreSQL connection string)
 *
 * Flow:
 *   1. LinkedIn redirects here with ?code=...&state=...
 *   2. Exchange code for access_token
 *   3. Fetch user info from LinkedIn OpenID Connect endpoint
 *   4. Find or create profile + auth_credentials (passwordless)
 *   5. Create session cookie (JWT)
 *   6. Redirect to original destination
 */

import { Pool } from "pg";
import crypto from "crypto";

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10000,
  });
  return _pool;
}

export const config = { runtime: "nodejs", maxDuration: 30 };

const SESSION_COOKIE = "hf_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function json(res, data, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  return res.json(data);
}

/** Create a JWT session token using jose (same logic as src/lib/auth/session.ts) */
async function createSessionToken({ userId, email, tenantId, sessionVersion = 0 }) {
  const { SignJWT } = await import("jose");
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be configured in production.");
    }
    throw new Error("JWT_SECRET is not configured.");
  }
  const key = new TextEncoder().encode(secret);
  const payload = { userId, email, sessionVersion };
  if (tenantId) payload.tenantId = tenantId;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .setIssuer("hire-flow")
    .sign(key);
  return token;
}

/** Find or create profile for a LinkedIn-authenticated user. */
async function findOrCreateLinkedInUser(pool, { email, fullName, linkedinId, avatarUrl }) {
  // 1. Check if profile exists by email
  const existing = await pool.query(
    "SELECT id, tenant_id, full_name, email, email_verified FROM profiles WHERE lower(email) = lower($1)",
    [email],
  );

  if (existing.rows.length > 0) {
    const profile = existing.rows[0];

    // Ensure email is marked as verified (LinkedIn accounts are always verified)
    if (!profile.email_verified) {
      await pool.query(
        "UPDATE profiles SET email_verified = true, verify_token = NULL, verify_expires_at = NULL WHERE id = $1",
        [profile.id],
      );
    }

    // Upsert auth_credentials with linkedin_id
    await pool.query(
      `INSERT INTO auth_credentials (user_id, linkedin_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET linkedin_id = $2, updated_at = NOW()`,
      [profile.id, linkedinId],
    );

    return profile;
  }

  // 2. New user — create profile
  const userId = crypto.randomUUID();
  const insertResult = await pool.query(
    `INSERT INTO profiles (id, full_name, email, email_verified, avatar_url, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW())
     RETURNING id, tenant_id, full_name, email, email_verified`,
    [userId, fullName, email, avatarUrl || null],
  );

  // Create auth_credentials with linkedin_id (no password_hash for OAuth users)
  await pool.query(
    `INSERT INTO auth_credentials (user_id, linkedin_id, updated_at)
     VALUES ($1, $2, NOW())`,
    [userId, linkedinId],
  );

  return insertResult.rows[0];
}

/** Set the session cookie on the response. */
function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    isProduction ? "Secure" : "",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return json(res, { error: "Method not allowed" }, 405);
    }

    const { code, state, error: linkedinError } = req.query || {};

    if (linkedinError) {
      return res.redirect(302, `/auth?error=${encodeURIComponent(linkedinError)}`);
    }

    if (!code) {
      return json(res, { error: "Missing authorization code" }, 400);
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(res, { error: "LinkedIn OAuth is not configured" }, 500);
    }

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const origin = `${proto}://${host}`;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${origin}/api/auth/linkedin/callback`;

    // 1. Exchange authorization code for access_token
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
      console.error("LinkedIn token exchange failed:", JSON.stringify(tokenData));
      return res.redirect(302, "/auth?error=linkedin_token_exchange_failed");
    }

    // 2. Get user info from LinkedIn OpenID Connect endpoint
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const linkedinUser = await userRes.json();

    if (!linkedinUser.email) {
      console.error("Failed to get LinkedIn user info:", JSON.stringify(linkedinUser));
      return res.redirect(302, "/auth?error=linkedin_user_info_failed");
    }

    // 3. Find or create user in our database
    const pool = getPool();
    const profile = await findOrCreateLinkedInUser(pool, {
      email: linkedinUser.email,
      fullName: linkedinUser.name || linkedinUser.email.split("@")[0],
      linkedinId: linkedinUser.sub,
      avatarUrl: linkedinUser.picture || null,
    });

    // 4. Create session cookie
    const sessionToken = await createSessionToken({
      userId: profile.id,
      email: profile.email || linkedinUser.email,
      tenantId: profile.tenant_id,
      sessionVersion: 0,
    });
    setSessionCookie(res, sessionToken);

    // 5. Redirect to the original destination (or dashboard)
    const destination = state && state.startsWith("/") ? state : "/";
    res.redirect(302, destination);
  } catch (err) {
    console.error("LinkedIn OAuth callback error:", err);
    return res.redirect(302, "/auth?error=linkedin_oauth_failed");
  }
}
