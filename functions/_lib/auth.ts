// ============================================================================
// Entra ID authentication for incoming requests
//
// The frontend uses MSAL (@azure/msal-browser) to sign the user in via
// Entra ID and attaches the resulting ID token as a Bearer token on every
// API call. This module verifies that token's signature against Entra ID's
// published JWKS and extracts the user's identity + role.
//
// Role source: an Entra ID App Role (defined in the app registration manifest
// as "Viewer" / "Manager" / "Administrator" and assigned to users/groups in
// the Enterprise Application's "Users and groups" blade). This keeps role
// assignment entirely inside Microsoft Entra — no names hardcoded here.
// ============================================================================

import type { Env, AuthenticatedUser } from "./types";
import { ApiException } from "./types";
import type { UserRole } from "../../src/types";

interface JwkKey {
  kid: string;
  n: string;
  e: string;
  kty: string;
  use?: string;
}

interface DecodedIdToken {
  oid: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  roles?: string[];
  exp: number;
  aud: string;
  tid: string;
}

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function decodeJwtPayload(token: string): DecodedIdToken {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiException(401, "INVALID_TOKEN", "Malformed authentication token.");
  const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(parts[1]));
  return JSON.parse(payloadJson);
}

async function getJwks(env: Env): Promise<JwkKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/discovery/v2.0/keys`
  );
  if (!res.ok) {
    throw new ApiException(502, "JWKS_FETCH_FAILED", "Could not fetch Entra ID signing keys.");
  }
  const json = (await res.json()) as { keys: JwkKey[] };
  jwksCache = { keys: json.keys, fetchedAt: now };
  return json.keys;
}

async function verifySignature(env: Env, token: string): Promise<void> {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64))) as { kid: string; alg: string };

  const keys = await getJwks(env);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new ApiException(401, "INVALID_TOKEN", "Signing key not found for this token.");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signature = base64UrlToUint8Array(signatureB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer,
    data
  );
  if (!valid) throw new ApiException(401, "INVALID_TOKEN", "Token signature verification failed.");
}

function resolveRole(roles: string[] | undefined): UserRole {
  if (!roles || roles.length === 0) return "Viewer";
  if (roles.includes("Administrator")) return "Administrator";
  if (roles.includes("Manager")) return "Manager";
  return "Viewer";
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiException(401, "NO_TOKEN", "Missing Authorization header.");
  }
  const token = authHeader.slice("Bearer ".length);

  const decoded = decodeJwtPayload(token);

  if (decoded.exp * 1000 < Date.now()) {
    throw new ApiException(401, "TOKEN_EXPIRED", "Authentication session has expired. Please sign in again.");
  }
  if (decoded.tid !== env.MICROSOFT_TENANT_ID) {
    throw new ApiException(401, "WRONG_TENANT", "Token issued for a different tenant.");
  }
  if (decoded.aud !== env.MICROSOFT_CLIENT_ID) {
    throw new ApiException(401, "WRONG_AUDIENCE", "Token was not issued for this application.");
  }

  await verifySignature(env, token);

  return {
    oid: decoded.oid,
    name: decoded.name || decoded.preferred_username || "Unknown",
    email: decoded.email || decoded.preferred_username || "",
    role: resolveRole(decoded.roles),
  };
}

export function requireRole(user: AuthenticatedUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw new ApiException(
      403,
      "FORBIDDEN",
      `This action requires one of the following roles: ${allowed.join(", ")}. Your role: ${user.role}.`
    );
  }
}
