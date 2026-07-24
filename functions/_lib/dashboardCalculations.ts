// ============================================================================
// Dashboard calculation engine
//
// Per spec: NO separate Monthly Summary SharePoint list, and NO stored
// Month/Year columns. Everything here is derived from Review.reviewDate at
// query time. These are pure functions over an in-memory Review[] so they're
// easy to unit test and reused by both /api/dashboard and /api/monthly-summary.
// ============================================================================

import type {
  Review,
  ActionTrackerItem,
  ReviewPerformanceSummary,
  ComplaintAnalysisSummary,
  ManagementActionProgressSummary,
  DashboardFilters,
} from "../../src/types";

export function monthKeyFromDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function filterReviews(reviews: Review[], filters: DashboardFilters): Review[] {
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : null;

  return reviews.filter((r) => {
    if (filters.brand && filters.brand !== "All" && r.brand !== filters.brand) return false;
    if (filters.outlet && filters.outlet !== "All" && r.outlet !== filters.outlet) return false;
    if (filters.month && monthKeyFromDate(r.reviewDate) !== filters.month) return false;
    if (from && new Date(r.reviewDate) < from) return false;
    if (to && new Date(r.reviewDate) > to) return false;
    return true;
  });
}

export function isConcernReview(r: Review): boolean {
  // All 1-star and 2-star reviews are always concerns.
  if (r.starRating <= 2) return true;
  // Complaint-containing 3-star reviews (has a root cause noted, or a category beyond default "Others").
  if (r.starRating === 3 && (r.possibleRootCause?.trim() || r.category !== "Others")) return true;
  // Any severity marked High/Critical is a concern regardless of star rating —
  // covers "4-5 star reviews containing a meaningful operational concern" per spec.
  if (r.severity === "High" || r.severity === "Critical") return true;
  // Reviews explicitly requiring management action, even without high severity yet assigned.
  if (r.status === "Action Plan Required") return true;
  return false;
}

export function isOverdue(recommendedTimeline: string, status: string): boolean {
  if (!recommendedTimeline) return false;
  if (status === "Done") return false;
  const d = new Date(recommendedTimeline);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// ----------------------------------------------------------------------------
// Monthly Summary 1: Review Performance
// ----------------------------------------------------------------------------

export function computeReviewPerformance(reviews: Review[]): ReviewPerformanceSummary {
  const total = reviews.length;
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (const r of reviews) {
    stars[r.starRating] = (stars[r.starRating] || 0) + 1;
    sum += r.starRating;
  }

  const positive = stars[4] + stars[5];
  const negative = stars[1] + stars[2];

  return {
    totalReviews: total,
    averageStarRating: total > 0 ? Math.round((sum / total) * 100) / 100 : 0,
    star1: stars[1],
    star2: stars[2],
    star3: stars[3],
    star4: stars[4],
    star5: stars[5],
    positiveCount: positive,
    negativeCount: negative,
    negativePercentage: total > 0 ? Math.round((negative / total) * 10000) / 100 : 0,
  };
}

// ----------------------------------------------------------------------------
// Monthly Summary 2: Complaint Analysis
// ----------------------------------------------------------------------------

export function computeComplaintAnalysis(reviews: Review[], allReviewsForOutletComparison: Review[]): ComplaintAnalysisSummary {
  const countByCategory: Record<string, number> = {};
  const rootCauseCounts: Record<string, number> = {};
  let highSeverity = 0;
  let critical = 0;

  for (const r of reviews) {
    countByCategory[r.category] = (countByCategory[r.category] || 0) + 1;
    if (r.possibleRootCause?.trim()) {
      const key = r.possibleRootCause.trim();
      rootCauseCounts[key] = (rootCauseCounts[key] || 0) + 1;
    }
    if (r.severity === "High") highSeverity++;
    if (r.severity === "Critical") critical++;
  }

  const total = reviews.length;
  const percentageByCategory: Record<string, number> = {};
  for (const [cat, count] of Object.entries(countByCategory)) {
    percentageByCategory[cat] = total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
  }

  const mostFrequentCategory =
    Object.entries(countByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mostFrequentRootCause =
    Object.entries(rootCauseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const repeatedThemes = Object.entries(rootCauseCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme, count]) => ({ theme, count }));

  const brandGroups = new Map<string, Review[]>();
  const outletGroups = new Map<string, Review[]>();
  for (const r of allReviewsForOutletComparison) {
    if (!brandGroups.has(r.brand)) brandGroups.set(r.brand, []);
    brandGroups.get(r.brand)!.push(r);
    const outletKey = `${r.brand}\u0000${r.outletCode}\u0000${r.outlet}`;
    if (!outletGroups.has(outletKey)) outletGroups.set(outletKey, []);
    outletGroups.get(outletKey)!.push(r);
  }
  const brandComparison = Array.from(brandGroups.entries()).map(([brand, rs]) => {
    const perf = computeReviewPerformance(rs);
    return { brand, totalReviews: perf.totalReviews, averageRating: perf.averageStarRating, negativePercentage: perf.negativePercentage };
  });
  const outletComparison = Array.from(outletGroups.values()).map((rs) => {
    const perf = computeReviewPerformance(rs);
    return {
      brand: rs[0].brand,
      outletCode: rs[0].outletCode,
      outlet: rs[0].outlet,
      totalReviews: perf.totalReviews,
      averageRating: perf.averageStarRating,
      negativePercentage: perf.negativePercentage,
    };
  });

  return {
    countByCategory,
    percentageByCategory,
    mostFrequentCategory,
    mostFrequentRootCause,
    highSeverityCount: highSeverity,
    criticalCount: critical,
    repeatedThemes,
    brandComparison,
    outletComparison,
  };
}

// ----------------------------------------------------------------------------
// Monthly Summary 3: Management Action Progress
// ----------------------------------------------------------------------------

export function computeActionProgress(reviews: Review[]): ManagementActionProgressSummary {
  const newCases = 0;
  let actionRequired = 0,
    inProgress = 0,
    resolved = 0,
    closed = 0,
    overdue = 0,
    noResponsible = 0,
    noActionPlan = 0;

  const resolutionDurationsMs: number[] = [];

  for (const r of reviews) {
    switch (r.status) {
      case "Action Plan Required":
        actionRequired++;
        break;
      case "Working in Progress":
        inProgress++;
        break;
      case "Action Plan Executed":
        resolved++;
        break;
      case "Done":
        closed++;
        break;
    }

    if (isOverdue(r.recommendedTimeline, r.status)) overdue++;
    if (!r.responsiblePerson?.trim() && (r.status === "Action Plan Required" || r.status === "Working in Progress")) noResponsible++;
    if (!r.actionPlan?.trim() && (r.status === "Action Plan Required" || r.status === "Working in Progress")) noActionPlan++;

    if (r.status === "Done" && r.reviewDate && r.modifiedAt) {
      const start = new Date(r.reviewDate).getTime();
      const end = new Date(r.modifiedAt).getTime();
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        resolutionDurationsMs.push(end - start);
      }
    }
  }

  const total = reviews.length;
  const resolvedOrClosed = resolved + closed;

  return {
    newCases,
    actionRequiredCases: actionRequired,
    inProgressCases: inProgress,
    resolvedCases: resolved,
    closedCases: closed,
    overdueActions: overdue,
    casesWithoutResponsiblePerson: noResponsible,
    casesWithoutActionPlan: noActionPlan,
    resolutionRate: total > 0 ? Math.round((resolvedOrClosed / total) * 10000) / 100 : 0,
    averageResolutionDays:
      resolutionDurationsMs.length > 0
        ? Math.round((resolutionDurationsMs.reduce((a, b) => a + b, 0) / resolutionDurationsMs.length / 86400000) * 10) / 10
        : null,
  };
}

// ----------------------------------------------------------------------------
// Trends (for Overview tab charts)
// ----------------------------------------------------------------------------

export function computeTrends(reviews: Review[], monthsBack = 12) {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const byMonth = new Map<string, Review[]>();
  for (const r of reviews) {
    const key = monthKeyFromDate(r.reviewDate);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(r);
  }

  const ratingTrend = months.map((m) => {
    const rs = byMonth.get(m) || [];
    const avg = rs.length > 0 ? rs.reduce((s, r) => s + r.starRating, 0) / rs.length : 0;
    return { month: m, averageRating: Math.round(avg * 100) / 100 };
  });

  const volumeTrend = months.map((m) => ({ month: m, count: (byMonth.get(m) || []).length }));

  const positiveNegativeTrend = months.map((m) => {
    const rs = byMonth.get(m) || [];
    return {
      month: m,
      positive: rs.filter((r) => r.starRating >= 4).length,
      negative: rs.filter((r) => r.starRating <= 2).length,
    };
  });

  return { ratingTrend, volumeTrend, positiveNegativeTrend };
}

export function computeOverdueFromActions(actions: ActionTrackerItem[]): number {
  return actions.filter((a) => isOverdue(a.recommendedTimeline, a.status)).length;
}
