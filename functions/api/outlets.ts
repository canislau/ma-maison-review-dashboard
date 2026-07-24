// GET /api/outlets — distinct outlet names present in the Reviews list.
// Derived from data (not hardcoded) so new outlets appear automatically
// once their first review is imported.

import { withAuth, jsonResponse } from "../_lib/http";
import { getAllListItems } from "../_lib/googleData";
import { spItemToReview } from "../_lib/fieldMapping";
import type { SPReviewFields } from "../_lib/types";
import { BRANDS, OUTLET_DIRECTORY } from "../../src/data/outletDirectory";

export const onRequest = withAuth(async ({ env }) => {
  const items = await getAllListItems<SPReviewFields>(env, "Reviews");
  const reviews = items.map(spItemToReview);
  const extraDirectory = reviews
    .filter((review) => review.outlet && !OUTLET_DIRECTORY.some((entry) => entry.code === review.outletCode))
    .map((review) => ({ code: review.outletCode, name: review.outlet, brand: review.brand, aliases: [] as string[] }));
  const directory = [...OUTLET_DIRECTORY, ...extraDirectory].filter(
    (entry, index, all) => all.findIndex((candidate) => `${candidate.brand}|${candidate.code}|${candidate.name}` === `${entry.brand}|${entry.code}|${entry.name}`) === index
  );
  const brands = Array.from(new Set([...BRANDS, ...reviews.map((review) => review.brand).filter(Boolean)])).sort();
  const outlets = Array.from(new Set(directory.map((entry) => entry.name))).sort();
  return jsonResponse({ brands, outlets, directory }, env);
});
