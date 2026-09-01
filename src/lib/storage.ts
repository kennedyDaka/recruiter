/**
 * Document Storage Abstraction Layer.
 *
 * Supports three modes (in order of preference):
 *
 *   1. S3-compatible (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY)
 *      — Full S3 API access for upload/download via AWS SDK
 *   2. Cloudflare API + Public URL (R2_API_TOKEN + R2_PUBLIC_URL + R2_BUCKET)
 *      — Uses Cloudflare API for uploads, public r2.dev URL for reads
 *   3. Base64 in DB (no R2 config)
 *      — Fallback for dev environments
 *
 * Configuration via environment variables:
 *   R2_BUCKET            — R2 bucket name (e.g. "recruiter")
 *   R2_PUBLIC_URL        — Public base URL for reads (e.g. "https://pub-xxx.r2.dev")
 *   R2_API_TOKEN         — Cloudflare API token with R2 permissions (for API mode)
 *   R2_ACCOUNT_ID        — Cloudflare account ID (for API mode)
 *   R2_ACCESS_KEY_ID     — S3 access key (for S3 mode)
 *   R2_SECRET_ACCESS_KEY — S3 secret key (for S3 mode)
 */

// ── Configuration ───────────────────────────────────────────────────

interface S3Config {
  mode: "s3";
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

interface CfApiConfig {
  mode: "cf-api";
  apiToken: string;
  accountId: string;
  bucket: string;
  publicUrl: string;
}

type StorageConfig = S3Config | CfApiConfig;

function getConfig(): StorageConfig | null {
  const bucket = process.env["R2_BUCKET"];
  if (!bucket) return null;

  // S3 mode: has access key + secret
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const endpoint = process.env["R2_ENDPOINT"];
  if (accessKeyId && secretAccessKey && endpoint) {
    return { mode: "s3", endpoint, accessKeyId, secretAccessKey, bucket };
  }

  // CF API mode: has API token + public URL
  const apiToken = process.env["R2_API_TOKEN"];
  const accountId = process.env["R2_ACCOUNT_ID"];
  const publicUrl = process.env["R2_PUBLIC_URL"];
  if (apiToken && accountId && publicUrl) {
    return { mode: "cf-api", apiToken, accountId, bucket, publicUrl };
  }

  return null;
}

// ── S3 Client (lazy) ───────────────────────────────────────────────

let _s3Client: any = null;

function getS3Client(config: S3Config): any {
  if (_s3Client) return _s3Client;
  // Dynamic import to avoid loading S3 SDK when not needed
  const { S3Client } = require("@aws-sdk/client-s3");
  _s3Client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return _s3Client;
}

export function isR2Configured(): boolean {
  return getConfig() !== null;
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

// ── URL Cache ───────────────────────────────────────────────────────
// Public URLs don't expire, but we cache to avoid repeated concatenation.
// For S3 signed URLs, cache for 50 minutes (signed URLs last 60 minutes).

const URL_CACHE_TTL_MS = 50 * 60 * 1000;
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

function setCachedUrl(key: string, url: string, ttlMs = URL_CACHE_TTL_MS): void {
  urlCache.set(key, { url, expiresAt: Date.now() + ttlMs });
  if (urlCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of urlCache) {
      if (now > v.expiresAt) urlCache.delete(k);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export interface StorageUploadResult {
  key: string;
  provider: "r2" | "base64";
}

/**
 * Upload a file to storage.
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
  const contentType = getMimeType(fileName);

  const config = getConfig();
  if (!config) {
    return { key, provider: "base64" };
  }

  if (config.mode === "s3") {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    const client = getS3Client(config);
    await withRetry(() =>
      client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
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

  // CF API mode: upload via Cloudflare API
  if (config.mode === "cf-api") {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects/${encodeURIComponent(key)}`;
    const response = await withRetry(async () => {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": contentType,
        },
        body: new Uint8Array(buffer),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`R2 upload failed (${res.status}): ${body}`);
      }
      return res;
    });
    return { key, provider: "r2" };
  }

  return { key, provider: "base64" };
}

/**
 * Get a URL for reading a document.
 * - CF API mode: returns public URL (no expiry)
 * - S3 mode: returns signed URL (1 hour)
 * - No config: returns null (caller uses base64)
 */
export async function getDocumentUrl(key: string): Promise<string | null> {
  const cached = getCachedUrl(key);
  if (cached) return cached;

  const config = getConfig();
  if (!config) return null;

  if (config.mode === "cf-api") {
    // Public URL — no expiry, no signing needed
    const url = `${config.publicUrl.replace(/\/$/, "")}/${key}`;
    setCachedUrl(key, url, 24 * 60 * 60 * 1000); // Cache for 24h
    return url;
  }

  if (config.mode === "s3") {
    try {
      const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
      const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
      const client = getS3Client(config);

      await withRetry(() =>
        client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        ),
      );

      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: 3600 },
      );
      setCachedUrl(key, url);
      return url;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Check if a document exists in storage.
 */
export async function documentExists(key: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  if (config.mode === "cf-api") {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${config.apiToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (config.mode === "s3") {
    try {
      const { HeadObjectCommand } = require("@aws-sdk/client-s3");
      const client = getS3Client(config);
      await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
