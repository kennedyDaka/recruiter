import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { normalize, resolve } from "node:path";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  rtf: "application/rtf",
};

/** Serves candidate documents from the local uploads/ directory (dev storage). */
const uploadsMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/uploads\/(.+)$/);
  if (!match) return next();

  const root = resolve(process.cwd(), "uploads");
  const relative = normalize(decodeURIComponent(match[1]!));
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(root + "/")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await readFile(full);
    const extension = relative.split(".").pop()?.toLowerCase() ?? "";
    return new Response(body, {
      headers: {
        "content-type": UPLOAD_CONTENT_TYPES[extension] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Re-throw Responses as-is (redirects, not-found, etc.)
    if (error instanceof Response) throw error;

    // Re-throw if it has a status code (already formatted)
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error("[server error]", error);

    // For server function requests, return JSON so the client can parse it.
    // Details stay in the server log — the client gets a generic message so
    // internal paths/values never leak.
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fallback to HTML error page for non-JSON requests
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * Basic in-memory rate limiter for POSTs to server functions and /api routes.
 * Per-IP sliding window; keeps brute-forcing and scrapes bounded. This is a
 * single-process guard (adequate for this deployment) — replace with a shared
 * store if the app is ever run across multiple instances.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const _rateHits = new Map<string, number[]>();

const rateLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (
    request.method === "POST" &&
    (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/"))
  ) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const now = Date.now();
    const hits = (_rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    hits.push(now);
    _rateHits.set(ip, hits);
    if (_rateHits.size > 10_000) _rateHits.clear();
    if (hits.length > RATE_MAX) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [uploadsMiddleware, rateLimitMiddleware, errorMiddleware, csrfMiddleware],
}));
