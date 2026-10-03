/**
 * Shared optimistic-revision transition for record-store adapters.
 *
 * Why: durable and memory backends must reject stale writes identically.
 */
import { asWorkRecordValidation, parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
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

/** Parse a record about to be written; schema failures are client-attributable validation errors. */
export function parseWrittenRecord(record: unknown): WorkRecord {
  return asWorkRecordValidation(() => parseWorkRecord(record));
}

/** Parse the requested transition result and assign its next revision. */
export function parseNextRecord(
  id: string,
  previous: WorkRecord,
  requested: unknown,
): WorkRecord {
  return asWorkRecordValidation(() =>
    parseWorkRecord(withNextRecordRevision(id, previous, parseWorkRecord(requested))),
  );
}
