import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          return new Response(JSON.stringify({ error: "GOOGLE_CLIENT_ID is not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const proto = url.protocol.replace(":", "");
        const host = url.host;
        const origin = `${proto}://${host}`;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

        // Preserve the original redirect destination
        const dest = url.searchParams.get("redirect") || "/";

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
          state: dest,
        });

        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
          },
        });
      },
    },
  },
});
