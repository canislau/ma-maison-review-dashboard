import { useState } from "react";
import { api, ApiClientError } from "../lib/apiClient";
import type { ImportPreviewResult, DuplicateAction, ImportCommitResult } from "../types";

interface UploadModalProps {
  outlets: string[];
  onClose: () => void;
  onImported: () => void;
}

type Step = "select" | "preview" | "committing" | "done";

export default function UploadModal({ outlets, onClose, onImported }: UploadModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [outlet, setOutlet] = useState(outlets[0] || "");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.reviews.importPreview(file, outlet);
      setPreview(res);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setStep("committing");
    setError(null);
    try {
      const res = await api.reviews.importCommit({
        uploadToken: preview.uploadToken,
        duplicateAction,
        selectedRowIndexes: duplicateAction === "selected" ? Array.from(selectedRows) : undefined,
      });
      setResult(res);
      setStep("done");
      onImported();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to import reviews.");
      setStep("preview");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={step === "committing" ? undefined : onClose} />
      <div className="relative bg-surface rounded-card shadow-card w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-border">
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Upload Reviews</h2>
          {step !== "committing" && (
            <button className="text-ink-muted hover:text-ink text-xl leading-none" onClick={onClose}>×</button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {step === "select" && (
            <>
              <div>
                <label className="block text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Outlet</label>
                <select className="input" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
                  {outlets.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <p className="text-xs text-ink-muted mt-1">Used when the file doesn't specify an outlet per row.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">File</label>
                <input
                  type="file"
                  accept=".csv,.json,.xlsx,.xls"
                  className="input"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-ink-muted mt-1">Supports CSV, JSON, and Excel (.xlsx/.xls) files.</p>
              </div>
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button className="btn-primary flex-1 justify-center" disabled={!file || loading} onClick={handlePreview}>
                  {loading ? "Parsing…" : "Preview Import"}
                </button>
              </div>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                <StatBox label="Total Rows" value={preview.totalRows} />
                <StatBox label="Valid" value={preview.validRows} tone="accent" />
                <StatBox label="Duplicates" value={preview.duplicateRows} tone={preview.duplicateRows > 0 ? "warn" : "default"} />
                <StatBox label="Errors" value={preview.errorRows} tone={preview.errorRows > 0 ? "danger" : "default"} />
              </div>

              {preview.duplicateRows > 0 && (
                <div>
                  <label className="block text-xs font-medium text-ink-muted uppercase tracking-wide mb-1.5">Duplicate Handling</label>
                  <div className="space-y-1.5">
                    {(["skip", "replace", "selected"] as DuplicateAction[]).map((action) => (
                      <label key={action} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="dupAction"
                          checked={duplicateAction === action}
                          onChange={() => setDuplicateAction(action)}
                        />
                        {action === "skip" && "Skip duplicates (default)"}
                        {action === "replace" && "Replace existing records"}
                        {action === "selected" && "Import selected rows only"}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                <table>
                  <thead>
                    <tr>
                      {duplicateAction === "selected" && <th></th>}
                      <th>Row</th>
                      <th>Reviewer</th>
                      <th>Date</th>
                      <th>Rating</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowIndex}>
                        {duplicateAction === "selected" && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.rowIndex)}
                              onChange={(e) => {
                                setSelectedRows((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(row.rowIndex);
                                  else next.delete(row.rowIndex);
                                  return next;
                                });
                              }}
                            />
                          </td>
                        )}
                        <td>{row.rowIndex + 1}</td>
                        <td>{row.parsed.reviewer || "—"}</td>
                        <td>{row.parsed.reviewDate ? new Date(row.parsed.reviewDate).toLocaleDateString() : "—"}</td>
                        <td>{row.parsed.starRating ?? "—"}</td>
                        <td>
                          {row.errors.length > 0 ? (
                            <span className="text-danger-500 text-xs">{row.errors[0]}</span>
                          ) : row.isDuplicate ? (
                            <span className="text-warn-500 text-xs">Duplicate of {row.duplicateOf}</span>
                          ) : (
                            <span className="text-accent-600 text-xs">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <p className="text-sm text-danger-500">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button className="btn-primary flex-1 justify-center" onClick={handleCommit}>
                  Import {preview.validRows} Reviews
                </button>
                <button className="btn-secondary" onClick={() => setStep("select")}>
                  Back
                </button>
              </div>
            </>
          )}

          {step === "committing" && (
            <div className="text-center py-10">
              <span className="w-6 h-6 border-2 border-accent-300 border-t-accent-600 rounded-full animate-spin inline-block mb-3" />
              <p className="text-sm text-ink-muted">Importing reviews to SharePoint…</p>
            </div>
          )}

          {step === "done" && result && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm font-medium text-ink">Import complete</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <StatBox label="Imported" value={result.imported} tone="accent" />
                <StatBox label="Skipped" value={result.skipped} />
                <StatBox label="Replaced" value={result.replaced} />
                <StatBox label="Failed" value={result.failed} tone={result.failed > 0 ? "danger" : "default"} />
              </div>
              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "accent" | "warn" | "danger" }) {
  const color =
    tone === "accent" ? "text-accent-600" : tone === "warn" ? "text-warn-500" : tone === "danger" ? "text-danger-500" : "text-ink";
  return (
    <div className="bg-section rounded-lg p-2.5">
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}
