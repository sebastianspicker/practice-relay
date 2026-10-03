/**
 * Core Practice Relay record resource, membership, and version routes.
 * Why: common record document operations stay separate from domain mutations.
 */
import {
  addMember,
  canMutate,
  assertCanMutate,
  isRole,
  WorkRecordRoleDeniedError,
  type WorkRecord,
  type Role,
} from "@practice-relay/work-record";
import {
  guardMutation,
  requireAnyMutationAccess,
  requireActor,
  requireRecordForActor,
} from "./access.ts";
import { readJson, sendJson, sendProblem, validResourceId } from "./api-http.ts";
import { attemptRequestValue } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { mutateRecord } from "./application/records.ts";

type ConfiguredPatchMember = { userId: string; role: unknown };
type OwnDataValue = { present: false } | { present: true; value: unknown };

const applyTitlePatch = (
  ctx: RequestContext,
  record: WorkRecord,
  actorUserId: string,
  title: unknown,
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
  if (typeof title === "string" && title.trim().length > 500) {
    sendProblem(ctx.res, 400, "Bad Request", "title must be at most 500 characters");
    return undefined;
  }
  if (typeof title !== "string") return record;
  const patched = { ...record };
  patched.title = title.trim();
  return patched;
};

const ownDataValue = (member: object, key: string): OwnDataValue => {
  const descriptor = Object.getOwnPropertyDescriptor(member, key);
  if (!descriptor || !("value" in descriptor)) return { present: false };
  const value: unknown = descriptor.value;
  return { present: true, value };
};

const configuredMember = (
  ctx: RequestContext,
  member: unknown,
): ConfiguredPatchMember | undefined => {
  if (member === null || typeof member !== "object") return undefined;
  const userIdValue = ownDataValue(member, "userId");
  if (!userIdValue.present) return undefined;
  const userId = userIdValue.value;
  if (
    typeof userId !== "string" ||
    ctx.runtime.auth.getUser(userId) === undefined
  ) {
    return undefined;
  }
  const roleValue = ownDataValue(member, "role");
  return { userId, role: roleValue.present ? roleValue.value : undefined };
};

const configuredMembersProblem = (
  ctx: RequestContext,
  members: unknown[],
): ConfiguredPatchMember[] | undefined => {
  const configuredMembers: ConfiguredPatchMember[] = [];
  for (const member of members) {
    const configuredMemberValue = configuredMember(ctx, member);
    if (!configuredMemberValue) {
      sendProblem(
        ctx.res,
        400,
        "Bad Request",
        "every member must identify a configured user",
      );
      return undefined;
    }
    configuredMembers.push(configuredMemberValue);
  }
  return configuredMembers;
};

const supportedRoleMember = (
  member: ConfiguredPatchMember,
): member is { userId: string; role: Role } => isRole(member.role);

const adminAssignmentProblem = (
  ctx: RequestContext,
  actorUserId: string,
  members: ConfiguredPatchMember[],
): boolean => {
  if (
    members.some((member) => member.role === "admin") &&
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
  members: ConfiguredPatchMember[],
): WorkRecord | undefined => {
  if (!members.length) {
    sendProblem(ctx.res, 400, "Bad Request", "members must not be empty");
    return undefined;
  }
  const validated = attemptRequestValue(ctx.res, () => {
    let candidate: WorkRecord = { ...record, members: [] };
    for (const member of members) {
      if (!supportedRoleMember(member)) {
        throw new Error("role must be a supported record role");
      }
      candidate = addMember(candidate, member);
    }
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
  members: unknown,
): WorkRecord | undefined => {
  if (members === undefined) return record;
  if (!Array.isArray(members)) {
    sendProblem(ctx.res, 400, "Bad Request", "members must be an array");
    return undefined;
  }
  if (!guardMutation(ctx, { record, actorUserId, mutation: "edit_members" })) {
    return undefined;
  }
  const configuredMembers = configuredMembersProblem(ctx, members);
  if (!configuredMembers) return undefined;
  if (adminAssignmentProblem(ctx, actorUserId, configuredMembers)) return undefined;
  return replaceMembers(ctx, record, configuredMembers);
};

async function patchRecord(
  ctx: RequestContext,
  recordId: string,
): Promise<void> {
  const access = await requireAnyMutationAccess(
    ctx,
    recordId,
    ["edit_record", "edit_members"],
  );
  if (!access) return;
  const { actorUserId, record } = access;
  const body = await readJson<object>(ctx.req);
  const title = ownDataValue(body, "title");
  const members = ownDataValue(body, "members");
  const titled = applyTitlePatch(
    ctx,
    record,
    actorUserId,
    title.present ? title.value : undefined,
  );
  if (!titled) return;
  const next = applyMembersPatch(
    ctx,
    titled,
    actorUserId,
    members.present ? members.value : undefined,
  );
  if (!next) return;
  const revision = ownDataValue(body, "revision");
  const saved = await mutateRecord(ctx, recordId, (latest) => ({
    ...latest,
    ...(title.present ? { title: next.title } : {}),
    ...(members.present ? { members: next.members } : {}),
  }), {
    mutations: [...(title.present ? ["edit_record" as const] : []), ...(members.present ? ["edit_members" as const] : [])],
    revision: revision.present ? revision.value : undefined,
    kind: "patch",
  });
  sendJson(ctx.res, 200, saved);
}

async function addRecordMember(
  ctx: RequestContext,
  recordId: string,
): Promise<void> {
  const access = await requireAnyMutationAccess(ctx, recordId, [
    "edit_members",
    "invite_faculty",
  ]);
  if (!access) return;
  const { actorUserId: actor, record } = access;
  const body = await readJson<object>(ctx.req);
  const userIdValue = ownDataValue(body, "userId");
  if (
    !userIdValue.present ||
    typeof userIdValue.value !== "string" ||
    ctx.runtime.auth.getUser(userIdValue.value) === undefined
  ) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "member must identify a configured user",
    );
    return;
  }
  const roleValue = ownDataValue(body, "role");
  const member: ConfiguredPatchMember = {
    userId: userIdValue.value,
    role: roleValue.present ? roleValue.value : undefined,
  };
  if (!canMutate(record, actor, "edit_members")) {
    const account = ctx.runtime.auth.getUser(member.userId);
    if (member.role !== "faculty" || account?.defaultRole !== "faculty") {
      sendProblem(
        ctx.res,
        403,
        "Forbidden",
        "student creators may invite only configured faculty accounts",
      );
      return;
    }
  }
  if (
    member.role === "admin" &&
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
  const next = attemptRequestValue(ctx.res, () => {
    if (!supportedRoleMember(member)) {
      throw new Error("role must be a supported record role");
    }
    return addMember(record, member);
  });
  if (!next.ok) return;
  const saved = await mutateRecord(ctx, recordId, (latest) => {
    if (!canMutate(latest, actor, "edit_members")) {
      assertCanMutate(latest, actor, "invite_faculty");
      if (member.role !== "faculty" || ctx.runtime.auth.getUser(member.userId)?.defaultRole !== "faculty") {
        throw new WorkRecordRoleDeniedError("role denied: student creators may invite only configured faculty accounts");
      }
    }
    if (!supportedRoleMember(member)) throw new Error("role must be a supported record role");
    return addMember(latest, member);
  }, { mutations: [], kind: "add-member" });
  sendJson(ctx.res, 200, saved);
}

async function sendRecordVersions(ctx: RequestContext, recordId: string): Promise<void> {
  const actor = requireActor(ctx);
  if (!actor) return;
  if (!validResourceId(recordId)) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid record id");
    return;
  }
  const snapshot = await ctx.runtime.recordStore.readWithEvents(recordId, (record) => {
    if (!record.members.some((member) => member.userId === actor)) {
      throw new WorkRecordRoleDeniedError("role denied: record membership required");
    }
  });
  if (!snapshot) {
    sendProblem(ctx.res, 404, "Not Found", `record ${recordId} not found`);
    return;
  }
  sendJson(ctx.res, 200, { versions: snapshot.record.versions, events: snapshot.events });
}

/** Handle core actions for an already parsed generic record route. */
export async function handleRecordCoreRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  const { recordId, action } = params;
  const baseRoute = action === undefined || action === "";
  if (baseRoute && ctx.method === "GET") {
    const record = await requireRecordForActor(ctx, recordId);
    if (record) sendJson(ctx.res, 200, record);
    return "handled";
  }
  if (baseRoute && ctx.method === "PATCH") {
    await patchRecord(ctx, recordId);
    return "handled";
  }
  if (action === "members" && ctx.method === "POST") {
    await addRecordMember(ctx, recordId);
    return "handled";
  }
  if (action === "versions" && ctx.method === "GET") {
    await sendRecordVersions(ctx, recordId);
    return "handled";
  }
  return "unmatched";
}
