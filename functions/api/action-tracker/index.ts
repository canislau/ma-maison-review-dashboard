// GET /api/action-tracker — list action tracker items, optionally filtered by reviewId/outlet/status
// POST /api/action-tracker — create a new action tracker item (Manager, Administrator)

import { withAuth, jsonResponse, readJsonBody } from "../../_lib/http";
import { ApiException } from "../../_lib/types";
import { getAllListItems, createListItem } from "../../_lib/sharepoint";
import { spItemToActionTracker, actionTrackerToSpFields } from "../../_lib/fieldMapping";
import type { SPActionTrackerFields } from "../../_lib/types";
import type { ActionTrackerItem } from "../../../src/types";
import { STATUS_OPTIONS } from "../../../src/types";

export const onRequest = withAuth(async ({ request, env, user }) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const reviewId = url.searchParams.get("reviewId");
    const outlet = url.searchParams.get("outlet");
    const status = url.searchParams.get("status");

    const items = await getAllListItems<SPActionTrackerFields>(env, "ActionTracker");
    let actions: ActionTrackerItem[] = items.map(spItemToActionTracker);

    if (reviewId) actions = actions.filter((a) => a.reviewId === reviewId);
    if (outlet) actions = actions.filter((a) => a.outlet === outlet);
    if (status) actions = actions.filter((a) => a.status === status);

    return jsonResponse({ items: actions, total: actions.length }, env);
  }

  if (request.method === "POST") {
    if (user.role !== "Manager" && user.role !== "Administrator") {
      throw new ApiException(403, "FORBIDDEN", "Only Managers and Administrators can create action items.");
    }

    const body = await readJsonBody<Partial<ActionTrackerItem>>(request);

    if (!body.reviewId) throw new ApiException(400, "MISSING_REVIEW_ID", "reviewId is required.");
    if (!body.outlet) throw new ApiException(400, "MISSING_OUTLET", "outlet is required.");
    if (body.status && !STATUS_OPTIONS.includes(body.status)) {
      throw new ApiException(400, "INVALID_STATUS", `"${body.status}" is not a valid Status.`);
    }

    const actionId = body.actionId || `ACT-${Date.now()}`;
    const fields = actionTrackerToSpFields({ ...body, actionId, status: body.status || "New" });

    const created = await createListItem<SPActionTrackerFields>(env, "ActionTracker", fields);
    return jsonResponse(spItemToActionTracker(created), env, { status: 201 });
  }

  throw new ApiException(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
});
