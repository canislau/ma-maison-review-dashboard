// ============================================================================
// Microsoft Graph app-only (client credentials) authentication
//
// This acquires a Graph token as the *application*, not the signed-in user.
// The signed-in user's identity (via Entra ID / MSAL on the frontend) is used
// only to authenticate the human and determine their role — all SharePoint
// reads/writes happen via this app-only token so that Viewers/Managers never
// need direct Graph permissions of their own. This is the standard pattern
// for internal line-of-business apps sitting in front of a SharePoint list.
// ============================================================================

import type { Env, GraphTokenCache } from "./types";
import { ApiException } from "./types";

// Cloudflare Workers isolates are short-lived, so an in-memory cache only
// helps within a single request burst — but it costs nothing to keep and
// meaningfully cuts token calls under concurrent requests hitting the same
// isolate. KV (if bound) extends this across isolates safely.
let memoryTokenCache: GraphTokenCache | null = null;

const TOKEN_SAFETY_MARGIN_MS = 60_000; // refresh 60s before actual expiry

export async function getGraphToken(env: Env): Promise<string> {
  const now = Date.now();

  if (memoryTokenCache && memoryTokenCache.expiresAt - TOKEN_SAFETY_MARGIN_MS > now) {
    return memoryTokenCache.accessToken;
  }

  if (env.CACHE) {
    const cached = await env.CACHE.get<GraphTokenCache>("graph:token", "json");
    if (cached && cached.expiresAt - TOKEN_SAFETY_MARGIN_MS > now) {
      memoryTokenCache = cached;
      return cached.accessToken;
    }
  }

  const tokenUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiException(
      502,
      "GRAPH_AUTH_FAILED",
      "Failed to acquire Microsoft Graph token. Check MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.",
      text
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };

  const cache: GraphTokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };

  memoryTokenCache = cache;
  if (env.CACHE) {
    // Store slightly shorter than actual TTL so KV eviction never serves stale
    await env.CACHE.put("graph:token", JSON.stringify(cache), {
      expirationTtl: Math.max(60, json.expires_in - 120),
    });
  }

  return cache.accessToken;
}
