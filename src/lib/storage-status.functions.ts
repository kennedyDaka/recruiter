import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  S3Client,
  ListObjectsV2Command,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { isR2Configured } from "@/lib/storage";

/**
 * Returns R2 storage status, connectivity health, and metrics.
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
        message:
          "Cloudflare R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET environment variables.",
        bucket: null,
        objectCount: null,
        totalSizeBytes: null,
        totalSizeFormatted: null,
      };
    }

    const endpoint = process.env["R2_ENDPOINT"]!;
    const accessKeyId = process.env["R2_ACCESS_KEY_ID"]!;
    const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]!;
    const bucket = process.env["R2_BUCKET"]!;

    const s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, accessKeyId: accessKeyId, secretAccessKey },
    });

    try {
      // Test bucket access
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));

      // List objects to get count and total size
      let objectCount = 0;
      let totalSizeBytes = 0;
      let continuationToken: string | undefined = undefined;

      do {
        const result = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }),
        );

        if (result.Contents) {
          objectCount += result.Contents.length;
          totalSizeBytes += result.Contents.reduce(
            (sum, obj) => sum + (obj.Size || 0),
            0,
          );
        }
        continuationToken = result.NextContinuationToken;
      } while (continuationToken);

      return {
        configured: true,
        healthy: true,
        status: "healthy" as const,
        message: `Connected to R2 bucket "${bucket}"`,
        bucket,
        endpoint: endpoint.replace(/\/\/[^:]+:[^@]+@/, "//***:***@"), // Mask credentials
        objectCount,
        totalSizeBytes,
        totalSizeFormatted: formatBytes(totalSizeBytes),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during R2 health check";
      return {
        configured: true,
        healthy: false,
        status: "error" as const,
        message: `R2 connection failed: ${message}`,
        bucket,
        objectCount: null,
        totalSizeBytes: null,
        totalSizeFormatted: null,
      };
    }
  },
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
