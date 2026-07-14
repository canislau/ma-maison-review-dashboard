// GET /api/export?format=csv|xlsx&outlet=...&month=...&status=...&...
// Exports the currently filtered review set (Concern Reviews or All Reviews
// tab) as a downloadable CSV or XLSX file, applying the same filters as
// GET /api/reviews so "export what I'm looking at" works correctly.

import * as XLSX from "xlsx";
import { withAuth } from "../_lib/http";
import { corsHeaders } from "../_lib/http";
import { ApiException } from "../_lib/types";
import { getAllListItems } from "../_lib/sharepoint";
import { spItemToReview } from "../_lib/fieldMapping";
import { isConcernReview, isOverdue } from "../_lib/dashboardCalculations";
import type { SPReviewFields } from "../_lib/types";
import type { Review } from "../../src/types";

const EXPORT_COLUMNS: { key: keyof Review; header: string }[] = [
  { key: "reviewId", header: "Review ID" },
  { key: "outlet", header: "Outlet" },
  { key: "reviewer", header: "Reviewer" },
  { key: "reviewDate", header: "Review Date" },
  { key: "starRating", header: "Star Rating" },
  { key: "originalReview", header: "Original Review" },
  { key: "englishTranslation", header: "English Translation" },
  { key: "managementReply", header: "Management Reply" },
  { key: "draftReply", header: "Draft Reply" },
  { key: "category", header: "Category" },
  { key: "severity", header: "Severity" },
  { key: "possibleRootCause", header: "Possible Root Cause" },
  { key: "responsiblePerson", header: "Responsible Person" },
  { key: "salesRecovery", header: "Sales Recovery" },
  { key: "actionPlan", header: "Action Plan" },
  { key: "recommendedTimeline", header: "Recommended Timeline" },
  { key: "status", header: "Status" },
  { key: "language", header: "Language" },
  { key: "sourceFile", header: "Source File" },
];

function toCsvValue(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const onRequest = withAuth(async ({ request, env }) => {
  const url = new URL(request.url);
  const q = url.searchParams;
  const format = (q.get("format") || "csv").toLowerCase();

  if (format !== "csv" && format !== "xlsx") {
    throw new ApiException(400, "INVALID_FORMAT", "format must be 'csv' or 'xlsx'.");
  }

  const items = await getAllListItems<SPReviewFields>(env, env.REVIEWS_LIST_ID);
  let reviews: Review[] = items.map(spItemToReview);

  const outlet = q.get("outlet");
  const month = q.get("month");
  const rating = q.get("rating");
  const category = q.get("category");
  const severity = q.get("severity");
  const status = q.get("status");
  const concernOnly = q.get("concernOnly") === "true";
  const overdueOnly = q.get("overdueOnly") === "true";

  if (outlet && outlet !== "All") reviews = reviews.filter((r) => r.outlet === outlet);
  if (month) reviews = reviews.filter((r) => r.reviewDate?.slice(0, 7) === month);
  if (rating) reviews = reviews.filter((r) => r.starRating === parseInt(rating, 10));
  if (category) reviews = reviews.filter((r) => r.category === category);
  if (severity) reviews = reviews.filter((r) => r.severity === severity);
  if (status) reviews = reviews.filter((r) => r.status === status);
  if (concernOnly) reviews = reviews.filter(isConcernReview);
  if (overdueOnly) reviews = reviews.filter((r) => isOverdue(r.recommendedTimeline, r.status));

  reviews.sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const headerRow = EXPORT_COLUMNS.map((c) => toCsvValue(c.header)).join(",");
    const dataRows = reviews.map((r) => EXPORT_COLUMNS.map((c) => toCsvValue(r[c.key])).join(","));
    const csv = [headerRow, ...dataRows].join("\r\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ma-maison-reviews-${timestamp}.csv"`,
        ...corsHeaders(env),
      },
    });
  }

  // xlsx
  const sheetData = [
    EXPORT_COLUMNS.map((c) => c.header),
    ...reviews.map((r) => EXPORT_COLUMNS.map((c) => r[c.key])),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reviews");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ma-maison-reviews-${timestamp}.xlsx"`,
      ...corsHeaders(env),
    },
  });
});
