import type { Severity, ReviewStatus } from "../types";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    Low: "bg-accent-50 text-accent-700",
    Medium: "bg-warn-100 text-warn-500",
    High: "bg-warn-100 text-[#a8641a]",
    Critical: "bg-danger-100 text-danger-600",
  };
  return <span className={`badge ${styles[severity]}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const styles: Record<ReviewStatus, string> = {
    New: "bg-section text-ink-muted border border-border",
    "Under Review": "bg-accent-50 text-accent-700",
    "Action Required": "bg-warn-100 text-warn-500",
    "In Progress": "bg-accent-100 text-accent-700",
    Resolved: "bg-accent-500/10 text-accent-600",
    Closed: "bg-section text-ink-muted border border-border",
  };
  return <span className={`badge ${styles[status]}`}>{status}</span>;
}

export function StarRating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < value ? "text-accent-600" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function OverdueBadge() {
  return <span className="badge bg-danger-100 text-danger-600">Overdue</span>;
}
