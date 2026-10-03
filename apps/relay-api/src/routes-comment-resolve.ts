/**
 * Practice Relay comment-resolution route.
 * Why: the nested resolve path must run before generic record dispatch.
 */
import { COMMAND_PERMISSIONS } from "@practice-relay/work-record";
import { requireMutationAccess } from "./access.ts";
import { readJson, sendJson } from "./api-http.ts";
import { sendOperationError } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { executeRecordCommand } from "./application/records.ts";

async function serveCommentResolve(
  ctx: RequestContext,
  match: RegExpMatchArray,
): Promise<void> {
  const recordId = decodeURIComponent(match[1]!);
  const commentId = decodeURIComponent(match[2]!);
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["resolve-comment"]);
  if (!access) return;
  await readJson(ctx.req);
  try {
    sendJson(ctx.res, 200, await executeRecordCommand(ctx, recordId, {
      type: "resolve-comment", commentId,
    }));
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

/** Resolve a record comment while preserving pre-body record revision loading. */
export async function handleCommentResolveRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  const match = ctx.pathname.match(
    /^\/work-records\/([^/]+)\/comments\/([^/]+)\/resolve$/,
  );
  if (!match || ctx.method !== "POST") return "unmatched";
  await serveCommentResolve(ctx, match);
  return "handled";
}
