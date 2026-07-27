/**
 * Core Practice Relay record resource, membership, version, and collaboration routes.
 * Why: common record document operations stay separate from domain mutations.
 */
import { addMember, type WorkRecord, type Role } from "@practice-relay/work-record-core";
import { collabEnabled } from "@practice-relay/collaboration";
import {
  guardMutation,
  requireAnyMutationAccess,
  requireMutationAccess,
  requireRecordForActor,
} from "./access.ts";
import { readJson, sendJson, sendProblem } from "./api-http.ts";
import { attemptRequestValue } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { persistRecord, syncCollab } from "./record-service.ts";

type PatchMember = { userId: string; role: Role };

type RecordPatchBody = {
  title?: string;
  members?: PatchMember[];
};

const applyTitlePatch = (
  ctx: RequestContext,
  record: WorkRecord,
  actorUserId: string,
  title: string | undefined,
): WorkRecord | undefined => {
  if (typeof title === "string") {
    const mutation = { record, actorUserId, mutation: "edit_record" as const };
    if (!guardMutation(ctx, mutation)) return undefined;
  }
  if (title !== undefined && typeof title !== "string") {
    sendProblem(ctx.res, 400, "Bad Request", "title must be a string");
    return undefined;
  }
  if (typeof title === "string" && !title.trim()) {
    sendProblem(ctx.res, 400, "Bad Request", "title must not be empty");
    return undefined;
  }
  if (typeof title !== "string") return record;
  const patched = { ...record };
  patched.title = title.trim();
  return patched;
};

const configuredMembersProblem = (
  ctx: RequestContext,
  members: PatchMember[],
): boolean => {
  if (members.some((member) =>
    !member ||
    typeof member.userId !== "string" ||
    !ctx.runtime.auth.getUser(member.userId))) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "every member must identify a configured user",
    );
    return true;
  }
  return false;
};

const adminAssignmentProblem = (
  ctx: RequestContext,
  actorUserId: string,
  members: PatchMember[],
): boolean => {
  if (
    members.some((member) => member?.role === "admin") &&
    ctx.runtime.auth.getUser(actorUserId)?.defaultRole !== "admin"
  ) {
    sendProblem(
      ctx.res,
      403,
      "Forbidden",
      "only an operations admin may assign admin",
    );
    return true;
  }
  return false;
};

const replaceMembers = (
  ctx: RequestContext,
  record: WorkRecord,
  members: PatchMember[],
): WorkRecord | undefined => {
  if (!members.length) {
    sendProblem(ctx.res, 400, "Bad Request", "members must not be empty");
    return undefined;
  }
  const validated = attemptRequestValue(ctx.res, () => {
    let candidate: WorkRecord = { ...record, members: [] };
    for (const member of members) candidate = addMember(candidate, member);
    if (!candidate.members.some((member) =>
      member.role === "faculty" || member.role === "admin")) {
      throw new Error("members must retain a faculty or admin member");
    }
    return candidate.members;
  });
  return validated.ok ? { ...record, members: validated.value } : undefined;
};

const applyMembersPatch = (
  ctx: RequestContext,
  record: WorkRecord,
  actorUserId: string,
  members: PatchMember[] | undefined,
): WorkRecord | undefined => {
  if (members === undefined) return record;
  if (!Array.isArray(members)) {
    sendProblem(ctx.res, 400, "Bad Request", "members must be an array");
    return undefined;
  }
  if (!guardMutation(ctx, { record, actorUserId, mutation: "edit_members" })) {
    return undefined;
  }
  if (configuredMembersProblem(ctx, members)) return undefined;
  if (adminAssignmentProblem(ctx, actorUserId, members)) return undefined;
  return replaceMembers(ctx, record, members);
};

async function patchRecord(
  ctx: RequestContext,
  recordId: string,
): Promise<void> {
  const access = requireAnyMutationAccess(
    ctx,
    recordId,
    ["edit_record", "edit_members"],
  );
  if (!access) return;
  const { actorUserId, record } = access;
  const body = await readJson<RecordPatchBody>(ctx.req);
  const titled = applyTitlePatch(ctx, record, actorUserId, body.title);
  if (!titled) return;
  const next = applyMembersPatch(ctx, titled, actorUserId, body.members);
  if (!next) return;
  const saved = persistRecord(ctx.runtime, recordId, next);
  sendJson(ctx.res, 200, saved);
}

async function addRecordMember(
  ctx: RequestContext,
  recordId: string,
): Promise<void> {
  const access = requireMutationAccess(ctx, recordId, "edit_members");
  if (!access) return;
  const { actorUserId: actor, record } = access;
  const body = await readJson<{ userId: string; role: Role }>(ctx.req);
  if (
    typeof body.userId !== "string" ||
    !ctx.runtime.auth.getUser(body.userId)
  ) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "member must identify a configured user",
    );
    return;
  }
  if (
    body.role === "admin" &&
    ctx.runtime.auth.getUser(actor)?.defaultRole !== "admin"
  ) {
    sendProblem(
      ctx.res,
      403,
      "Forbidden",
      "only an operations admin may assign admin",
    );
    return;
  }
  const next = attemptRequestValue(ctx.res, () =>
    addMember(record, { userId: body.userId, role: body.role }),
  );
  if (!next.ok) return;
  sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next.value));
}

/** Handle core actions for an already parsed generic record route. */
export async function handleRecordCoreRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  const { recordId, action } = params;
  if (!action && ctx.method === "GET") {
    const record = requireRecordForActor(ctx, recordId);
    if (record) sendJson(ctx.res, 200, record);
    return "handled";
  }
  if (!action && ctx.method === "PATCH") {
    await patchRecord(ctx, recordId);
    return "handled";
  }
  if (action === "members" && ctx.method === "POST") {
    await addRecordMember(ctx, recordId);
    return "handled";
  }
  if (action === "versions" && ctx.method === "GET") {
    const record = requireRecordForActor(ctx, recordId);
    if (record) {
      const events =
        "listEvents" in ctx.runtime.recordStore
          ? (
              ctx.runtime.recordStore as {
                listEvents: (id: string) => unknown[];
              }
            ).listEvents(recordId)
          : [];
      sendJson(ctx.res, 200, { versions: record.versions, events });
    }
    return "handled";
  }
  if (action === "collab" && ctx.method === "GET") {
    const record = requireRecordForActor(ctx, recordId);
    if (!record) return "handled";
    if (!collabEnabled()) {
      sendJson(ctx.res, 200, { enabled: false, status: "off" });
      return "handled";
    }
    syncCollab(ctx.runtime, record);
    const room = ctx.runtime.collabRooms.get(recordId)!;
    sendJson(ctx.res, 200, {
      enabled: true,
      status: "document-yjs",
      overlay: room.toRecordOverlay(),
    });
    return "handled";
  }
  return "unmatched";
}
