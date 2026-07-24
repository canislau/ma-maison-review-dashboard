// ============================================================================
// Typed API client. Every call attaches the current Google or Microsoft token.
// ============================================================================

import { getStoredGoogleToken } from "./googleAuth";
import type {
  Review,
  ActionTrackerItem,
  DashboardData,
  PaginatedResult,
  ReviewListQuery,
  EditableReviewFields,
  ImportPreviewResult,
  ImportCommitRequest,
  ImportCommitResult,
  ApiError,
} from "../types";
import type { OutletDirectoryEntry } from "../data/outletDirectory";

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getAccessToken(): Promise<string> {
  const token = getStoredGoogleToken();
  if (!token) throw new ApiClientError(401, "NOT_SIGNED_IN", "Please sign in to continue.");
  return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // ignore JSON parse failure on error body
    }
    throw new ApiClientError(res.status, body?.error || "UNKNOWN_ERROR", body?.message || res.statusText);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.blob()) as unknown as T;
}

function toQueryString(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  reviews: {
    list: (query: ReviewListQuery = {}) =>
      request<PaginatedResult<Review>>(`/reviews${toQueryString(query as Record<string, unknown>)}`),
    get: (id: string) => request<Review>(`/reviews/${id}`),
    update: (id: string, fields: Partial<EditableReviewFields>) =>
      request<Review>(`/reviews/${id}`, { method: "PUT", body: JSON.stringify(fields) }),
    delete: (id: string) => request<{ success: boolean }>(`/reviews/${id}`, { method: "DELETE" }),
    importPreview: (file: File, identity: { brand: string; outletCode: string; outlet: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("brand", identity.brand);
      form.append("outletCode", identity.outletCode);
      form.append("outlet", identity.outlet);
      return request<ImportPreviewResult>("/reviews/import", { method: "POST", body: form });
    },
    importCommit: (body: ImportCommitRequest) =>
      request<ImportCommitResult>("/reviews/import?commit=true", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  dashboard: {
    get: (filters: { brand?: string; outlet?: string; month?: string; dateFrom?: string; dateTo?: string } = {}) =>
      request<DashboardData>(`/dashboard${toQueryString(filters)}`),
  },
  monthlySummary: {
    get: (month: string, outlet = "All") =>
      request(`/monthly-summary${toQueryString({ month, outlet })}`),
  },
  outlets: {
    list: () => request<{ brands: string[]; outlets: string[]; directory: OutletDirectoryEntry[] }>("/outlets"),
  },
  categories: {
    list: () => request<{ categories: string[]; severities: string[]; statuses: string[] }>("/categories"),
  },
  actionTracker: {
    list: (query: { reviewId?: string; outlet?: string; status?: string } = {}) =>
      request<{ items: ActionTrackerItem[]; total: number }>(`/action-tracker${toQueryString(query)}`),
    create: (item: Partial<ActionTrackerItem>) =>
      request<ActionTrackerItem>("/action-tracker", { method: "POST", body: JSON.stringify(item) }),
    update: (id: string, item: Partial<ActionTrackerItem>) =>
      request<ActionTrackerItem>(`/action-tracker/${id}`, { method: "PUT", body: JSON.stringify(item) }),
  },
  files: {
    list: (outlet?: string) => request<{ files: { id: string; name: string; webUrl: string; folder: string }[] }>(
      `/files${toQueryString({ outlet })}`
    ),
  },
  export: {
    url: (format: "csv" | "xlsx", filters: Record<string, unknown> | ReviewListQuery = {}) =>
      `/api/export${toQueryString({ format, ...(filters as Record<string, unknown>) })}`,
  },
};

export async function downloadExport(
  format: "csv" | "xlsx",
  filters: Record<string, unknown> | ReviewListQuery = {}
) {
  const token = await getAccessToken();
  const res = await fetch(api.export.url(format, filters as Record<string, unknown>), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiClientError(res.status, "EXPORT_FAILED", "Failed to generate export.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cwx-reviews.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
