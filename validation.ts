// ============================================================================
// Validation logic for review records (used during import preview and edits)
// ============================================================================

import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../../src/types";
import type { Review } from "../../src/types";

export function validateReviewRow(row: Partial<Review>): string[] {
  const errors: string[] = [];

  if (!row.outlet || !row.outlet.trim()) errors.push("Outlet is required.");
  if (!row.reviewer || !row.reviewer.trim()) errors.push("Reviewer is required.");
  if (!row.originalReview || !row.originalReview.trim()) errors.push("Original Review is required.");

  if (!row.reviewDate || isNaN(Date.parse(row.reviewDate))) {
    errors.push("Review Date is missing or not a valid date.");
  } else {
    const parsed = new Date(row.reviewDate);
    const now = new Date();
    if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      errors.push("Review Date is in the future.");
    }
  }

  if (row.starRating === undefined || row.starRating === null) {
    errors.push("Star Rating is required.");
  } else if (![1, 2, 3, 4, 5].includes(Number(row.starRating))) {
    errors.push("Star Rating must be between 1 and 5.");
  }

  if (row.category && !CATEGORY_OPTIONS.includes(row.category)) {
    errors.push(`Category "${row.category}" is not a recognised option.`);
  }
  if (row.severity && !SEVERITY_OPTIONS.includes(row.severity)) {
    errors.push(`Severity "${row.severity}" is not a recognised option.`);
  }
  if (row.status && !STATUS_OPTIONS.includes(row.status)) {
    errors.push(`Status "${row.status}" is not a recognised option.`);
  }

  return errors;
}

/** Normalises common outlet-name variants to a canonical form. */
const OUTLET_ALIASES: Record<string, string> = {
  "the gardens": "Kintsugi @ The Gardens",
  "kintsugi gardens": "Kintsugi @ The Gardens",
  "one utama": "Way Modern Chinois @ One Utama",
  "1u": "Way Modern Chinois @ One Utama",
  "sunway velocity": "Ramen Takahashi @ Sunway Velocity",
};

export function standardiseOutletName(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return OUTLET_ALIASES[lower] || trimmed;
}

/** Attempts to parse a variety of common date formats into ISO 8601. */
export function standardiseReviewDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (Malaysia convention) when
  // the first segment is > 12.
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const first = parseInt(a, 10);
    const second = parseInt(b, 10);
    const day = first > 12 ? first : second > 12 ? second : first; // default DD/MM/YYYY
    const month = first > 12 ? second : second > 12 ? first : second;
    const d = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const generic = new Date(trimmed);
  return isNaN(generic.getTime()) ? null : generic.toISOString();
}
