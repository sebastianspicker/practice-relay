/**
 * Record persistence and operational helpers for the Practice Relay API.
 * Why: route groups share one persistence seam and collaboration side effect.
 */
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  addTrack,
  attachUsePolicySnapshot,
  createEmptyRecord,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import { collabEnabled, createRecordCollabRoom } from "@practice-relay/collaboration";
import {
  createDurableRecordStore,
  type RecordStoreAdapter,
} from "@practice-relay/record-store";
import type { ApiRuntime } from "./runtime.ts";

/** Return the durable adapter surface when the active record store supports it. */
export function durableStore(
  runtime: ApiRuntime,
): ReturnType<typeof createDurableRecordStore> | undefined {
  const recordStore = runtime.recordStore;
  if ("backup" in recordStore && "restoreFromBackup" in recordStore) {
    return recordStore as ReturnType<typeof createDurableRecordStore>;
  }
  return undefined;
}

/** Describe the active record-store backend without probing mutable data. */
export function storeBackendLabel(runtime: ApiRuntime): string {
  const recordStore = runtime.recordStore;
  if (
    "backend" in recordStore &&
    typeof (recordStore as RecordStoreAdapter).backend === "string"
  ) {
    return (recordStore as RecordStoreAdapter).backend!;
  }
  if (process.env.PRACTICE_RELAY_DATA) return "json";
  return "memory";
}

/** Remove host paths from a backup manifest before returning it over HTTP. */
export function publicBackup(
  manifest: ReturnType<RecordStoreAdapter["backup"]>,
) {
  return {
    createdAt: manifest.createdAt,
    recordCount: manifest.recordCount,
    recordIds: manifest.recordIds,
    tenantId: manifest.tenantId,
    backupId: path.basename(manifest.backupDir),
  };
}

/** Resolve a backup id beneath the durable root with lexical and realpath checks. */
export function backupPathForId(
  durable: RecordStoreAdapter,
  backupId: string,
): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(backupId) ||
    backupId === "." ||
    backupId === ".."
  ) {
    throw new Error("invalid backupId");
  }
  const backupRoot = path.resolve(durable.rootDir, "backups");
  const candidate = path.resolve(backupRoot, backupId);
  const rootPrefix = `${backupRoot}${path.sep}`;
  if (!candidate.startsWith(rootPrefix)) throw new Error("invalid backupId");
  const realRoot = realpathSync(backupRoot);
  const realCandidate = realpathSync(candidate);
  if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("backupId escapes backup root");
  }
  return realCandidate;
}

/** Build the consented multi-track record used by the demo export endpoint. */
export function demoRecord(): WorkRecord {
  let record = createEmptyRecord("ps-demo", "Demo record");
  record = addTrack(record, { id: "v", type: "video", ref: "media/t.mp4" });
  record = addTrack(record, {
    id: "m",
    type: "music_notation",
    ref: "record.musicxml",
  });
  record = addTrack(record, {
    id: "a",
    type: "movement_annotation",
    ref: "move.json",
  });
  return attachUsePolicySnapshot(record, {
    id: "consent-demo",
    subjectId: "demo-subject",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
}

/** Apply a saved record to the optional process-local collaboration room. */
export function syncCollab(
  runtime: ApiRuntime,
  record: WorkRecord,
): void {
  if (!collabEnabled()) return;
  let room = runtime.collabRooms.get(record.id);
  if (!room) {
    room = createRecordCollabRoom(record.id);
    runtime.collabRooms.set(record.id, room);
  }
  room.applyRecord(record);
}

/** Persist one record revision and mirror the saved value into collaboration. */
export function persistRecord(
  runtime: ApiRuntime,
  recordId: string,
  next: WorkRecord,
): WorkRecord {
  const saved = runtime.recordStore.update(recordId, next);
  syncCollab(runtime, saved);
  return saved;
}
