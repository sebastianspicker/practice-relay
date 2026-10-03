/**
 * Authentication and current-user routes for the Practice Relay lab API.
 * Why: login throttling must share the injected process runtime across requests.
 */
import { createHash } from "node:crypto";
import { AuthenticationBusyError, type AuthSession } from "@practice-relay/auth";
import { actorFrom, requireActor } from "./access.ts";
import { readJson, sendJson, sendProblem } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";

function loginSource(ctx: RequestContext): string {
  const request: {
    readonly socket?: { readonly remoteAddress?: string };
  } = ctx.req;
  return request.socket?.remoteAddress ?? "unknown";
}

async function serveLogin(ctx: RequestContext): Promise<void> {
  const { req, res, runtime } = ctx;
  const body = await readJson<{ userId?: string; password?: string }>(req);
  const userId = typeof body.userId === "string" ? body.userId : "";
  const password = typeof body.password === "string" ? body.password : "";
  const source = loginSource(ctx);
  const account = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(userId)
    ? `account:${userId}`
    : `invalid:${createHash("sha256").update(userId).digest("hex")}`;
  const attempt = await runtime.coordination.beginLogin({ account, source });
  if (!attempt) {
    sendProblem(res, 429, "Too Many Requests", "login temporarily rate limited");
    return;
  }
  let session: AuthSession | null = null;
  let outcome: boolean | null = null;
  try {
    session = await runtime.auth.login(userId, password);
    outcome = session !== null;
  } catch (error) {
    if (!(error instanceof AuthenticationBusyError)) throw error;
    sendProblem(res, 429, "Too Many Requests", "authentication capacity exhausted");
    return;
  } finally {
    await runtime.coordination.finishLogin(attempt, outcome);
  }
  if (!session) { sendProblem(res, 401, "Unauthorized", "invalid credentials"); return; }
  sendJson(res, 200, session);
}

function serveUsers(ctx: RequestContext): void {
  const { res, runtime } = ctx;
  const actor = requireActor(ctx);
  if (actor === undefined || actor === "") return;
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
  if (actor === undefined || actor === "") {
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
