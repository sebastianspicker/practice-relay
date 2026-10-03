/**
 * Public facade for Practice Relay durable record storage and operational secrets.
 *
 * Why: preserve package exports while isolating persistence, factory, and secret concerns.
 */
export type { DurableStoreOptions, RecordEvent, BackupManifest, StoreHealthMetrics, RecordStoreAdapter, RecordStoreBackend, RecordSummaryQuery, RecordSummary, RecordSummaryPage, RecordWithEvents } from "./types.js";
export type { CreateRecordStoreOptions } from "./store-factory.js";
export type { SecretBackend, OpsSecrets } from "./ops-secrets.js";
export { RECORD_REVISION_CONFLICT, RecordRevisionConflictError, UnsupportedRecordStoreOperationError, isRecordRevisionConflict } from "./types.js";
export { safePathSegment, resolveTenantRoot } from "./store-safety.js";
export { createDurableRecordStore } from "./durable-store.js";
export { createMemoryRecordStore } from "./memory-store.js";
export { createRecordStore } from "./store-factory.js";
export { createPostgresRecordStore, type PostgresRecordStoreOptions } from "./postgres-store.js";
export { migrateRecordStore, importRecordSnapshot, RECORD_STORE_MIGRATIONS, type RecordSnapshotImport } from "./migrations.js";
export { resolveOpsSecrets } from "./ops-secrets.js";
