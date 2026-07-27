/**
 * Public durable-store contracts and revision-conflict error.
 *
 * Why: JSON and memory backends expose one stable record-store integration surface.
 */
import type { WorkRecord, RecordStore } from "@practice-relay/work-record-core";

/** Configuration for a path-scoped durable JSON record store. */
export interface DurableStoreOptions {
  /** Root data directory (created if missing). Default: ./data/practice-relay */
  rootDir: string;
  /**
   * Optional tenant path prefix. Records, events, audit, and backups live under
   * `{rootDir}/{tenantId}`. Callers select this value, so it is not an authorization boundary.
   */
  tenantId?: string;
}

/** Append-only record audit event persisted by store adapters. */
export interface RecordEvent {
  at: string;
  kind: string;
  recordId: string;
  detail?: string;
  /** Actor userId when known (audit). */
  actorId?: string;
}

/** Validated inventory describing one durable-store backup. */
export interface BackupManifest {
  createdAt: string;
  rootDir: string;
  recordCount: number;
  recordIds: string[];
  backupDir: string;
  tenantId?: string;
}

/** Operational health counters exposed by a record-store adapter. */
export interface StoreHealthMetrics {
  recordCount: number;
  auditEventCount: number;
  rootDir: string;
  durable: boolean;
  tenantId?: string;
  backend?: string;
}

/**
 * Record-store adapter with an optional tenant path namespace.
 * JSON filesystem is the lab default; swap implementations without changing API routes.
 */
export interface RecordStoreAdapter extends RecordStore {
  listByMember: (userId: string) => WorkRecord[];
  appendEvent: (
    recordId: string,
    kind: string,
    detail?: string,
    actorId?: string,
  ) => void;
  listEvents: (recordId: string) => RecordEvent[];
  listAllEvents: () => RecordEvent[];
  backup: (backupRoot?: string) => BackupManifest;
  listBackups: (backupRoot?: string) => BackupManifest[];
  /** Restore records/events/audit from a backup directory (lab drill). */
  restoreFromBackup: (backupDir: string) => BackupManifest;
  healthMetrics: () => StoreHealthMetrics;
  rootDir: string;
  /** Optional tenant path namespace selected by the caller. */
  tenantId?: string;
  /** Backend label: json | memory */
  backend?: string;
}

/** Optimistic-concurrency failure raised when a stale record is persisted. */
export class RecordRevisionConflictError extends Error {
  constructor(
    readonly recordId: string,
    readonly expectedRevision: number,
    readonly receivedRevision: number,
  ) {
    super(
      `record ${recordId} revision conflict: expected ${expectedRevision}, received ${receivedRevision}`,
    );
    this.name = "RecordRevisionConflictError";
  }
}

/** @deprecated Prefer RecordStoreAdapter name; same shape. */
export type DurableRecordStore = RecordStoreAdapter;

/**
 * PRACTICE_RELAY_STORE values for in-tree backends.
 * `postgres` is intentionally not a runtime value here - see createPostgresRecordStore.
 */
export type RecordStoreBackend = "json" | "memory";
