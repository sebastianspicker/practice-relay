/**
 * Authentication and record-access guards for Practice Relay API routes.
 * Why: all guards must use the runtime attached to the current request.
 */
import {
  assertCanMutate,
  canMutate,
  type WorkRecord,
  type RecordMutation,
} from "@practice-relay/work-record-core";
import { sendProblem, validResourceId } from "./api-http.ts";
import type { RequestContext } from "./request-context.ts";

/** Resolve the bearer actor for the current runtime, if present. */
export function actorFrom(ctx: RequestContext): string | undefined {
  const authz = ctx.req.headers?.authorization;
  if (typeof authz === "string") {
    const session = ctx.runtime.auth.verify(authz);
    if (session) return session.userId;
  }
  return undefined;
}

/** Require a valid bearer actor and emit the shared 401 problem on failure. */
export function requireActor(ctx: RequestContext): string | undefined {
  const actor = actorFrom(ctx);
  if (!actor) {
    sendProblem(
      ctx.res,
      401,
      "Unauthorized",
      "valid bearer session required",
    );
  }
  return actor;
}

/** Check a record mutation against the actor's record role. */
export function guardMutation(
  ctx: RequestContext,
  input: {
    record: WorkRecord;
    actorUserId: string | undefined;
    mutation: RecordMutation;
  },
): boolean {
  if (!input.actorUserId) {
    sendProblem(
      ctx.res,
      401,
      "Unauthorized",
      "valid bearer session required",
    );
    return false;
  }
  try {
    assertCanMutate(input.record, input.actorUserId, input.mutation);
    return true;
  } catch (err) {
    sendProblem(
      ctx.res,
      403,
      "Forbidden",
      err instanceof Error ? err.message : "role denied",
    );
    return false;
  }
}

/** Load a valid record identifier or emit the canonical request problem. */
export function requireRecord(
  ctx: RequestContext,
  id: string,
): WorkRecord | undefined {
  if (!validResourceId(id)) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid record id");
    return undefined;
  }
  const record = ctx.runtime.recordStore.get(id);
  if (!record) {
    sendProblem(ctx.res, 404, "Not Found", `record ${id} not found`);
    return undefined;
  }
  return record;
}

type RecordAccess = {
  actorUserId: string;
  record: WorkRecord;
};

function requireRecordAccess(
  ctx: RequestContext,
  id: string,
): RecordAccess | undefined {
  const actorUserId = requireActor(ctx);
  if (!actorUserId) return undefined;
  const record = requireRecord(ctx, id);
  if (!record) return undefined;
  if (
    !(record.members ?? []).some(
      (member) => member.userId === actorUserId,
    )
  ) {
    sendProblem(ctx.res, 403, "Forbidden", "record membership required");
    return undefined;
  }
  return { actorUserId, record };
}

/** Require both a bearer actor and membership in the requested record. */
export function requireRecordForActor(
  ctx: RequestContext,
  id: string,
): WorkRecord | undefined {
  return requireRecordAccess(ctx, id)?.record;
}

/** Authorize a known record mutation before reading its request body. */
export function requireMutationAccess(
  ctx: RequestContext,
  id: string,
  mutation: RecordMutation,
): RecordAccess | undefined {
  const access = requireRecordAccess(ctx, id);
  if (!access) return undefined;
  if (
    !guardMutation(ctx, {
      record: access.record,
      actorUserId: access.actorUserId,
      mutation,
    })
  ) {
    return undefined;
  }
  return access;
}

/** Require permission for at least one body-selected mutation before parsing. */
export function requireAnyMutationAccess(
  ctx: RequestContext,
  id: string,
  mutations: readonly RecordMutation[],
): RecordAccess | undefined {
  const access = requireRecordAccess(ctx, id);
  if (!access) return undefined;
  if (
    !mutations.some((mutation) =>
      canMutate(access.record, access.actorUserId, mutation),
    )
  ) {
    sendProblem(ctx.res, 403, "Forbidden", "role denied for this mutation");
    return undefined;
  }
  return access;
}

/** Require an operations-admin account for process-level endpoints. */
export function requireOpsAdmin(ctx: RequestContext): string | undefined {
  const actor = requireActor(ctx);
  if (!actor) return undefined;
  if (ctx.runtime.auth.getUser(actor)?.defaultRole !== "admin") {
    sendProblem(ctx.res, 403, "Forbidden", "operations admin role required");
    return undefined;
  }
  return actor;
}
