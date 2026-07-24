// ============================================================================
// File parsers: CSV, JSON, XLSX -> Partial<Review>[]
//
// All parsers accept flexible column/key naming (case-insensitive, spaces or
// underscores) since real-world exports from Google review scrapers, POS
// systems, and manual spreadsheets rarely match our internal names exactly.
// ============================================================================

import * as XLSX from "xlsx";
import type { Review } from "../../src/types";
import { standardiseReviewDate } from "./validation";
import { resolveOutletIdentity } from "../../src/data/outletDirectory";

// Maps flexible/lowercased header variants to our canonical Review keys.
const HEADER_ALIASES: Record<string, keyof Review> = {
  reviewid: "reviewId",
  "review id": "reviewId",
  outlet: "outlet",
  brand: "brand",
  outletcode: "outletCode",
  "outlet code": "outletCode",
  code: "outletCode",
  branch: "outlet",
  store: "outlet",
  reviewer: "reviewer",
  name: "reviewer",
  customer: "reviewer",
  reviewdate: "reviewDate",
  "review date": "reviewDate",
  date: "reviewDate",
  starrating: "starRating",
  "star rating": "starRating",
  rating: "starRating",
  stars: "starRating",
  originalreview: "originalReview",
  "original review": "originalReview",
  review: "originalReview",
  comment: "originalReview",
  content: "originalReview",
  englishtranslation: "englishTranslation",
  "english translation": "englishTranslation",
  translation: "englishTranslation",
  managementreply: "managementReply",
  "management reply": "managementReply",
  reply: "managementReply",
  draftreply: "draftReply",
  "draft reply": "draftReply",
  category: "category",
  severity: "severity",
  possiblerootcause: "possibleRootCause",
  "possible root cause": "possibleRootCause",
  rootcause: "possibleRootCause",
  responsibleperson: "responsiblePerson",
  "responsible person": "responsiblePerson",
  owner: "responsiblePerson",
  salesrecovery: "salesRecovery",
  "sales recovery": "salesRecovery",
  actionplan: "actionPlan",
  "action plan": "actionPlan",
  recommendedtimeline: "recommendedTimeline",
  "recommended timeline": "recommendedTimeline",
  timeline: "recommendedTimeline",
  status: "status",
  language: "language",
};

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function standardiseStatus(raw: string): Review["status"] | string {
  const trimmed = raw.trim();
  const normalised = trimmed
    .toLowerCase()
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/\s+/g, " ");

  if (
    normalised === "not replied - requires action" ||
    normalised === "not replied - require action" ||
    normalised === "new" ||
    normalised === "action required" ||
    normalised === "action plan required"
  ) return "Action Plan Required";
  if (normalised === "under review" || normalised === "in progress" || normalised === "working in progress") {
    return "Working in Progress";
  }
  if (normalised === "action plan executed" || normalised === "action plan excueted") return "Action Plan Executed";
  if (normalised === "resolved" || normalised === "closed" || normalised === "done") return "Done";

  return trimmed;
}

function mapRowToReview(rawRow: Record<string, unknown>, outletHint?: string): Partial<Review> {
  const row: Partial<Review> = {};

  for (const [rawKey, value] of Object.entries(rawRow)) {
    const key = HEADER_ALIASES[normaliseHeader(rawKey)];
    if (!key) continue;
    if (value === undefined || value === null || value === "") continue;

    if (key === "starRating") {
      const n = typeof value === "number" ? value : parseInt(String(value).replace(/[^\d]/g, ""), 10);
      if (!isNaN(n)) row.starRating = Math.min(5, Math.max(1, n)) as Review["starRating"];
      continue;
    }

    if (key === "reviewDate") {
      const iso = standardiseReviewDate(String(value));
      if (iso) row.reviewDate = iso;
      continue;
    }

    if (key === "outlet") {
      // Preserve the source text until the final identity pass. Branded
      // values such as "Kintsugi - The Gardens Mall" must not be reduced to
      // the shared location name before the brand is resolved.
      row.outlet = String(value).trim();
      continue;
    }

    if (key === "status") {
      row.status = standardiseStatus(String(value)) as Review["status"];
      continue;
    }

    (row as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() : value;
  }

  if (!row.outlet && outletHint) {
    row.outlet = outletHint.trim();
  }
  const identity = resolveOutletIdentity(row);
  row.brand = identity.brand;
  row.outletCode = identity.outletCode;
  row.outlet = identity.outlet;

  return row;
}

export function parseCsv(text: string, outletHint?: string): Partial<Review>[] {
  // Lightweight RFC4180-ish CSV parser (handles quoted fields with commas/newlines).
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  return dataRows.map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return mapRowToReview(obj, outletHint);
  });
}

export function parseJson(text: string, outletHint?: string): Partial<Review>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }

  const arr: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : typeof data === "object" && data !== null && Array.isArray((data as { reviews?: unknown }).reviews)
    ? ((data as { reviews: Record<string, unknown>[] }).reviews)
    : [];

  return arr.map((r) => mapRowToReview(r, outletHint));
}

export function parseXlsx(buffer: ArrayBuffer, outletHint?: string): Partial<Review>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((r) => {
    // Excel cellDates gives JS Date objects for date-formatted cells.
    const normalised: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      normalised[k] = v instanceof Date ? v.toISOString() : v;
    }
    return mapRowToReview(normalised, outletHint);
  });
}

export function parseUploadedFile(
  fileType: "csv" | "json" | "xlsx",
  fileName: string,
  content: ArrayBuffer,
  outletHint?: string
): Partial<Review>[] {
  if (fileType === "csv") {
    return parseCsv(new TextDecoder("utf-8").decode(content), outletHint);
  }
  if (fileType === "json") {
    return parseJson(new TextDecoder("utf-8").decode(content), outletHint);
  }
  return parseXlsx(content, outletHint);
}

export function detectFileType(fileName: string): "csv" | "json" | "xlsx" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}
