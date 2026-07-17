import type { Env, AuthenticatedUser } from "./types";
import { ApiException } from "./types";
import type { UserRole } from "../../src/types";

interface GoogleTokenInfo {
  aud: string;
  sub: string;
  email: string;
  email_verified: string;
  name?: string;
  exp: string;
  iss: string;
  hd?: string;
}

function emailSet(value?: string): Set<string> {
  return new Set((value || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function resolveRole(email: string, env: Env): UserRole {
  if (emailSet(env.GOOGLE_ADMIN_EMAILS).has(email) || emailSet(env.MICROSOFT_ADMIN_EMAILS).has(email)) return "Administrator";
  if (emailSet(env.GOOGLE_MANAGER_EMAILS).has(email) || emailSet(env.MICROSOFT_MANAGER_EMAILS).has(email)) return "Manager";
  return "Viewer";
}

interface MicrosoftProfile { id: string; displayName?: string; mail?: string; userPrincipalName?: string }

function tokenPayload(token: string): { tid?: string; exp?: number } | null {
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
}

async function authenticateMicrosoft(token: string, env: Env): Promise<AuthenticatedUser | null> {
  if (!env.MICROSOFT_TENANT_ID || !env.MICROSOFT_CLIENT_ID) return null;
  const payload = tokenPayload(token);
  if (!payload || payload.tid !== env.MICROSOFT_TENANT_ID || (payload.exp || 0) * 1000 < Date.now()) return null;
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const profile = await response.json() as MicrosoftProfile;
  const email = (profile.mail || profile.userPrincipalName || "").toLowerCase();
  if (!email) return null;
  return { oid: profile.id, name: profile.displayName || email, email, role: resolveRole(email, env) };
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedUser> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new ApiException(401, "NO_TOKEN", "Please sign in.");
  const token = header.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (response.ok) {
    const info = await response.json() as GoogleTokenInfo;
    if (info.aud !== env.GOOGLE_CLIENT_ID) throw new ApiException(401, "WRONG_AUDIENCE", "Token was not issued for this application.");
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new ApiException(401, "WRONG_ISSUER", "Token was not issued by Google.");
    if (info.email_verified !== "true" || Number(info.exp) * 1000 < Date.now()) throw new ApiException(401, "INVALID_TOKEN", "Google account is not verified or the session expired.");
    const email = info.email.toLowerCase();
    return { oid: info.sub, name: info.name || email, email, role: resolveRole(email, env) };
  }
  const microsoftUser = await authenticateMicrosoft(token, env);
  if (microsoftUser) return microsoftUser;
  throw new ApiException(401, "INVALID_TOKEN", "The Google or Microsoft sign-in token is invalid or expired.");
}

export function requireRole(user: AuthenticatedUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) throw new ApiException(403, "FORBIDDEN", `This action requires: ${allowed.join(", ")}.`);
}
