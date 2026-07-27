/**
 * Practice Relay comment-resolution route.
 * Why: the nested resolve path must run before generic record dispatch.
 */
import { resolveComment } from "@practice-relay/work-record-core";
import { requireMutationAccess } from "./access.ts";
import { readJson, sendJson } from "./api-http.ts";
import { sendOperationError } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { persistRecord } from "./record-service.ts";

async function serveCommentResolve(
  ctx: RequestContext,
  match: RegExpMatchArray,
): Promise<void> {
  const recordId = decodeURIComponent(match[1]!);
  const commentId = decodeURIComponent(match[2]!);
  const access = requireMutationAccess(ctx, recordId, "resolve_comment");
  if (!access) return;
  const { record } = access;
  await readJson(ctx.req);
  try {
    const next = resolveComment(record, commentId);
    const saved = persistRecord(ctx.runtime, recordId, next);
    sendJson(ctx.res, 200, saved);
  } catch (err) {
    sendOperationError(ctx.res, err, "resolve failed");
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
