import { useGoogleAuth } from "../lib/googleAuth";
import type { UserRole } from "../types";

function emailSet(value?: string): Set<string> { return new Set((value || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)); }
export function useUserRole(): { role: UserRole; name: string; email: string } {
  const { user } = useGoogleAuth();
  const email = user?.email?.toLowerCase() || "";
  let role: UserRole = "Viewer";
  if (emailSet(import.meta.env.VITE_GOOGLE_ADMIN_EMAILS as string).has(email) || emailSet(import.meta.env.VITE_MICROSOFT_ADMIN_EMAILS as string).has(email)) role = "Administrator";
  else if (emailSet(import.meta.env.VITE_GOOGLE_MANAGER_EMAILS as string).has(email) || emailSet(import.meta.env.VITE_MICROSOFT_MANAGER_EMAILS as string).has(email)) role = "Manager";
  return { role, name: user?.name || email || "User", email };
}
export const canEditReviews = (role: UserRole) => role === "Manager" || role === "Administrator";
export const canImport = canEditReviews;
export const canDelete = (role: UserRole) => role === "Administrator";
