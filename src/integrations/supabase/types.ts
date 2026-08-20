/**
 * Prisma-generated types re-exported for convenience.
 * Replace Supabase Json type with Prisma's Json.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface User {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface Session {
  user: User;
  access_token: string;
}
