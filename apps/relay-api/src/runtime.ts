/**
 * Mutable process runtime for the Practice Relay API.
 * Why: every route must observe test-store swaps and shared process identities.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRecordStore,
  resolveOpsSecrets,
  type RecordStoreAdapter,
} from "@practice-relay/record-store";
import {
  type MediaStoreAdapter,
} from "@practice-relay/media-store";
import { createRuntimeMediaStore } from "./runtime-media.ts";
import { createDatabase, type Database } from "@practice-relay/database";
import { createMemoryRuntimeState, createPostgresRuntimeState, type RuntimeState } from "@practice-relay/runtime-state";
export type { PendingLtiLaunch } from "@practice-relay/runtime-state";
import { createAuthService } from "@practice-relay/auth";
import { resolveLabRsaKeys } from "@practice-relay/lti";
import {
  resolveApiIngressPolicy,
  type ApiIngressPolicy,
} from "./api-ingress.ts";
import {
  readApiRuntimeConfig,
  type ApiReadinessPolicy,
  type ApiRuntimeConfig,
} from "./runtime-config.ts";

/** Record-store shapes supported by the local API and its test hooks. */
export type ApiRecordStore = RecordStoreAdapter;

/** Shared mutable dependencies and process identities used by API routes. */
export type ApiRuntime = {
  recordStore: ApiRecordStore;
  mediaStore: MediaStoreAdapter;
  auth: ReturnType<typeof createAuthService>;
  database?: Database;
  coordination: RuntimeState;
  activeMediaUploads: number;
  opsSecrets: ReturnType<typeof resolveOpsSecrets>;
  labRsaKeys: ReturnType<typeof resolveLabRsaKeys>;
  objectStoreMode: string;
  ingress: ApiIngressPolicy;
  readinessPolicy: ApiReadinessPolicy;
  repoRoot: string;
};

function resolveOverride<T>(override: T | undefined, fallback: () => T): T {
  return override === undefined ? fallback() : override;
}

function createConfiguredDatabase(config: ApiRuntimeConfig): Database | undefined {
  if (config.recordStore.backend !== "postgres") return undefined;
  return createDatabase({ connectionString: config.recordStore.connectionString });
}

function createConfiguredRecordStore(
  config: ApiRuntimeConfig,
  database: Database | undefined,
): ApiRecordStore {
  if (database) {
    return createRecordStore({ backend: "postgres", database, tenantId: config.databaseTenantId });
  }
  const selected = config.recordStore;
  if (selected.backend === "invalid") throw new Error(selected.error);
  if (selected.backend === "postgres") throw new Error("PRACTICE_RELAY_STORE=postgres requires an injected shared Database");
  return createRecordStore(selected);
}

function assertMultiProcessRuntime(
  config: ApiRuntimeConfig,
  runtime: Pick<ApiRuntime, "recordStore" | "database" | "opsSecrets">,
): void {
  if (config.topology !== "multi-process") return;
  if (runtime.recordStore.backend !== "postgres" || !runtime.database) throw new Error("multi-process requires PostgreSQL records and coordination");
  if (config.objectStoreMode !== "s3" && !(config.objectStoreMode === "fs" && config.mediaSharedHost)) {
    throw new Error("multi-process media requires S3 or explicit shared-host filesystem");
  }
  if (runtime.opsSecrets.usingDevDefaults) throw new Error("multi-process requires configured shared secrets");
}

function defaultRepoRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Create an isolated API runtime while retaining production defaults by default. */
export function createApiRuntime(
  overrides: Partial<ApiRuntime> = {},
): ApiRuntime {
  const opsSecrets = resolveOverride(overrides.opsSecrets, resolveOpsSecrets);
  const config = readApiRuntimeConfig(process.env);
  const database = overrides.database ?? (overrides.recordStore ? undefined : createConfiguredDatabase(config));
  const recordStore = overrides.recordStore ?? createConfiguredRecordStore(config, database);
  assertMultiProcessRuntime(config, { recordStore, database, opsSecrets });
  return {
    recordStore,
    mediaStore: resolveOverride(
      overrides.mediaStore,
      () => createRuntimeMediaStore(config.env, { mediaRoot: config.mediaRoot, database, tenantId: recordStore.tenantId }),
    ),
    auth: resolveOverride(
      overrides.auth,
      () => createAuthService(opsSecrets.authSecret),
    ),
    database,
    coordination: overrides.coordination ?? (database
      ? createPostgresRuntimeState({ database, tenantId: recordStore.tenantId })
      : createMemoryRuntimeState()),
    activeMediaUploads: resolveOverride(overrides.activeMediaUploads, () => 0),
    ingress: resolveOverride(overrides.ingress, () => resolveApiIngressPolicy(config.env)),
    readinessPolicy: resolveOverride(overrides.readinessPolicy, () => config.readiness),
    opsSecrets,
    labRsaKeys: resolveOverride(overrides.labRsaKeys, () => resolveLabRsaKeys(config.env)),
    objectStoreMode: resolveOverride(overrides.objectStoreMode, () => config.objectStoreMode),
    repoRoot: resolveOverride(overrides.repoRoot, defaultRepoRoot),
  };
}

/** Default singleton runtime used by the stable package entrypoint. */
export const defaultRuntime = createApiRuntime();
