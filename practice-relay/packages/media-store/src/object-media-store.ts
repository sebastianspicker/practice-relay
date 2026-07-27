/**
 * Media lifecycle implementation over an arbitrary object-storage adapter.
 *
 * Why: manifest-first reservations preserve quota and tombstone behavior across remote stores.
 */
import { randomUUID } from "node:crypto";
import type { MediaBlobMeta, MediaStoreAdapter, ObjectStorageAdapter } from "./types.js";
import { assertSafeStorageKey, parseMediaMeta, safeId } from "./media-safety.js";
import { sha256hex } from "./hashing.js";
import { awaitMaybe } from "./object-store.js";

const recordMutationQueues = new WeakMap<
  ObjectStorageAdapter,
  Map<string, Promise<void>>
>();
const CATALOG_QUEUE_ID = "\0media-record-catalog";
const MAX_SCORE_CATALOG_ENTRIES = 100_000;

/**
 * Serialize record-manifest mutations across adapters sharing one object-store
 * instance. This is process-local only; cross-process writers require backend
 * conditional writes or CAS, which this local-mock adapter does not claim.
 */
async function serializeRecordMutation<T>(
  objectStore: ObjectStorageAdapter,
  recordId: string,
  mutation: () => Promise<T>,
): Promise<T> {
  let queues = recordMutationQueues.get(objectStore);
  if (!queues) {
    queues = new Map();
    recordMutationQueues.set(objectStore, queues);
  }
  const previous = queues.get(recordId) ?? Promise.resolve();
  let release = (): void => {};
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => turn);
  queues.set(recordId, tail);
  await previous.catch(() => undefined);
  try {
    return await mutation();
  } finally {
    release();
    if (queues.get(recordId) === tail) queues.delete(recordId);
  }
}

/** Create a media lifecycle store over a supplied object-storage adapter. */
export function createMediaStoreOnObjectStore(
  objectStore: ObjectStorageAdapter,
  opts?: { rootDir?: string; keyPrefix?: string },
): MediaStoreAdapter {
  const rootDir = opts?.rootDir ?? `:object:${objectStore.backend ?? "obj"}`;
  const prefix = opts?.keyPrefix ? `${opts.keyPrefix.replace(/\/$/, "")}/` : "";
  // Cache the durable per-record manifests; object stores deliberately need no list API.
  const index = new Map<string, MediaBlobMeta>();
  const loadingRecordIndexes = new Map<string, Promise<void>>();

  function blobKey(storageKey: string): string {
    return `${prefix}${storageKey}`;
  }
  function metaKey(storageKey: string): string {
    return `${prefix}${storageKey}.meta.json`;
  }
  function indexKey(recordId: string): string {
    return `${prefix}__media-index/${safeId(recordId)}.json`;
  }
  function catalogKey(): string {
    // Tilde cannot occur in a valid record id, so this cannot collide with a
    // per-record manifest in the same namespace.
    return `${prefix}__media-index/~catalog.json`;
  }
  function recordIdFromStorageKey(storageKey: string): string {
    assertSafeStorageKey(storageKey);
    return safeId(storageKey.split("/")[0] ?? "");
  }
  async function refreshRecordIndex(recordId: string): Promise<void> {
    const pending = loadingRecordIndexes.get(recordId);
    if (pending) {
      await pending;
      return;
    }
    const loading = (async () => {
      const raw = await awaitMaybe(objectStore.getObject(indexKey(recordId)));
      let parsed: unknown = [];
      if (raw) {
        try {
          parsed = JSON.parse(raw.toString("utf8"));
        } catch {
          return;
        }
      }
      if (!Array.isArray(parsed)) return;
      const persisted = new Map<string, MediaBlobMeta>();
      for (const value of parsed) {
        const meta = parseMediaMeta(JSON.stringify(value));
        if (meta?.recordId === recordId) persisted.set(meta.storageKey, meta);
      }
      for (const [key, meta] of index) {
        if (meta.recordId === recordId) index.delete(key);
      }
      for (const [key, meta] of persisted) index.set(key, meta);
    })();
    loadingRecordIndexes.set(recordId, loading);
    try {
      await loading;
    } finally {
      loadingRecordIndexes.delete(recordId);
    }
  }
  async function readRecordCatalog(): Promise<string[]> {
    const raw = await awaitMaybe(objectStore.getObject(catalogKey()));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      if (
        !Array.isArray(parsed) ||
        parsed.length > MAX_SCORE_CATALOG_ENTRIES ||
        parsed.some((value) => {
          if (typeof value !== "string") return true;
          try {
            return safeId(value) !== value;
          } catch {
            return true;
          }
        })
      ) {
        throw new Error("invalid media record catalog");
      }
      return [...new Set(parsed)].sort();
    } catch (error) {
      if (error instanceof Error && error.message === "invalid media record catalog") {
        throw error;
      }
      throw new Error("invalid media record catalog", { cause: error });
    }
  }
  async function updateRecordCatalog(
    recordId: string,
    present: boolean,
  ): Promise<void> {
    await serializeRecordMutation(objectStore, CATALOG_QUEUE_ID, async () => {
      const records = new Set(await readRecordCatalog());
      const validatedId = safeId(recordId);
      if (present) records.add(validatedId);
      else records.delete(validatedId);
      if (records.size > MAX_SCORE_CATALOG_ENTRIES) {
        throw new Error("media record catalog capacity exceeded");
      }
      await awaitMaybe(
        objectStore.putObject(
          catalogKey(),
          Buffer.from(JSON.stringify([...records].sort()), "utf8"),
          { contentType: "application/json" },
        ),
      );
    });
  }
  async function persistRecordIndex(recordId: string): Promise<void> {
    const metas = [...index.values()]
      .filter((meta) => meta.recordId === recordId)
      .sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    if (metas.length) await updateRecordCatalog(recordId, true);
    await awaitMaybe(
      objectStore.putObject(indexKey(recordId), Buffer.from(JSON.stringify(metas), "utf8"), {
        contentType: "application/json",
      }),
    );
    if (!metas.length) {
      try {
        await updateRecordCatalog(recordId, false);
      } catch {
        // A stale catalog entry is safe and keeps the empty manifest
        // discoverable for a later maintenance pass.
      }
    }
  }
  async function hydrateCatalogIndexes(): Promise<void> {
    const recordIds = await serializeRecordMutation(
      objectStore,
      CATALOG_QUEUE_ID,
      readRecordCatalog,
    );
    for (const recordId of recordIds) await refreshRecordIndex(recordId);
  }
  async function cleanupExactObjects(storageKey: string): Promise<boolean> {
    if (!objectStore.deleteObject) return false;
    try {
      await awaitMaybe(objectStore.deleteObject(blobKey(storageKey)));
      await awaitMaybe(objectStore.deleteObject(metaKey(storageKey)));
      return true;
    } catch {
      return false;
    }
  }

  return {
    rootDir,
    backend: objectStore.backend ?? "object",
    async put(recordId, takeId, bytes, putOpts = {}) {
      return serializeRecordMutation(objectStore, recordId, async () => {
        await refreshRecordIndex(recordId);
        const storageKey = `${safeId(recordId)}/${safeId(takeId)}-${randomUUID().slice(0, 8)}.bin`;
        const meta: MediaBlobMeta = {
          storageKey,
          recordId,
          takeId,
          contentType: putOpts.contentType ?? "application/octet-stream",
          byteSize: bytes.byteLength,
          sha256: sha256hex(bytes),
          originalName: putOpts.originalName,
          createdAt: new Date().toISOString(),
        };
        // Reserve before writing bytes. If cleanup cannot be proven complete,
        // the durable reservation remains and continues to count against quota.
        index.set(storageKey, meta);
        await persistRecordIndex(recordId);
        try {
          await awaitMaybe(
            objectStore.putObject(blobKey(storageKey), bytes, {
              contentType: meta.contentType,
            }),
          );
          await awaitMaybe(
            objectStore.putObject(
              metaKey(storageKey),
              Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
              { contentType: "application/json" },
            ),
          );
          return meta;
        } catch (error) {
          if (await cleanupExactObjects(storageKey)) {
            index.delete(storageKey);
            try {
              await persistRecordIndex(recordId);
            } catch {
              index.set(storageKey, meta);
            }
          }
          throw error;
        }
      });
    },
    async get(storageKey) {
      assertSafeStorageKey(storageKey);
      const raw = await awaitMaybe(objectStore.getObject(metaKey(storageKey)));
      if (!raw) return undefined;
      const meta = parseMediaMeta(raw.toString("utf8"), storageKey);
      if (!meta) return undefined;
      index.set(storageKey, meta);
      if (meta.storageKey !== storageKey) return undefined;
      if (meta.deletedAt) return undefined;
      const bytes = await awaitMaybe(objectStore.getObject(blobKey(storageKey)));
      if (!bytes) return undefined;
      return { meta, bytes };
    },
    async getByTake(recordId, takeId) {
      await refreshRecordIndex(recordId);
      const list = [...index.values()].filter(
        (meta) =>
          meta.recordId === recordId &&
          meta.takeId === takeId &&
          !meta.deletedAt,
      );
      if (!list.length) return undefined;
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return this.get(list[list.length - 1]!.storageKey);
    },
    async listForRecord(recordId) {
      await refreshRecordIndex(recordId);
      const out: MediaBlobMeta[] = [];
      for (const meta of index.values()) {
        if (meta.recordId === recordId && !meta.deletedAt) out.push(meta);
      }
      return out;
    },
    async softDelete(storageKey) {
      const recordId = recordIdFromStorageKey(storageKey);
      return serializeRecordMutation(objectStore, recordId, async () => {
        await refreshRecordIndex(recordId);
        let meta = index.get(storageKey);
        if (!meta) {
          const raw = await awaitMaybe(objectStore.getObject(metaKey(storageKey)));
          if (!raw) return undefined;
          meta = parseMediaMeta(raw.toString("utf8"), storageKey);
        }
        if (!meta || meta.recordId !== recordId) return undefined;
        const next = { ...meta, deletedAt: new Date().toISOString() };
        await awaitMaybe(
          objectStore.putObject(
            metaKey(storageKey),
            Buffer.from(JSON.stringify(next, null, 2), "utf8"),
            { contentType: "application/json" },
          ),
        );
        index.set(storageKey, next);
        await persistRecordIndex(next.recordId);
        return next;
      });
    },
    async hardDelete(storageKey) {
      const recordId = recordIdFromStorageKey(storageKey);
      return serializeRecordMutation(objectStore, recordId, async () => {
        await refreshRecordIndex(recordId);
        let meta = index.get(storageKey);
        if (!meta) {
          const raw = await awaitMaybe(objectStore.getObject(metaKey(storageKey)));
          if (!raw) return false;
          meta = parseMediaMeta(raw.toString("utf8"), storageKey);
        }
        if (!meta || meta.recordId !== recordId) return false;
        if (!objectStore.deleteObject) {
          throw new Error("object storage adapter does not support hard media deletion");
        }
        // Delete exact objects before removing the durable reservation. This
        // also repairs failed puts whose metadata sidecar was never created.
        await awaitMaybe(objectStore.deleteObject(blobKey(storageKey)));
        await awaitMaybe(objectStore.deleteObject(metaKey(storageKey)));
        index.delete(storageKey);
        await persistRecordIndex(meta.recordId);
        return true;
      });
    },
    async purgeDeleted(maxAgeMs = 0) {
      await hydrateCatalogIndexes();
      let removed = 0;
      const now = Date.now();
      for (const [key, meta] of [...index.entries()]) {
        if (!meta.deletedAt) continue;
        await serializeRecordMutation(objectStore, meta.recordId, async () => {
          await refreshRecordIndex(meta.recordId);
          const current = index.get(key);
          if (!current?.deletedAt) return;
          const age = now - Date.parse(current.deletedAt);
          if (age < maxAgeMs) return;
          if (!objectStore.deleteObject) {
            throw new Error("object storage adapter does not support hard media deletion");
          }
          await awaitMaybe(objectStore.deleteObject(blobKey(key)));
          await awaitMaybe(objectStore.deleteObject(metaKey(key)));
          index.delete(key);
          await persistRecordIndex(current.recordId);
          removed++;
        });
      }
      return removed;
    },
    async totalBytesForRecord(recordId) {
      await refreshRecordIndex(recordId);
      // Include tombstones: a failed physical delete must continue to reserve
      // quota until the exact key has actually been removed.
      return [...index.values()]
        .filter((meta) => meta.recordId === recordId)
        .reduce((n, m) => n + (m.byteSize ?? 0), 0);
    },
    async totalBytesAll() {
      await hydrateCatalogIndexes();
      let n = 0;
      for (const meta of index.values()) {
        n += meta.byteSize ?? 0;
      }
      return n;
    },
  };
}
