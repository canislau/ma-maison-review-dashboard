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
import { getAllListItems, batchCreateListItems, uploadSourceFile } from "../../_lib/googleData";
import { spItemToReview, reviewToSpFields } from "../../_lib/fieldMapping";
import { buildExistingKeyIndex, duplicateKey } from "../../_lib/duplicateDetection";
import { enrichReviewBatch } from "../../_lib/azureOpenAi";
import { stageImport, readStagedImport, deleteStagedImport } from "../../_lib/importStage";
import type {
  Review,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportCommitRequest,
  ImportCommitResult,
} from "../../../src/types";
import { resolveOutletIdentity } from "../../../src/data/outletDirectory";

const STAGE_TTL_SECONDS = 60 * 30; // staged imports expire after 30 minutes

interface StagedImport {
  fileName: string;
  fileType: "csv" | "json" | "xlsx";
  brand: string;
  outletCode: string;
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
  const url = new URL(request.url);
  const isCommit = url.searchParams.get("commit") === "true";

  // ---------------------------------------------------------------------
  // Phase 2: commit a previously staged import
  // ---------------------------------------------------------------------
  if (isCommit) {
    const body = await readJsonBody<ImportCommitRequest>(request);
    const stagedRaw = await readStagedImport<StagedImport>(env, body.uploadToken);
    if (!stagedRaw) {
      throw new ApiException(410, "UPLOAD_EXPIRED", "This import preview has expired. Please re-upload the file.");
    }
    const staged = stagedRaw;

    const existingItems = await getAllListItems<SPReviewFields>(env, "Reviews");
    const existingIndex = buildExistingKeyIndex(existingItems.map(spItemToReview));

    // Never commit rows that failed preview validation, regardless of the
    // duplicate action selected by the client.
    let rowsToImport = staged.rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => validateReviewRow(row).length === 0);

    if (body.duplicateAction === "skip") {
      rowsToImport = rowsToImport.filter(({ row }) => !existingIndex.has(duplicateKey(row as Review)));
    } else if (body.duplicateAction === "selected") {
      const selected = new Set(body.selectedRowIndexes || []);
      rowsToImport = rowsToImport.filter(({ idx }) => selected.has(idx));
    }
    let replacedCount = 0;

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
    const spFieldsArray: Partial<SPReviewFields>[] = rowsToImport.map(({ row }, i2) => {
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
        status: row.status || "Action Plan Required",
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

    const batchResult = await batchCreateListItems<SPReviewFields>(env, "Reviews", spFieldsArray);

    // Create replacements first and only remove the old item when its new
    // counterpart succeeded, avoiding data loss on a partial Graph failure.
    if (body.duplicateAction === "replace") {
      const failedIndexes = new Set(batchResult.failed.map((failure) => failure.index));
      const { deleteListItem } = await import("../../_lib/googleData");
      const oldRowIds: string[] = [];
      for (let index = 0; index < rowsToImport.length; index++) {
        if (failedIndexes.has(index)) continue;
        const existing = existingIndex.get(duplicateKey(rowsToImport[index].row as Review));
        if (existing) {
          oldRowIds.push(existing.id);
          replacedCount++;
        }
      }
      // Sheet row numbers shift after a deletion, so delete bottom-up.
      for (const rowId of oldRowIds.sort((a, b) => Number(b) - Number(a))) {
        await deleteListItem(env, "Reviews", rowId);
      }
    }

    await deleteStagedImport(env, body.uploadToken);

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
  const brandHint = String(formData.get("brand") || "");
  const outletCodeHint = String(formData.get("outletCode") || "");

  if (!(file instanceof File)) {
    throw new ApiException(400, "NO_FILE", "No file was uploaded.");
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    throw new ApiException(400, "UNSUPPORTED_FILE_TYPE", "Only .csv, .json, .xlsx, and .xls files are supported.");
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 4 * 1024 * 1024) {
    throw new ApiException(413, "FILE_TOO_LARGE", "Import files must be 4 MB or smaller.");
  }

  let parsedRows: Partial<Review>[];
  try {
    parsedRows = parseUploadedFile(fileType, file.name, buffer, outletHint);
    const parsedIdentities = new Set(
      parsedRows.map((row) => `${row.brand || ""}|${row.outletCode || ""}|${row.outlet || ""}`)
    );
    const isMixedOutletFile = parsedIdentities.size > 1;
    parsedRows = parsedRows.map((row) => ({ ...row, ...resolveOutletIdentity({
      // The outlet selected in the upload form is an explicit management
      // choice and must win over an ambiguous name inferred from the file
      // for a single-outlet file. Mixed-outlet workbooks retain each row's
      // own identity instead.
      brand: isMixedOutletFile ? row.brand : brandHint || row.brand,
      outletCode: isMixedOutletFile ? row.outletCode : outletCodeHint || row.outletCode,
      outlet: row.outlet || outletHint,
      reviewId: row.reviewId,
    }) }));
  } catch (err) {
    throw new ApiException(400, "PARSE_ERROR", err instanceof Error ? err.message : "Failed to parse file.");
  }

  if (parsedRows.length === 0) {
    throw new ApiException(400, "EMPTY_FILE", "No rows could be parsed from this file. Check the column headers.");
  }

  const existingItems = await getAllListItems<SPReviewFields>(env, "Reviews");
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

  const stagedBrands = new Set(parsedRows.map((row) => row.brand).filter(Boolean));
  const stagedOutlets = new Set(parsedRows.map((row) => row.outlet).filter(Boolean));
  const stagedIdentity = stagedBrands.size > 1 || stagedOutlets.size > 1
    ? { brand: "Multiple Brands", outletCode: "", outlet: "Multiple Outlets" }
    : resolveOutletIdentity({ brand: brandHint, outletCode: outletCodeHint, outlet: outletHint });
  const staged: StagedImport = {
    fileName: file.name,
    fileType,
    brand: stagedIdentity.brand,
    outletCode: stagedIdentity.outletCode,
    outlet: stagedIdentity.outlet || parsedRows[0]?.outlet || "Unspecified",
    contentBase64: arrayBufferToBase64(buffer),
    contentType: file.type || "application/octet-stream",
    rows: parsedRows,
  };

  const uploadToken = await stageImport(env, staged, STAGE_TTL_SECONDS);

  const result: ImportPreviewResult = {
    fileName: file.name,
    brand: staged.brand,
    outletCode: staged.outletCode,
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
