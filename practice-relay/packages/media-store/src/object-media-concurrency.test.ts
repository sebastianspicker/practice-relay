/**
 * Object-media concurrency and failed-put recovery regression tests.
 *
 * Why: shared adapters must not lose manifests, and uncertain cleanup must
 * retain quota until exact-key repair succeeds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awaitMaybe,
  createMediaStoreOnObjectStore,
  createMemoryObjectStore,
  type ObjectStorageAdapter,
} from "./index.ts";

test("concurrent same-process adapters serialize record manifest mutations", async () => {
  const objects = createMemoryObjectStore();
  const adapterA = createMediaStoreOnObjectStore(objects);
  const adapterB = createMediaStoreOnObjectStore(objects);

  const [first, second] = await Promise.all([
    awaitMaybe(adapterA.put("concurrent-record", "first", Buffer.from("one"))),
    awaitMaybe(adapterB.put("concurrent-record", "second", Buffer.from("two"))),
  ]);

  const restarted = createMediaStoreOnObjectStore(objects);
  assert.deepEqual(
    (await awaitMaybe(restarted.listForRecord("concurrent-record")))
      .map((meta) => meta.storageKey)
      .sort(),
    [first.storageKey, second.storageKey].sort(),
  );
  assert.equal(
    await awaitMaybe(restarted.totalBytesForRecord("concurrent-record")),
    6,
  );
});

for (const failedWrite of ["blob", "meta"] as const) {
  test(`hardDelete repairs a reserved failed ${failedWrite} put without a sidecar`, async () => {
    const objects = new Map<string, Buffer>();
    let cleanupUnavailable = true;
    const objectStore: ObjectStorageAdapter = {
      backend: `failing-${failedWrite}`,
      putObject(key, bytes) {
        const isManifest = key.startsWith("__media-index/");
        const isMeta = key.endsWith(".meta.json");
        if (
          !isManifest &&
          ((failedWrite === "meta" && isMeta) ||
            (failedWrite === "blob" && !isMeta))
        ) {
          throw new Error(`injected ${failedWrite} put failure`);
        }
        objects.set(key, Buffer.from(bytes));
      },
      getObject(key) {
        const bytes = objects.get(key);
        return bytes ? Buffer.from(bytes) : undefined;
      },
      deleteObject(key) {
        if (cleanupUnavailable) throw new Error("injected cleanup uncertainty");
        return objects.delete(key);
      },
    };
    const recordId = `failed-${failedWrite}`;
    const store = createMediaStoreOnObjectStore(objectStore);
    await assert.rejects(
      async () =>
        await awaitMaybe(
          store.put(recordId, "take", Buffer.from("data")),
        ),
      new RegExp(`injected ${failedWrite} put failure`),
    );

    const manifest = JSON.parse(
      objects.get(`__media-index/${recordId}.json`)!.toString("utf8"),
    ) as Array<{ storageKey: string }>;
    assert.equal(manifest.length, 1);
    const storageKey = manifest[0]!.storageKey;
    const restarted = createMediaStoreOnObjectStore(objectStore);
    assert.equal(await awaitMaybe(restarted.totalBytesForRecord(recordId)), 4);

    cleanupUnavailable = false;
    assert.equal(await awaitMaybe(restarted.hardDelete(storageKey)), true);
    assert.equal(await awaitMaybe(restarted.totalBytesForRecord(recordId)), 0);
    assert.deepEqual(
      JSON.parse(
        objects.get(`__media-index/${recordId}.json`)!.toString("utf8"),
      ),
      [],
    );
  });
}

test("restarted adapter purges concurrent-record tombstones from durable catalog", async () => {
  const objects = createMemoryObjectStore();
  const first = createMediaStoreOnObjectStore(objects);
  const second = createMediaStoreOnObjectStore(objects);
  const [firstMeta, secondMeta] = await Promise.all([
    awaitMaybe(first.put("restart-purge-a", "take", Buffer.from("data"))),
    awaitMaybe(second.put("restart-purge-b", "take", Buffer.from("more"))),
  ]);
  await Promise.all([
    awaitMaybe(first.softDelete(firstMeta.storageKey)),
    awaitMaybe(second.softDelete(secondMeta.storageKey)),
  ]);

  const restarted = createMediaStoreOnObjectStore(objects);
  assert.equal(await awaitMaybe(restarted.purgeDeleted(0)), 2);
  assert.equal(
    await awaitMaybe(restarted.totalBytesForRecord("restart-purge-a")),
    0,
  );
  assert.equal(
    await awaitMaybe(restarted.totalBytesForRecord("restart-purge-b")),
    0,
  );
  assert.equal(await awaitMaybe(restarted.totalBytesAll?.()), 0);
});

test("maintenance fails closed on a malformed durable record catalog", async () => {
  const objects = createMemoryObjectStore();
  await awaitMaybe(
    objects.putObject(
      "__media-index/~catalog.json",
      Buffer.from('{"not":"an array"}'),
    ),
  );
  const restarted = createMediaStoreOnObjectStore(objects);
  await assert.rejects(
    async () => await awaitMaybe(restarted.purgeDeleted(0)),
    /invalid media record catalog/,
  );
});
