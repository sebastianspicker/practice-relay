/** Latest-record mutation and authorization inside the adapter transaction. */
import { asWorkRecordValidation, assertCanMutate, requiredPermission, transitionWorkRecord, WorkRecordRoleDeniedError, type RecordMutation, type WorkRecord, type WorkRecordCommand } from "@practice-relay/work-record";
import { actorFrom } from "../access.ts";
import type { RequestContext } from "../request-context.ts";

/** A malformed explicit revision is a client error before persistence starts. */
export class InvalidRevisionError extends Error {}

/** Parse an optional explicit revision; absence means transition the latest aggregate. */
export function expectedRevision(ctx: RequestContext, bodyRevision?: unknown): number | undefined {
  const header = ctx.req.headers["if-match"];
  let value: unknown = bodyRevision;
  if (header !== undefined) {
    if (typeof header !== "string" || !/^("[0-9]+"|[0-9]+)$/.test(header)) throw new InvalidRevisionError("invalid If-Match revision");
    value = Number(header.replaceAll('"', ""));
    if (bodyRevision !== undefined && value !== bodyRevision) throw new InvalidRevisionError("revision and If-Match disagree");
  }
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new InvalidRevisionError("invalid revision");
  return value;
}

/**
 * Authorize against the locked canonical document, then persist and audit atomically.
 * Uncoded failures of the pure transition are client-attributable validation errors;
 * failures of the store itself stay unclassified.
 */
export async function mutateRecord(
  ctx: RequestContext,
  recordId: string,
  transition: (record: WorkRecord) => WorkRecord,
  options: { mutations: readonly RecordMutation[]; revision?: unknown; kind?: string },
): Promise<WorkRecord> {
  const actor = actorFrom(ctx);
  if (!actor) throw new WorkRecordRoleDeniedError("role denied: valid bearer session required");
  return ctx.runtime.recordStore.mutate(recordId, (latest) => {
    if (!latest.members.some((member) => member.userId === actor)) throw new WorkRecordRoleDeniedError("role denied: record membership required");
    for (const mutation of options.mutations) assertCanMutate(latest, actor, mutation);
    return asWorkRecordValidation(() => transition(latest));
  }, { expectedRevision: expectedRevision(ctx, options.revision), actorId: actor, kind: options.kind ?? "mutation" });
}

/** Apply one domain command to the latest record with its canonical permission. */
export function executeRecordCommand(ctx: RequestContext, recordId: string, command: WorkRecordCommand): Promise<WorkRecord> {
  return mutateRecord(ctx, recordId, (record) => transitionWorkRecord(record, command), {
    mutations: [requiredPermission(command)], kind: command.type,
  });
}
