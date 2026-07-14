// GET /api/reviews/:id — fetch a single review
// PUT /api/reviews/:id — update editable fields (Manager, Administrator only)
// DELETE /api/reviews/:id — delete a review (Administrator only)

import { withAuth, jsonResponse, readJsonBody } from "../../_lib/http";
import { getListItemById, updateListItem, deleteListItem } from "../../_lib/sharepoint";
import { spItemToReview, reviewToSpFields } from "../../_lib/fieldMapping";
import { ApiException } from "../../_lib/types";
import type { SPReviewFields } from "../../_lib/types";
import type { EditableReviewFields } from "../../../src/types";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "../../../src/types";

const EDITABLE_KEYS: (keyof EditableReviewFields)[] = [
  "managementReply",
  "draftReply",
  "category",
  "severity",
  "possibleRootCause",
  "responsiblePerson",
  "salesRecovery",
  "actionPlan",
  "recommendedTimeline",
  "status",
];

export const onRequest = withAuth<{ id: string }>(async ({ request, env, params, user }) => {
  const { id } = params;

  if (request.method === "GET") {
    const item = await getListItemById<SPReviewFields>(env, env.REVIEWS_LIST_ID, id);
    return jsonResponse(spItemToReview(item), env);
  }

  if (request.method === "PUT") {
    if (user.role !== "Manager" && user.role !== "Administrator") {
      throw new ApiException(403, "FORBIDDEN", "Only Managers and Administrators can edit reviews.");
    }

    const body = await readJsonBody<Partial<EditableReviewFields>>(request);
    const updates: Partial<EditableReviewFields> = {};

    for (const key of EDITABLE_KEYS) {
      if (body[key] !== undefined) {
        (updates as Record<string, unknown>)[key] = body[key];
      }
    }

    if (updates.category && !CATEGORY_OPTIONS.includes(updates.category)) {
      throw new ApiException(400, "INVALID_CATEGORY", `"${updates.category}" is not a valid Category.`);
    }
    if (updates.severity && !SEVERITY_OPTIONS.includes(updates.severity)) {
      throw new ApiException(400, "INVALID_SEVERITY", `"${updates.severity}" is not a valid Severity.`);
    }
    if (updates.status && !STATUS_OPTIONS.includes(updates.status)) {
      throw new ApiException(400, "INVALID_STATUS", `"${updates.status}" is not a valid Status.`);
    }

    const spFields = reviewToSpFields(updates);
    await updateListItem<SPReviewFields>(env, env.REVIEWS_LIST_ID, id, spFields);

    const refreshed = await getListItemById<SPReviewFields>(env, env.REVIEWS_LIST_ID, id);
    return jsonResponse(spItemToReview(refreshed), env);
  }

  if (request.method === "DELETE") {
    if (user.role !== "Administrator") {
      throw new ApiException(403, "FORBIDDEN", "Only Administrators can delete reviews.");
    }
    await deleteListItem(env, env.REVIEWS_LIST_ID, id);
    return jsonResponse({ success: true, id }, env);
  }

  throw new ApiException(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed on this route.`);
});
