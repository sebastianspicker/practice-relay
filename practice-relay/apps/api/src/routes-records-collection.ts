/**
 * Practice Relay record-collection HTTP routes.
 * Why: collection membership and creator identity remain bearer-derived.
 */
import { randomUUID } from "node:crypto";
import {
  addMember,
  createEmptyRecord,
  type WorkRecord,
  type Role,
} from "@practice-relay/work-record-core";
import { requireActor } from "./access.ts";
import { readJson, sendJson, sendProblem, validResourceId } from "./api-http.ts";
import { attemptRequestValue } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { syncCollab } from "./record-service.ts";

async function serveRecordsCollection(ctx: RequestContext): Promise<void> {
  const { method, req, res, runtime } = ctx;
  if (method === "GET") {
    const actor = requireActor(ctx);
    if (!actor) return;
    if ("listByMember" in runtime.recordStore) {
      sendJson(
        res,
        200,
        (
          runtime.recordStore as {
            listByMember: (userId: string) => WorkRecord[];
          }
        ).listByMember(actor),
      );
      return;
    }
    sendJson(
      res,
      200,
      runtime.recordStore
        .list()
        .filter((record) =>
          record.members.some((member) => member.userId === actor),
        ),
    );
    return;
  }

  const actor = requireActor(ctx);
  if (!actor) return;
  const body = await readJson<{
    id?: string;
    title?: string;
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
  const id = body.id?.trim() || `ps-${randomUUID()}`;
  if (!validResourceId(id)) {
    sendProblem(res, 400, "Bad Request", "invalid record id");
    return;
  }
  if (runtime.recordStore.get(id)) {
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
  const created = attemptRequestValue(res, () =>
    createEmptyRecord(id, body.title?.trim() || "Untitled"),
  );
  if (!created.ok) return;
  const record = addMember(created.value, {
    userId: actor,
    role: defaultRole,
  });
  const saved = runtime.recordStore.create(record);
  syncCollab(runtime, saved);
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
