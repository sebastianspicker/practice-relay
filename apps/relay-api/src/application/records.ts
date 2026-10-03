/**
 * Record application services.
 *
 * HTTP adapters authorize and validate requests; this layer coordinates
 * canonical aggregate transitions and persistence.
 */
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  addMember,
  addTrack,
  asWorkRecordValidation,
  attachUsePolicySnapshot,
  createEmptyRecord,
  type Role,
  type WorkRecord,
} from "@practice-relay/work-record";
import type { RecordStoreAdapter } from "@practice-relay/record-store";
import type { ApiRuntime } from "../runtime.ts";

/** Return the durable adapter surface only when durability is explicitly claimed. */
export function durableStore(
  runtime: ApiRuntime,
): RecordStoreAdapter | undefined {
  const recordStore = runtime.recordStore;
  return recordStore.durable ? recordStore : undefined;
}

/** Describe the active record-store backend without probing mutable data. */
export function storeBackendLabel(runtime: ApiRuntime): string {
  return runtime.recordStore.backend;
}

/** Remove host paths from a backup manifest before HTTP serialization. */
export function publicBackup(manifest: Awaited<ReturnType<RecordStoreAdapter["backup"]>>) {
  return {
    createdAt: manifest.createdAt,
    recordCount: manifest.recordCount,
    recordIds: manifest.recordIds,
    tenantId: manifest.tenantId,
    backupId: path.basename(manifest.backupDir),
  };
}

/** Resolve a backup id beneath the durable root with lexical and realpath checks. */
export function backupPathForId(durable: RecordStoreAdapter, backupId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(backupId) || backupId === "." || backupId === "..") {
    throw new Error("invalid backupId");
  }
  const backupRoot = path.resolve(durable.rootDir, "backups");
  const candidate = path.resolve(backupRoot, backupId);
  if (!candidate.startsWith(`${backupRoot}${path.sep}`)) throw new Error("invalid backupId");
  const realRoot = realpathSync(backupRoot);
  const realCandidate = realpathSync(candidate);
  if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("backupId escapes backup root");
  }
  return realCandidate;
}

export { executeRecordCommand, mutateRecord } from "./mutations.ts";

/** Create a record owned by the authenticated creator. */
export async function createOwnedRecord(
  runtime: ApiRuntime,
  input: { id: string; title: string; actorUserId: string; role: Role },
): Promise<WorkRecord> {
  const record = asWorkRecordValidation(() => addMember(createEmptyRecord(input.id, input.title), {
    userId: input.actorUserId,
    role: input.role,
  }));
  return runtime.recordStore.create(record);
}

/** Build the consented multi-track record used by the public demo export. */
export function demoRecord(): WorkRecord {
  let record = createEmptyRecord("wr-demo", "Demo record");
  record = addTrack(record, { id: "v", type: "video", ref: "media/t.mp4" });
  record = addTrack(record, { id: "m", type: "music_notation", ref: "record.musicxml" });
  record = addTrack(record, { id: "a", type: "movement_annotation", ref: "move.json" });
  return attachUsePolicySnapshot(record, {
    id: "consent-demo",
    subjectId: "demo-subject",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
}
