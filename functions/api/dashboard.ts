// GET /api/dashboard — powers the Overview tab: KPIs, trends, and the three
// Monthly Summary sections, filtered by outlet/month/date-range.

import { withAuth, jsonResponse } from "../_lib/http";
import { getAllListItems } from "../_lib/googleData";
import { spItemToReview } from "../_lib/fieldMapping";
import {
  filterReviews,
  computeReviewPerformance,
  computeComplaintAnalysis,
  computeActionProgress,
  computeTrends,
  monthKeyFromDate,
} from "../_lib/dashboardCalculations";
import type { SPReviewFields } from "../_lib/types";
import type { Review, DashboardData, DashboardFilters } from "../../src/types";

export const onRequest = withAuth(async ({ request, env }) => {
  const url = new URL(request.url);
  const q = url.searchParams;

  const filters: DashboardFilters = {
    outlet: q.get("outlet") || "All",
    month: q.get("month") || undefined,
    dateFrom: q.get("dateFrom") || undefined,
    dateTo: q.get("dateTo") || undefined,
  };

  // Default view per spec: current month, all outlets, when no filters given.
  if (!filters.month && !filters.dateFrom && !filters.dateTo) {
    filters.month = monthKeyFromDate(new Date().toISOString());
  }

  const items = await getAllListItems<SPReviewFields>(env, "Reviews");
  const allReviews: Review[] = items.map(spItemToReview);

  const filtered = filterReviews(allReviews, filters);
  const outlets = Array.from(new Set(allReviews.map((r) => r.outlet))).filter(Boolean).sort();

  const data: DashboardData = {
    filters,
    performance: computeReviewPerformance(filtered),
    complaints: computeComplaintAnalysis(filtered, filterReviews(allReviews, { month: filters.month })),
    actionProgress: computeActionProgress(filtered),
    ...computeTrends(allReviews, 12),
    outlets,
  };

  return jsonResponse(data, env);
});
