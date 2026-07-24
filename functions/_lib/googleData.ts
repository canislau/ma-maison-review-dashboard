// Google Sheets/Drive storage adapter. The legacy function names are retained
// so the dashboard's business logic does not need to know which provider stores data.
import type { Env, GraphListItem, SPReviewFields, SPActionTrackerFields } from "./types";
import { ApiException } from "./types";
import { googleRequest, getGoogleAccessToken } from "./googleAuth";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const REVIEW_HEADERS = ["Title","ReviewID","Outlet","Reviewer","ReviewDate","StarRating","OriginalReview","EnglishTranslation","ManagementReply","DraftReply","Category","Severity","PossibleRootCause","ResponsiblePerson","SalesRecovery","ActionPlan","RecommendedTimeline","Status","Language","SourceFile","SourceFileURL","Created","Modified","Brand","OutletCode"];
const ACTION_HEADERS = ["Title","ActionID","ReviewID","Outlet","ResponsiblePerson","ActionPlan","RecommendedTimeline","Status","CompletionDate","Remarks","Created","Modified"];

function headers(sheet: string): string[] {
  return sheet === "ActionTracker" ? ACTION_HEADERS : REVIEW_HEADERS;
}

function rangeUrl(env: Env, sheet: string, suffix = ""): string {
  return `${SHEETS_BASE}/${env.GOOGLE_SPREADSHEET_ID}/values/${encodeURIComponent(`${sheet}!A:ZZ`)}${suffix}`;
}

async function ensureSheet(env: Env, sheet: string): Promise<void> {
  try {
    await googleRequest(env, rangeUrl(env, sheet));
  } catch (error) {
    if (!(error instanceof ApiException) || error.status !== 400) throw error;
    try {
      await googleRequest(env, `${SHEETS_BASE}/${env.GOOGLE_SPREADSHEET_ID}:batchUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheet } } }] }),
      });
    } catch (addError) {
      if (!(addError instanceof ApiException) || addError.status !== 400) throw addError;
    }
  }
  const current = await googleRequest<{ values?: string[][] }>(env, rangeUrl(env, sheet));
  if (!current.values?.length) {
    await googleRequest(env, rangeUrl(env, sheet, "?valueInputOption=RAW"), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range: `${sheet}!A1`, majorDimension: "ROWS", values: [headers(sheet)] }),
    });
  } else if (sheet === "Reviews") {
    const currentHeaders = current.values[0] || [];
    const oldHeaders = REVIEW_HEADERS.slice(0, -2);
    const safeToExtend = oldHeaders.every((name, index) => currentHeaders[index] === name);
    if (safeToExtend && (!currentHeaders.includes("Brand") || !currentHeaders.includes("OutletCode"))) {
      await googleRequest(env, rangeUrl(env, sheet, "?valueInputOption=RAW"), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: `${sheet}!A1`, majorDimension: "ROWS", values: [REVIEW_HEADERS] }),
      });
    }
  }
}

function fieldsFromRow<T>(sheet: string, row: unknown[]): T {
  const result: Record<string, unknown> = {};
  headers(sheet).forEach((name, index) => { result[name] = row[index] ?? ""; });
  if (result.StarRating !== undefined) result.StarRating = Number(result.StarRating) || 0;
  return result as T;
}

function rowFromFields(sheet: string, fields: Record<string, unknown>, existing?: unknown[]): unknown[] {
  return headers(sheet).map((name, index) => fields[name] !== undefined ? fields[name] : existing?.[index] ?? "");
}

export async function getAllListItems<TFields>(env: Env, sheet: string, _opts: { filter?: string; orderBy?: string; top?: number } = {}): Promise<GraphListItem<TFields>[]> {
  await ensureSheet(env, sheet);
  const data = await googleRequest<{ values?: unknown[][] }>(env, rangeUrl(env, sheet));
  return (data.values || []).slice(1).map((row, index) => ({ id: String(index + 2), fields: fieldsFromRow<TFields>(sheet, row) as TFields & { id?: string } }));
}

export async function getListItemById<TFields>(env: Env, sheet: string, itemId: string): Promise<GraphListItem<TFields>> {
  const item = (await getAllListItems<TFields>(env, sheet)).find((entry) => entry.id === itemId);
  if (!item) throw new ApiException(404, "ROW_NOT_FOUND", "The requested spreadsheet row no longer exists.");
  return item;
}

export async function createListItem<TFields>(env: Env, sheet: string, fields: Partial<TFields>): Promise<GraphListItem<TFields>> {
  await ensureSheet(env, sheet);
  const stamped = { ...(fields as Record<string, unknown>), Created: new Date().toISOString(), Modified: new Date().toISOString() };
  const result = await googleRequest<{ updates?: { updatedRange?: string } }>(env, rangeUrl(env, sheet, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [rowFromFields(sheet, stamped)] }),
  });
  const match = result.updates?.updatedRange?.match(/!(?:[A-Z]+)(\d+)/);
  const id = match?.[1] || String((await getAllListItems(env, sheet)).length + 1);
  return getListItemById<TFields>(env, sheet, id);
}

export async function updateListItem<TFields>(env: Env, sheet: string, itemId: string, fields: Partial<TFields>): Promise<TFields> {
  const rowNumber = Number(itemId);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new ApiException(400, "INVALID_ROW", "Invalid spreadsheet row ID.");
  const data = await googleRequest<{ values?: unknown[][] }>(env, rangeUrl(env, sheet));
  const existing = data.values?.[rowNumber - 1];
  if (!existing) throw new ApiException(404, "ROW_NOT_FOUND", "The requested spreadsheet row no longer exists.");
  const stamped = { ...(fields as Record<string, unknown>), Modified: new Date().toISOString() };
  const end = columnName(headers(sheet).length);
  await googleRequest(env, `${SHEETS_BASE}/${env.GOOGLE_SPREADSHEET_ID}/values/${encodeURIComponent(`${sheet}!A${rowNumber}:${end}${rowNumber}`)}?valueInputOption=RAW`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [rowFromFields(sheet, stamped, existing)] }),
  });
  return fields as TFields;
}

function columnName(column: number): string {
  let result = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

async function sheetNumericId(env: Env, sheet: string): Promise<number> {
  const data = await googleRequest<{ sheets: { properties: { sheetId: number; title: string } }[] }>(env, `${SHEETS_BASE}/${env.GOOGLE_SPREADSHEET_ID}?fields=sheets.properties`);
  const found = data.sheets.find((entry) => entry.properties.title === sheet);
  if (!found) throw new ApiException(404, "SHEET_NOT_FOUND", `Sheet ${sheet} was not found.`);
  return found.properties.sheetId;
}

export async function deleteListItem(env: Env, sheet: string, itemId: string): Promise<void> {
  const rowNumber = Number(itemId);
  await googleRequest(env, `${SHEETS_BASE}/${env.GOOGLE_SPREADSHEET_ID}:batchUpdate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: await sheetNumericId(env, sheet), dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
  });
}

export async function batchCreateListItems<TFields>(env: Env, sheet: string, values: Partial<TFields>[]): Promise<{ succeeded: number; failed: { index: number; error: string }[] }> {
  try {
    await ensureSheet(env, sheet);
    const now = new Date().toISOString();
    const rows = values.map((fields) => rowFromFields(sheet, { ...(fields as Record<string, unknown>), Created: now, Modified: now }));
    await googleRequest(env, rangeUrl(env, sheet, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: rows }),
    });
    return { succeeded: values.length, failed: [] };
  } catch (error) {
    return { succeeded: 0, failed: values.map((_, index) => ({ index, error: error instanceof Error ? error.message : "Google Sheets write failed" })) };
  }
}

function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Unspecified"; }

async function ensureDriveFolder(env: Env, parentId: string, name: string): Promise<string> {
  const query = encodeURIComponent(`'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await googleRequest<{ files: { id: string }[] }>(env, `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files[0]) return found.files[0].id;
  const created = await googleRequest<{ id: string }>(env, "https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  return created.id;
}

export async function uploadSourceFile(env: Env, opts: { outlet: string; year: string; month: string; fileName: string; content: ArrayBuffer; contentType: string }): Promise<{ id: string; webUrl: string }> {
  let parent = env.GOOGLE_DRIVE_FOLDER_ID;
  for (const part of [opts.outlet, opts.year, opts.month].map(safeName)) parent = await ensureDriveFolder(env, parent, part);
  const boundary = `ma_maison_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: safeName(opts.fileName), parents: [parent] });
  const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${opts.contentType}\r\n\r\n`);
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + opts.content.byteLength + suffix.length);
  body.set(prefix); body.set(new Uint8Array(opts.content), prefix.length); body.set(suffix, prefix.length + opts.content.byteLength);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true", {
    method: "POST", headers: { Authorization: `Bearer ${await getGoogleAccessToken(env)}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!response.ok) throw new ApiException(response.status, "GOOGLE_DRIVE_UPLOAD_FAILED", "Could not upload the source file to Google Drive.", await response.text());
  const result = await response.json() as { id: string; webViewLink: string };
  return { id: result.id, webUrl: result.webViewLink };
}

export async function listSourceFiles(env: Env, opts: { outlet?: string } = {}): Promise<{ id: string; name: string; webUrl: string; folder: string; createdDateTime: string }[]> {
  let parent = env.GOOGLE_DRIVE_FOLDER_ID;
  if (opts.outlet) parent = await ensureDriveFolder(env, parent, safeName(opts.outlet));
  type DriveFile = { id: string; name: string; webViewLink: string; createdTime: string; mimeType: string };
  const results: { id: string; name: string; webUrl: string; folder: string; createdDateTime: string }[] = [];
  async function walk(folderId: string, path: string): Promise<void> {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const data = await googleRequest<{ files: DriveFile[] }>(env, `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,createdTime,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    for (const file of data.files) {
      if (file.mimeType === "application/vnd.google-apps.folder") await walk(file.id, path ? `${path}/${file.name}` : file.name);
      else results.push({ id: file.id, name: file.name, webUrl: file.webViewLink, folder: path, createdDateTime: file.createdTime });
    }
  }
  await walk(parent, opts.outlet || "");
  return results;
}

export type { SPReviewFields, SPActionTrackerFields };
