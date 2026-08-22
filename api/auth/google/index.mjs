/**
 * Google OAuth initiation — redirects to Google consent screen.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_REDIRECT_URI  (e.g. https://operon-recruit-psi.vercel.app/api/auth/google/callback)
 *
 * Flow:
 *   1. Browser hits /api/auth/google
 *   2. This handler builds the Google OAuth consent URL and redirects
 *   3. After consent, Google redirects to GOOGLE_REDIRECT_URI
 *   4. /api/auth/google/callback exchanges code for tokens, finds/creates user, sets session
 */

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not configured" });
  }

  // Build the callback URL from the request origin
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  // Preserve the original redirect destination (where to go after login)
  const dest = req.query?.redirect || "/";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: dest, // pass through the redirect destination
  });

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
