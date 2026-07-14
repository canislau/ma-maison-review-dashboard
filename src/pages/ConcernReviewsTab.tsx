import { useEffect, useState, useCallback } from "react";
import { api, ApiClientError, downloadExport } from "../lib/apiClient";
import type { Review, ReviewListQuery } from "../types";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../types";
import { FilterBar, SelectFilter, SearchFilter, MonthPicker } from "../components/FilterBar";
import { SeverityBadge, StatusBadge, StarRating, OverdueBadge } from "../components/Badges";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import Pagination from "../components/Pagination";
import ReviewDetailPanel from "../components/ReviewDetailPanel";
import { useUserRole, canEditReviews } from "../hooks/useUserRole";

function isOverdueClientSide(recommendedTimeline: string, status: string): boolean {
  if (!recommendedTimeline || status === "Resolved" || status === "Closed") return false;
  const d = new Date(recommendedTimeline);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

export default function ConcernReviewsTab() {
  const { role } = useUserRole();
  const editable = canEditReviews(role);

  const [outlets, setOutlets] = useState<string[]>([]);
  const [responsiblePersons, setResponsiblePersons] = useState<string[]>([]);
  const [query, setQuery] = useState<ReviewListQuery>({ page: 1, pageSize: 25, concernOnly: true });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Review | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, outletsRes] = await Promise.all([api.reviews.list(query), api.outlets.list()]);
      setReviews(result.items);
      setTotal(result.total);
      setOutlets(outletsRes.outlets);
      setResponsiblePersons(
        Array.from(new Set(result.items.map((r) => r.responsiblePerson).filter(Boolean))).sort()
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load concern reviews.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  function updateQuery(patch: Partial<ReviewListQuery>) {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    try {
      await downloadExport(format, { ...query, concernOnly: true });
    } finally {
      setExporting(false);
    }
  }

  function handleSaved(updated: Review) {
    setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(updated);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Concern Reviews</h2>
          <p className="text-sm text-ink-muted">Low ratings, high severity, and reviews requiring management action.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => handleExport("csv")} disabled={exporting}>
            Export CSV
          </button>
          <button className="btn-secondary" onClick={() => handleExport("xlsx")} disabled={exporting}>
            Export Excel
          </button>
        </div>
      </div>

      <FilterBar>
        <SearchFilter value={query.search || ""} onChange={(v) => updateQuery({ search: v })} />
        <SelectFilter label="All Outlets" value={query.outlet || ""} onChange={(v) => updateQuery({ outlet: v })} options={outlets.map((o) => ({ value: o, label: o }))} />
        <MonthPicker value={query.month || ""} onChange={(v) => updateQuery({ month: v })} />
        <SelectFilter
          label="All Ratings"
          value={query.rating ? String(query.rating) : ""}
          onChange={(v) => updateQuery({ rating: v ? Number(v) : undefined })}
          options={[5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} Star` }))}
        />
        <SelectFilter label="All Categories" value={query.category || ""} onChange={(v) => updateQuery({ category: (v || undefined) as never })} options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))} />
        <SelectFilter label="All Severities" value={query.severity || ""} onChange={(v) => updateQuery({ severity: (v || undefined) as never })} options={SEVERITY_OPTIONS.map((s) => ({ value: s, label: s }))} />
        <SelectFilter label="All Owners" value={query.responsiblePerson || ""} onChange={(v) => updateQuery({ responsiblePerson: v || undefined })} options={responsiblePersons.map((p) => ({ value: p, label: p }))} />
        <SelectFilter label="All Statuses" value={query.status || ""} onChange={(v) => updateQuery({ status: (v || undefined) as never })} options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          <input type="checkbox" checked={Boolean(query.overdueOnly)} onChange={(e) => updateQuery({ overdueOnly: e.target.checked })} />
          Overdue only
        </label>
      </FilterBar>

      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reviews.length === 0 ? (
          <EmptyState title="No concern reviews found" description="Try adjusting your filters." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reviewer</th>
                <th>Outlet</th>
                <th>Date</th>
                <th>Rating</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Owner</th>
                <th>Timeline</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="hover:bg-section cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="font-medium">{r.reviewer}</td>
                  <td>{r.outlet}</td>
                  <td className="whitespace-nowrap">{new Date(r.reviewDate).toLocaleDateString()}</td>
                  <td><StarRating value={r.starRating} /></td>
                  <td>{r.category}</td>
                  <td><SeverityBadge severity={r.severity} /></td>
                  <td>{r.responsiblePerson || <span className="text-ink-muted">Unassigned</span>}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {r.recommendedTimeline ? new Date(r.recommendedTimeline).toLocaleDateString() : "—"}
                      {isOverdueClientSide(r.recommendedTimeline, r.status) && <OverdueBadge />}
                    </div>
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && reviews.length > 0 && (
        <Pagination page={query.page || 1} pageSize={query.pageSize || 25} total={total} onPageChange={(p) => setQuery((q) => ({ ...q, page: p }))} />
      )}

      {selected && (
        <ReviewDetailPanel review={selected} editable={editable} onClose={() => setSelected(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
