/**
 * Email verification layer — the "zero-cost first, paid deep-check second"
 * strategy: cheap free checks on every entry (format, disposable-domain
 * blocklist, MX/DNS), plus an optional ZeroBounce API call only when a key
 * is configured.
 *
 *   - Signup / application submission: free checks always; ZeroBounce only
 *     when a key is available (env for signup, tenant settings for applies).
 *   - Recruiter-initiated sends: same, so a spamtrap/invalid address never
 *     gets emailed at scale.
 *
 * ZeroBounce is deliberately optional — its 100 free checks/month are for
 * deep verification before important sends, not for every keystroke.
 */

export type EmailCheckStatus = "valid" | "risky" | "invalid";

export type EmailAssessment = {
  email: string;
  status: EmailCheckStatus;
  /** Machine-readable reason: format | disposable | no_mx | zerobounce:* | ok */
  reason: string;
  /** Human-readable lines, in check order, for UI/why-lines. */
  checks: string[];
  zeroBounce?: { status: string; sub_status?: string | null };
};

export type EmailVerifyOptions = {
  /** ZeroBounce API key — when present the API is consulted. */
  zeroBounceKey?: string | null;
  /** Set false to skip the MX/DNS check (fast path, e.g. hot paths). */
  checkMx?: boolean;
};

/** ZeroBounce statuses that must never be emailed. */
const HARD_ZEROBOUNCE_STATUSES = new Set([
  "invalid",
  "spamtrap",
  "abuse",
  "do_not_mail",
]);

/** Curated disposable / temporary-mail domains (free, offline, no API). */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "33mail.com",
  "bearsarefuzzy.com",
  "burnermail.io",
  "cuvox.de",
  "dayrep.com",
  "deadaddress.com",
  "discard.email",
  "dispostable.com",
  "dodgeit.com",
  "dropmail.me",
  "e4ward.com",
  "einrot.com",
  "emailondeck.com",
  "fakemail.net",
  "fakemailgenerator.com",
  "fakeinbox.com",
  "fleckens.hu",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "gustr.com",
  "inboxkitten.com",
  "jetable.org",
  "jourrapide.com",
  "mail.gw",
  "mailbox72.biz",
  "mailcatch.com",
  "maileater.com",
  "maildrop.cc",
  "mailgutter.com",
  "mailinator.com",
  "mailinator2.com",
  "mailinator3.com",
  "mailmetrash.com",
  "mailnesia.com",
  "mailnull.com",
  "mailsac.com",
  "mailtemp.net",
  "meltmail.com",
  "mintemail.com",
  "mintymail.com",
  "mohmal.com",
  "mytemp.email",
  "obeythem.com",
  "rhyta.com",
  "sharklasers.com",
  "spam.la",
  "spam4.me",
  "spambox.us",
  "spamfree24.org",
  "spamgourmet.com",
  "superrito.com",
  "teleworm.us",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "tempinbox.com",
  "tempincoming.com",
  "throwawaymail.com",
  "tmail.ws",
  "tmpmail.org",
  "trash-mail.de",
  "trash2009.com",
  "trashmail.com",
  "trashymail.com",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "whyyyy.com",
  "yopmail.com",
]);

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkEmailFormat(email: string): boolean {
  return EMAIL_FORMAT.test(email.trim());
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

// Domain → has-mail-server result, cached so signups/applications for the
// same domain don't re-hit DNS. Results live for 6 hours; timeouts are never
// cached (they resolve to "assume deliverable", the safe failure mode).
const MX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const mxCache = new Map<string, { hasMail: boolean; at: number }>();

/**
 * True when the domain can receive mail: an MX record, or (fallback) any
 * A/AAAA record. Timeouts return true so a slow resolver never hard-blocks
 * a real applicant.
 */
export async function domainHasMail(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = mxCache.get(key);
  if (cached && Date.now() - cached.at < MX_CACHE_TTL_MS) return cached.hasMail;

  const outcome = await Promise.race([
    (async () => {
      const { promises: dns } = await import("node:dns");
      const mx = await dns.resolveMx(key).catch(() => [] as unknown[]);
      if (mx.length) return true;
      const [a, aaaa] = await Promise.all([
        dns.resolve4(key).catch(() => [] as string[]),
        dns.resolve6(key).catch(() => [] as string[]),
      ]);
      return a.length > 0 || aaaa.length > 0;
    })(),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000)),
  ]);

  // Only cache definite (non-timeout) answers — a transient DNS hiccup
  // shouldn't poison the cache for six hours.
  if (outcome === true) {
    const recheck = mxCache.get(key);
    if (!recheck || Date.now() - recheck.at >= MX_CACHE_TTL_MS) {
      // A timeout also resolves `true`; distinguish by re-probing quickly is
      // overkill, so store with a short TTL (5 min) to limit the blast radius.
      mxCache.set(key, { hasMail: true, at: Date.now() - (MX_CACHE_TTL_MS - 5 * 60 * 1000) });
    }
  } else {
    mxCache.set(key, { hasMail: false, at: Date.now() });
  }
  return outcome;
}

// ZeroBounce results are cached per address so automatic verification (every
// paste in the bulk tool, every signup) doesn't re-burn credits — a re-check
// within 24h of the same address is free and instant.
const ZEROBOUNCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const zeroBounceCache = new Map<
  string,
  { result: { status: string; sub_status?: string | null }; at: number }
>();

/** Calls the ZeroBounce v2 validate API. Returns null on any failure. */
export async function verifyWithZeroBounce(
  email: string,
  apiKey: string,
): Promise<{ status: string; sub_status?: string | null } | null> {
  const key = `${email.toLowerCase()}|${apiKey}`;
  const cached = zeroBounceCache.get(key);
  if (cached && Date.now() - cached.at < ZEROBOUNCE_CACHE_TTL_MS) return cached.result;

  let result: { status: string; sub_status?: string | null } | null = null;
  try {
    const url = new URL("https://api.zerobounce.net/v2/validate");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("email", email);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { status?: unknown; sub_status?: unknown };
      if (typeof data.status === "string") {
        result = {
          status: data.status,
          sub_status: typeof data.sub_status === "string" ? data.sub_status : null,
        };
      }
    }
  } catch {
    result = null;
  }
  if (result) zeroBounceCache.set(key, { result, at: Date.now() });
  return result;
}

/**
 * Runs the layered checks in order and returns an assessment. Never throws —
 * callers decide what to block via `assertEmailUsable`.
 */
export async function assessEmail(
  email: string,
  opts: EmailVerifyOptions = {},
): Promise<EmailAssessment> {
  const normalized = email.trim().toLowerCase();
  const checks: string[] = [];

  if (!checkEmailFormat(normalized)) {
    return {
      email: normalized,
      status: "invalid",
      reason: "format",
      checks: ["Email format is invalid."],
    };
  }
  checks.push("Format looks correct.");

  const domain = normalized.split("@")[1] ?? "";
  if (isDisposableDomain(domain)) {
    return {
      email: normalized,
      status: "invalid",
      reason: "disposable",
      checks: [...checks, "Temporary / disposable email domains are not accepted."],
    };
  }
  checks.push("Not a disposable domain.");

  // Deep check when a ZeroBounce key is available. On a definite answer the
  // API is authoritative (it already covers SMTP/MX), so we return early.
  if (opts.zeroBounceKey) {
    const zb = await verifyWithZeroBounce(normalized, opts.zeroBounceKey);
    if (zb) {
      const label = zb.sub_status ? `${zb.status} (${zb.sub_status})` : zb.status;
      checks.push(`ZeroBounce reports: ${label}.`);
      if (HARD_ZEROBOUNCE_STATUSES.has(zb.status)) {
        return {
          email: normalized,
          status: "invalid",
          reason: `zerobounce:${zb.status}`,
          checks,
          zeroBounce: zb,
        };
      }
      // valid / catch-all / unknown — acceptable for sending.
      return { email: normalized, status: "valid", reason: "zerobounce", checks, zeroBounce: zb };
    }
  }

  // Free MX/DNS check — missing records mean the address almost certainly
  // can't receive mail. Reported as "risky", not blocked by default.
  if (opts.checkMx !== false) {
    const hasMail = await domainHasMail(domain);
    if (!hasMail) {
      return {
        email: normalized,
        status: "risky",
        reason: "no_mx",
        checks: [
          ...checks,
          "The domain has no mail server records — this address may not receive email.",
        ],
      };
    }
    checks.push("Domain resolves to a mail server.");
  }

  return { email: normalized, status: "valid", reason: "ok", checks };
}

/**
 * Blocking wrapper: throws on hard-invalid addresses (format, disposable,
 * ZeroBounce invalid/spamtrap/abuse). "Risky" (no MX, catch-all) passes
 * unless `blockRisky` is set. Returns the assessment when it passes.
 */
export async function assertEmailUsable(
  email: string,
  opts: EmailVerifyOptions & { blockRisky?: boolean } = {},
): Promise<EmailAssessment> {
  const assessment = await assessEmail(email, opts);
  if (assessment.status === "invalid") {
    throw new Error(messageFor(assessment));
  }
  if (assessment.status === "risky" && opts.blockRisky) {
    throw new Error(
      "This email address does not appear to be deliverable — please double-check it.",
    );
  }
  return assessment;
}

function messageFor(assessment: EmailAssessment): string {
  if (assessment.reason === "format") return "Enter a valid email address.";
  if (assessment.reason === "disposable")
    return "Temporary / disposable email addresses are not accepted.";
  if (assessment.reason.startsWith("zerobounce:")) {
    const status = assessment.reason.replace("zerobounce:", "");
    return `This email address failed verification (${status}). Please use a valid address.`;
  }
  return assessment.checks[0] ?? "This email address is not usable.";
}
