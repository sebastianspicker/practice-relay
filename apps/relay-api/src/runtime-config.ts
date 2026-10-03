/**
 * Environment-driven configuration for the Practice Relay API runtime.
 * Why: the API resolves its process settings once here; packages receive explicit options or the
 * injected environment object, so no setting is parsed in two places.
 */
import path from "node:path";

/** Process layout accepted by PRACTICE_RELAY_TOPOLOGY. */
export type ApiTopology = "single-process" | "multi-process";

/**
 * Record store selected by PRACTICE_RELAY_STORE / _DATA / _TENANT_ID / _DATABASE_URL.
 *
 * `invalid` defers a selection error until the runtime actually constructs a configured store,
 * so injected stores and databases keep taking precedence over unusable environment settings.
 */
export type ApiRecordStoreConfig =
  | { backend: "memory"; tenantId?: string }
  | { backend: "json"; rootDir: string; tenantId?: string }
  | { backend: "postgres"; connectionString: string }
  | { backend: "invalid"; error: string };

/** Readiness requirements selected by PRACTICE_RELAY_REQUIRE_DURABLE / _REQUIRE_SECRETS. */
export type ApiReadinessPolicy = {
  requireDurable: boolean;
  requireSecrets: boolean;
};

/** Typed API runtime configuration read once from the process environment. */
export type ApiRuntimeConfig = {
  /** Source environment for package factories that accept an explicit environment. */
  env: NodeJS.ProcessEnv;
  topology: ApiTopology;
  recordStore: ApiRecordStoreConfig;
  /** Unnormalized PRACTICE_RELAY_TENANT_ID applied to PostgreSQL-backed records and coordination. */
  databaseTenantId?: string;
  mediaRoot: string;
  objectStoreMode: string;
  mediaSharedHost: boolean;
  readiness: ApiReadinessPolicy;
};

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

function resolveTopology(env: NodeJS.ProcessEnv): ApiTopology {
  const topology = env.PRACTICE_RELAY_TOPOLOGY ?? "single-process";
  if (topology !== "single-process" && topology !== "multi-process") {
    throw new Error("invalid PRACTICE_RELAY_TOPOLOGY");
  }
  return topology;
}

function configuredLocalBackend(
  explicit: string,
  dataDir: string | undefined,
): "memory" | "json" | ApiRecordStoreConfig {
  if (explicit === "memory" || explicit === "json") return explicit;
  if (explicit === "") return dataDir ? "json" : "memory";
  if (explicit === "sqlite") {
    return {
      backend: "invalid",
      error: "PRACTICE_RELAY_STORE=sqlite is not shipped (zero-native CI). Use json|memory|postgres or implement RecordStoreAdapter.",
    };
  }
  return {
    backend: "invalid",
    error: `PRACTICE_RELAY_STORE must be json|memory|postgres; received ${JSON.stringify(explicit)}`,
  };
}

function configuredRecordStore(
  env: NodeJS.ProcessEnv,
  topology: ApiTopology,
): ApiRecordStoreConfig {
  const explicit = env.PRACTICE_RELAY_STORE?.trim().toLowerCase() || "";
  if (explicit === "postgres" || explicit === "pg") {
    return { backend: "postgres", connectionString: env.PRACTICE_RELAY_DATABASE_URL?.trim() ?? "" };
  }
  if (!nonEmpty(env.PRACTICE_RELAY_STORE) && !nonEmpty(env.PRACTICE_RELAY_DATA)) {
    return { backend: "memory" };
  }
  const dataDir = env.PRACTICE_RELAY_DATA?.trim();
  const backend = configuredLocalBackend(explicit, dataDir);
  if (typeof backend !== "string") return backend;
  if (topology === "multi-process") {
    return {
      backend: "invalid",
      error: "PRACTICE_RELAY_TOPOLOGY=multi-process requires PRACTICE_RELAY_STORE=postgres",
    };
  }
  const tenantId = env.PRACTICE_RELAY_TENANT_ID?.trim() || undefined;
  if (backend === "memory") return { backend, tenantId };
  const rootDir = dataDir || path.join(process.cwd(), "data", "practice-relay");
  return { backend, rootDir, tenantId };
}

function configuredObjectStoreMode(env: NodeJS.ProcessEnv): string {
  const objectStoreMode = env.PRACTICE_RELAY_OBJECT_STORE;
  if (objectStoreMode === undefined || objectStoreMode === "") return "fs";
  const normalized = objectStoreMode.trim().toLowerCase();
  return normalized === "" ? "fs" : normalized;
}

/** Read and validate the API runtime configuration from one environment snapshot. */
export function readApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const topology = resolveTopology(env);
  return {
    env,
    topology,
    recordStore: configuredRecordStore(env, topology),
    databaseTenantId: env.PRACTICE_RELAY_TENANT_ID,
    mediaRoot: env.PRACTICE_RELAY_MEDIA ?? path.join(process.cwd(), "data", "media"),
    objectStoreMode: configuredObjectStoreMode(env),
    mediaSharedHost: env.PRACTICE_RELAY_MEDIA_SHARED_HOST === "1",
    readiness: {
      requireDurable: env.PRACTICE_RELAY_REQUIRE_DURABLE === "1",
      requireSecrets: env.PRACTICE_RELAY_REQUIRE_SECRETS === "1",
    },
  };
}
