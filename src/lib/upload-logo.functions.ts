import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { uploadDocument, getDocumentUrl, isR2Configured } from "@/lib/storage";

/**
 * Upload a logo image to R2 and return the public URL.
 * Falls back to returning the base64 data URL when R2 is not configured.
 */
export const uploadLogoFn = createServerFn({ method: "POST" })
  .validator(
    (input: unknown) =>
      z
        .object({
          base64DataUrl: z.string().trim().min(1).max(20_000_000),
          tenantId: z.string().min(1).max(100),
          fileName: z.string().trim().min(1).max(255).default("logo"),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    // If R2 is not configured, return the base64 as-is
    if (!isR2Configured()) {
      return { url: data.base64DataUrl, provider: "base64" as const };
    }

    // Parse the data URL to extract mime type and binary data
    const match = data.base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid data URL format");
    }

    const mimeType = match[1] ?? "image/png";
    const base64 = match[2] ?? "";
    const buffer = Buffer.from(base64, "base64");

    // Determine file extension from mime type
    const ext = mimeType.includes("png")
      ? "png"
      : mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? "jpg"
        : mimeType.includes("svg")
          ? "svg"
          : mimeType.includes("webp")
            ? "webp"
            : "png";

    const fileName = `${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;

    const { key } = await uploadDocument({
      tenantId: data.tenantId,
      campaignId: "logos",
      fileName,
      buffer,
    });

    // Return the public URL
    const publicUrl = await getDocumentUrl(key);
    return { url: publicUrl || data.base64DataUrl, provider: "r2" as const, key };
  });

/**
 * Get the logo URL for a tenant.
 * If the logo_data contains an R2 key, return the public URL.
 * Otherwise return the base64 data URL as-is.
 */
export const getLogoUrlFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ logoData: z.string().nullable() }).parse(input))
  .handler(async ({ data }) => {
    if (!data.logoData) return null;

    // If it's already a URL (data: or http), return as-is
    if (data.logoData.startsWith("data:") || data.logoData.startsWith("http")) {
      return data.logoData;
    }

    // If R2 is configured and this looks like a storage key, get the public URL
    if (isR2Configured()) {
      const publicUrl = await getDocumentUrl(data.logoData);
      if (publicUrl) return publicUrl;
    }

    return data.logoData;
  });
