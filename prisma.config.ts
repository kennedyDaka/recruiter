import { defineConfig } from "prisma/config";

// dotenv only needed locally — Vercel/production provides env vars natively
if (!process.env["DATABASE_URL"]) {
  try { await import("dotenv/config"); } catch { /* ignore */ }
}

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
