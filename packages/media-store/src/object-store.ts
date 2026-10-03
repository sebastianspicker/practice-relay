/** Streaming filesystem and memory object-storage adapters. */
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ObjectStorageAdapter } from "./types.js";
import { assertSafeStorageKey, createStorageReadStream, createStorageWriteStream, deleteStorageFile, prepareStorageRoot } from "./media-safety.js";

/** Create an immutable, path-contained filesystem object adapter. */
export function createFilesystemObjectStore(rootDir: string): ObjectStorageAdapter {
  const root = path.resolve(rootDir);
  const realRoot = prepareStorageRoot(root);
  return {
    backend: "fs",
    async putFile(key, filePath, options) {
      assertSafeStorageKey(key);
      const owned = createStorageWriteStream(root, realRoot, key);
      try {
        await pipeline(createReadStream(filePath), owned.stream, { signal: options.signal });
        owned.publish();
      } catch (error) {
        owned.cleanup();
        throw error;
      }
    },
    async getStream(key, options) {
      try {
        options?.signal?.throwIfAborted();
        return createStorageReadStream(root, realRoot, key);
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async deleteObject(key) {
      return deleteStorageFile(root, realRoot, key);
    },
    async checkHealth() {
      prepareStorageRoot(root);
    },
  };
}

/** Test/lab adapter. Runtime transfers still stage before this bounded in-memory copy. */
export function createMemoryObjectStore(): ObjectStorageAdapter {
  const objects = new Map<string, Buffer>();
  return {
    backend: "memory",
    async putFile(key, filePath, options) {
      assertSafeStorageKey(key);
      options.signal?.throwIfAborted();
      const bytes = await readFile(filePath);
      options.signal?.throwIfAborted();
      objects.set(key, bytes);
    },
    async getStream(key, options) {
      assertSafeStorageKey(key);
      options?.signal?.throwIfAborted();
      const value = objects.get(key);
      return value === undefined ? undefined : Readable.from(Buffer.from(value));
    },
    async deleteObject(key) {
      assertSafeStorageKey(key);
      return objects.delete(key);
    },
    async checkHealth() {},
  };
}
