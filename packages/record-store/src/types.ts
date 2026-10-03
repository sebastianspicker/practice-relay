/**
 * Public durable-store contracts and revision-conflict error.
 *
 * Why: JSON and memory backends expose one stable record-store integration surface.
 */
import type { WorkRecord, RecordStore } from "@practice-relay/work-record";

/** Configuration for a path-scoped durable JSON record store. */
export interface DurableStoreOptions {
  /** Root data directory (created if missing). Default: ./data/practice-relay */
  readonly rootDir: string;
  /**
   * Optional tenant path prefix. Records, events, audit, and backups live under
   * `{rootDir}/{tenantId}`. Callers select this value, so it is not an authorization boundary.
   */
  readonly tenantId?: string;
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
  readonly durable: boolean;
  tenantId?: string;
  backend?: string;
}

/**
 * Record-store adapter with an optional tenant path namespace.
 * JSON filesystem is the lab default; swap implementations without changing API routes.
 */
export interface RecordStoreAdapter extends RecordStore {
  readWithEvents: (
    id: string,
    authorize: (record: WorkRecord) => void,
  ) => Promise<RecordWithEvents | undefined>;
  listByMember: (userId: string) => Promise<WorkRecord[]>;
  listSummariesByMember: (
    userId: string,
    options: RecordSummaryQuery,
  ) => Promise<RecordSummaryPage>;
  appendEvent: (
    recordId: string,
    kind: string,
    detail?: string,
    actorId?: string,
  ) => Promise<void>;
  listEvents: (recordId: string) => Promise<RecordEvent[]>;
  listAllEvents: () => Promise<RecordEvent[]>;
  backup: (backupRoot?: string) => Promise<BackupManifest>;
  listBackups: (backupRoot?: string) => Promise<BackupManifest[]>;
  /** Restore records/events/audit from a backup directory (lab drill). */
  restoreFromBackup: (backupDir: string) => Promise<BackupManifest>;
  healthMetrics: () => Promise<StoreHealthMetrics>;
  checkHealth: () => Promise<void>;
  close: () => Promise<void>;
  rootDir: string;
  /** Optional tenant path namespace selected by the caller. */
  tenantId?: string;
  /** True only when the adapter persists records and operations state durably. */
  durable: boolean;
  /** Backend label for this adapter. */
  readonly backend: RecordStoreBackend;
}

/** Code carried by every optimistic-concurrency failure. */
export const RECORD_REVISION_CONFLICT = "RECORD_REVISION_CONFLICT";

/** Optimistic-concurrency failure raised when a stale record is persisted. */
export class RecordRevisionConflictError extends Error {
  readonly code = RECORD_REVISION_CONFLICT;

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

/** Identify a revision conflict by its stable code, independent of class identity. */
export function isRecordRevisionConflict(err: unknown): err is RecordRevisionConflictError {
  return err instanceof Error && (err as { code?: unknown }).code === RECORD_REVISION_CONFLICT;
}

/**
 * PRACTICE_RELAY_STORE values for in-tree backends.
 * `postgres` is intentionally not a runtime value here - see createPostgresRecordStore.
 */
export type RecordStoreBackend = "json" | "memory" | "postgres";

/** Bounded member-summary keyset query. */
export interface RecordSummaryQuery {
  readonly after?: string;
  readonly title?: string;
  readonly limit: number;
}

/** Minimal indexed record representation returned to collection routes. */
export interface RecordSummary {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
}

/** One keyset page and an indication that another page exists. */
export interface RecordSummaryPage {
  readonly items: RecordSummary[];
  readonly hasMore: boolean;
}

/** Coherent record and event snapshot returned after authorization. */
export interface RecordWithEvents {
  readonly record: WorkRecord;
  readonly events: RecordEvent[];
}

/** Operations delegated to the database platform rather than an adapter. */
export class UnsupportedRecordStoreOperationError extends Error {
  constructor(readonly operation: "backup" | "listBackups" | "restore") {
    super(`record-store ${operation} is database-owned for the PostgreSQL backend`);
    this.name = "UnsupportedRecordStoreOperationError";
  }
}
