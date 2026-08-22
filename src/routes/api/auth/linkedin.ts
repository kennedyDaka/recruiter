import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * LinkedIn OAuth initiation — redirects to LinkedIn consent screen.
 * This route only exists for local development. On Vercel, the
 * api/auth/linkedin.mjs serverless function handles this instead.
 */
export const Route = createFileRoute("/api/auth/linkedin")({
  server: {
    loaders: async ({ request }) => {
      const url = new URL(request.url);
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      if (!clientId) {
        throw redirect({ to: "/auth", search: { mode: "signin" } });
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
      throw redirect({
        href: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
      });
    },
  },
});
