import { useEffect, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { api, ApiClientError } from "../lib/apiClient";
import type { DashboardData } from "../types";
import KpiCard from "../components/KpiCard";
import { FilterBar, SelectFilter, MonthPicker } from "../components/FilterBar";
import { LoadingState, ErrorState } from "../components/States";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

const CHART_GREEN = "#3f6b4c";
const CHART_GREEN_LIGHT = "#8fae97";
const CHART_RED = "#c0392b";

export default function OverviewTab() {
  const [outlet, setOutlet] = useState("All");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [outlets, setOutlets] = useState<string[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, outletsRes] = await Promise.all([
        api.dashboard.get({ outlet, month }),
        api.outlets.list(),
      ]);
      setData(dashboard);
      setOutlets(outletsRes.outlets);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [outlet, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { performance, complaints, actionProgress, ratingTrend, volumeTrend, positiveNegativeTrend } = data;

  return (
    <div className="space-y-6">
      <FilterBar>
        <SelectFilter
          label="All Outlets"
          value={outlet === "All" ? "" : outlet}
          onChange={(v) => setOutlet(v || "All")}
          options={outlets.map((o) => ({ value: o, label: o }))}
        />
        <MonthPicker value={month} onChange={setMonth} />
      </FilterBar>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Reviews" value={performance.totalReviews} />
        <KpiCard label="Avg Rating" value={performance.averageStarRating.toFixed(2)} />
        <KpiCard
          label="Negative %"
          value={`${performance.negativePercentage}%`}
          tone={performance.negativePercentage > 20 ? "danger" : "default"}
        />
        <KpiCard label="Critical Reviews" value={complaints.criticalCount} tone={complaints.criticalCount > 0 ? "danger" : "default"} />
        <KpiCard label="Overdue Actions" value={actionProgress.overdueActions} tone={actionProgress.overdueActions > 0 ? "danger" : "default"} />
        <KpiCard label="Resolution Rate" value={`${actionProgress.resolutionRate}%`} tone="accent" />
      </div>

      {/* Trends */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Monthly Rating Trend</h3>
          <Line
            data={{
              labels: ratingTrend.map((r) => r.month),
              datasets: [
                {
                  label: "Average Rating",
                  data: ratingTrend.map((r) => r.averageRating),
                  borderColor: CHART_GREEN,
                  backgroundColor: CHART_GREEN_LIGHT,
                  tension: 0.3,
                },
              ],
            }}
            options={{ scales: { y: { min: 0, max: 5 } }, plugins: { legend: { display: false } } }}
          />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Review Volume Trend</h3>
          <Bar
            data={{
              labels: volumeTrend.map((r) => r.month),
              datasets: [{ label: "Reviews", data: volumeTrend.map((r) => r.count), backgroundColor: CHART_GREEN_LIGHT }],
            }}
            options={{ plugins: { legend: { display: false } } }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Positive vs Negative Reviews</h3>
          <Bar
            data={{
              labels: positiveNegativeTrend.map((r) => r.month),
              datasets: [
                { label: "Positive (4-5★)", data: positiveNegativeTrend.map((r) => r.positive), backgroundColor: CHART_GREEN },
                { label: "Negative (1-2★)", data: positiveNegativeTrend.map((r) => r.negative), backgroundColor: CHART_RED },
              ],
            }}
            options={{ scales: { x: { stacked: true }, y: { stacked: true } } }}
          />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Category Breakdown</h3>
          {Object.keys(complaints.countByCategory).length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">No categorised reviews this period.</p>
          ) : (
            <Doughnut
              data={{
                labels: Object.keys(complaints.countByCategory),
                datasets: [
                  {
                    data: Object.values(complaints.countByCategory),
                    backgroundColor: ["#3f6b4c", "#8fae97", "#c98a1f", "#c0392b", "#5c645d", "#284833", "#d7e3da", "#a8641a"],
                  },
                ],
              }}
              options={{ plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } } }}
            />
          )}
        </div>
      </div>

      {/* Severity breakdown + outlet comparison */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Severity Breakdown</h3>
          <div className="space-y-2">
            <SeverityBar label="High" count={complaints.highSeverityCount} total={performance.totalReviews} color="bg-warn-500" />
            <SeverityBar label="Critical" count={complaints.criticalCount} total={performance.totalReviews} color="bg-danger-500" />
          </div>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Outlet Comparison</h3>
          <table>
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Reviews</th>
                <th>Avg Rating</th>
                <th>Negative %</th>
              </tr>
            </thead>
            <tbody>
              {complaints.outletComparison.map((o) => (
                <tr key={o.outlet}>
                  <td>{o.outlet}</td>
                  <td>{o.totalReviews}</td>
                  <td>{o.averageRating.toFixed(2)}</td>
                  <td className={o.negativePercentage > 20 ? "text-danger-500 font-medium" : ""}>{o.negativePercentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Summary sections */}
      <MonthlySummarySections performance={performance} complaints={complaints} actionProgress={actionProgress} />
    </div>
  );
}

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-muted mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-section rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MonthlySummarySections({
  performance,
  complaints,
  actionProgress,
}: {
  performance: DashboardData["performance"];
  complaints: DashboardData["complaints"];
  actionProgress: DashboardData["actionProgress"];
}) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">Monthly Summary — Review Performance</h3>
        <dl className="text-sm space-y-1.5">
          <Row label="Total Reviews" value={performance.totalReviews} />
          <Row label="Average Rating" value={performance.averageStarRating.toFixed(2)} />
          <Row label="5★ / 4★" value={`${performance.star5} / ${performance.star4}`} />
          <Row label="3★" value={performance.star3} />
          <Row label="2★ / 1★" value={`${performance.star2} / ${performance.star1}`} />
          <Row label="Positive" value={performance.positiveCount} />
          <Row label="Negative" value={performance.negativeCount} />
          <Row label="Negative %" value={`${performance.negativePercentage}%`} />
        </dl>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">Monthly Summary — Complaint Analysis</h3>
        <dl className="text-sm space-y-1.5">
          <Row label="Most Frequent Category" value={complaints.mostFrequentCategory || "—"} />
          <Row label="Most Frequent Root Cause" value={complaints.mostFrequentRootCause || "—"} />
          <Row label="High Severity" value={complaints.highSeverityCount} />
          <Row label="Critical" value={complaints.criticalCount} />
        </dl>
        {complaints.repeatedThemes.length > 0 && (
          <>
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mt-3 mb-1.5">Repeated Themes</p>
            <ul className="text-sm space-y-1">
              {complaints.repeatedThemes.slice(0, 5).map((t) => (
                <li key={t.theme} className="flex justify-between gap-2">
                  <span className="truncate">{t.theme}</span>
                  <span className="text-ink-muted shrink-0">{t.count}×</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">Monthly Summary — Management Action Progress</h3>
        <dl className="text-sm space-y-1.5">
          <Row label="Action Plan Required" value={actionProgress.actionRequiredCases + actionProgress.newCases} />
          <Row label="Working in Progress" value={actionProgress.inProgressCases} />
          <Row label="Action Plan Executed" value={actionProgress.resolvedCases} />
          <Row label="Done" value={actionProgress.closedCases} />
          <Row label="Overdue" value={actionProgress.overdueActions} highlight={actionProgress.overdueActions > 0} />
          <Row label="Missing Owner" value={actionProgress.casesWithoutResponsiblePerson} />
          <Row label="Missing Action Plan" value={actionProgress.casesWithoutActionPlan} />
          <Row label="Resolution Rate" value={`${actionProgress.resolutionRate}%`} />
          {actionProgress.averageResolutionDays !== null && (
            <Row label="Avg Resolution Time" value={`${actionProgress.averageResolutionDays} days`} />
          )}
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={highlight ? "text-danger-500 font-medium" : "text-ink font-medium"}>{value}</dd>
    </div>
  );
}
