// PUT /api/action-tracker/:id — update an action tracker item (Manager, Administrator)

import { withAuth, jsonResponse, readJsonBody } from "../../_lib/http";
import { ApiException } from "../../_lib/types";
import { updateListItem, getListItemById } from "../../_lib/googleData";
import { spItemToActionTracker, actionTrackerToSpFields } from "../../_lib/fieldMapping";
import type { SPActionTrackerFields } from "../../_lib/types";
import type { ActionTrackerItem } from "../../../src/types";
import { STATUS_OPTIONS } from "../../../src/types";

export const onRequest = withAuth<{ id: string }>(async ({ request, env, params, user }) => {
  if (request.method !== "PUT") {
    throw new ApiException(405, "METHOD_NOT_ALLOWED", "Only PUT is supported on this route.");
  }
  if (user.role !== "Manager" && user.role !== "Administrator") {
    throw new ApiException(403, "FORBIDDEN", "Only Managers and Administrators can update action items.");
  }

  const body = await readJsonBody<Partial<ActionTrackerItem>>(request);
  if (body.status && !STATUS_OPTIONS.includes(body.status)) {
    throw new ApiException(400, "INVALID_STATUS", `"${body.status}" is not a valid Status.`);
  }

  const fields = actionTrackerToSpFields(body);
  await updateListItem<SPActionTrackerFields>(env, "ActionTracker", params.id, fields);

  const refreshed = await getListItemById<SPActionTrackerFields>(env, "ActionTracker", params.id);
  return jsonResponse(spItemToActionTracker(refreshed), env);
});
