/**
 * Ordered HTTP dispatcher for the Practice Relay API.
 * Why: route precedence, shared error translation, metrics, and logs stay explicit.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  corsHeaders,
  drainRequest,
  initializeResponseMeta,
  responseMetaOf,
  sendMethodNotAllowed,
  sendProblem,
} from "./api-http.ts";
import { recordRequestMetrics } from "./api-metrics.ts";
import { checkApiIngress } from "./api-ingress.ts";
import { logRequestLine } from "./api-observability.ts";
import { revisionConflict } from "./request-errors.ts";
import {
  createRequestContext,
  type RequestContext,
  type RouteResult,
} from "./request-context.ts";
import type { ApiRuntime } from "./runtime.ts";
import { handleAuthRoutes } from "./routes-auth.ts";
import { handleCommentResolveRoute } from "./routes-comment-resolve.ts";
import { handleDemoRoutes } from "./routes-demo.ts";
import { handleLtiRoutes } from "./routes-lti.ts";
import { handleMediaRoutes } from "./routes-media.ts";
import { handleRecordRoutes } from "./routes-record.ts";
import { handleRecordsCollectionRoutes } from "./routes-records-collection.ts";
import { handleSystemOpsRoutes } from "./routes-system-ops.ts";
import { handleWorkRecordRoutes } from "./routes-work-records.ts";

type RouteHandler = (ctx: RequestContext) => Promise<RouteResult>;

const orderedRoutes: readonly RouteHandler[] = [
  handleSystemOpsRoutes,
  handleLtiRoutes,
  handleAuthRoutes,
  handleDemoRoutes,
  handleWorkRecordRoutes,
  handleRecordsCollectionRoutes,
  handleCommentResolveRoute,
  handleMediaRoutes,
  handleRecordRoutes,
];

const allowedMethodsByPath: Readonly<Record<string, readonly string[]>> = {
  "/health": ["GET"],
  "/readyz": ["GET"],
  "/metrics": ["GET"],
  "/ops/backup": ["POST"],
  "/ops/backups": ["GET"],
  "/ops/restore": ["POST"],
  "/ops/audit": ["GET"],
  "/lti/login": ["GET", "POST"],
  "/lti/jwks": ["GET"],
  "/lti/oauth/token": ["POST"],
  "/lti/ags/scores": ["POST"],
  "/lti/launch": ["POST"],
  "/auth/login": ["POST"],
  "/auth/users": ["GET"],
  "/me": ["GET"],
  "/demo/export": ["GET"],
  "/profiles": ["GET"],
  "/work-records": ["GET", "POST"],
};

const nestedResourceMethodRules: readonly [RegExp, readonly string[]][] = [
  [/^\/work-records\/[^/]+\/comments\/[^/]+\/resolve$/, ["POST"]],
  [/^\/media\/.+/, ["GET"]],
  [/^\/work-records\/[^/]+$/, ["GET", "PATCH"]],
  [
    /^\/work-records\/[^/]+\/(artifacts|subjects|annotations|policies|snapshots|exports)$/,
    ["POST"],
  ],
];

function nestedResourceMethods(
  pathname: string,
): readonly string[] | undefined {
  return nestedResourceMethodRules.find(([pattern]) => pattern.test(pathname))?.[1];
}

async function dispatch(ctx: RequestContext): Promise<void> {
  if (ctx.method === "OPTIONS") {
    const meta = responseMetaOf(ctx.res);
    if (meta) meta.status = 204;
    ctx.res.writeHead(204, corsHeaders(ctx.requestId, meta?.corsOrigin));
    ctx.res.end();
    return;
  }
  for (const route of orderedRoutes) {
    if ((await route(ctx)) === "handled") return;
  }
  const allowedMethods =
    allowedMethodsByPath[ctx.pathname] ?? nestedResourceMethods(ctx.pathname);
  if (allowedMethods) {
    sendMethodNotAllowed(ctx.res, allowedMethods);
    return;
  }
  sendProblem(ctx.res, 404, "Not Found", "not found");
}

function translateRequestError(ctx: RequestContext, err: unknown): void {
  if (revisionConflict(err)) {
    sendProblem(
      ctx.res,
      409,
      "Conflict",
      err instanceof Error ? err.message : "record revision conflict",
    );
  } else if (err instanceof PayloadTooLargeError) {
    sendProblem(ctx.res, 413, "Payload Too Large", err.message);
  } else if (err instanceof InvalidJsonError) {
    sendProblem(ctx.res, 400, "Bad Request", err.message);
  } else if (err instanceof URIError) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid URL encoding");
  } else {
    sendProblem(
      ctx.res,
      500,
      "Internal Server Error",
      "unexpected internal error",
    );
  }
}

function recordRequest(ctx: RequestContext): void {
  const meta = responseMetaOf(ctx.res);
  if (!meta) return;
  const ms = Date.now() - meta.started;
  const status = meta.status || 0;
  recordRequestMetrics(ctx.method, ctx.pathname, status, ms);
  logRequestLine({
    level: "info",
    msg: "request",
    requestId: meta.requestId,
    method: ctx.method,
    path: ctx.pathname,
    status,
    ms,
  });
}

/** Handle one request against an explicit runtime without hidden dependency capture. */
export async function handleRequestWithRuntime(
  runtime: ApiRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = createRequestContext(runtime, req, res);
  const ingress = checkApiIngress(req, runtime.ingress);
  initializeResponseMeta(
    res,
    ctx.requestId,
    ingress.allowed ? ingress.allowedOrigin : undefined,
  );
  try {
    if (!ingress.allowed) {
      sendProblem(res, ingress.status, "Request Rejected", ingress.detail);
      return;
    }
    await dispatch(ctx);
  } catch (err) {
    translateRequestError(ctx, err);
  } finally {
    drainRequest(ctx.req);
    recordRequest(ctx);
  }
}
