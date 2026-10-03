/** Primitive-shape validation for persisted media metadata. */
import type { MediaBlobMeta } from "./types.js";

function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function hasMediaIdentity(meta: Partial<MediaBlobMeta>): boolean {
  return (
    typeof meta.storageKey === "string" &&
    typeof meta.recordId === "string" &&
    typeof meta.takeId === "string" &&
    typeof meta.contentType === "string" &&
    typeof meta.sha256 === "string" &&
    typeof meta.createdAt === "string"
  );
}

function hasMediaSize(meta: Partial<MediaBlobMeta>): boolean {
  return typeof meta.byteSize === "number" && Number.isFinite(meta.byteSize) && meta.byteSize >= 0;
}

function hasOptionalMediaNames(meta: Partial<MediaBlobMeta>): boolean {
  return (
    (meta.originalName === undefined || typeof meta.originalName === "string") &&
    (meta.deletedAt === undefined || typeof meta.deletedAt === "string")
  );
}

function hasSafeStorageKey(meta: Partial<MediaBlobMeta>, validateStorageKey: (key: string) => void): boolean {
  try {
    validateStorageKey(meta.storageKey!);
    return true;
  } catch {
    return false;
  }
}

/** Parse metadata only when its primitive fields and caller-owned key validation pass. */
export function parseMediaMetaValue(
  raw: string,
  requestedKey: string | undefined,
  validateStorageKey: (key: string) => void,
): MediaBlobMeta | undefined {
  const value = parseJsonValue(raw);
  if (!value || typeof value !== "object") return undefined;
  const meta = value as Partial<MediaBlobMeta>;
  if (!hasMediaIdentity(meta) || !hasMediaSize(meta) || !hasOptionalMediaNames(meta)) return undefined;
  if (!hasSafeStorageKey(meta, validateStorageKey)) return undefined;
  if (requestedKey !== undefined && meta.storageKey !== requestedKey) return undefined;
  return meta as MediaBlobMeta;
}
