/**
 * Auth client — wired up with libsql + bcryptjs + jose.
 * Provides signUp, signIn, signOut, getUser via cookie-based JWT sessions.
 */

import { dbQueryFirst, dbExecute } from "@/lib/db";
import {
  createSession,
  getSessionFromCookie,
  setSessionCookie,
  clearSession,
  type SessionPayload,
} from "@/lib/auth/session";

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function comparePassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
}

export async function signUp(email: string, password: string, fullName: string) {
  const existing = await dbQueryFirst("SELECT id FROM profiles WHERE email = ?", [email]);
  if (existing) throw new Error("An account with this email already exists.");

  const userId = crypto.randomUUID();
  const passwordHashed = await hashPassword(password);

  await dbExecute(
    "INSERT INTO profiles (id, full_name, email) VALUES (?, ?, ?)",
    [userId, fullName, email],
  );

  await dbExecute(
    "INSERT INTO auth_credentials (user_id, password_hash) VALUES (?, ?)",
    [userId, passwordHashed],
  );

  const token = await createSession({ userId, email });
  await setSessionCookie(token);

  return { id: userId, email, fullName };
}

export async function signIn(email: string, password: string) {
  const profile = await dbQueryFirst(
    "SELECT id, tenant_id, full_name FROM profiles WHERE email = ?",
    [email],
  );
  if (!profile) throw new Error("No account found with this email.");

  const cred = await dbQueryFirst(
    "SELECT password_hash FROM auth_credentials WHERE user_id = ?",
    [profile.id as string],
  );
  if (!cred) throw new Error("No credentials found for this account.");

  const valid = await comparePassword(password, cred.password_hash as string);
  if (!valid) throw new Error("Incorrect password.");

  const token = await createSession({
    userId: profile.id as string,
    email,
    tenantId: (profile.tenant_id as string) ?? undefined,
  });
  await setSessionCookie(token);

  return { id: profile.id as string, email, fullName: profile.full_name as string };
}

export async function signOut() {
  await clearSession();
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  return getSessionFromCookie();
}
