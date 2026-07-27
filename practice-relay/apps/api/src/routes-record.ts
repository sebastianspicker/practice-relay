/**
 * Ordered generic record-resource dispatcher for Practice Relay.
 * Why: parse and decode the record path once before action-specific routing.
 */
import { sendMethodNotAllowed } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { handleRecordCoreRoute } from "./routes-record-core.ts";
import { handleRecordIntegrationRoute } from "./routes-record-integrations.ts";
import { handleRecordLtiRoute } from "./routes-lti.ts";
import { handleRecordMutationRoute } from "./routes-record-mutations.ts";

const recordActionMethods: Readonly<Record<string, readonly string[]>> = {
  tracks: ["POST"],
  takes: ["POST"],
  "preferred-take": ["PUT"],
  regions: ["POST"],
  comments: ["POST"],
  consent: ["POST"],
  submit: ["POST"],
  export: ["POST"],
  share: ["POST"],
  analysis: ["POST"],
  mvei: ["POST"],
  members: ["POST"],
  versions: ["GET"],
  lti: ["POST"],
  interop: ["POST"],
  collab: ["GET"],
};

/** Dispatch an exact generic record resource path in original action order. */
export async function handleRecordRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const match = ctx.pathname.match(
    /^\/work-records\/([^/]+)(?:\/(tracks|takes|preferred-take|regions|comments|consent|submit|export|share|analysis|mvei|members|versions|lti|interop|collab))?$/,
  );
  if (!match) return "unmatched";

  const params = {
    recordId: decodeURIComponent(match[1]!),
    action: match[2],
  };
  if ((await handleRecordCoreRoute(ctx, params)) === "handled") {
    return "handled";
  }
  if ((await handleRecordLtiRoute(ctx, params)) === "handled") {
    return "handled";
  }
  if ((await handleRecordIntegrationRoute(ctx, params)) === "handled") {
    return "handled";
  }
  if ((await handleRecordMutationRoute(ctx, params)) === "handled") {
    return "handled";
  }
  sendMethodNotAllowed(
    ctx.res,
    params.action ? recordActionMethods[params.action]! : ["GET", "PATCH"],
  );
  return "handled";
}
