/**
 * Practice Relay record-collection HTTP routes.
 * Why: collection membership and creator identity remain bearer-derived.
 */
import { randomUUID } from "node:crypto";
import type { Role } from "@practice-relay/work-record";
import { requireActor } from "./access.ts";
import { readJson, sendJson, sendProblem, validResourceId } from "./api-http.ts";
import { attemptRequestValue, attemptRequestOperation } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { parseCollectionQuery, collectionCursor } from "./collection-pagination.ts";
import { createOwnedRecord } from "./application/records.ts";

async function serveRecordsCollection(ctx: RequestContext): Promise<void> {
  const { method, req, res, runtime } = ctx;
  if (method === "GET") {
    const actor = requireActor(ctx);
    if (actor === undefined) return;
    const parsed = attemptRequestValue(res, () => parseCollectionQuery(ctx, actor));
    if (!parsed.ok) return;
    const page = await runtime.recordStore.listSummariesByMember(actor, parsed.value);
    const last = page.items.at(-1);
    sendJson(res, 200, {
      items: page.items,
      nextCursor: page.hasMore && last ? collectionCursor(ctx, actor, parsed.value.title, last.id) : null,
    });
    return;
  }

  const actor = requireActor(ctx);
  if (actor === undefined) return;
  const body = await readJson<{
    id?: unknown;
    title?: unknown;
    members?: { userId: string; role: Role }[];
  }>(req);
  if (body.members !== undefined) {
    sendProblem(
      res,
      400,
      "Bad Request",
      "members cannot be set during record creation",
    );
    return;
  }
  if (body.id !== undefined && typeof body.id !== "string") {
    sendProblem(res, 400, "Bad Request", "invalid record id");
    return;
  }
  const trimmedId = typeof body.id === "string" ? body.id.trim() : undefined;
  const id =
    trimmedId === undefined || trimmedId === ""
      ? `wr-${randomUUID()}`
      : trimmedId;
  if (!validResourceId(id)) {
    sendProblem(res, 400, "Bad Request", "invalid record id");
    return;
  }
  if ((await runtime.recordStore.get(id)) !== undefined) {
    sendProblem(res, 409, "Conflict", `record ${id} already exists`);
    return;
  }
  const defaultRole = runtime.auth.getUser(actor)?.defaultRole;
  if (
    defaultRole !== "student" &&
    defaultRole !== "faculty" &&
    defaultRole !== "admin"
  ) {
    sendProblem(
      res,
      403,
      "Forbidden",
      "this account role cannot create records",
    );
    return;
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    sendProblem(
      res,
      400,
      "Bad Request",
      "record title must be a non-empty string of at most 500 characters",
    );
    return;
  }
  const trimmedTitle =
    typeof body.title === "string" ? body.title.trim() : undefined;
  const title =
    trimmedTitle === undefined || trimmedTitle === "" ? "Untitled" : trimmedTitle;
  const created = await attemptRequestOperation(res, () => createOwnedRecord(runtime, {
    id, title, actorUserId: actor, role: defaultRole,
  }));
  if (!created.ok) return;
  const saved = created.value;
  sendJson(res, 201, saved);
}

/** Handle GET/POST on the exact `/work-records` collection path. */
export async function handleRecordsCollectionRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  if (
    ctx.pathname !== "/work-records" ||
    (ctx.method !== "GET" && ctx.method !== "POST")
  ) {
    return "unmatched";
  }
  await serveRecordsCollection(ctx);
  return "handled";
}
