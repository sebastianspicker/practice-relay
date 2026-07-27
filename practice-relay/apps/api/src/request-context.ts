/**
 * Typed request context shared by Practice Relay API route groups.
 * Why: route modules receive one stable dependency object instead of hidden globals.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathnameOf, requestIdOf } from "./api-http.ts";
import type { ApiRuntime } from "./runtime.ts";

/** Values available to every route without eagerly consuming the request body. */
export type RequestContext = {
  runtime: ApiRuntime;
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  requestId: string;
};

/** Route dispatch result used to preserve ordered fall-through. */
export type RouteResult = "handled" | "unmatched";

/** Build the dependency context while leaving the incoming body untouched. */
export function createRequestContext(
  runtime: ApiRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): RequestContext {
  return {
    runtime,
    req,
    res,
    method: (req.method ?? "GET").toUpperCase(),
    pathname: pathnameOf(req),
    requestId: requestIdOf(req),
  };
}
