/**
 * Filesystem path and backup-content validation shared by durable-store operations.
 *
 * Why: tenant isolation and restore validation must not be reimplemented by callers.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { BackupManifest, RecordEvent } from "./types.js";

/** Ensure a durable-store directory exists before filesystem operations. */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Validate a tenant or record id as one portable filesystem segment without rewriting it. */
export function safePathSegment(id: string): string {
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(id) ||
    id === "." ||
    id === ".."
  ) {
    throw new Error("invalid filesystem path segment");
  }
  return id;
}

/** Parse and fully validate a backup manifest before restore mutation. */
function parseBackupJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `invalid backup manifest ${source}: ${err instanceof Error ? err.message : "invalid JSON"}`,
    );
  }
}

const BACKUP_LOCATION_FIELDS = ["createdAt", "rootDir", "backupDir"] as const;

const hasValidBackupLocation = (manifest: Partial<BackupManifest>): boolean => {
  return BACKUP_LOCATION_FIELDS.every((field) => typeof manifest[field] === "string");
};

const hasValidBackupRecordIndex = (manifest: Partial<BackupManifest>): boolean => {
  return (
    Number.isSafeInteger(manifest.recordCount) &&
    (manifest.recordCount ?? -1) >= 0 &&
    Array.isArray(manifest.recordIds) &&
    manifest.recordIds.length === manifest.recordCount
  );
};

const hasValidBackupFields = (manifest: Partial<BackupManifest>): boolean => {
  return hasValidBackupLocation(manifest) && hasValidBackupRecordIndex(manifest);
};

function validateBackupRecordIds(manifest: Partial<BackupManifest>, source: string): void {
  const unique = new Set<string>();
  for (const id of manifest.recordIds ?? []) {
    safePathSegment(id);
    if (unique.has(id)) throw new Error(`invalid backup manifest ${source}: duplicate record id`);
    unique.add(id);
  }
}

/** Parse and validate a backup manifest before any restore path trusts it. */
export function parseBackupManifest(raw: string, source: string): BackupManifest {
  const value = parseBackupJson(raw, source);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid backup manifest ${source}: object required`);
  }
  const manifest = value as Partial<BackupManifest>;
  if (!hasValidBackupFields(manifest)) {
    throw new Error(`invalid backup manifest ${source}: malformed fields`);
  }
  validateBackupRecordIds(manifest, source);
  if (manifest.tenantId !== undefined) safePathSegment(manifest.tenantId);
  return manifest as BackupManifest;
}

/** Validate every non-empty event-log line as a minimal record event. */
export function validateJsonLines(raw: string, source: string): void {
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Partial<RecordEvent>;
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.at !== "string" ||
        typeof value.kind !== "string" ||
        typeof value.recordId !== "string"
      ) {
        throw new Error("event object fields required");
      }
    } catch (err) {
      throw new Error(
        `invalid event log ${source}:${index + 1}: ${err instanceof Error ? err.message : "invalid JSON"}`,
      );
    }
  }
}

/**
 * Resolve the effective data root for a store, applying optional tenant prefix.
 * Layout: `{rootDir}/{tenantId}/work-records|events|audit|backups` when tenantId set.
 */
export function resolveTenantRoot(
  rootDir: string,
  tenantId?: string,
): string {
  const root = path.resolve(rootDir);
  if (tenantId === undefined) return root;
  return path.join(root, safePathSegment(tenantId));
}

/** Resolve the validated JSON record path beneath a store root. */
export function recordPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "records", `${safe}.json`);
}

/** Resolve the validated event-log path beneath a store root. */
export function eventsPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "events", `${safe}.jsonl`);
}
