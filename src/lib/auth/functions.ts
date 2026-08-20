import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Security policy ─────────────────────────────────────────────────
// Passwords must be 8–128 chars with at least one uppercase, one lowercase
// and one digit. Existing accounts keep working — the policy gates new
// signups (and any future password change), never logins.

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Z]/, "Password needs at least one uppercase letter.")
  .regex(/[a-z]/, "Password needs at least one lowercase letter.")
  .regex(/[0-9]/, "Password needs at least one number.");

const signUpSchema = z.object({
  email: z.string().trim().email().max(255),
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120),
  /** Honeypot — must stay empty; real users never see or fill it. */
  website: z.string().max(0).optional().default(""),
  /** Client-reported time the form was rendered (ms) — bots submit instantly. */
  startedAt: z.number().optional(),
  /** Origin for the verification link (client-side window.location.origin). */
  origin: z.string().trim().url().max(255).optional(),
  /** Cloudflare Turnstile token — required only when TURNSTILE is configured. */
  turnstileToken: z.string().max(4096).optional(),
});

const signInSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
  website: z.string().max(0).optional().default(""),
  startedAt: z.number().optional(),
  turnstileToken: z.string().max(4096).optional(),
});

const verifySchema = z.object({
  token: z.string().trim().min(20).max(512),
});

const resendSchema = z.object({
  email: z.string().trim().email().max(255),
  origin: z.string().trim().url().max(255).optional(),
});

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h — short on purpose for reset links
const MIN_FORM_TIME_MS = 1500; // human-speed floor for signup/signin forms
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  /** Honeypot — must stay empty. */
  website: z.string().max(0).optional().default(""),
  /** Client-reported form render time — bots submit instantly. */
  startedAt: z.number().optional(),
  /** Origin for the reset link. */
  origin: z.string().trim().url().max(255).optional(),
});

const resetSchema = z.object({
  token: z.string().trim().min(20).max(512),
  password: passwordSchema,
});

/** Server-side request context (host/protocol/IP) for links and lockouts. */
async function requestContext() {
  try {
    const { getRequestHost, getRequestProtocol, getRequestIP } = await import(
      "@tanstack/react-start/server"
    );
    const host = getRequestHost() ?? "localhost:5173";
    const protocol = getRequestProtocol() ?? "http";
    return {
      origin: process.env["APP_URL"] ?? `${protocol}://${host}`,
      ip: getRequestIP() ?? null,
    };
  } catch {
    return { origin: process.env["APP_URL"] ?? "http://localhost:5173", ip: null };
  }
}

function newVerifyToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/** Rejects submissions that trip the bot heuristics (honeypot / speed). */
function assertHuman(input: {
  website?: string | undefined;
  startedAt?: number | undefined;
}) {
  if (input.website) throw new Error("Sign-up blocked: please try again.");
  if (typeof input.startedAt === "number" && Date.now() - input.startedAt < MIN_FORM_TIME_MS) {
    throw new Error("Please wait a moment before submitting.");
  }
}

/** Validates a Cloudflare Turnstile token when TURNSTILE is configured. */
async function assertTurnstile(token: string | undefined) {
  const secret = process.env["TURNSTILE_SECRET_KEY"] ?? "";
  if (!secret) return; // Not configured — nothing to enforce.
  if (!token) throw new Error("Security check failed — please try again.");
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  if (!data.success) throw new Error("Security check failed — please try again.");
}

/** Sends the password-reset email (no tenant yet — env config only). */
async function sendPasswordResetEmail(args: {
  to: string;
  firstName: string;
  token: string;
}) {
  const { sendEmail, resolveEmailConfig } = await import("@/lib/email-provider");
  const { renderEmail } = await import("@/lib/email-templates");
  const base = (await requestContext()).origin;
  const rendered = renderEmail("password_reset", {
    first_name: args.firstName,
    reset_url: `${base.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(args.token)}`,
  });
  const result = await sendEmail(
    { to: args.to, subject: rendered.subject, text: rendered.body },
    resolveEmailConfig(null),
  );
  if (!result.ok) {
    // Same non-fatal policy as verification: the token is stored, and the
    // user can request another link once the provider is configured.
    console.warn(
      `[Auth] Password reset email not dispatched (${result.error ?? "unknown error"}) — link stored, resendable.`,
    );
  }
}

/** Sends the account verification email (no tenant yet — env config only). */
async function sendVerificationEmail(args: {
  to: string;
  firstName: string;
  token: string;
}) {
  const { sendEmail, resolveEmailConfig } = await import("@/lib/email-provider");
  const { renderEmail } = await import("@/lib/email-templates");
  const base = (await requestContext()).origin;
  const rendered = renderEmail("email_verification", {
    first_name: args.firstName,
    verify_url: `${base.replace(/\/+$/, "")}/verify-email?token=${encodeURIComponent(args.token)}`,
  });
  const result = await sendEmail(
    { to: args.to, subject: rendered.subject, text: rendered.body },
    resolveEmailConfig(null),
  );
  if (!result.ok) {
    // A dispatch failure (e.g. sending domain not yet verified in Resend) must
    // not brick signup: the account + token are stored, and the user can hit
    // "Resend verification email" once the provider is fully configured.
    console.warn(
      `[Auth] Verification email not dispatched (${result.error ?? "unknown error"}) — account created, resend available.`,
    );
  }
}

/** Records an auth attempt (kind: signin | reset | reset_attempt) for the lockout window. */
async function recordFailedAttempt(
  email: string,
  ip?: string | null,
  kind = "signin",
) {
  const { dbExecute } = await import("@/lib/db");
  await dbExecute(
    "INSERT INTO auth_attempts (id, email, ip, kind, created_at) VALUES (?, ?, ?, ?, NOW())",
    [crypto.randomUUID(), email, ip ?? null, kind],
  );
}

/** True when the email is locked out (>= max attempts of `kind` in the window). */
async function isLockedOut(
  email: string,
  kind = "signin",
  max = MAX_FAILED_ATTEMPTS,
  windowMs = LOCKOUT_WINDOW_MS,
): Promise<boolean> {
  const { dbQueryFirst } = await import("@/lib/db");
  const minutes = Math.floor(windowMs / 60000);
  const row = await dbQueryFirst(
    `SELECT COUNT(*) AS n FROM auth_attempts
     WHERE email = ? AND kind = ? AND created_at >= NOW() - INTERVAL '1 minutes' * ?`,
    [email, kind, minutes],
  );
  return Number((row as { n?: unknown } | null)?.n ?? 0) >= max;
}

async function clearFailedAttempts(email: string) {
  const { dbExecute } = await import("@/lib/db");
  await dbExecute("DELETE FROM auth_attempts WHERE email = ?", [email]);
}

export const signUpFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");
    const bcrypt = await import("bcryptjs");

    assertHuman(data);
    await assertTurnstile(data.turnstileToken);

    // Verify the address before creating the account: free format/disposable/
    // MX checks always, plus a ZeroBounce deep check when a key is configured.
    const { assertEmailUsable } = await import("@/lib/email-verify");
    await assertEmailUsable(data.email, {
      zeroBounceKey: process.env["ZEROBOUNCE_API_KEY"] || null,
    });

    const existing = (await dbQueryFirst("SELECT id, email_verified FROM profiles WHERE email = ?", [
      data.email,
    ])) as { id: string; email_verified: unknown } | null;

    if (existing) {
      const verified = existing.email_verified === 1 || existing.email_verified === true;
      if (verified) throw new Error("An account with this email already exists.");
      // Unverified account — regenerate the token and re-send the email so a
      // user who lost the first link can finish verification without
      // inventing a second account.
      const token = newVerifyToken();
      await dbExecute(
        "UPDATE profiles SET verify_token = ?, verify_expires_at = ? WHERE id = ?",
        [token, new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString(), existing.id],
      );
      await sendVerificationEmail({
        to: data.email,
        firstName: data.fullName.split(" ")[0] ?? "there",
        token,
      });
      return { needsVerification: true };
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(data.password, 12);
    const token = newVerifyToken();

    await dbExecute(
      "INSERT INTO profiles (id, full_name, email, email_verified, verify_token, verify_expires_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
      [userId, data.fullName, data.email, token, new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString(), new Date().toISOString()],
    );
    await dbExecute("INSERT INTO auth_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?)", [
      userId,
      passwordHash,
      new Date().toISOString(),
    ]);

    await sendVerificationEmail({
      to: data.email,
      firstName: data.fullName.split(" ")[0] ?? "there",
      token,
    });

    return { needsVerification: true };
  });

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resetRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");

    // Same bot heuristics as signup: honeypot + human-speed floor.
    if (data.website) throw new Error("Request blocked: please try again.");
    if (typeof data.startedAt === "number" && Date.now() - data.startedAt < MIN_FORM_TIME_MS) {
      throw new Error("Please wait a moment before submitting.");
    }

    const { ip } = await requestContext();
    const normalizedEmail = data.email.toLowerCase();

    // Throttle per address so the endpoint can't be used to flood inboxes.
    if (await isLockedOut(normalizedEmail, "reset", 5, LOCKOUT_WINDOW_MS)) {
      throw new Error("Too many reset requests. Try again in a few minutes.");
    }
    await recordFailedAttempt(normalizedEmail, ip, "reset");

    const profile = (await dbQueryFirst(
      "SELECT id, full_name FROM profiles WHERE lower(email) = ?",
      [normalizedEmail],
    )) as { id: string; full_name: string } | null;

    if (profile) {
      const token = newVerifyToken();
      await dbExecute(
        "UPDATE profiles SET reset_token = ?, reset_expires_at = ? WHERE id = ?",
        [token, new Date(Date.now() + RESET_TTL_MS).toISOString(), profile.id],
      );
      await sendPasswordResetEmail({
        to: data.email,
        firstName: profile.full_name.split(" ")[0] ?? "there",
        token,
      });
    }

    // Same answer whether or not the account exists — never reveal it.
    return { sent: true };
  });

/** Checks a reset link's state without consuming it (used by the reset page). */
export const getResetTokenStateFn = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ token: z.string().trim().min(20).max(512) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { dbQueryFirst } = await import("@/lib/db");
    const profile = (await dbQueryFirst(
      "SELECT reset_expires_at FROM profiles WHERE reset_token = ?",
      [data.token],
    )) as { reset_expires_at: string | null } | null;
    if (!profile) return { state: "used" }; // consumed or never issued
    if (profile.reset_expires_at && new Date(profile.reset_expires_at).getTime() < Date.now()) {
      return { state: "expired" };
    }
    return { state: "valid" };
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");
    const bcrypt = await import("bcryptjs");

    const profile = (await dbQueryFirst(
      "SELECT id, email, reset_expires_at FROM profiles WHERE reset_token = ?",
      [data.token],
    )) as { id: string; email: string; reset_expires_at: string | null } | null;
    if (!profile) throw new Error("This reset link is invalid. Request a new one.");

    if (profile.reset_expires_at && new Date(profile.reset_expires_at).getTime() < Date.now()) {
      throw new Error("This reset link has expired. Request a new one.");
    }

    // Defense-in-depth against repeated attempts on a leaked token.
    if (await isLockedOut(profile.email, "reset_attempt", 5, LOCKOUT_WINDOW_MS)) {
      throw new Error("Too many attempts. Try again in a few minutes.");
    }
    await recordFailedAttempt(profile.email, null, "reset_attempt");

    const passwordHash = await bcrypt.hash(data.password, 12);
    await dbExecute("UPDATE auth_credentials SET password_hash = ? WHERE user_id = ?", [
      passwordHash,
      profile.id,
    ]);
    // Consume the token and invalidate every previously issued session so a
    // stolen cookie dies with the old password.
    await dbExecute(
      "UPDATE profiles SET reset_token = NULL, reset_expires_at = NULL, session_version = session_version + 1 WHERE id = ?",
      [profile.id],
    );
    await clearFailedAttempts(profile.email);

    return { ok: true };
  });

export const verifyEmailFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");
    const { createSession } = await import("@/lib/auth/session");
    const { setSessionCookieServer } = await import("@/lib/auth/session.server");

    const profile = (await dbQueryFirst(
      "SELECT id, full_name, email, tenant_id, session_version, verify_expires_at FROM profiles WHERE verify_token = ?",
      [data.token],
    )) as {
      id: string;
      full_name: string;
      email: string;
      tenant_id: string | null;
      session_version: number;
      verify_expires_at: string | null;
    } | null;

    if (!profile) throw new Error("This verification link is invalid.");
    if (
      profile.verify_expires_at &&
      new Date(profile.verify_expires_at).getTime() < Date.now()
    ) {
      throw new Error("This verification link has expired. Request a new one.");
    }

    await dbExecute(
      "UPDATE profiles SET email_verified = 1, verify_token = NULL, verify_expires_at = NULL WHERE id = ?",
      [profile.id],
    );
    await clearFailedAttempts(profile.email);

    const sessionToken = await createSession({
      userId: profile.id,
      email: profile.email,
      sessionVersion: Number(profile.session_version ?? 0),
      ...(profile.tenant_id ? { tenantId: profile.tenant_id } : {}),
    });
    await setSessionCookieServer(sessionToken);
    return { verified: true, token: sessionToken };
  });

export const resendVerificationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resendSchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");

    const profile = (await dbQueryFirst(
      "SELECT id, full_name, email_verified FROM profiles WHERE email = ?",
      [data.email],
    )) as { id: string; full_name: string; email_verified: unknown } | null;

    // Never reveal whether an email exists: senders get the same answer either
    // way, and an already-verified account simply cannot be re-verified.
    if (!profile || profile.email_verified === 1 || profile.email_verified === true) {
      return { sent: true };
    }

    const token = newVerifyToken();
    await dbExecute(
      "UPDATE profiles SET verify_token = ?, verify_expires_at = ? WHERE id = ?",
      [token, new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString(), profile.id],
    );
    await sendVerificationEmail({
      to: data.email,
      firstName: profile.full_name.split(" ")[0] ?? "there",
      token,
    });
    return { sent: true };
  });

export const signInFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => signInSchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst } = await import("@/lib/db");
    const { createSession } = await import("@/lib/auth/session");
    const { setSessionCookieServer } = await import("@/lib/auth/session.server");
    const bcrypt = await import("bcryptjs");

    assertHuman(data);
    await assertTurnstile(data.turnstileToken);

    const { ip } = await requestContext();
    const normalizedEmail = data.email.toLowerCase();
    const profile = (await dbQueryFirst(
      "SELECT id, tenant_id, full_name, email, email_verified, session_version FROM profiles WHERE lower(email) = ?",
      [normalizedEmail],
    )) as {
      id: string;
      tenant_id: string | null;
      full_name: string;
      email: string;
      email_verified: unknown;
      session_version: number;
    } | null;

    if (!profile) {
      await recordFailedAttempt(normalizedEmail, ip);
      throw new Error("Incorrect email or password.");
    }

    if (await isLockedOut(profile.email)) {
      throw new Error(
        "Too many failed attempts. Try again in a few minutes.",
      );
    }

    if (profile.email_verified !== 1 && profile.email_verified !== true) {
      throw new Error(
        "Email not confirmed — check your inbox for the verification link.",
      );
    }

    const cred = (await dbQueryFirst(
      "SELECT password_hash FROM auth_credentials WHERE user_id = ?",
      [profile.id],
    )) as { password_hash: string } | null;
    if (!cred) throw new Error("Incorrect email or password.");

    const valid = await bcrypt.compare(data.password, cred.password_hash);
    if (!valid) {
      await recordFailedAttempt(profile.email, ip);
      throw new Error("Incorrect email or password.");
    }

    await clearFailedAttempts(profile.email);

    const token = await createSession({
      userId: profile.id,
      email: profile.email,
      sessionVersion: Number(profile.session_version ?? 0),
      ...(profile.tenant_id ? { tenantId: profile.tenant_id } : {}),
    });
    await setSessionCookieServer(token);

    return { userId: profile.id, email: profile.email, token };
  });

export const signOutFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { clearSessionServer } = await import("@/lib/auth/session.server");
    await clearSessionServer();
    return { ok: true };
  });
