-- Migration: Remove base64 file_data from candidate_documents
-- 
-- PREREQUISITE: Run the bulk re-upload script first to move all
-- existing base64 documents to Cloudflare R2.
-- 
-- This migration removes the file_data column which stored documents
-- as base64 in the database. Documents are now stored in Cloudflare R2
-- and only the file_path (R2 key) is kept in the database.
--
-- DO NOT RUN until:
-- 1. R2 bucket is created and configured
-- 2. R2 env vars are set on Vercel
-- 3. Bulk re-upload script has been run successfully
-- 4. All documents have been verified accessible via R2 signed URLs

ALTER TABLE candidate_documents DROP COLUMN IF EXISTS file_data;
