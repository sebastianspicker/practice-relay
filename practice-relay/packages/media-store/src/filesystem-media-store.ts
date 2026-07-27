/**
 * Filesystem and memory media lifecycle stores plus environment selection.
 *
 * Why: direct local storage retains atomic metadata, containment, and tombstone behavior.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MediaBlobMeta, MediaStoreAdapter } from "./types.js";
import { assertSafeStorageKey, ensureDir, parseMediaMeta, resolveStoragePath, safeId } from "./media-safety.js";
import { sha256hex } from "./hashing.js";
import { createMemoryObjectStore } from "./object-store.js";
import { createObjectStoreFromEnv } from "./s3-store.js";
import { createMediaStoreOnObjectStore } from "./object-media-store.js";

const PRIVATE_FILE_MODE = 0o600;

/** Create the direct filesystem media store rooted at the supplied directory. */
export function createMediaStore(rootDir: string): MediaStoreAdapter {
  const root = path.resolve(rootDir);
  ensureDir(root);
  const realRoot = realpathSync(root);

  function metaPath(storageKey: string): string {
    assertSafeStorageKey(storageKey);
    return resolveStoragePath(root, realRoot, `${storageKey}.meta.json`);
  }

  function blobPath(storageKey: string): string {
    return resolveStoragePath(root, realRoot, storageKey);
  }

  return {
    rootDir: root,
    backend: "fs",
    put(recordId, takeId, bytes, opts = {}) {
      const key = path.join(
        safeId(recordId),
        `${safeId(takeId)}-${randomUUID().slice(0, 8)}.bin`,
      );
      const abs = blobPath(key);
      ensureDir(path.dirname(abs));
      blobPath(key);
      writeFileSync(abs, bytes, { mode: PRIVATE_FILE_MODE });
      const meta: MediaBlobMeta = {
        storageKey: key,
        recordId,
        takeId,
        contentType: opts.contentType ?? "application/octet-stream",
        byteSize: bytes.byteLength,
        sha256: sha256hex(bytes),
        originalName: opts.originalName,
        createdAt: new Date().toISOString(),
      };
      writeFileSync(metaPath(key), JSON.stringify(meta, null, 2), {
        encoding: "utf8",
        mode: PRIVATE_FILE_MODE,
      });
      return meta;
    },
    get(storageKey) {
      const mp = metaPath(storageKey);
      const bp = blobPath(storageKey);
      if (!existsSync(mp) || !existsSync(bp)) return undefined;
      const meta = parseMediaMeta(readFileSync(mp, "utf8"), storageKey);
      if (!meta || meta.deletedAt) return undefined;
      return { meta, bytes: readFileSync(bp) };
    },
    getByTake(recordId, takeId) {
      const list = this.listForRecord(recordId) as MediaBlobMeta[];
      const filtered = list.filter((m) => m.takeId === takeId);
      if (!filtered.length) return undefined;
      filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const meta = filtered[filtered.length - 1]!;
      return this.get(meta.storageKey);
    },
    listForRecord(recordId) {
      const dir = resolveStoragePath(root, realRoot, safeId(recordId));
      if (!existsSync(dir)) return [];
      const out: MediaBlobMeta[] = [];
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".meta.json")) continue;
        try {
          const mp = resolveStoragePath(root, realRoot, `${safeId(recordId)}/${name}`);
          const valid = parseMediaMeta(readFileSync(mp, "utf8"));
          if (valid && !valid.deletedAt) out.push(valid);
        } catch {
          /* skip */
        }
      }
      return out;
    },
    softDelete(storageKey) {
      const mp = metaPath(storageKey);
      if (!existsSync(mp)) return undefined;
      const meta = parseMediaMeta(readFileSync(mp, "utf8"), storageKey);
      if (!meta) return undefined;
      const next = { ...meta, deletedAt: new Date().toISOString() };
      writeFileSync(mp, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        mode: PRIVATE_FILE_MODE,
      });
      return next;
    },
    hardDelete(storageKey) {
      const mp = metaPath(storageKey);
      const bp = blobPath(storageKey);
      if (!existsSync(mp) && !existsSync(bp)) return false;
      if (existsSync(bp)) unlinkSync(bp);
      if (existsSync(mp)) unlinkSync(mp);
      return true;
    },
    purgeDeleted(maxAgeMs = 0) {
      let removed = 0;
      const now = Date.now();
      if (!existsSync(root)) return 0;
      for (const recordDir of readdirSync(root)) {
        let dir: string;
        try {
          dir = resolveStoragePath(root, realRoot, recordDir);
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        for (const name of readdirSync(dir)) {
          if (!name.endsWith(".meta.json")) continue;
          try {
            const mp = resolveStoragePath(root, realRoot, `${recordDir}/${name}`);
            const meta = parseMediaMeta(readFileSync(mp, "utf8"));
            if (!meta?.deletedAt) continue;
            const age = now - Date.parse(meta.deletedAt);
            if (age < maxAgeMs) continue;
            const bp = blobPath(meta.storageKey);
            if (existsSync(bp)) unlinkSync(bp);
            unlinkSync(mp);
            removed++;
          } catch {
            /* skip */
          }
        }
      }
      return removed;
    },
    totalBytesForRecord(recordId) {
      const dir = resolveStoragePath(root, realRoot, safeId(recordId));
      if (!existsSync(dir)) return 0;
      let n = 0;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".meta.json")) continue;
        try {
          const meta = parseMediaMeta(readFileSync(
            resolveStoragePath(root, realRoot, `${safeId(recordId)}/${name}`),
            "utf8",
          ));
          if (meta?.recordId === recordId) n += meta.byteSize;
        } catch {
          /* skip */
        }
      }
      return n;
    },
    totalBytesAll() {
      if (!existsSync(root)) return 0;
      let n = 0;
      for (const recordDir of readdirSync(root)) {
        let dir: string;
        try {
          dir = resolveStoragePath(root, realRoot, recordDir);
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        for (const name of readdirSync(dir)) {
          if (!name.endsWith(".meta.json")) continue;
          try {
            const mp = resolveStoragePath(root, realRoot, `${recordDir}/${name}`);
            const meta = parseMediaMeta(readFileSync(mp, "utf8"));
            if (meta) n += meta.byteSize;
          } catch {
            /* skip */
          }
        }
      }
      return n;
    },
  };
}

/** Explicit filesystem factory (same as createMediaStore). */
export function createFilesystemMediaStore(rootDir: string): MediaStoreAdapter {
  return createMediaStore(rootDir);
}

/**
 * In-memory media store for unit tests (no disk).
 */
export function createMemoryMediaStore(): MediaStoreAdapter {
  const blobs = new Map<string, Buffer>();
  const metas = new Map<string, MediaBlobMeta>();

  return {
    rootDir: ":memory:",
    backend: "memory",
    put(recordId, takeId, bytes, opts = {}) {
      const key = `${safeId(recordId)}/${safeId(takeId)}-${randomUUID().slice(0, 8)}.bin`;
      const meta: MediaBlobMeta = {
        storageKey: key,
        recordId,
        takeId,
        contentType: opts.contentType ?? "application/octet-stream",
        byteSize: bytes.byteLength,
        sha256: sha256hex(bytes),
        originalName: opts.originalName,
        createdAt: new Date().toISOString(),
      };
      blobs.set(key, Buffer.from(bytes));
      metas.set(key, meta);
      return meta;
    },
    get(storageKey) {
      const meta = metas.get(storageKey);
      const bytes = blobs.get(storageKey);
      if (!meta || !bytes || meta.deletedAt) return undefined;
      return { meta, bytes: Buffer.from(bytes) };
    },
    getByTake(recordId, takeId) {
      const list = (this.listForRecord(recordId) as MediaBlobMeta[]).filter(
        (m) => m.takeId === takeId,
      );
      if (!list.length) return undefined;
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const meta = list[list.length - 1]!;
      return this.get(meta.storageKey);
    },
    listForRecord(recordId) {
      const out: MediaBlobMeta[] = [];
      for (const meta of metas.values()) {
        if (meta.recordId === recordId && !meta.deletedAt) out.push(meta);
      }
      return out;
    },
    softDelete(storageKey) {
      const meta = metas.get(storageKey);
      if (!meta) return undefined;
      const next = { ...meta, deletedAt: new Date().toISOString() };
      metas.set(storageKey, next);
      return next;
    },
    hardDelete(storageKey) {
      const existed = blobs.delete(storageKey);
      metas.delete(storageKey);
      return existed;
    },
    purgeDeleted(maxAgeMs = 0) {
      let removed = 0;
      const now = Date.now();
      for (const [key, meta] of [...metas.entries()]) {
        if (!meta.deletedAt) continue;
        const age = now - Date.parse(meta.deletedAt);
        if (age < maxAgeMs) continue;
        metas.delete(key);
        blobs.delete(key);
        removed++;
      }
      return removed;
    },
    totalBytesForRecord(recordId) {
      let n = 0;
      for (const meta of metas.values()) {
        if (meta.recordId === recordId) n += meta.byteSize;
      }
      return n;
    },
    totalBytesAll() {
      let n = 0;
      for (const meta of metas.values()) {
        n += meta.byteSize ?? 0;
      }
      return n;
    },
  };
}

/**
 * Wire media store from PRACTICE_RELAY_OBJECT_STORE=memory|fs|s3.
 * When s3/memory object backend, media uses ObjectStorageAdapter;
 * fs uses classic filesystem media layout under PRACTICE_RELAY_MEDIA.
 */
export function createMediaStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { mediaRoot?: string; fetchImpl?: typeof fetch },
): MediaStoreAdapter {
  const mode = (env.PRACTICE_RELAY_OBJECT_STORE?.trim().toLowerCase() || "fs") as string;
  const mediaRoot =
    opts?.mediaRoot ||
    env.PRACTICE_RELAY_MEDIA?.trim() ||
    path.join(process.cwd(), "data", "media");

  if (mode === "memory") {
    return createMediaStoreOnObjectStore(createMemoryObjectStore(), {
      rootDir: ":memory:",
    });
  }
  if (mode === "s3") {
    const obj = createObjectStoreFromEnv(env, { fetchImpl: opts?.fetchImpl });
    return createMediaStoreOnObjectStore(obj, { rootDir: "s3://media" });
  }
  return createMediaStore(mediaRoot);
}
