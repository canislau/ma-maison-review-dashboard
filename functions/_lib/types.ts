// ============================================================================
// Backend-only types: Graph auth, environment bindings, SharePoint raw shapes
// ============================================================================

import type { UserRole } from "../../src/types";

/** Cloudflare Pages environment bindings (wrangler.toml [vars] + secrets). */
export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REFRESH_TOKEN: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_DRIVE_FOLDER_ID: string;
  GOOGLE_ADMIN_EMAILS: string;
  GOOGLE_MANAGER_EMAILS?: string;
  MICROSOFT_TENANT_ID?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_ADMIN_EMAILS?: string;
  MICROSOFT_MANAGER_EMAILS?: string;
  SESSION_SECRET: string;
  ALLOWED_ORIGIN: string;

  // Azure OpenAI (for translation / categorisation / draft reply generation)
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  AZURE_OPENAI_API_VERSION?: string;

  // Optional KV namespace used ONLY as a short-lived cache for dashboard
  // summaries and staged import previews — never as the system of record.
  CACHE?: KVNamespace;
}

export interface AuthenticatedUser {
  oid: string; // Entra object ID
  name: string;
  email: string;
  role: UserRole;
}

export interface GraphTokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/** Raw shape of an item returned by Graph's /lists/{id}/items?expand=fields */
export interface GraphListItem<TFields = Record<string, unknown>> {
  id: string;
  fields: TFields & {
    id?: string;
    Created?: string;
    Modified?: string;
  };
}

export interface GraphListItemsResponse<TFields = Record<string, unknown>> {
  value: GraphListItem<TFields>[];
  "@odata.nextLink"?: string;
}

/** Raw SharePoint column names for the "Ma Maison Reviews" list. */
export interface SPReviewFields {
  Title?: string; // used as Review ID
  ReviewID?: string;
  Brand?: string;
  OutletCode?: string;
  Outlet?: string;
  Reviewer?: string;
  ReviewDate?: string;
  StarRating?: number;
  OriginalReview?: string;
  EnglishTranslation?: string;
  ManagementReply?: string;
  DraftReply?: string;
  Category?: string;
  Severity?: string;
  PossibleRootCause?: string;
  ResponsiblePerson?: string;
  SalesRecovery?: string;
  ActionPlan?: string;
  RecommendedTimeline?: string;
  Status?: string;
  Language?: string;
  SourceFile?: string;
  SourceFileURL?: string;
}

/** Raw SharePoint column names for the "Review Action Tracker" list. */
export interface SPActionTrackerFields {
  Title?: string; // used as Action ID
  ActionID?: string;
  ReviewID?: string;
  Outlet?: string;
  ResponsiblePerson?: string;
  ActionPlan?: string;
  RecommendedTimeline?: string;
  Status?: string;
  CompletionDate?: string;
  Remarks?: string;
}

export class ApiException extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
