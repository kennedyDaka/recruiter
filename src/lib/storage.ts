/**
 * Document Storage Abstraction Layer.
 *
 * Supports:
 *   - Cloudflare R2 (S3-compatible) — primary storage for production
 *   - Base64 in DB — fallback for dev environments without R2 configured
 *
 * Configuration via environment variables:
 *   R2_ENDPOINT       — R2 endpoint URL (e.g. https://<account-id>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID  — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret key
 *   R2_BUCKET         — R2 bucket name (e.g. "operon-documents")
 *   R2_PUBLIC_URL     — Optional public base URL for direct access
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ── Configuration ───────────────────────────────────────────────────

interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string | undefined;
}

function getConfig(): StorageConfig | null {
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: process.env["R2_PUBLIC_URL"] || undefined,
  };
}

let _client: S3Client | null = null;

function getClient(): S3Client | null {
  const config = getConfig();
  if (!config) return null;
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return _client;
}

export function isR2Configured(): boolean {
  return getClient() !== null;
}

// ── MIME type detection ─────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
  csv: "text/csv",
};

export function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

// ── Retry with exponential backoff ──────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 500): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}

// ── Signed URL Cache ────────────────────────────────────────────────
// In-memory TTL cache to avoid regenerating R2 signed URLs on every request.
// URLs expire after 50 minutes (signed URLs last 60 minutes).

const URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes
const urlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedUrl(key: string): string | null {
  const entry = urlCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    urlCache.delete(key);
    return null;
  }
  return entry.url;
}

function setCachedUrl(key: string, url: string): void {
  urlCache.set(key, { url, expiresAt: Date.now() + URL_CACHE_TTL_MS });
  // Evict stale entries when cache grows large
  if (urlCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of urlCache) {
      if (now > v.expiresAt) urlCache.delete(k);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export interface StorageUploadResult {
  /** The storage key (path) for the file */
  key: string;
  /** Whether the file was uploaded to R2 or stored as base64 */
  provider: "r2" | "base64";
}

/**
 * Upload a file to storage (R2 or base64 fallback).
 * Returns the storage key that can be used to retrieve the file later.
 */
export async function uploadDocument(params: {
  tenantId: string;
  campaignId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<StorageUploadResult> {
  const { tenantId, campaignId, fileName, buffer } = params;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `${tenantId}/${campaignId}/${crypto.randomUUID()}-${safeName}`;

  const client = getClient();
  if (client) {
    // Upload to R2 with retry
    await withRetry(() =>
      client.send(
        new PutObjectCommand({
          Bucket: getConfig()!.bucket,
          Key: key,
          Body: buffer,
          ContentType: getMimeType(fileName),
          ContentLength: buffer.byteLength,
          Metadata: {
            "original-name": fileName,
            "tenant-id": tenantId,
            "campaign-id": campaignId,
          },
        }),
      ),
    );
    return { key, provider: "r2" };
  }

  // Fallback: store base64 (caller handles DB storage)
  return { key, provider: "base64" };
}

/**
 * Get a signed URL for reading a document from R2.
 * Falls back to null if R2 is not configured (caller should use base64 fallback).
 */
export async function getDocumentUrl(key: string): Promise<string | null> {
  // Check cache first
  const cached = getCachedUrl(key);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  try {
    // Check if the object exists (with retry)
    await withRetry(() =>
      client.send(
        new HeadObjectCommand({
          Bucket: getConfig()!.bucket,
          Key: key,
        }),
      ),
    );

    // Generate a signed URL (1 hour expiry)
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: getConfig()!.bucket,
        Key: key,
      }),
      { expiresIn: 3600 },
    );
    setCachedUrl(key, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Check if a document exists in R2 storage.
 */
export async function documentExists(key: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: getConfig()!.bucket,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
