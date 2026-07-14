// GET /api/outlets — distinct outlet names present in the Reviews list.
// Derived from data (not hardcoded) so new outlets appear automatically
// once their first review is imported.

import { withAuth, jsonResponse } from "../_lib/http";
import { getAllListItems } from "../_lib/googleData";
import { spItemToReview } from "../_lib/fieldMapping";
import type { SPReviewFields } from "../_lib/types";

export const onRequest = withAuth(async ({ env }) => {
  const items = await getAllListItems<SPReviewFields>(env, "Reviews");
  const outlets = Array.from(new Set(items.map((i) => spItemToReview(i).outlet))).filter(Boolean).sort();
  return jsonResponse({ outlets }, env);
});
