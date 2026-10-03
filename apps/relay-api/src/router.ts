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
import { INTERNAL_ERROR_DETAIL, logUnclassifiedError, sendClassifiedError } from "./request-errors.ts";
import { InvalidRevisionError } from "./application/mutations.ts";
import {
  createRequestContext,
  type RequestContext,
  type RouteResult,
} from "./request-context.ts";
import type { ApiRuntime } from "./runtime.ts";
import { publicRouteForPath } from "./public-routes.ts";
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

async function dispatch(ctx: RequestContext): Promise<void> {
  if (ctx.method === "OPTIONS") {
    const meta = responseMetaOf(ctx.res);
    if (meta) meta.status = 204;
    ctx.res.writeHead(204, corsHeaders(ctx.requestId, meta?.corsOrigin));
    ctx.res.end();
    return;
  }
  const publicRoute = publicRouteForPath(ctx.pathname);
  if (!publicRoute) {
    sendProblem(ctx.res, 404, "Not Found", "not found");
    return;
  }
  if (!publicRoute.methods.includes(ctx.method)) {
    if (publicRoute.concealMethodMismatch) {
      sendProblem(ctx.res, 404, "Not Found", "not found");
    } else {
      sendMethodNotAllowed(ctx.res, publicRoute.methods);
    }
    return;
  }
  for (const route of orderedRoutes) {
    if ((await route(ctx)) === "handled") return;
  }
  sendProblem(ctx.res, 500, "Internal Server Error", "registered route has no handler");
}

function translateRequestError(ctx: RequestContext, err: unknown): void {
  if (sendClassifiedError(ctx.res, err, { duplicateDetail: "record already exists" })) return;
  if (err instanceof PayloadTooLargeError) {
    sendProblem(ctx.res, 413, "Payload Too Large", err.message);
  } else if (err instanceof InvalidJsonError || err instanceof InvalidRevisionError) {
    sendProblem(ctx.res, 400, "Bad Request", err.message);
  } else if (err instanceof URIError) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid URL encoding");
  } else {
    logUnclassifiedError(ctx.res, err);
    sendProblem(
      ctx.res,
      500,
      "Internal Server Error",
      INTERNAL_ERROR_DETAIL,
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
