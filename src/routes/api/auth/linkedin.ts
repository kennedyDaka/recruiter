import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * LinkedIn OAuth initiation — redirects to LinkedIn consent screen.
 * This route only exists for local development. On Vercel, the
 * api/auth/linkedin.mjs serverless function handles this instead.
 */
export const Route = createFileRoute("/api/auth/linkedin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) {
          return new Response(JSON.stringify({ error: "LinkedIn OAuth is not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const proto = url.protocol.replace(":", "");
        const host = url.host;
        const origin = `${proto}://${host}`;
        const redirectUri = `${origin}/api/auth/linkedin/callback`;
        const dest = url.searchParams.get("redirect") || "/";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid profile email",
          state: dest,
        });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
          },
        });
      },
    },
  },
});
