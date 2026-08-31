/**
 * PDF Text Extraction — extracts raw text from PDF CVs before sending to Gemini.
 *
 * Uses pdf-parse (or similar) to convert PDF → raw text → cleaned text.
 * The extracted text is what Gemini receives — never the raw PDF.
 */

import { AI_MAX_INPUT_CHARS, AI_MIN_TEXT_LENGTH, AI_ERROR_CODES } from "./config";

// ─── Types ────────────────────────────────────────────────────────

export interface PdfExtractionResult {
  success: boolean;
  text?: string;
  pageCount?: number;
  charCount?: number;
  error?: {
    code: string;
    message: string;
  };
}

// ─── Text Cleaning ────────────────────────────────────────────────

/**
 * Clean extracted PDF text: normalize whitespace, remove artifacts,
 * and prepare it for AI processing.
 */
function cleanExtractedText(raw: string): string {
  return raw
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    // Remove common PDF artifacts
    .replace(/\x00/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // Normalize spaces (but preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    // Trim each line
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    // Collapse spaces at start/end of lines
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .trim();
}

/**
 * Validate that extracted text is usable — not too short, not garbage.
 */
function validateText(text: string): { valid: boolean; reason?: string } {
  if (text.length < AI_MIN_TEXT_LENGTH) {
    return {
      valid: false,
      reason: `Extracted text too short (${text.length} chars, minimum ${AI_MIN_TEXT_LENGTH})`,
    };
  }

  // Check if the text is mostly non-alpha (garbage extraction)
  const alphaRatio =
    (text.replace(/[^a-zA-Z]/g, "").length) / text.length;
  if (alphaRatio < 0.3) {
    return {
      valid: false,
      reason: `Extracted text has low alpha ratio (${(alphaRatio * 100).toFixed(1)}%) — likely garbage`,
    };
  }

  return { valid: true };
}

// ─── Extraction ───────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer.
 *
 * @param buffer - The raw PDF file contents
 * @param fileName - Original filename for logging
 * @returns Cleaned, validated text ready for AI processing
 */
export async function extractPdfText(
  buffer: Buffer,
  fileName: string,
): Promise<PdfExtractionResult> {
  try {
    // Dynamic import — pdf-parse may not be installed in all environments
    let pdfParse: any;
    try {
      const mod = await import("pdf-parse");
      pdfParse = (mod as any).default ?? mod;
    } catch {
      return {
        success: false,
        error: {
          code: AI_ERROR_CODES.PDF_EXTRACTION_FAILED,
          message:
            "pdf-parse library is not installed. Install it with: npm install pdf-parse",
        },
      };
    }

    const result = await pdfParse(buffer, {
      // Limit pages to prevent memory issues
      max: 50,
    });

    const pageCount = result.numpages ?? 0;
    const rawText = result.text ?? "";

    if (!rawText.trim()) {
      return {
        success: false,
        error: {
          code: AI_ERROR_CODES.NO_USABLE_TEXT,
          message: `PDF has ${pageCount} pages but no extractable text — may be a scanned image`,
        },
      };
    }

    // Clean the text
    const cleaned = cleanExtractedText(rawText);

    // Validate
    const validation = validateText(cleaned);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: AI_ERROR_CODES.NO_USABLE_TEXT,
          message: validation.reason!,
        },
      };
    }

    // Truncate if too long for Gemini
    const truncated =
      cleaned.length > AI_MAX_INPUT_CHARS
        ? cleaned.slice(0, AI_MAX_INPUT_CHARS) + "\n[... truncated ...]"
        : cleaned;

    return {
      success: true,
      text: truncated,
      pageCount,
      charCount: truncated.length,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: AI_ERROR_CODES.PDF_EXTRACTION_FAILED,
        message: `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

/**
 * Extract text from a base64-encoded PDF.
 */
export async function extractPdfTextFromBase64(
  base64: string,
  fileName: string,
): Promise<PdfExtractionResult> {
  try {
    const buffer = Buffer.from(base64, "base64");
    return extractPdfText(buffer, fileName);
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: AI_ERROR_CODES.PDF_EXTRACTION_FAILED,
        message: `Failed to decode base64 PDF: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

/**
 * Generate a SHA-256 hash of the PDF buffer for deduplication.
 */
export async function hashDocument(buffer: Buffer): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(buffer).digest("hex");
}
