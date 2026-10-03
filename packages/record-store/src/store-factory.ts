/**
 * Store backend selection with explicit shared-database injection.
 *
 * Why: the composition root owns environment parsing and shared database connections; this package only receives explicit options.
 */
import type { Database } from "@practice-relay/database";
import type { RecordStoreAdapter } from "./types.js";
import { createDurableRecordStore } from "./durable-store.js";
import { createMemoryRecordStore } from "./memory-store.js";
import { createPostgresRecordStore } from "./postgres-store.js";

/**
 * Explicit backend options accepted by the store factory.
 *
 * Note: SQLite is not implemented in-tree (keeps CI zero-native); external adapters may implement RecordStoreAdapter.
 */
export type CreateRecordStoreOptions =
  | { backend: "memory"; tenantId?: string }
  | { backend: "json"; rootDir: string; tenantId?: string }
  | { backend: "postgres"; database: Database; tenantId?: string };

/** Create the selected in-tree record store from explicit options. */
export function createRecordStore(
  options: CreateRecordStoreOptions,
): RecordStoreAdapter {
  switch (options.backend) {
    case "memory":
      return createMemoryRecordStore({ tenantId: options.tenantId });
    case "json":
      return createDurableRecordStore({ rootDir: options.rootDir, tenantId: options.tenantId });
    case "postgres":
      return createPostgresRecordStore({ database: options.database, tenantId: options.tenantId });
    default:
      throw new Error(
        `record store backend must be memory|json|postgres; received ${JSON.stringify((options as { backend?: unknown }).backend)}`,
      );
  }
}
