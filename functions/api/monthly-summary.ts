// GET /api/monthly-summary?month=YYYY-MM&outlet=...
// Returns the three Monthly Summary sections for a specific month/outlet,
// independent of the broader dashboard trends. Useful for a focused report
// view or for exporting a single month's summary.

import { withAuth, jsonResponse } from "../_lib/http";
import { ApiException } from "../_lib/types";
import { getAllListItems } from "../_lib/googleData";
import { spItemToReview } from "../_lib/fieldMapping";
import {
  filterReviews,
  computeReviewPerformance,
  computeComplaintAnalysis,
  computeActionProgress,
} from "../_lib/dashboardCalculations";
import type { SPReviewFields } from "../_lib/types";
import type { Review } from "../../src/types";

export const onRequest = withAuth(async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const outlet = url.searchParams.get("outlet") || "All";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new ApiException(400, "INVALID_MONTH", "Query parameter 'month' must be in YYYY-MM format.");
  }

  const items = await getAllListItems<SPReviewFields>(env, "Reviews");
  const allReviews: Review[] = items.map(spItemToReview);

  const filtered = filterReviews(allReviews, { outlet, month });
  const monthOnlyAllOutlets = filterReviews(allReviews, { month });

  return jsonResponse(
    {
      month,
      outlet,
      reviewPerformance: computeReviewPerformance(filtered),
      complaintAnalysis: computeComplaintAnalysis(filtered, monthOnlyAllOutlets),
      managementActionProgress: computeActionProgress(filtered),
    },
    env
  );
});
