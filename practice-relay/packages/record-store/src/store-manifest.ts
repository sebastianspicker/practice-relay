/** Backup manifest parsing that must complete before any restore mutation. */
import type { BackupManifest } from "./types.js";
import { safePathSegment } from "./store-paths.js";

const BACKUP_LOCATION_FIELDS = ["createdAt", "rootDir", "backupDir"] as const;

/** Parse a JSON manifest while retaining its source in failure messages. */
function parseBackupJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `invalid backup manifest ${source}: ${err instanceof Error ? err.message : "invalid JSON"}`,
    );
  }
}

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
