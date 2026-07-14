// ============================================================================
// Duplicate detection: Outlet + Reviewer + Review Date + Star Rating +
// Original Review (normalised) forms the duplicate key, per spec.
// ============================================================================

import type { Review } from "../../src/types";

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function duplicateKey(row: Pick<Review, "outlet" | "reviewer" | "reviewDate" | "starRating" | "originalReview">): string {
  const datePart = row.reviewDate ? row.reviewDate.slice(0, 10) : "";
  return [
    normalise(row.outlet || ""),
    normalise(row.reviewer || ""),
    datePart,
    String(row.starRating || ""),
    normalise((row.originalReview || "").slice(0, 200)), // cap to avoid huge key strings
  ].join("|");
}

export function buildExistingKeyIndex(existing: Review[]): Map<string, Review> {
  const map = new Map<string, Review>();
  for (const r of existing) {
    map.set(duplicateKey(r), r);
  }
  return map;
}
