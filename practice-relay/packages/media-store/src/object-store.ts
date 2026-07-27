/**
 * Filesystem and in-memory implementations of the media object-storage boundary.
 *
 * Why: local and test backends share containment enforcement without duplicating it.
 */
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MaybePromise, ObjectStorageAdapter } from "./types.js";
import { ensureDir, resolveStoragePath } from "./media-safety.js";

const PRIVATE_FILE_MODE = 0o600;

/** Normalize synchronous and asynchronous backend results for shared callers. */
export async function awaitMaybe<T>(value: MaybePromise<T>): Promise<T> {
  return await value;
}

/**
 * Filesystem object storage (S3-like put/get on a directory root).
 */
export function createFilesystemObjectStore(rootDir: string): ObjectStorageAdapter {
  const root = path.resolve(rootDir);
  ensureDir(root);
  const realRoot = realpathSync(root);
  return {
    backend: "fs",
    putObject(key, bytes) {
      const abs = resolveStoragePath(root, realRoot, key);
      ensureDir(path.dirname(abs));
      // mkdir may have followed a newly-created or concurrent symlink.
      resolveStoragePath(root, realRoot, key);
      writeFileSync(abs, bytes, { mode: PRIVATE_FILE_MODE });
    },
    getObject(key) {
      const abs = resolveStoragePath(root, realRoot, key);
      if (!existsSync(abs)) return undefined;
      return readFileSync(abs);
    },
    deleteObject(key) {
      const abs = resolveStoragePath(root, realRoot, key);
      if (!existsSync(abs)) return false;
      unlinkSync(abs);
      return true;
    },
  };
}

/**
 * In-memory object storage (tests / fake backend).
 */
export function createMemoryObjectStore(): ObjectStorageAdapter {
  const map = new Map<string, Buffer>();
  return {
    backend: "memory",
    putObject(key, bytes) {
      map.set(key, Buffer.from(bytes));
    },
    getObject(key) {
      const b = map.get(key);
      return b ? Buffer.from(b) : undefined;
    },
    deleteObject(key) {
      return map.delete(key);
    },
  };
}
