interface KpiCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: "default" | "danger" | "accent";
}

export default function KpiCard({ label, value, sublabel, tone = "default" }: KpiCardProps) {
  const valueColor =
    tone === "danger" ? "text-danger-500" : tone === "accent" ? "text-accent-600" : "text-ink";

  return (
    <div className="card">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1.5 ${valueColor}`}>{value}</p>
      {sublabel && <p className="text-xs text-ink-muted mt-1">{sublabel}</p>}
    </div>
  );
}
