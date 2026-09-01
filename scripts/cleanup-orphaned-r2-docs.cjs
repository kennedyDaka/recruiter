/**
 * Orphaned Document Cleanup Script
 *
 * Finds documents in R2 that no longer reference any application in the DB,
 * and optionally deletes them.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-r2-docs.cjs            # dry run (show orphans)
 *   node scripts/cleanup-orphaned-r2-docs.cjs --delete    # actually delete
 *
 * Prerequisites:
 *   - R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET env vars
 *   - DATABASE_URL env var
 */

require("dotenv").config();
const { Pool } = require("pg");
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const DRY_RUN = !process.argv.includes("--delete");

async function main() {
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    console.error("❌ Missing R2 env vars.");
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
    // 1. Get all file_path values from the DB
    const dbDocs = await db.query(
      `SELECT file_path FROM candidate_documents WHERE file_path IS NOT NULL`
    );
    const dbPaths = new Set(dbDocs.rows.map((r) => r.file_path));
    console.log(`DB has ${dbPaths.size} document references.\n`);

    // 2. List all objects in R2
    let r2Keys = [];
    let continuationToken = undefined;
    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      });
      const listResult = await s3.send(listCmd);
      if (listResult.Contents) {
        r2Keys.push(...listResult.Contents.map((obj) => obj.Key));
      }
      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    console.log(`R2 has ${r2Keys.length} objects.\n`);

    // 3. Find orphans — R2 keys not referenced in DB
    const orphans = r2Keys.filter((key) => !dbPaths.has(key));
    console.log(`Found ${orphans.length} orphaned objects in R2.\n`);

    if (orphans.length === 0) {
      console.log("✅ No orphaned documents found.");
      return;
    }

    // 4. Show first 20 orphans
    console.log("Orphaned files (first 20):");
    for (const key of orphans.slice(0, 20)) {
      console.log(`  ${key}`);
    }
    if (orphans.length > 20) {
      console.log(`  ... and ${orphans.length - 20} more`);
    }
    console.log();

    // 5. Delete if --delete flag
    if (DRY_RUN) {
      console.log("🔍 DRY RUN — no files deleted. Run with --delete to remove orphans.");
    } else {
      let deleted = 0;
      for (const key of orphans) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          deleted++;
          if (deleted % 50 === 0) {
            process.stdout.write(`  Deleted ${deleted}/${orphans.length}...\n`);
          }
        } catch (err) {
          console.error(`  ✗ Failed to delete: ${key} — ${err.message}`);
        }
      }
      console.log(`\n✅ Deleted ${deleted}/${orphans.length} orphaned objects.`);
    }
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
