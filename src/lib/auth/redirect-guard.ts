/**
 * Redirect guard — validates that a destination path is safe (same-origin).
 * Prevents open-redirect attacks where an attacker sets the OAuth `state`
 * parameter to `https://evil.com` and tricks the callback into sending
 * the user (with their fresh session cookie) to the attacker's site.
 *
 * Rules:
 *   - Must start with "/" (relative path)
 *   - Must NOT start with "//" (protocol-relative URL)
 *   - Must NOT contain "\r" or "\n" (header injection)
 *   - Maximum 2048 characters
 */
export function safeRedirectPath(dest: string | null | undefined): string {
  if (!dest || typeof dest !== "string") return "/dashboard";

  const trimmed = dest.trim();

  // Must be a relative path
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/dashboard";
  }

  // Block header injection
  if (trimmed.includes("\r") || trimmed.includes("\n")) {
    return "/dashboard";
  }

  // Block extremely long paths (buffer overflow in cookie/headers)
  if (trimmed.length > 2048) {
    return "/dashboard";
  }

  return trimmed;
}
