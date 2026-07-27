/**
 * Store backend selection and managed-Postgres boundary stub.
 *
 * Why: runtime configuration stays explicit without introducing an in-tree SQL dependency.
 */
import path from "node:path";
import type { RecordStoreBackend, RecordStoreAdapter } from "./types.js";
import { createDurableRecordStore } from "./durable-store.js";
import { createMemoryRecordStore } from "./memory-store.js";

/** Environment and fallback-root inputs accepted by the store factory. */
export interface CreateStoreFromEnvOptions {
  env?: NodeJS.ProcessEnv;
  /** Override root when PRACTICE_RELAY_DATA unset (json mode). */
  defaultRootDir?: string;
}

/**
 * Factory: PRACTICE_RELAY_STORE=json|memory (default: json when PRACTICE_RELAY_DATA set, else memory).
 * Optional PRACTICE_RELAY_TENANT_ID scopes paths to data/{tenant}/work-records.
 *
 * Note: PRACTICE_RELAY_STORE=sqlite is not implemented in-tree (keeps CI zero-native).
 * Document JSON as default; external adapters may implement RecordStoreAdapter.
 */
export function createStoreFromEnv(
  opts: CreateStoreFromEnvOptions = {},
): RecordStoreAdapter {
  const env = opts.env ?? process.env;
  const explicit = (env.PRACTICE_RELAY_STORE?.trim().toLowerCase() || "") as string;
  const dataDir = env.PRACTICE_RELAY_DATA?.trim();
  const tenantId = env.PRACTICE_RELAY_TENANT_ID?.trim() || undefined;

  if (explicit === "postgres" || explicit === "pg") {
    // Surfaces a clear error; does not load a driver (zero-native CI).
    return createPostgresRecordStore({
      connectionString: env.PRACTICE_RELAY_DATABASE_URL?.trim(),
      tenantId,
    });
  }

  let backend: RecordStoreBackend;
  if (explicit === "memory") backend = "memory";
  else if (explicit === "json") backend = "json";
  else if (explicit === "sqlite") {
    throw new Error(
      "PRACTICE_RELAY_STORE=sqlite is not shipped (zero-native CI). Use json|memory or implement RecordStoreAdapter.",
    );
  } else {
    backend = dataDir ? "json" : "memory";
  }

  if (backend === "memory") {
    return createMemoryRecordStore({ tenantId });
  }

  const rootDir =
    dataDir ||
    opts.defaultRootDir ||
    path.join(process.cwd(), "data", "practice-relay");
  return createDurableRecordStore({ rootDir, tenantId });
}

/**
 * Managed Postgres adapter stub.
 *
 * Not configured in-tree: no `pg` / SQL driver dependency (keeps CI zero-native).
 * Institutions that need SQL should implement {@link RecordStoreAdapter} against their
 * managed DB and swap at process boot - see `postgres-adapter.stub.md`.
 *
 * @throws always with a clear "not configured" message
 */
export function createPostgresRecordStore(_opts?: {
  connectionString?: string;
  tenantId?: string;
}): RecordStoreAdapter {
  void _opts;
  throw new Error(
    "createPostgresRecordStore is not configured in this monorepo build. " +
      "Use PRACTICE_RELAY_STORE=json|memory (lab default) or implement RecordStoreAdapter " +
      "against your managed Postgres (see practice-relay/packages/record-store/src/postgres-adapter.stub.md).",
  );
}
