/** Compose streaming media with the database selected by the API runtime. */
import path from "node:path";
import type { Database } from "@practice-relay/database";
import { createMediaStoreFromEnv, createObjectStoreFromEnv, createPostgresMediaStore, resolveMediaStoreLimits, type MediaStoreAdapter } from "@practice-relay/media-store";

/** Resolve explicit transfer bounds and choose shared metadata whenever records use PostgreSQL. */
export function createRuntimeMediaStore(env: NodeJS.ProcessEnv, options: { database?: Database; tenantId?: string; mediaRoot: string }): MediaStoreAdapter {
  const number = (name: string) => env[name] === undefined ? undefined : Number(env[name]);
  const limits = resolveMediaStoreLimits({
    maxObjectBytes: number("PRACTICE_RELAY_MEDIA_MAX_OBJECT_BYTES"),
    maxRecordBytes: number("PRACTICE_RELAY_MEDIA_MAX_RECORD_BYTES"),
    maxActiveTransfers: number("PRACTICE_RELAY_MEDIA_MAX_ACTIVE_TRANSFERS"),
    maxActiveTransfersDeployment: number("PRACTICE_RELAY_MEDIA_MAX_ACTIVE_TRANSFERS_DEPLOYMENT"),
    maxActiveUploadsPerRecord: number("PRACTICE_RELAY_MEDIA_MAX_ACTIVE_UPLOADS_PER_RECORD"),
    leaseMs: number("PRACTICE_RELAY_MEDIA_LEASE_MS"),
  });
  const stagingRoot = env.PRACTICE_RELAY_MEDIA_STAGING?.trim() || path.join(options.mediaRoot, ".staging");
  if (!options.database) return createMediaStoreFromEnv(env, { mediaRoot: options.mediaRoot, stagingRoot, limits });
  return createPostgresMediaStore({ database: options.database, tenantId: options.tenantId, stagingRoot, limits,
    objectStore: createObjectStoreFromEnv(env, { fsRoot: options.mediaRoot }),
  });
}
