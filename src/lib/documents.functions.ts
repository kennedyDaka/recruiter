import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const uploadSchema = z.object({
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
 * Stores a candidate document for a public campaign.
 *
 * Files are stored as base64 in the `candidate_documents.file_data` column.
 * This avoids filesystem dependencies and works on serverless platforms
 * (Vercel, AWS Lambda, etc.) where the filesystem is read-only.
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
    const storagePath = `${data.campaignId}/${key}`;

    // Store the base64 data directly in the database — no filesystem needed.
    return {
      doc_type: data.docType,
      file_name: data.fileName,
      file_path: storagePath,
      file_size: buffer.byteLength,
      file_data: data.base64,
    };
  });

/**
 * Returns the document data for viewing/downloading.
 * Reads from the database and returns a data URI.
 */
export const applicationDocumentUrl = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ filePath: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = await supabaseAdmin
      .from("candidate_documents")
      .select("file_name, file_data, doc_type")
      .eq("file_path", data.filePath)
      .maybeSingle();
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data) throw new Error("Document not found.");

    if (doc.data.file_data) {
      // Return a data URI so the frontend can display/download the file
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
      };
      const ext = doc.data.file_name.split(".").pop()?.toLowerCase() ?? "";
      const mime = mimeMap[ext] ?? "application/octet-stream";
      return {
        signedUrl: `data:${mime};base64,${doc.data.file_data}`,
        fileName: doc.data.file_name,
        docType: doc.data.doc_type,
      };
    }

    throw new Error("Document file not found in storage.");
  });
