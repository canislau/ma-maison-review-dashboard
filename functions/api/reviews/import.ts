// POST /api/reviews/import
//
// Two-phase import flow:
//   Phase 1 (multipart file upload, no ?commit): parse + validate + detect
//     duplicates, stage the parsed rows in KV under an uploadToken, return
//     an ImportPreviewResult for the frontend to render as a preview table.
//   Phase 2 (?commit=true, JSON body ImportCommitRequest): read the staged
//     rows back from KV, apply the chosen duplicate action, enrich with AI,
//     batch-write to SharePoint, upload the original file to the Document
//     Library, and return an ImportCommitResult.
//
// Staging in KV (not just trusting the client to re-send full parsed data)
// prevents a malicious/buggy client from injecting arbitrary records that
// were never actually validated against the uploaded file.

import { withAuth, jsonResponse, readJsonBody } from "../../_lib/http";
import { ApiException } from "../../_lib/types";
import type { SPReviewFields } from "../../_lib/types";
import { detectFileType, parseUploadedFile } from "../../_lib/fileParsers";
import { validateReviewRow } from "../../_lib/validation";
import { getAllListItems, batchCreateListItems, uploadSourceFile } from "../../_lib/sharepoint";
import { spItemToReview, reviewToSpFields } from "../../_lib/fieldMapping";
import { buildExistingKeyIndex, duplicateKey } from "../../_lib/duplicateDetection";
import { enrichReviewBatch } from "../../_lib/azureOpenAi";
import type {
  Review,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportCommitRequest,
  ImportCommitResult,
} from "../../../src/types";

const STAGE_TTL_SECONDS = 60 * 30; // staged imports expire after 30 minutes

interface StagedImport {
  fileName: string;
  fileType: "csv" | "json" | "xlsx";
  outlet: string;
  contentBase64: string;
  contentType: string;
  rows: Partial<Review>[];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export const onRequest = withAuth(async ({ request, env, user }) => {
  if (request.method !== "POST") {
    throw new ApiException(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }
  if (user.role !== "Administrator" && user.role !== "Manager") {
    throw new ApiException(403, "FORBIDDEN", "Only Managers and Administrators can import reviews.");
  }
  if (!env.CACHE) {
    throw new ApiException(
      500,
      "CACHE_NOT_CONFIGURED",
      "A KV namespace must be bound as CACHE for staged imports. See wrangler.toml."
    );
  }

  const url = new URL(request.url);
  const isCommit = url.searchParams.get("commit") === "true";

  // ---------------------------------------------------------------------
  // Phase 2: commit a previously staged import
  // ---------------------------------------------------------------------
  if (isCommit) {
    const body = await readJsonBody<ImportCommitRequest>(request);
    const stagedRaw = await env.CACHE.get(`import:${body.uploadToken}`, "json");
    if (!stagedRaw) {
      throw new ApiException(410, "UPLOAD_EXPIRED", "This import preview has expired. Please re-upload the file.");
    }
    const staged = stagedRaw as StagedImport;

    const existingItems = await getAllListItems<SPReviewFields>(env, env.REVIEWS_LIST_ID);
    const existingIndex = buildExistingKeyIndex(existingItems.map(spItemToReview));

    let rowsToImport = staged.rows.map((row, idx) => ({ row, idx }));

    if (body.duplicateAction === "skip") {
      rowsToImport = rowsToImport.filter(({ row }) => !existingIndex.has(duplicateKey(row as Review)));
    } else if (body.duplicateAction === "selected") {
      const selected = new Set(body.selectedRowIndexes || []);
      rowsToImport = rowsToImport.filter(({ idx }) => selected.has(idx));
    }
    // "replace" imports everything; duplicates will be re-created as new
    // list items — SharePoint list items don't have a natural upsert key,
    // so "replace" is implemented as delete-then-recreate for matched dupes.
    let replacedCount = 0;
    if (body.duplicateAction === "replace") {
      for (const { row } of rowsToImport) {
        const existing = existingIndex.get(duplicateKey(row as Review));
        if (existing) {
          const { deleteListItem } = await import("../../_lib/sharepoint");
          await deleteListItem(env, env.REVIEWS_LIST_ID, existing.id);
          replacedCount++;
        }
      }
    }

    const skippedCount = staged.rows.length - rowsToImport.length;

    // Upload the original source file to the Document Library first so we
    // can stamp every imported row with the correct SourceFile link.
    const now = new Date();
    const year = String(now.getFullYear());
    const monthName = now.toLocaleString("en-US", { month: "long" });

    const uploaded = await uploadSourceFile(env, {
      outlet: staged.outlet,
      year,
      month: monthName,
      fileName: staged.fileName,
      content: base64ToArrayBuffer(staged.contentBase64),
      contentType: staged.contentType,
    });

    // AI enrichment (best-effort; failures leave fields blank rather than failing the import)
    const enrichments = await enrichReviewBatch(
      env,
      rowsToImport.map(({ row }) => row as Review)
    );

    const now2 = Date.now();
    const spFieldsArray: Partial<SPReviewFields>[] = rowsToImport.map(({ row, idx: i }, i2) => {
      const enrichment = enrichments[i2];
      const reviewId = row.reviewId || `${row.outlet?.slice(0, 3).toUpperCase() || "REV"}-${now2}-${i2}`;
      const merged: Partial<Review> = {
        ...row,
        reviewId,
        englishTranslation: row.englishTranslation || enrichment?.englishTranslation || "",
        language: row.language || enrichment?.language || "Unknown",
        category: row.category || enrichment?.category || "Others",
        severity: row.severity || enrichment?.severity || "Low",
        possibleRootCause: row.possibleRootCause || enrichment?.possibleRootCause || "",
        draftReply: row.draftReply || enrichment?.draftReply || "",
        status: row.status || "New",
        managementReply: row.managementReply || "",
        responsiblePerson: row.responsiblePerson || "",
        salesRecovery: row.salesRecovery || "",
        actionPlan: row.actionPlan || "",
        recommendedTimeline: row.recommendedTimeline || "",
        sourceFile: staged.fileName,
        sourceFileUrl: uploaded.webUrl,
      };
      return reviewToSpFields(merged);
    });

    const batchResult = await batchCreateListItems<SPReviewFields>(env, env.REVIEWS_LIST_ID, spFieldsArray);

    await env.CACHE.delete(`import:${body.uploadToken}`);

    const result: ImportCommitResult = {
      imported: batchResult.succeeded,
      skipped: skippedCount,
      replaced: replacedCount,
      failed: batchResult.failed.length,
      errors: batchResult.failed.map((f) => ({ rowIndex: f.index, message: f.error })),
      sourceFileUrl: uploaded.webUrl,
    };

    return jsonResponse(result, env);
  }

  // ---------------------------------------------------------------------
  // Phase 1: parse + validate + stage
  // ---------------------------------------------------------------------
  const formData = await request.formData().catch(() => {
    throw new ApiException(400, "INVALID_UPLOAD", "Expected multipart/form-data with a 'file' field.");
  });

  const file = formData.get("file");
  const outletHint = String(formData.get("outlet") || "");

  if (!(file instanceof File)) {
    throw new ApiException(400, "NO_FILE", "No file was uploaded.");
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    throw new ApiException(400, "UNSUPPORTED_FILE_TYPE", "Only .csv, .json, .xlsx, and .xls files are supported.");
  }

  const buffer = await file.arrayBuffer();

  let parsedRows: Partial<Review>[];
  try {
    parsedRows = parseUploadedFile(fileType, file.name, buffer, outletHint);
  } catch (err) {
    throw new ApiException(400, "PARSE_ERROR", err instanceof Error ? err.message : "Failed to parse file.");
  }

  if (parsedRows.length === 0) {
    throw new ApiException(400, "EMPTY_FILE", "No rows could be parsed from this file. Check the column headers.");
  }

  const existingItems = await getAllListItems<SPReviewFields>(env, env.REVIEWS_LIST_ID);
  const existingIndex = buildExistingKeyIndex(existingItems.map(spItemToReview));

  const rows: ImportPreviewRow[] = parsedRows.map((parsed, rowIndex) => {
    const errors = validateReviewRow(parsed);
    const key = errors.length === 0 ? duplicateKey(parsed as Review) : null;
    const existingMatch = key ? existingIndex.get(key) : undefined;

    return {
      rowIndex,
      parsed,
      isDuplicate: Boolean(existingMatch),
      duplicateOf: existingMatch?.reviewId,
      errors,
    };
  });

  const uploadToken = crypto.randomUUID();
  const staged: StagedImport = {
    fileName: file.name,
    fileType,
    outlet: outletHint || parsedRows[0]?.outlet || "Unspecified",
    contentBase64: arrayBufferToBase64(buffer),
    contentType: file.type || "application/octet-stream",
    rows: parsedRows,
  };

  await env.CACHE.put(`import:${uploadToken}`, JSON.stringify(staged), {
    expirationTtl: STAGE_TTL_SECONDS,
  });

  const result: ImportPreviewResult = {
    fileName: file.name,
    outlet: staged.outlet,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.errors.length === 0).length,
    duplicateRows: rows.filter((r) => r.isDuplicate).length,
    errorRows: rows.filter((r) => r.errors.length > 0).length,
    rows,
    uploadToken,
  };

  return jsonResponse(result, env);
});
