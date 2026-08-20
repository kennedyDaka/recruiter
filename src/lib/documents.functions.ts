import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const uploadSchema = z.object({
  // Campaign ids are UUIDs and public tokens are alphanumeric — nothing else
  // is allowed here because this value becomes a path segment under uploads/.
  campaignId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(200),
  docType: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(255),
  base64: z.string().trim().min(1).max(16_000_000),
});

/**
 * Stores a candidate document for a public campaign. Files land in the local
 * `uploads/` directory (dev stand-in for object storage) and are served by the
 * /uploads request middleware in src/start.ts.
 */
export const uploadApplicationDocument = createServerFn({ method: "POST" })
  .validator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve campaign: try public_token first, then id
    let campaignRes = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("public_token", data.campaignId)
      .maybeSingle();
    if (!campaignRes.data) {
      campaignRes = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("id", data.campaignId)
        .maybeSingle();
    }
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    if (!campaignRes.data) throw new Error("This campaign is not accepting applications.");

    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.byteLength === 0) throw new Error("The uploaded file is empty.");
    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error("The uploaded file exceeds the 10 MB limit.");
    }

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `${crypto.randomUUID()}-${safeName}`;
    const relativePath = `uploads/${data.campaignId}/${key}`;
    const absolutePath = resolve(process.cwd(), "uploads", data.campaignId, key);

    await mkdir(resolve(process.cwd(), "uploads", data.campaignId), { recursive: true });
    await writeFile(absolutePath, buffer);

    return {
      doc_type: data.docType,
      file_name: data.fileName,
      file_path: relativePath,
      file_size: buffer.byteLength,
    };
  });

export const applicationDocumentUrl = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ filePath: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = await supabaseAdmin
      .from("candidate_documents")
      .select("id")
      .eq("file_path", data.filePath)
      .maybeSingle();
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data) throw new Error("Document not found.");

    try {
      const absolutePath = resolve(process.cwd(), data.filePath);
      const info = await stat(absolutePath);
      if (!info.isFile()) throw new Error("Document not found.");
    } catch {
      throw new Error("Document not found.");
    }

    return { signedUrl: `/${data.filePath}` };
  });
