import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { clearSessionFn } from "@/lib/auth/session.functions";

/**
 * Sign-out route. A full page load so the server can delete the httpOnly
 * session cookie in the SSR response (document.cookie cannot clear it).
 */
const searchSchema = z.object({
  redirect: z.string().optional(),
});

function safeTarget(value?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/auth";
  return value;
}

export const Route = createFileRoute("/session/signout")({
  validateSearch: searchSchema,
  loader: async ({ location }) => {
    await clearSessionFn({ data: undefined });
    const search = (location.search ?? {}) as { redirect?: string };
    return { target: safeTarget(search.redirect ?? "/auth") };
  },
  component: SignOutPage,
});

function SignOutPage() {
  const data = Route.useLoaderData();
  useEffect(() => {
    window.location.replace(data.target);
  }, [data.target]);
  return null;
}
