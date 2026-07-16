// ============================================================================
// Ma Maison Review Management Dashboard — Shared Types
// Used by both frontend (src/) and backend (functions/)
// ============================================================================

export type Category =
  | "Food Quality"
  | "Taste"
  | "Food Temperature"
  | "Portion Size"
  | "Price and Value"
  | "Service"
  | "Staff Attitude"
  | "Waiting Time"
  | "Order Accuracy"
  | "Product Availability"
  | "Cleanliness"
  | "Restaurant Environment"
  | "Queue Management"
  | "Payment"
  | "Delivery or Takeaway"
  | "Others";

export const CATEGORY_OPTIONS: Category[] = [
  "Food Quality",
  "Taste",
  "Food Temperature",
  "Portion Size",
  "Price and Value",
  "Service",
  "Staff Attitude",
  "Waiting Time",
  "Order Accuracy",
  "Product Availability",
  "Cleanliness",
  "Restaurant Environment",
  "Queue Management",
  "Payment",
  "Delivery or Takeaway",
  "Others",
];

export type Severity = "Low" | "Medium" | "High" | "Critical";
export const SEVERITY_OPTIONS: Severity[] = ["Low", "Medium", "High", "Critical"];

export type ReviewStatus =
  | "Done"
  | "Working in Progress"
  | "Action Plan Executed"
  | "Action Plan Required";

export const STATUS_OPTIONS: ReviewStatus[] = [
  "Done",
  "Working in Progress",
  "Action Plan Executed",
  "Action Plan Required",
];

export type UserRole = "Viewer" | "Manager" | "Administrator";

/** Maps 1:1 to a row in the Google Sheets "Reviews" tab. */
export interface Review {
  id: string; // stable row identifier
  reviewId: string; // Review ID (business key, e.g. MM003-2026-07-0001)
  outlet: string;
  reviewer: string;
  reviewDate: string; // ISO 8601 date
  starRating: 1 | 2 | 3 | 4 | 5;
  originalReview: string;
  englishTranslation: string;
  managementReply: string;
  draftReply: string;
  category: Category;
  severity: Severity;
  possibleRootCause: string;
  responsiblePerson: string;
  salesRecovery: string;
  actionPlan: string;
  recommendedTimeline: string; // ISO 8601 date or free text
  status: ReviewStatus;
  language: string; // detected source language, e.g. "Chinese", "Malay", "English"
  sourceFile: string; // display name / link text back to the source file
  sourceFileUrl?: string; // resolved webUrl to the file in the Document Library
  createdAt?: string;
  modifiedAt?: string;
}

/** Fields a Viewer/Manager is permitted to edit inline (Concern Reviews tab). */
export type EditableReviewFields = Pick<
  Review,
  | "managementReply"
  | "draftReply"
  | "category"
  | "severity"
  | "possibleRootCause"
  | "responsiblePerson"
  | "salesRecovery"
  | "actionPlan"
  | "recommendedTimeline"
  | "status"
>;

/** Maps 1:1 to a row in the Google Sheets "ActionTracker" tab. */
export interface ActionTrackerItem {
  id: string;
  actionId: string;
  reviewId: string; // FK -> Review.reviewId
  outlet: string;
  responsiblePerson: string;
  actionPlan: string;
  recommendedTimeline: string;
  status: ReviewStatus;
  completionDate?: string;
  remarks: string;
}

// ----------------------------------------------------------------------------
// Import / upload types
// ----------------------------------------------------------------------------

export type ImportFileType = "csv" | "json" | "xlsx";

export interface ImportPreviewRow {
  rowIndex: number;
  parsed: Partial<Review>;
  isDuplicate: boolean;
  duplicateOf?: string; // existing Review ID it collides with
  errors: string[]; // validation errors (required field, bad date, bad rating, etc.)
}

export interface ImportPreviewResult {
  fileName: string;
  outlet: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  rows: ImportPreviewRow[];
  uploadToken: string; // opaque token referencing the staged parsed file server-side
}

export type DuplicateAction = "skip" | "replace" | "selected";

export interface ImportCommitRequest {
  uploadToken: string;
  duplicateAction: DuplicateAction;
  selectedRowIndexes?: number[]; // used when duplicateAction === "selected"
}

export interface ImportCommitResult {
  imported: number;
  skipped: number;
  replaced: number;
  failed: number;
  errors: { rowIndex: number; message: string }[];
  sourceFileUrl: string;
}

// ----------------------------------------------------------------------------
// Dashboard / summary types
// ----------------------------------------------------------------------------

export interface DashboardFilters {
  outlet?: string; // "All" or specific outlet name
  month?: string; // "YYYY-MM"
  dateFrom?: string;
  dateTo?: string;
}

export interface ReviewPerformanceSummary {
  totalReviews: number;
  averageStarRating: number;
  star1: number;
  star2: number;
  star3: number;
  star4: number;
  star5: number;
  positiveCount: number; // 4-5 star
  negativeCount: number; // 1-2 star
  negativePercentage: number;
}

export interface ComplaintAnalysisSummary {
  countByCategory: Record<string, number>;
  percentageByCategory: Record<string, number>;
  mostFrequentCategory: string | null;
  mostFrequentRootCause: string | null;
  highSeverityCount: number;
  criticalCount: number;
  repeatedThemes: { theme: string; count: number }[];
  outletComparison: { outlet: string; totalReviews: number; averageRating: number; negativePercentage: number }[];
}

export interface ManagementActionProgressSummary {
  newCases: number;
  actionRequiredCases: number;
  inProgressCases: number;
  resolvedCases: number;
  closedCases: number;
  overdueActions: number;
  casesWithoutResponsiblePerson: number;
  casesWithoutActionPlan: number;
  resolutionRate: number; // percentage
  averageResolutionDays: number | null;
}

export interface DashboardData {
  filters: DashboardFilters;
  performance: ReviewPerformanceSummary;
  complaints: ComplaintAnalysisSummary;
  actionProgress: ManagementActionProgressSummary;
  ratingTrend: { month: string; averageRating: number }[];
  volumeTrend: { month: string; count: number }[];
  positiveNegativeTrend: { month: string; positive: number; negative: number }[];
  outlets: string[];
}

// ----------------------------------------------------------------------------
// API envelope types
// ----------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ReviewListQuery {
  page?: number;
  pageSize?: number;
  outlet?: string;
  month?: string; // YYYY-MM
  dateFrom?: string;
  dateTo?: string;
  rating?: number;
  category?: Category;
  severity?: Severity;
  status?: ReviewStatus;
  responsiblePerson?: string;
  search?: string;
  concernOnly?: boolean;
  overdueOnly?: boolean;
  sortBy?: "reviewDate" | "starRating";
  sortDir?: "asc" | "desc";
}
