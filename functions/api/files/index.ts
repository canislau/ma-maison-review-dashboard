// GET /api/files — list uploaded source files from the Document Library,
// optionally filtered by outlet. Used by the "Open original source file"
// action in the All Reviews tab.
//
// NOTE: File *upload* itself happens as part of the import commit flow
// (see /api/reviews/import?commit=true), which uploads the file and stamps
// each imported review's SourceFile/SourceFileURL. This route additionally
// exposes POST /api/files/upload for standalone re-uploads (e.g. re-attaching
// a corrected source file to an outlet without re-importing rows).

import { withAuth, jsonResponse } from "../../_lib/http";
import { ApiException } from "../../_lib/types";
import { listSourceFiles, uploadSourceFile } from "../../_lib/sharepoint";

export const onRequest = withAuth(async ({ request, env, user }) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const outlet = url.searchParams.get("outlet") || undefined;
    const files = await listSourceFiles(env, { outlet });
    return jsonResponse({ files }, env);
  }

  if (request.method === "POST") {
    if (user.role !== "Administrator") {
      throw new ApiException(403, "FORBIDDEN", "Only Administrators can upload files directly via this route.");
    }

    const formData = await request.formData().catch(() => {
      throw new ApiException(400, "INVALID_UPLOAD", "Expected multipart/form-data.");
    });

    const file = formData.get("file");
    const outlet = String(formData.get("outlet") || "Unspecified");
    if (!(file instanceof File)) {
      throw new ApiException(400, "NO_FILE", "No file was uploaded.");
    }

    const now = new Date();
    const uploaded = await uploadSourceFile(env, {
      outlet,
      year: String(now.getFullYear()),
      month: now.toLocaleString("en-US", { month: "long" }),
      fileName: file.name,
      content: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
    });

    return jsonResponse(uploaded, env, { status: 201 });
  }

  throw new ApiException(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
});
