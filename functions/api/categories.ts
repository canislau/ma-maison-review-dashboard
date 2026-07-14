// GET /api/categories — returns the fixed Category / Severity / Status option
// lists so the frontend never has to hardcode them separately from the
// backend's source of truth (src/types/index.ts).

import { withAuth, jsonResponse } from "../_lib/http";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../../src/types";

export const onRequest = withAuth(async ({ env }) => {
  return jsonResponse(
    {
      categories: CATEGORY_OPTIONS,
      severities: SEVERITY_OPTIONS,
      statuses: STATUS_OPTIONS,
    },
    env
  );
});
