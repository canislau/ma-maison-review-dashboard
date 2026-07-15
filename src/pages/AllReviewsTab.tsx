import { useEffect, useState, useCallback } from "react";
import { api, ApiClientError, downloadExport } from "../lib/apiClient";
import type { Review, ReviewListQuery } from "../types";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../types";
import { FilterBar, SelectFilter, SearchFilter, MonthPicker } from "../components/FilterBar";
import { SeverityBadge, StatusBadge, StarRating } from "../components/Badges";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import Pagination from "../components/Pagination";
import ReviewDetailPanel from "../components/ReviewDetailPanel";
import UploadModal from "../components/UploadModal";
import { useUserRole, canEditReviews, canImport } from "../hooks/useUserRole";

export default function AllReviewsTab() {
  const { role } = useUserRole();
  const editable = canEditReviews(role);
  const uploadAllowed = canImport(role);

  const [outlets, setOutlets] = useState<string[]>([]);
  const [query, setQuery] = useState<ReviewListQuery>({ page: 1, pageSize: 25, sortBy: "reviewDate", sortDir: "desc" });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Review | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, outletsRes] = await Promise.all([api.reviews.list(query), api.outlets.list()]);
      setReviews(result.items);
      setTotal(result.total);
      setOutlets(outletsRes.outlets);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load reviews.");
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
      await downloadExport(format, query);
    } finally {
      setExporting(false);
    }
  }

  function handleSaved(updated: Review) {
    setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(updated);
  }

  function handleSort(sortBy: "reviewDate" | "starRating") {
    setQuery((q) => ({
      ...q,
      sortBy,
      sortDir: q.sortBy === sortBy && q.sortDir === "desc" ? "asc" : "desc",
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-ink">All Reviews</h2>
          <p className="text-sm text-ink-muted">Every imported review across all outlets.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => handleExport("csv")} disabled={exporting}>
            Export CSV
          </button>
          <button className="btn-secondary" onClick={() => handleExport("xlsx")} disabled={exporting}>
            Export Excel
          </button>
          {uploadAllowed && (
            <button className="btn-primary" onClick={() => setShowUpload(true)}>
              Upload File
            </button>
          )}
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
        <SelectFilter label="All Statuses" value={query.status || ""} onChange={(v) => updateQuery({ status: (v || undefined) as never })} options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
      </FilterBar>

      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reviews.length === 0 ? (
          <EmptyState title="No reviews found" description="Try adjusting your filters or upload a review file." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reviewer</th>
                <th>Outlet</th>
                <th className="cursor-pointer select-none" onClick={() => handleSort("reviewDate")}>
                  Date {query.sortBy === "reviewDate" && (query.sortDir === "asc" ? "↑" : "↓")}
                </th>
                <th className="cursor-pointer select-none" onClick={() => handleSort("starRating")}>
                  Rating {query.sortBy === "starRating" && (query.sortDir === "asc" ? "↑" : "↓")}
                </th>
                <th>Category</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Source</th>
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
                  <td><StatusBadge status={r.status} /></td>
                  <td className="max-w-[10rem] truncate">
                    {r.sourceFileUrl ? (
                      <a
                        href={r.sourceFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent-600 hover:underline"
                      >
                        {r.sourceFile}
                      </a>
                    ) : (
                      r.sourceFile || "—"
                    )}
                  </td>
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

      {showUpload && (
        <UploadModal
          outlets={outlets}
          onClose={() => setShowUpload(false)}
          onImported={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
