import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { uploadDocument, getDocumentUrl, isR2Configured, getMimeType, deleteDocument } from "@/lib/storage";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const uploadSchema = z.object({
  campaignId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(200),
  tenantId: z.string().min(1).max(100).optional().default("public"),
  docType: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(255),
  base64: z.string().trim().min(1).max(16_000_000),
});

/**
 * Stores a candidate document for a public campaign.
 *
 * When Cloudflare R2 is configured, files are uploaded to R2 and only the key
 * is stored in the database. Falls back to base64-in-DB for dev environments.
 */
export const uploadApplicationDocument = createServerFn({ method: "POST" })
  .validator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve campaign: try public_token first, then id
    let campaignRes = await supabaseAdmin
      .from("campaigns")
      .select("id, tenant_id")
      .eq("public_token", data.campaignId)
      .maybeSingle();
    if (!campaignRes.data) {
      campaignRes = await supabaseAdmin
        .from("campaigns")
        .select("id, tenant_id")
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

    // Use the tenant ID from the campaign for proper R2 key isolation
    const tenantId = campaignRes.data.tenant_id || data.tenantId;

    // Upload to R2 if configured, otherwise store base64 in DB
    const { key, provider } = await uploadDocument({
      tenantId,
      campaignId: data.campaignId,
      fileName: data.fileName,
      buffer,
    });

    return {
      doc_type: data.docType,
      file_name: data.fileName,
      file_path: key,
      file_size: buffer.byteLength,
      // Only store base64 data when R2 is NOT configured (fallback)
      file_data: provider === "base64" ? data.base64 : null,
    };
  });

/**
 * Returns the document data for viewing/downloading.
 * Tries R2 signed URL first, falls back to base64 from DB.
 */
export const applicationDocumentUrl = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ filePath: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = await supabaseAdmin
      .from("candidate_documents")
      .select("file_name, file_data, file_path, doc_type")
      .eq("file_path", data.filePath)
      .maybeSingle();
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data) throw new Error("Document not found.");

    // Try R2 first — the file_path IS the R2 storage key
    if (isR2Configured() && doc.data.file_path) {
      const signedUrl = await getDocumentUrl(doc.data.file_path);
      if (signedUrl) {
        return {
          signedUrl,
          fileName: doc.data.file_name,
          docType: doc.data.doc_type,
        };
      }
    }

    // Fallback: base64 from database
    if (doc.data.file_data) {
      const mime = getMimeType(doc.data.file_name);
      return {
        signedUrl: `data:${mime};base64,${doc.data.file_data}`,
        fileName: doc.data.file_name,
        docType: doc.data.doc_type,
      };
    }

    throw new Error("Document file not found in storage.");
  });

/**
 * Deletes a document from R2 storage and returns true.
 * Best-effort — does not throw on failure.
 */
export const deleteApplicationDocument = createServerFn({ method: "POST" })
  .validator(
    (input: unknown) =>
      z.object({ filePath: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!isR2Configured()) return { deleted: false };
    try {
      await deleteDocument(data.filePath);
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  });
