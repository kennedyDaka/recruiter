/**
 * Bulk Re-Upload Script: Base64 DB → Cloudflare R2
 *
 * Reads all documents with file_data (base64) from the candidate_documents
 * table, uploads them to R2, and updates the file_path to the new R2 key.
 *
 * Usage:
 *   node scripts/migrate-documents-to-r2.cjs
 *
 * Prerequisites:
 *   - R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET env vars
 *   - DATABASE_URL env var
 */

require("dotenv").config();
const { Pool } = require("pg");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const MIME_MAP = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};

function getMimeType(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

async function main() {
  // Validate env vars
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    console.error("❌ Missing R2 env vars. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Find all documents with base64 data
    const docs = await db.query(
      `SELECT id, file_path, file_name, file_data, doc_type
       FROM candidate_documents
       WHERE file_data IS NOT NULL AND length(file_data) > 0`
    );

    console.log(`Found ${docs.rowCount} documents with base64 data to migrate.\n`);

    if (docs.rowCount === 0) {
      console.log("✅ Nothing to migrate.");
      return;
    }

    let success = 0;
    let failed = 0;

    for (const doc of docs.rows) {
      const buffer = Buffer.from(doc.file_data, "base64");
      const safeName = (doc.file_name || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const r2Key = `migrated/${doc.file_path || `unknown/${doc.id}/${safeName}`}`;

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: r2Key,
            Body: buffer,
            ContentType: getMimeType(doc.file_name || ""),
            ContentLength: buffer.byteLength,
            Metadata: {
              "original-name": doc.file_name || "",
              "doc-type": doc.doc_type || "",
              "migration-source": "base64-db",
            },
          }),
        );

        // Update file_path to R2 key and clear base64 data
        await db.query(
          `UPDATE candidate_documents
           SET file_path = $1, file_data = NULL
           WHERE id = $2`,
          [r2Key, doc.id],
        );

        success++;
        process.stdout.write(`  ✓ [${success}/${docs.rowCount}] ${doc.file_name} → ${r2Key}\n`);
      } catch (err) {
        failed++;
        console.error(`  ✗ Failed: ${doc.file_name} — ${err.message}`);
      }
    }

    console.log(`\nMigration complete: ${success} succeeded, ${failed} failed out of ${docs.rowCount} total.`);
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
