/**
 * Mutable process runtime for the Practice Relay API.
 * Why: every route must observe test-store swaps and shared process identities.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { createRecordStore } from "@practice-relay/work-record-core";
import {
  createMemoryRecordStore,
  createStoreFromEnv,
  resolveOpsSecrets,
  type RecordStoreAdapter,
} from "@practice-relay/record-store";
import {
  createMediaStoreFromEnv,
  type MediaStoreAdapter,
} from "@practice-relay/media-store";
import { createAuthService } from "@practice-relay/auth";
import type { createRecordCollabRoom } from "@practice-relay/collaboration";
import { resolveLabRsaKeys } from "../../lti/src/index.mjs";
import {
  resolveApiIngressPolicy,
  type ApiIngressPolicy,
} from "./api-ingress.ts";

/** Record-store shapes supported by the local API and its test hooks. */
export type ApiRecordStore =
  | RecordStoreAdapter
  | ReturnType<typeof createRecordStore>;

/** Process-local OIDC launch state retained until one launch consumes it. */
export type PendingLtiLaunch = {
  nonce: string;
  issuer: string;
  audience: string;
  deploymentId: string;
  expiresAt: number;
};

/** Shared mutable dependencies and process identities used by API routes. */
export type ApiRuntime = {
  recordStore: ApiRecordStore;
  mediaStore: MediaStoreAdapter;
  auth: ReturnType<typeof createAuthService>;
  collabRooms: Map<string, ReturnType<typeof createRecordCollabRoom>>;
  pendingLtiLaunches: Map<string, PendingLtiLaunch>;
  failedLoginAttempts: Map<string, { count: number; resetAt: number }>;
  failedLoginSources: Map<string, { count: number; resetAt: number }>;
  activeMediaUploads: number;
  opsSecrets: ReturnType<typeof resolveOpsSecrets>;
  labRsaKeys: ReturnType<typeof resolveLabRsaKeys>;
  objectStoreMode: string;
  ingress: ApiIngressPolicy;
  repoRoot: string;
};

function createDefaultRecordStore(): ApiRecordStore {
  if (process.env.PRACTICE_RELAY_STORE || process.env.PRACTICE_RELAY_DATA) {
    return createStoreFromEnv();
  }
  return createMemoryRecordStore();
}

function resolveOverride<T>(override: T | undefined, fallback: () => T): T {
  return override === undefined ? fallback() : override;
}

function defaultMediaRoot(): string {
  return resolveOverride(
    process.env.PRACTICE_RELAY_MEDIA,
    () => path.join(process.cwd(), "data", "media"),
  );
}

function defaultObjectStoreMode(): string {
  return process.env.PRACTICE_RELAY_OBJECT_STORE?.trim().toLowerCase() || "fs";
}

function defaultRepoRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Create an isolated API runtime while retaining production defaults by default. */
export function createApiRuntime(
  overrides: Partial<ApiRuntime> = {},
): ApiRuntime {
  const opsSecrets = resolveOverride(overrides.opsSecrets, resolveOpsSecrets);
  const mediaRoot = defaultMediaRoot();
  return {
    recordStore: resolveOverride(overrides.recordStore, createDefaultRecordStore),
    mediaStore: resolveOverride(
      overrides.mediaStore,
      () => createMediaStoreFromEnv(process.env, { mediaRoot }),
    ),
    auth: resolveOverride(
      overrides.auth,
      () => createAuthService(opsSecrets.authSecret),
    ),
    collabRooms: resolveOverride(overrides.collabRooms, () => new Map()),
    pendingLtiLaunches: resolveOverride(
      overrides.pendingLtiLaunches,
      () => new Map(),
    ),
    failedLoginAttempts: resolveOverride(
      overrides.failedLoginAttempts,
      () => new Map(),
    ),
    failedLoginSources: resolveOverride(
      overrides.failedLoginSources,
      () => new Map(),
    ),
    activeMediaUploads: resolveOverride(overrides.activeMediaUploads, () => 0),
    ingress: resolveOverride(overrides.ingress, resolveApiIngressPolicy),
    opsSecrets,
    labRsaKeys: resolveOverride(overrides.labRsaKeys, resolveLabRsaKeys),
    objectStoreMode: resolveOverride(overrides.objectStoreMode, defaultObjectStoreMode),
    repoRoot: resolveOverride(overrides.repoRoot, defaultRepoRoot),
  };
}

/** Default singleton runtime used by the stable package entrypoint. */
export const defaultRuntime = createApiRuntime();
