/**
 * Public facade for Practice Relay durable record storage and operational secrets.
 *
 * Why: preserve package exports while isolating persistence, factory, and secret concerns.
 */
export type { DurableStoreOptions, RecordEvent, BackupManifest, StoreHealthMetrics, RecordStoreAdapter, DurableRecordStore, RecordStoreBackend } from "./types.js";
export type { CreateStoreFromEnvOptions } from "./store-factory.js";
export type { SecretBackend, OpsSecrets } from "./ops-secrets.js";
export { RecordRevisionConflictError } from "./types.js";
export { safePathSegment, resolveTenantRoot } from "./store-safety.js";
export { createDurableRecordStore } from "./durable-store.js";
export { createMemoryRecordStore } from "./memory-store.js";
export { createStoreFromEnv, createPostgresRecordStore } from "./store-factory.js";
export { kmsStubEncrypt, resolveOpsSecrets } from "./ops-secrets.js";
