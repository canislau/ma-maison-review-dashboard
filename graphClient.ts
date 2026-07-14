// ============================================================================
// Low-level Microsoft Graph fetch wrapper
// Handles: auth header injection, 429 throttling with Retry-After, transient
// 5xx retry with backoff, and consistent error surfacing via ApiException.
// ============================================================================

import type { Env } from "./types";
import { ApiException } from "./types";
import { getGraphToken } from "./graphAuth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface GraphRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  extraHeaders?: Record<string, string>;
  maxRetries?: number;
  /** Set true when body is already a raw binary/string payload (e.g. file upload). */
  rawBody?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function graphRequest<T = unknown>(
  env: Env,
  path: string,
  options: GraphRequestOptions = {}
): Promise<T> {
  const { method = "GET", body, extraHeaders = {}, maxRetries = 4, rawBody = false } = options;

  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    const token = await getGraphToken(env);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    };

    if (!rawBody && body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : rawBody ? (body as BodyInit) : JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 503) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 1000 * 2 ** attempt;
        attempt++;
        if (attempt > maxRetries) {
          throw new ApiException(503, "GRAPH_THROTTLED", "Microsoft Graph is throttling requests. Please retry shortly.");
        }
        await sleep(Math.min(retryAfterMs, 15_000));
        continue;
      }

      if (res.status === 401) {
        // Token might have been invalidated server-side; clear and retry once.
        attempt++;
        if (attempt > maxRetries) {
          throw new ApiException(401, "GRAPH_UNAUTHORIZED", "Microsoft Graph rejected the request token.");
        }
        await sleep(500);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiException(
          res.status,
          "GRAPH_REQUEST_FAILED",
          `Microsoft Graph request failed (${res.status} ${res.statusText})`,
          text
        );
      }

      if (res.status === 204) {
        return undefined as T;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.arrayBuffer()) as unknown as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiException) {
        // 4xx (except 401/429 handled above) should not be retried.
        if (err.status >= 400 && err.status < 500) throw err;
      }
      attempt++;
      if (attempt > maxRetries) break;
      await sleep(500 * 2 ** attempt);
    }
  }

  if (lastError instanceof ApiException) throw lastError;
  throw new ApiException(502, "GRAPH_UNKNOWN_ERROR", "Unknown error communicating with Microsoft Graph.", lastError);
}

export { GRAPH_BASE };
