/**
 * Shared optimistic-revision transition for record-store adapters.
 *
 * Why: durable and memory backends must reject stale writes identically.
 */
import type { WorkRecord } from "@practice-relay/work-record-core";
import { RecordRevisionConflictError } from "./types.js";

/** Return the next persisted record revision or reject a stale requested revision. */
export function withNextRecordRevision(
  id: string,
  previous: WorkRecord,
  requested: WorkRecord,
): WorkRecord {
  const previousRevision =
    typeof previous.revision === "number" ? previous.revision : 0;
  const receivedRevision = requested.revision;
  if (
    typeof receivedRevision === "number" &&
    receivedRevision !== previousRevision
  ) {
    throw new RecordRevisionConflictError(
      id,
      previousRevision,
      receivedRevision,
    );
  }
  return {
    ...requested,
    id,
    revision: previousRevision + 1,
  };
}
