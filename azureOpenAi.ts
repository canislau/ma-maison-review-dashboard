// ============================================================================
// Azure OpenAI integration
// Used during import to: detect language, translate to English, suggest
// Category + Severity + Possible Root Cause, and generate a Draft Reply.
//
// Design choice: ONE call per review batch chunk (not one call per field) to
// keep costs and latency reasonable on large imports. Falls back gracefully
// (leaves fields blank / marks for manual review) if Azure OpenAI is not
// configured or a call fails — imports must never hard-fail because of AI.
// ============================================================================

import type { Env } from "./types";
import type { Review, Category, Severity } from "../../src/types";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS } from "../../src/types";

interface AiEnrichment {
  englishTranslation: string;
  language: string;
  category: Category;
  severity: Severity;
  possibleRootCause: string;
  draftReply: string;
}

const SYSTEM_PROMPT = `You are an assistant for a Japanese-style tonkatsu restaurant group in Malaysia (Ma Maison). \
You will be given a customer review (which may be in English, Chinese, Malay, Japanese, or mixed). \
Respond with ONLY a JSON object, no markdown fences, no commentary, with these exact keys:
{
  "language": "<detected source language, e.g. English / Chinese / Malay / Japanese / Mixed>",
  "englishTranslation": "<English translation; if already English, lightly clean it up>",
  "category": "<exactly one of: ${CATEGORY_OPTIONS.join(", ")}>",
  "severity": "<exactly one of: ${SEVERITY_OPTIONS.join(", ")}>",
  "possibleRootCause": "<one short sentence, operational hypothesis, empty string if 4-5 star with no issue>",
  "draftReply": "<a warm, professional, concise management reply in English, referencing specifics from the review, ready for a manager to lightly edit and post; empty string only if not needed>"
}`;

function safeJsonExtract(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export async function enrichReviewWithAi(env: Env, review: Partial<Review>): Promise<AiEnrichment | null> {
  if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_API_KEY || !env.AZURE_OPENAI_DEPLOYMENT) {
    return null; // Not configured — caller should leave AI fields blank for manual entry.
  }

  const apiVersion = env.AZURE_OPENAI_API_VERSION || "2024-06-01";
  const url = `${env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${apiVersion}`;

  const userPrompt = `Outlet: ${review.outlet || "Unknown"}\nStar Rating: ${review.starRating || "Unknown"}\nReview: ${review.originalReview || ""}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("Azure OpenAI call failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = safeJsonExtract(content);
    if (!parsed) return null;

    const category = CATEGORY_OPTIONS.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : "Others";
    const severity = SEVERITY_OPTIONS.includes(parsed.severity as Severity)
      ? (parsed.severity as Severity)
      : "Low";

    return {
      language: String(parsed.language || "Unknown"),
      englishTranslation: String(parsed.englishTranslation || ""),
      category,
      severity,
      possibleRootCause: String(parsed.possibleRootCause || ""),
      draftReply: String(parsed.draftReply || ""),
    };
  } catch (err) {
    console.error("Azure OpenAI enrichment error:", err);
    return null;
  }
}

/**
 * Enriches a batch of reviews with limited concurrency to avoid hammering
 * Azure OpenAI rate limits during large imports.
 */
export async function enrichReviewBatch(
  env: Env,
  reviews: Partial<Review>[],
  concurrency = 4
): Promise<(AiEnrichment | null)[]> {
  const results: (AiEnrichment | null)[] = new Array(reviews.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < reviews.length) {
      const idx = cursor++;
      results[idx] = await enrichReviewWithAi(env, reviews[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, reviews.length) }, () => worker()));
  return results;
}
