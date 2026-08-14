/**
 * Shared media path containment and metadata validation primitives.
 *
 * Why: every filesystem media path must pass the same traversal and symlink checks.
 */
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { MediaBlobMeta } from "./types.js";

const parseJsonValue = (raw: string): unknown => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return value;
}

const hasMediaIdentity = (meta: Partial<MediaBlobMeta>): boolean => {
  return (
    typeof meta.storageKey === "string" &&
    typeof meta.recordId === "string" &&
    typeof meta.takeId === "string" &&
    typeof meta.contentType === "string" &&
    typeof meta.sha256 === "string" &&
    typeof meta.createdAt === "string"
  );
}

const hasMediaSize = (meta: Partial<MediaBlobMeta>): boolean => {
  return typeof meta.byteSize === "number" && Number.isFinite(meta.byteSize) && meta.byteSize >= 0;
}

const hasOptionalMediaNames = (meta: Partial<MediaBlobMeta>): boolean => {
  return (
    (meta.originalName === undefined || typeof meta.originalName === "string") &&
    (meta.deletedAt === undefined || typeof meta.deletedAt === "string")
  );
}

const hasValidMediaShape = (meta: Partial<MediaBlobMeta>): boolean => {
  return hasMediaIdentity(meta) && hasMediaSize(meta) && hasOptionalMediaNames(meta);
}

const forbiddenStorageSegments = new Set(["", ".", ".."]);

const hasForbiddenStorageSegment = (storageKey: string): boolean => {
  return storageKey.split("/").some((segment) => forbiddenStorageSegments.has(segment));
}

const assertPortableRelativeStorageKey = (storageKey: string): void => {
  if (!storageKey) {
    throw new Error("media storageKey must be a safe relative path");
  }
  if (storageKey.includes("\0")) {
    throw new Error("media storageKey must be a safe relative path");
  }
  if (storageKey.includes("\\")) {
    throw new Error("media storageKey must be a safe relative path");
  }
  if (path.isAbsolute(storageKey)) {
    throw new Error("media storageKey must be a safe relative path");
  }
  if (path.win32.isAbsolute(storageKey)) {
    throw new Error("media storageKey must be a safe relative path");
  }
}

const hasSafeStorageKey = (meta: Partial<MediaBlobMeta>): boolean => {
  try {
    assertSafeStorageKey(meta.storageKey!);
    return true;
  } catch {
    return false;
  }
}

const matchesRequestedStorageKey = (
  meta: Partial<MediaBlobMeta>,
  requestedKey: string | undefined,
): boolean => {
  if (requestedKey === undefined) return true;
  return meta.storageKey === requestedKey;
}

/** Ensure a media storage directory exists before writing beneath it. */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Validate a record or take identifier as one portable path segment. */
export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
    throw new Error("media recordId and takeId must be valid resource ids");
  }
  return id;
}

/** Reject keys that are not relative, portable media-object paths. */
export function assertSafeStorageKey(storageKey: string): void {
  assertPortableRelativeStorageKey(storageKey);
  if (hasForbiddenStorageSegment(storageKey)) {
    throw new Error("media storageKey must not contain traversal segments");
  }
}

/** Whether a resolved path remains inside a resolved storage root. */
export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Resolve a safe key and reject existing symlink paths that leave the root. */
export function resolveStoragePath(root: string, realRoot: string, storageKey: string): string {
  assertSafeStorageKey(storageKey);
  const candidate = path.resolve(root, storageKey);
  if (!isWithinRoot(root, candidate)) {
    throw new Error("media storageKey resolves outside the configured root");
  }

  let existing = candidate;
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error("media path has no existing root ancestor");
    existing = parent;
  }
  if (!isWithinRoot(realRoot, realpathSync(existing))) {
    throw new Error("media path resolves outside the configured root");
  }
  return candidate;
}

/** Parse persisted metadata only when its identity and primitive fields are valid. */
export function parseMediaMeta(raw: string, requestedKey?: string): MediaBlobMeta | undefined {
  const value = parseJsonValue(raw);
  if (!value || typeof value !== "object") return undefined;
  const meta = value as Partial<MediaBlobMeta>;
  if (!hasValidMediaShape(meta)) return undefined;
  if (!hasSafeStorageKey(meta)) return undefined;
  if (!matchesRequestedStorageKey(meta, requestedKey)) return undefined;
  return meta as MediaBlobMeta;
}
