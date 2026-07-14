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
  if (emailSet(env.GOOGLE_ADMIN_EMAILS).has(email)) return "Administrator";
  if (emailSet(env.GOOGLE_MANAGER_EMAILS).has(email)) return "Manager";
  return "Viewer";
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedUser> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new ApiException(401, "NO_TOKEN", "Please sign in with Google.");
  const token = header.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new ApiException(401, "INVALID_TOKEN", "Google sign-in token is invalid or expired.");
  const info = await response.json() as GoogleTokenInfo;
  if (info.aud !== env.GOOGLE_CLIENT_ID) throw new ApiException(401, "WRONG_AUDIENCE", "Token was not issued for this application.");
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new ApiException(401, "WRONG_ISSUER", "Token was not issued by Google.");
  if (info.email_verified !== "true" || Number(info.exp) * 1000 < Date.now()) throw new ApiException(401, "INVALID_TOKEN", "Google account is not verified or the session expired.");
  const email = info.email.toLowerCase();
  if (env.GOOGLE_ALLOWED_DOMAIN && email.split("@")[1] !== env.GOOGLE_ALLOWED_DOMAIN.toLowerCase()) {
    throw new ApiException(403, "WRONG_DOMAIN", "This Google account is not allowed to use the dashboard.");
  }
  return { oid: info.sub, name: info.name || email, email, role: resolveRole(email, env) };
}

export function requireRole(user: AuthenticatedUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) throw new ApiException(403, "FORBIDDEN", `This action requires: ${allowed.join(", ")}.`);
}
