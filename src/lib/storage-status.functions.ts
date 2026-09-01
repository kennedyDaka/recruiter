import { createServerFn } from "@tanstack/react-start";
import { isR2Configured } from "@/lib/storage";

/**
 * Returns R2 storage status, connectivity health, and metrics.
 * Supports both S3-compatible and Cloudflare API modes.
 * Admin-only endpoint.
 */
export const getR2StatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const configured = isR2Configured();

    if (!configured) {
      return {
        configured: false,
        healthy: false,
        status: "not_configured" as const,
        mode: null as string | null,
        message:
          "Cloudflare R2 is not configured. Set R2_BUCKET and either (R2_API_TOKEN + R2_ACCOUNT_ID + R2_PUBLIC_URL) or (R2_ENDPOINT + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY).",
        bucket: null,
        publicUrl: null,
        objectCount: null,
        totalSizeBytes: null,
        totalSizeFormatted: null,
      };
    }

    const bucket = process.env["R2_BUCKET"]!;
    const apiToken = process.env["R2_API_TOKEN"];
    const accountId = process.env["R2_ACCOUNT_ID"];
    const publicUrl = process.env["R2_PUBLIC_URL"];
    const s3Endpoint = process.env["R2_ENDPOINT"];

    // CF API mode
    if (apiToken && accountId && publicUrl) {
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }

        const data = await res.json() as any;
        const objects = data?.result?.objects ?? [];

        let totalSizeBytes = 0;
        for (const obj of objects) {
          totalSizeBytes += obj.size || 0;
        }

        return {
          configured: true,
          healthy: true,
          status: "healthy" as const,
          mode: "cloudflare-api" as const,
          message: `Connected to R2 bucket "${bucket}" via Cloudflare API`,
          bucket,
          publicUrl,
          objectCount: objects.length,
          totalSizeBytes,
          totalSizeFormatted: formatBytes(totalSizeBytes),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          configured: true,
          healthy: false,
          status: "error" as const,
          mode: "cloudflare-api" as const,
          message: `R2 API connection failed: ${message}`,
          bucket,
          publicUrl,
          objectCount: null,
          totalSizeBytes: null,
          totalSizeFormatted: null,
        };
      }
    }

    // S3 mode
    if (s3Endpoint) {
      const { S3Client, ListObjectsV2Command, HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const accessKeyId = process.env["R2_ACCESS_KEY_ID"]!;
      const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]!;

      const s3 = new S3Client({
        region: "auto",
        endpoint: s3Endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });

      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));

        let objectCount = 0;
        let totalSizeBytes = 0;
        let continuationToken: string | undefined = undefined;

        do {
          const result: { Contents?: Array<{ Size?: number | undefined }> | undefined; NextContinuationToken?: string | undefined } = await s3.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              ContinuationToken: continuationToken,
              MaxKeys: 1000,
            }),
          );

          if (result.Contents) {
            objectCount += result.Contents.length;
            for (const obj of result.Contents) {
              totalSizeBytes += obj.Size ?? 0;
            }
          }
          continuationToken = result.NextContinuationToken;
        } while (continuationToken);

        return {
          configured: true,
          healthy: true,
          status: "healthy" as const,
          mode: "s3-compatible" as const,
          message: `Connected to R2 bucket "${bucket}" via S3 API`,
          bucket,
          publicUrl: publicUrl || null,
          objectCount,
          totalSizeBytes,
          totalSizeFormatted: formatBytes(totalSizeBytes),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          configured: true,
          healthy: false,
          status: "error" as const,
          mode: "s3-compatible" as const,
          message: `R2 S3 connection failed: ${message}`,
          bucket,
          publicUrl: publicUrl || null,
          objectCount: null,
          totalSizeBytes: null,
          totalSizeFormatted: null,
        };
      }
    }

    // Configured but no valid mode
    return {
      configured: true,
      healthy: false,
      status: "error" as const,
      mode: null,
      message: "R2_BUCKET is set but no API token or S3 credentials found.",
      bucket,
      publicUrl: null,
      objectCount: null,
      totalSizeBytes: null,
      totalSizeFormatted: null,
    };
  },
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
