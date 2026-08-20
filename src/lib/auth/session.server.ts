/**
 * Server-side session helpers — reads/writes cookies via TanStack Start APIs.
 * Only imported in server functions and middleware.
 */

import { setCookie, getCookie, deleteCookie } from "@tanstack/react-start/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/session";

export async function setSessionCookieServer(token: string) {
  setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE,
    // httpOnly keeps the session token out of reach of any XSS — the token is
    // only readable by the server, never by page scripts.
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
  });
}

export async function getSessionFromCookieServer(): Promise<SessionPayload | null> {
  const token = getCookie(SESSION_COOKIE_NAME) ?? null;
  if (!token) return null;

  const { verifySession } = await import("@/lib/auth/session");
  return verifySession(token);
}

export async function clearSessionServer() {
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
}
