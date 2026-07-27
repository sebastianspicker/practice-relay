/**
 * Authentication and current-user routes for the Practice Relay lab API.
 * Why: login throttling must share the injected process runtime across requests.
 */
import { actorFrom, requireActor } from "./access.ts";
import { readJson, sendJson, sendProblem } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";

const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MAX_FAILED_LOGINS_PER_SOURCE = 100;
const MAX_TRACKED_LOGIN_KEYS = 10_000;

function loginSource(ctx: RequestContext): string {
  return ctx.req.socket?.remoteAddress ?? "unknown";
}

function loginAttemptKey(source: string, userId: string): string {
  return `${source}:${userId.slice(0, 128)}`;
}

function attemptRateLimited(
  attempts: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  now = Date.now(),
): boolean {
  const current = attempts.get(key);
  if (!current) return false;
  if (current.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return current.count >= limit;
}

function incrementFailure(
  attempts: Map<string, { count: number; resetAt: number }>,
  key: string,
  now = Date.now(),
): void {
  let current = attempts.get(key);
  if (current?.resetAt != null && current.resetAt <= now) {
    attempts.delete(key);
    current = undefined;
  }
  if (!current && attempts.size >= MAX_TRACKED_LOGIN_KEYS) {
    for (const [candidate, attempt] of attempts) {
      if (attempt.resetAt <= now) attempts.delete(candidate);
    }
  }
  // Never evict a live key to admit attacker-controlled cardinality. Source
  // aggregation still bounds failures when the account-key map is saturated.
  if (!current && attempts.size >= MAX_TRACKED_LOGIN_KEYS) return;
  attempts.set(key, {
    count: (current?.count ?? 0) + 1,
    resetAt: current?.resetAt ?? now + LOGIN_ATTEMPT_WINDOW_MS,
  });
}

async function serveLogin(ctx: RequestContext): Promise<void> {
  const { req, res, runtime } = ctx;
  const body = await readJson<{ userId?: string; password?: string }>(req);
  const userId = typeof body.userId === "string" ? body.userId : "";
  const password = typeof body.password === "string" ? body.password : "";
  const source = loginSource(ctx);
  const attemptKey = loginAttemptKey(source, userId);
  if (
    attemptRateLimited(
      runtime.failedLoginAttempts,
      attemptKey,
      MAX_FAILED_LOGIN_ATTEMPTS,
    ) ||
    attemptRateLimited(
      runtime.failedLoginSources,
      source,
      MAX_FAILED_LOGINS_PER_SOURCE,
    )
  ) {
    sendProblem(
      res,
      429,
      "Too Many Requests",
      "login temporarily rate limited",
    );
    return;
  }
  const session = runtime.auth.login(userId, password);
  if (!session) {
    incrementFailure(runtime.failedLoginAttempts, attemptKey);
    incrementFailure(runtime.failedLoginSources, source);
    sendProblem(res, 401, "Unauthorized", "invalid credentials");
    return;
  }
  runtime.failedLoginAttempts.delete(attemptKey);
  sendJson(res, 200, session);
}

function serveUsers(ctx: RequestContext): void {
  const { res, runtime } = ctx;
  const actor = requireActor(ctx);
  if (!actor) return;
  const role = runtime.auth.getUser(actor)?.defaultRole;
  if (role !== "faculty" && role !== "admin") {
    sendProblem(
      res,
      403,
      "Forbidden",
      "faculty or operations role required",
    );
    return;
  }
  sendJson(res, 200, runtime.auth.listUsers());
}

function serveCurrentUser(ctx: RequestContext): void {
  const { res, runtime } = ctx;
  const actor = actorFrom(ctx);
  if (!actor) {
    sendProblem(res, 401, "Unauthorized", "login required");
    return;
  }
  const user = runtime.auth.getUser(actor);
  sendJson(res, 200, {
    userId: actor,
    displayName: user?.displayName,
    defaultRole: user?.defaultRole,
  });
}

/** Handle authentication and current-user endpoints in their original order. */
export async function handleAuthRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  if (ctx.pathname === "/auth/login" && ctx.method === "POST") {
    await serveLogin(ctx);
    return "handled";
  }
  if (ctx.pathname === "/auth/users" && ctx.method === "GET") {
    serveUsers(ctx);
    return "handled";
  }
  if (ctx.pathname === "/me" && ctx.method === "GET") {
    serveCurrentUser(ctx);
    return "handled";
  }
  return "unmatched";
}
