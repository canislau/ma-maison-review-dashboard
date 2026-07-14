// ============================================================================
// SharePoint data access layer
// Wraps Graph's /sites/{siteId}/lists/{listId}/items and drive upload APIs.
// This is the ONLY file that should issue raw SharePoint List / Drive calls;
// API routes call these functions rather than graphRequest directly.
// ============================================================================

import type { Env } from "./types";
import type { GraphListItem, GraphListItemsResponse, SPReviewFields, SPActionTrackerFields } from "./types";
import { graphRequest } from "./graphClient";
import { ApiException } from "./types";

const PAGE_SIZE_MAX = 999; // Graph list items hard page cap in practice

function siteListPath(env: Env, listId: string) {
  return `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}`;
}

// ----------------------------------------------------------------------------
// Generic list operations (typed by caller)
// ----------------------------------------------------------------------------

export async function getAllListItems<TFields>(
  env: Env,
  listId: string,
  opts: { filter?: string; orderBy?: string; top?: number } = {}
): Promise<GraphListItem<TFields>[]> {
  const items: GraphListItem<TFields>[] = [];
  const params = new URLSearchParams({
    expand: "fields",
    $top: String(opts.top || PAGE_SIZE_MAX),
  });
  if (opts.filter) params.set("$filter", opts.filter);
  if (opts.orderBy) params.set("$orderby", opts.orderBy);

  let nextUrl: string | undefined = `${siteListPath(env, listId)}/items?${params.toString()}`;

  // Safety cap: internal admin tool with a few thousand reviews max, but
  // guard against runaway pagination in case of misconfiguration upstream.
  let pages = 0;
  while (nextUrl && pages < 50) {
    const res: GraphListItemsResponse<TFields> = await graphRequest(env, nextUrl);
    items.push(...res.value);
    nextUrl = res["@odata.nextLink"];
    pages++;
  }

  return items;
}

export async function getListItemById<TFields>(
  env: Env,
  listId: string,
  itemId: string
): Promise<GraphListItem<TFields>> {
  return graphRequest(env, `${siteListPath(env, listId)}/items/${itemId}?expand=fields`);
}

export async function createListItem<TFields>(
  env: Env,
  listId: string,
  fields: Partial<TFields>
): Promise<GraphListItem<TFields>> {
  return graphRequest(env, `${siteListPath(env, listId)}/items`, {
    method: "POST",
    body: { fields },
  });
}

export async function updateListItem<TFields>(
  env: Env,
  listId: string,
  itemId: string,
  fields: Partial<TFields>
): Promise<TFields> {
  return graphRequest(env, `${siteListPath(env, listId)}/items/${itemId}/fields`, {
    method: "PATCH",
    body: fields,
  });
}

export async function deleteListItem(env: Env, listId: string, itemId: string): Promise<void> {
  await graphRequest(env, `${siteListPath(env, listId)}/items/${itemId}`, { method: "DELETE" });
}

/**
 * Batch-creates list items using Graph's $batch endpoint (up to 20 per batch),
 * which is dramatically faster and less throttle-prone than sequential POSTs
 * for large CSV/Excel imports.
 */
export async function batchCreateListItems<TFields>(
  env: Env,
  listId: string,
  fieldsArray: Partial<TFields>[]
): Promise<{ succeeded: number; failed: { index: number; error: string }[] }> {
  const BATCH_SIZE = 20;
  let succeeded = 0;
  const failed: { index: number; error: string }[] = [];

  for (let batchStart = 0; batchStart < fieldsArray.length; batchStart += BATCH_SIZE) {
    const chunk = fieldsArray.slice(batchStart, batchStart + BATCH_SIZE);
    const requests = chunk.map((fields, i) => ({
      id: String(i + 1),
      method: "POST",
      url: `/sites/${env.SHAREPOINT_SITE_ID}/lists/${listId}/items`,
      headers: { "Content-Type": "application/json" },
      body: { fields },
    }));

    const res = await graphRequest<{ responses: { id: string; status: number; body?: unknown }[] }>(
      env,
      "/$batch",
      { method: "POST", body: { requests } }
    );

    for (const r of res.responses) {
      const idx = batchStart + (parseInt(r.id, 10) - 1);
      if (r.status >= 200 && r.status < 300) {
        succeeded++;
      } else {
        failed.push({ index: idx, error: JSON.stringify(r.body) });
      }
    }
  }

  return { succeeded, failed };
}

// ----------------------------------------------------------------------------
// Document Library (file upload) operations
// ----------------------------------------------------------------------------

function sanitizeFolderSegment(segment: string): string {
  return segment.replace(/[\\/:*?"<>|]/g, "-").trim() || "Unspecified";
}

/**
 * Uploads a source file into:
 *   Ma Maison Review Source Files / {Outlet} / {Year} / {Month}
 * Creates the folder path implicitly via Graph's path-addressing, then does
 * a simple PUT upload (suitable for files under ~4MB, which covers CSV/JSON/
 * XLSX review exports in practice). Returns the resulting file's webUrl.
 */
export async function uploadSourceFile(
  env: Env,
  opts: { outlet: string; year: string; month: string; fileName: string; content: ArrayBuffer; contentType: string }
): Promise<{ id: string; webUrl: string }> {
  const outlet = sanitizeFolderSegment(opts.outlet);
  const year = sanitizeFolderSegment(opts.year);
  const month = sanitizeFolderSegment(opts.month);
  const fileName = sanitizeFolderSegment(opts.fileName);

  const path = `${outlet}/${year}/${month}/${fileName}`;
  const url = `/sites/${env.SHAREPOINT_SITE_ID}/drives/${env.DOCUMENT_LIBRARY_ID}/root:/${encodeURI(path)}:/content`;

  const res = await graphRequest<{ id: string; webUrl: string }>(env, url, {
    method: "PUT",
    body: opts.content,
    rawBody: true,
    extraHeaders: { "Content-Type": opts.contentType },
  });

  return { id: res.id, webUrl: res.webUrl };
}

export async function listSourceFiles(
  env: Env,
  opts: { outlet?: string } = {}
): Promise<{ id: string; name: string; webUrl: string; folder: string; createdDateTime: string }[]> {
  // List everything under root recursively via search-by-drive is overkill for
  // an internal tool's file count; we walk outlet folders directly instead.
  const driveRoot = `/sites/${env.SHAREPOINT_SITE_ID}/drives/${env.DOCUMENT_LIBRARY_ID}/root`;

  type DriveItem = {
    id: string;
    name: string;
    webUrl: string;
    folder?: unknown;
    file?: unknown;
    createdDateTime: string;
    parentReference?: { path?: string };
  };

  async function walk(itemPath: string): Promise<DriveItem[]> {
    const res = await graphRequest<{ value: DriveItem[] }>(
      env,
      `${driveRoot}${itemPath ? `:/${encodeURI(itemPath)}:` : ""}/children`
    );
    const results: DriveItem[] = [];
    for (const child of res.value) {
      if (child.folder) {
        results.push(...(await walk(itemPath ? `${itemPath}/${child.name}` : child.name)));
      } else if (child.file) {
        results.push(child);
      }
    }
    return results;
  }

  let files: DriveItem[];
  try {
    files = opts.outlet ? await walk(sanitizeFolderSegment(opts.outlet)) : await walk("");
  } catch (err) {
    if (err instanceof ApiException && err.status === 404) return [];
    throw err;
  }

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    webUrl: f.webUrl,
    folder: f.parentReference?.path?.split(":").pop()?.replace(/^\//, "") || "",
    createdDateTime: f.createdDateTime,
  }));
}

export type { SPReviewFields, SPActionTrackerFields };
