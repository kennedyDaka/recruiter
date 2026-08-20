/**
 * JWT session management — shared between server and client.
 * Cookie helpers are in session.server.ts (server) and inline (client).
 */

const SESSION_COOKIE = "hf_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE;

export interface SessionPayload {
  userId: string;
  email: string;
  tenantId?: string;
  role?: string;
  /** profiles.session_version at issue time — mismatches invalidate the token. */
  sessionVersion?: number;
}

let _devBootSecret: string | null = null;

function getSecret() {
  const configured = process.env["JWT_SECRET"];
  if (configured) return new TextEncoder().encode(configured);
  if (process.env["NODE_ENV"] === "production") {
    // Fail fast rather than sign tokens with a predictable key.
    throw new Error("JWT_SECRET must be configured in production.");
  }
  // Dev-only: stable for the process lifetime so the UI doesn't log the user
  // out on every hot reload. Never used in production.
  _devBootSecret ??= crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  return new TextEncoder().encode(_devBootSecret);
}

// ---------------------------------------------------------------------------
// JWT creation & verification (works on both server and client)
// ---------------------------------------------------------------------------

export async function createSession(payload: SessionPayload) {
  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .setIssuer("hire-flow")
    .sign(getSecret());
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, getSecret(), { issuer: "hire-flow" });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Client-side session reader.
 *
 * JWT_SECRET is server-only, so the browser cannot verify the signature here.
 * Instead we decode the payload and check its expiry. This is only used for UI
 * gating ("is someone signed in?") — every real data call is re-verified
 * server-side with the actual secret, so a forged token never reaches data.
 */
export async function readSessionPayload(token: string): Promise<SessionPayload | null> {
  try {
    const { decodeJwt } = await import("jose");
    const payload = decodeJwt(token);
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (typeof payload["userId"] !== "string") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Client-side cookie helpers (used in browser)
// ---------------------------------------------------------------------------

export function setSessionCookieClient(token: string) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`;
}

export function getSessionCookieClient(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

export function clearSessionCookieClient() {
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Public API — client-side (for use in React components / client code)
// ---------------------------------------------------------------------------

export async function setSessionCookie(token: string) {
  setSessionCookieClient(token);
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  if (typeof document === "undefined") return null;
  const token = getSessionCookieClient();
  if (!token) return null;
  return readSessionPayload(token);
}

export async function clearSession() {
  clearSessionCookieClient();
}
