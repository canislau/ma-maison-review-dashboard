// ============================================================================
// Shared HTTP helpers: CORS, JSON responses, and a route wrapper that
// centralises auth + error handling so individual route files stay small.
// ============================================================================

import type { Env, AuthenticatedUser } from "./types";
import { ApiException } from "./types";
import { authenticateRequest } from "./auth";
import type { UserRole } from "../../src/types";

export function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(data: unknown, env: Env, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(err: unknown, env: Env): Response {
  if (err instanceof ApiException) {
    return jsonResponse(
      { error: err.code, message: err.message, details: err.details },
      env,
      { status: err.status }
    );
  }
  console.error("Unhandled API error:", err);
  return jsonResponse(
    { error: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." },
    env,
    { status: 500 }
  );
}

export function handleOptions(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

interface RouteContext<Params = Record<string, string>> {
  request: Request;
  env: Env;
  params: Params;
  user: AuthenticatedUser;
}

type RouteHandler<Params = Record<string, string>> = (ctx: RouteContext<Params>) => Promise<Response>;

/**
 * Wraps a Pages Function route with: OPTIONS short-circuit, Entra ID auth,
 * optional role gate, and centralised error -> JSON conversion. Every route
 * file in functions/api/** should be a thin call to this wrapper.
 */
export function withAuth<Params = Record<string, string>>(
  handler: RouteHandler<Params>,
  opts: { allowedRoles?: UserRole[] } = {}
) {
  return async (context: { request: Request; env: Env; params: Params }): Promise<Response> => {
    const { request, env, params } = context;

    if (request.method === "OPTIONS") {
      return handleOptions(env);
    }

    try {
      const user = await authenticateRequest(request, env);
      if (opts.allowedRoles) {
        const { requireRole } = await import("./auth");
        requireRole(user, opts.allowedRoles);
      }
      return await handler({ request, env, params, user });
    } catch (err) {
      return errorResponse(err, env);
    }
  };
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiException(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
