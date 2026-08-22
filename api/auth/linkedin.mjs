/**
 * LinkedIn OAuth initiation — redirects to LinkedIn consent screen.
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_REDIRECT_URI  (e.g. https://operon-recruit-psi.vercel.app/api/auth/linkedin/callback)
 *
 * Flow:
 *   1. Browser hits /api/auth/linkedin
 *   2. This handler builds the LinkedIn OAuth consent URL and redirects
 *   3. After consent, LinkedIn redirects to LINKEDIN_REDIRECT_URI
 *   4. /api/auth/linkedin/callback exchanges code for tokens, finds/creates user, sets session
 */

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "LINKEDIN_CLIENT_ID is not configured" });
  }

  // Build the callback URL from the request origin
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${origin}/api/auth/linkedin/callback`;

  // Preserve the original redirect destination (where to go after login)
  const dest = req.query?.redirect || "/";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: dest,
  });

  res.redirect(302, `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
}
