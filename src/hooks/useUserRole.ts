// ============================================================================
// Derives the signed-in user's role from Entra ID App Role claims on the
// active account's ID token. Roles are assigned entirely within Entra ID
// (Enterprise Application > Users and groups) — nothing is hardcoded here.
// ============================================================================

import { useMsal } from "@azure/msal-react";
import type { UserRole } from "../types";

interface IdTokenClaims {
  roles?: string[];
  name?: string;
  preferred_username?: string;
  email?: string;
}

export function useUserRole(): { role: UserRole; name: string; email: string } {
  const { accounts } = useMsal();
  const account = accounts[0];
  const claims = (account?.idTokenClaims || {}) as IdTokenClaims;
  const roles = claims.roles || [];

  let role: UserRole = "Viewer";
  if (roles.includes("Administrator")) role = "Administrator";
  else if (roles.includes("Manager")) role = "Manager";

  return {
    role,
    name: claims.name || claims.preferred_username || "User",
    email: claims.email || claims.preferred_username || "",
  };
}

export function canEditReviews(role: UserRole): boolean {
  return role === "Manager" || role === "Administrator";
}

export function canImport(role: UserRole): boolean {
  return role === "Manager" || role === "Administrator";
}

export function canDelete(role: UserRole): boolean {
  return role === "Administrator";
}
