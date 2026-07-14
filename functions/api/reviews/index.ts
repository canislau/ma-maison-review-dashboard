// GET /api/reviews — list reviews with server-side filtering, search, sorting, pagination

import { withAuth } from "../../_lib/http";
import { jsonResponse } from "../../_lib/http";
import { getAllListItems } from "../../_lib/sharepoint";
import { spItemToReview } from "../../_lib/fieldMapping";
import { isConcernReview, isOverdue } from "../../_lib/dashboardCalculations";
import type { SPReviewFields } from "../../_lib/types";
import type { Review, PaginatedResult } from "../../../src/types";

export const onRequest = withAuth(async ({ request, env }) => {
  const url = new URL(request.url);
  const q = url.searchParams;

  const page = Math.max(1, parseInt(q.get("page") || "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(q.get("pageSize") || "50", 10)));

  const items = await getAllListItems<SPReviewFields>(env, env.REVIEWS_LIST_ID, {
    orderBy: "fields/ReviewDate desc",
  });
  let reviews: Review[] = items.map(spItemToReview);

  const outlet = q.get("outlet");
  const month = q.get("month");
  const dateFrom = q.get("dateFrom");
  const dateTo = q.get("dateTo");
  const rating = q.get("rating");
  const category = q.get("category");
  const severity = q.get("severity");
  const status = q.get("status");
  const responsiblePerson = q.get("responsiblePerson");
  const search = q.get("search")?.toLowerCase().trim();
  const concernOnly = q.get("concernOnly") === "true";
  const overdueOnly = q.get("overdueOnly") === "true";

  if (outlet && outlet !== "All") reviews = reviews.filter((r) => r.outlet === outlet);
  if (month) reviews = reviews.filter((r) => r.reviewDate?.slice(0, 7) === month);
  if (dateFrom) reviews = reviews.filter((r) => new Date(r.reviewDate) >= new Date(dateFrom));
  if (dateTo) reviews = reviews.filter((r) => new Date(r.reviewDate) <= new Date(dateTo));
  if (rating) reviews = reviews.filter((r) => r.starRating === parseInt(rating, 10));
  if (category) reviews = reviews.filter((r) => r.category === category);
  if (severity) reviews = reviews.filter((r) => r.severity === severity);
  if (status) reviews = reviews.filter((r) => r.status === status);
  if (responsiblePerson) reviews = reviews.filter((r) => r.responsiblePerson === responsiblePerson);
  if (concernOnly) reviews = reviews.filter(isConcernReview);
  if (overdueOnly) reviews = reviews.filter((r) => isOverdue(r.recommendedTimeline, r.status));

  if (search) {
    reviews = reviews.filter(
      (r) =>
        r.reviewer.toLowerCase().includes(search) ||
        r.originalReview.toLowerCase().includes(search) ||
        r.englishTranslation.toLowerCase().includes(search) ||
        r.reviewId.toLowerCase().includes(search)
    );
  }

  const sortBy = q.get("sortBy") || "reviewDate";
  const sortDir = q.get("sortDir") || "desc";
  reviews.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "starRating") cmp = a.starRating - b.starRating;
    else cmp = new Date(a.reviewDate).getTime() - new Date(b.reviewDate).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = reviews.length;
  const start = (page - 1) * pageSize;
  const pageItems = reviews.slice(start, start + pageSize);

  const result: PaginatedResult<Review> = {
    items: pageItems,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };

  return jsonResponse(result, env);
});
