import type { Env } from "./types";
import { ApiException } from "./types";

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Uses a one-time user authorization refresh token. No service-account key is required. */
export async function getGoogleAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as {
      error?: string;
      error_description?: string;
    };
    const message = result.error === "invalid_client"
      ? "Google rejected the OAuth client ID or client secret."
      : result.error === "invalid_grant"
        ? "Google rejected or revoked the OAuth refresh token."
        : "Google rejected the OAuth refresh credentials.";
    throw new ApiException(502, "GOOGLE_AUTH_FAILED", message, {
      providerError: result.error || "unknown",
    });
  }
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

export async function googleRequest<T>(env: Env, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await getGoogleAccessToken(env)}`, ...(init.headers || {}) },
  });
  if (!response.ok) {
    throw new ApiException(response.status, "GOOGLE_API_FAILED", `Google API request failed (${response.status}).`, await response.text());
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
