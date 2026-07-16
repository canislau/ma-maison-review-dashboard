// ============================================================================
// Field mapping: SharePoint List columns <-> application types
//
// IMPORTANT: The internal (programmatic) names of SharePoint columns are
// often NOT identical to their display names, especially for columns with
// spaces (e.g. "Review Date" -> internal name may become "Review_x0020_Date"
// unless you set the internal name explicitly when creating the column).
//
// This file assumes you created the columns with these internal names
// (recommended when setting up the list — see SharePoint setup instructions
// in README.md). If your actual internal names differ, this is the ONLY
// file you need to edit — every API route goes through these two functions.
// ============================================================================

import type { Review, ActionTrackerItem, Category, Severity, ReviewStatus } from "../../src/types";
import type { GraphListItem, SPReviewFields, SPActionTrackerFields } from "./types";

function mapStoredStatus(value?: string): ReviewStatus {
  switch ((value || "").trim().toLowerCase()) {
    case "done":
    case "resolved":
    case "closed":
      return "Done";
    case "working in progress":
    case "in progress":
    case "under review":
      return "Working in Progress";
    case "action plan executed":
    case "action plan excueted":
      return "Action Plan Executed";
    case "action plan required":
    case "action required":
    case "new":
    default:
      return "Action Plan Required";
  }
}

export function spItemToReview(item: GraphListItem<SPReviewFields>): Review {
  const f = item.fields;
  return {
    id: item.id,
    reviewId: f.ReviewID || f.Title || item.id,
    outlet: f.Outlet || "",
    reviewer: f.Reviewer || "",
    reviewDate: f.ReviewDate ? f.ReviewDate.slice(0, 10) : "",
    starRating: (Number(f.StarRating) || 5) as Review["starRating"],
    originalReview: f.OriginalReview || "",
    englishTranslation: f.EnglishTranslation || "",
    managementReply: f.ManagementReply || "",
    draftReply: f.DraftReply || "",
    category: (f.Category as Category) || "Others",
    severity: (f.Severity as Severity) || "Low",
    possibleRootCause: f.PossibleRootCause || "",
    responsiblePerson: f.ResponsiblePerson || "",
    salesRecovery: f.SalesRecovery || "",
    actionPlan: f.ActionPlan || "",
    recommendedTimeline: f.RecommendedTimeline || "",
    status: mapStoredStatus(f.Status),
    language: f.Language || "",
    sourceFile: f.SourceFile || "",
    sourceFileUrl: f.SourceFileURL || undefined,
    createdAt: f.Created,
    modifiedAt: f.Modified,
  };
}

export function reviewToSpFields(review: Partial<Review>): Partial<SPReviewFields> {
  const f: Partial<SPReviewFields> = {};
  if (review.reviewId !== undefined) {
    f.Title = review.reviewId;
    f.ReviewID = review.reviewId;
  }
  if (review.outlet !== undefined) f.Outlet = review.outlet;
  if (review.reviewer !== undefined) f.Reviewer = review.reviewer;
  if (review.reviewDate !== undefined) f.ReviewDate = review.reviewDate.slice(0, 10);
  if (review.starRating !== undefined) f.StarRating = review.starRating;
  if (review.originalReview !== undefined) f.OriginalReview = review.originalReview;
  if (review.englishTranslation !== undefined) f.EnglishTranslation = review.englishTranslation;
  if (review.managementReply !== undefined) f.ManagementReply = review.managementReply;
  if (review.draftReply !== undefined) f.DraftReply = review.draftReply;
  if (review.category !== undefined) f.Category = review.category;
  if (review.severity !== undefined) f.Severity = review.severity;
  if (review.possibleRootCause !== undefined) f.PossibleRootCause = review.possibleRootCause;
  if (review.responsiblePerson !== undefined) f.ResponsiblePerson = review.responsiblePerson;
  if (review.salesRecovery !== undefined) f.SalesRecovery = review.salesRecovery;
  if (review.actionPlan !== undefined) f.ActionPlan = review.actionPlan;
  if (review.recommendedTimeline !== undefined) f.RecommendedTimeline = review.recommendedTimeline;
  if (review.status !== undefined) f.Status = review.status;
  if (review.language !== undefined) f.Language = review.language;
  if (review.sourceFile !== undefined) f.SourceFile = review.sourceFile;
  if (review.sourceFileUrl !== undefined) f.SourceFileURL = review.sourceFileUrl;
  return f;
}

export function spItemToActionTracker(item: GraphListItem<SPActionTrackerFields>): ActionTrackerItem {
  const f = item.fields;
  return {
    id: item.id,
    actionId: f.ActionID || f.Title || item.id,
    reviewId: f.ReviewID || "",
    outlet: f.Outlet || "",
    responsiblePerson: f.ResponsiblePerson || "",
    actionPlan: f.ActionPlan || "",
    recommendedTimeline: f.RecommendedTimeline || "",
    status: mapStoredStatus(f.Status),
    completionDate: f.CompletionDate || undefined,
    remarks: f.Remarks || "",
  };
}

export function actionTrackerToSpFields(item: Partial<ActionTrackerItem>): Partial<SPActionTrackerFields> {
  const f: Partial<SPActionTrackerFields> = {};
  if (item.actionId !== undefined) {
    f.Title = item.actionId;
    f.ActionID = item.actionId;
  }
  if (item.reviewId !== undefined) f.ReviewID = item.reviewId;
  if (item.outlet !== undefined) f.Outlet = item.outlet;
  if (item.responsiblePerson !== undefined) f.ResponsiblePerson = item.responsiblePerson;
  if (item.actionPlan !== undefined) f.ActionPlan = item.actionPlan;
  if (item.recommendedTimeline !== undefined) f.RecommendedTimeline = item.recommendedTimeline;
  if (item.status !== undefined) f.Status = item.status;
  if (item.completionDate !== undefined) f.CompletionDate = item.completionDate;
  if (item.remarks !== undefined) f.Remarks = item.remarks;
  return f;
}
