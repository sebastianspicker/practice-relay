/**
 * Tests - media.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createMediaStore,
  createMemoryMediaStore,
  createFilesystemObjectStore,
  createMemoryObjectStore,
  createFilesystemMediaStore,
  createMediaStoreOnObjectStore,
  createS3CompatibleObjectStore,
  createObjectStoreFromEnv,
  createMediaStoreFromEnv,
  awaitMaybe,
  type S3CompatibleConfig,
} from "./index.ts";

describe("media store", () => {
  it("creates filesystem media paths with owner-only permissions", async () => {
    if (process.platform === "win32") return;
    const parent = mkdtempSync(path.join(tmpdir(), "media-modes-"));
    const mediaRoot = path.join(parent, "media");
    const objectRoot = path.join(parent, "objects");
    try {
      const store = createMediaStore(mediaRoot);
      const meta = await awaitMaybe(
        store.put("ps-private", "take-private", Buffer.from("private-media")),
      );
      const blobPath = path.join(mediaRoot, meta.storageKey);
      const recordDir = path.dirname(blobPath);
      assert.equal(statSync(mediaRoot).mode & 0o777, 0o700);
      assert.equal(statSync(recordDir).mode & 0o777, 0o700);
      assert.equal(statSync(blobPath).mode & 0o777, 0o600);
      assert.equal(statSync(`${blobPath}.meta.json`).mode & 0o777, 0o600);

      const objects = createFilesystemObjectStore(objectRoot);
      await awaitMaybe(objects.putObject("record/blob.bin", Buffer.from("private-object")));
      assert.equal(statSync(objectRoot).mode & 0o777, 0o700);
      assert.equal(statSync(path.join(objectRoot, "record")).mode & 0o777, 0o700);
      assert.equal(statSync(path.join(objectRoot, "record", "blob.bin")).mode & 0o777, 0o600);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("puts and gets blob with sha256", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "media-"));
    try {
      const store = createMediaStore(root);
      const meta = await awaitMaybe(
        store.put("ps-1", "take-a", Buffer.from("hello-video"), {
          contentType: "video/mp4",
          originalName: "a.mp4",
        }),
      );
      assert.equal(meta.byteSize, 11);
      assert.equal(meta.sha256.length, 64);
      const got = await awaitMaybe(store.get(meta.storageKey));
      assert.ok(got);
      assert.equal(got!.bytes.toString("utf8"), "hello-video");
      const byTake = await awaitMaybe(store.getByTake("ps-1", "take-a"));
      assert.ok(byTake);
      assert.equal((await awaitMaybe(store.listForRecord("ps-1"))).length, 1);
      assert.equal(await awaitMaybe(store.totalBytesForRecord("ps-1")), 11);
      await awaitMaybe(store.softDelete(meta.storageKey));
      assert.equal((await awaitMaybe(store.listForRecord("ps-1"))).length, 0);
      assert.equal(await awaitMaybe(store.purgeDeleted(0)), 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("filesystem factory aliases createMediaStore", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "media-fs-"));
    try {
      const store = createFilesystemMediaStore(root);
      const meta = await awaitMaybe(store.put("ps-2", "t", Buffer.from("x")));
      assert.ok(await awaitMaybe(store.get(meta.storageKey)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("in-memory media store put/get/softDelete for tests", async () => {
    const store = createMemoryMediaStore();
    assert.equal(store.rootDir, ":memory:");
    const meta = await awaitMaybe(
      store.put("ps-m", "take-1", Buffer.from("mem-bytes"), {
        contentType: "video/mp4",
      }),
    );
    assert.equal(meta.byteSize, 9);
    const got = await awaitMaybe(store.get(meta.storageKey));
    assert.ok(got);
    assert.equal(got!.bytes.toString("utf8"), "mem-bytes");
    assert.equal((await awaitMaybe(store.listForRecord("ps-m"))).length, 1);
    await awaitMaybe(store.softDelete(meta.storageKey));
    assert.equal((await awaitMaybe(store.listForRecord("ps-m"))).length, 0);
    assert.equal(await awaitMaybe(store.purgeDeleted(0)), 1);
  });

  it("hard-deletes replaced blobs for filesystem and memory stores", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "media-replace-"));
    try {
      for (const store of [createMediaStore(root), createMemoryMediaStore()]) {
        let previous: string | undefined;
        let latest = Buffer.alloc(0);
        for (const value of ["one", "two", "three"]) {
          latest = Buffer.from(value);
          const next = await awaitMaybe(store.put("ps-replace", "take", latest));
          if (previous) await awaitMaybe(store.hardDelete(previous));
          previous = next.storageKey;
        }
        assert.equal(await awaitMaybe(store.totalBytesForRecord("ps-replace")), latest.byteLength);
        assert.ok(await awaitMaybe(store.get(previous!)));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("object storage adapters put/get (filesystem + memory)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "obj-"));
    try {
      const fsObj = createFilesystemObjectStore(root);
      await awaitMaybe(fsObj.putObject("a/b.bin", Buffer.from("obj-fs")));
      assert.equal(
        (await awaitMaybe(fsObj.getObject("a/b.bin")))?.toString("utf8"),
        "obj-fs",
      );
      assert.equal(await awaitMaybe(fsObj.deleteObject?.("a/b.bin") ?? false), true);
      assert.throws(() => fsObj.putObject("../outside.bin", Buffer.from("no")));
      assert.throws(() => fsObj.getObject("/tmp/outside.bin"));

      const mem = createMemoryObjectStore();
      await awaitMaybe(mem.putObject("k", Buffer.from("obj-mem")));
      assert.equal(
        (await awaitMaybe(mem.getObject("k")))?.toString("utf8"),
        "obj-mem",
      );
      assert.equal(await awaitMaybe(mem.getObject("missing")), undefined);
      assert.equal(mem.backend, "memory");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe media ids and storage keys", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "media-boundary-"));
    try {
      const fsStore = createMediaStore(root);
      assert.throws(() => fsStore.put("..", "take", Buffer.from("no")));
      assert.throws(() => fsStore.put("../record", "take", Buffer.from("no")));
      assert.throws(() => fsStore.put("record/name", "take", Buffer.from("no")));
      assert.throws(() => fsStore.put("record", ".", Buffer.from("no")));
      assert.throws(() => fsStore.get("../outside.bin"));
      assert.throws(() => fsStore.softDelete("/tmp/outside.bin"));

      const meta = await awaitMaybe(fsStore.put("record", "take", Buffer.from("ok")));
      writeFileSync(
        path.join(root, `${meta.storageKey}.meta.json`),
        JSON.stringify({ ...meta, storageKey: "other/take.bin" }),
      );
      assert.equal(await awaitMaybe(fsStore.get(meta.storageKey)), undefined);

      const objectStore = createMediaStoreOnObjectStore(createMemoryObjectStore());
      await assert.rejects(async () =>
        await awaitMaybe(objectStore.get("../outside.bin")),
      );
      await assert.rejects(async () =>
        await awaitMaybe(objectStore.softDelete("/tmp/outside.bin")),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects filesystem symlink escapes", (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "media-symlink-root-"));
    const outside = mkdtempSync(path.join(tmpdir(), "media-symlink-outside-"));
    try {
      try {
        symlinkSync(outside, path.join(root, "escape"), "dir");
      } catch (error) {
        t.skip(`symlinks unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const store = createMediaStore(root);
      const key = "escape/blob.bin";
      writeFileSync(path.join(outside, "blob.bin"), "outside");
      writeFileSync(
        path.join(outside, "blob.bin.meta.json"),
        JSON.stringify({
          storageKey: key,
          recordId: "record",
          takeId: "take",
          contentType: "application/octet-stream",
          byteSize: 7,
          sha256: "0".repeat(64),
          createdAt: new Date().toISOString(),
        }),
      );
      assert.throws(() => store.get(key));

      const objectStore = createFilesystemObjectStore(root);
      assert.throws(() => objectStore.putObject("escape/new.bin", Buffer.from("no")));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("media store on memory ObjectStorageAdapter", async () => {
    const obj = createMemoryObjectStore();
    const store = createMediaStoreOnObjectStore(obj, { rootDir: ":memory:" });
    const meta = await awaitMaybe(
      store.put("ps-obj", "t1", Buffer.from("via-obj"), {
        contentType: "video/webm",
      }),
    );
    const got = await awaitMaybe(store.get(meta.storageKey));
    assert.ok(got);
    assert.equal(got!.bytes.toString("utf8"), "via-obj");
    assert.equal(await awaitMaybe(store.totalBytesForRecord("ps-obj")), 7);
    assert.equal(await awaitMaybe(store.totalBytesAll?.() ?? 0), 7);
    await awaitMaybe(store.softDelete(meta.storageKey));
    assert.equal((await awaitMaybe(store.listForRecord("ps-obj"))).length, 0);
  });

  it("refreshes an adapter that previously cached an empty shared record", async () => {
    const objects = createMemoryObjectStore();
    const adapterA = createMediaStoreOnObjectStore(objects);
    const adapterB = createMediaStoreOnObjectStore(objects);
    assert.deepEqual(await awaitMaybe(adapterA.listForRecord("shared-record")), []);

    const created = await awaitMaybe(
      adapterB.put("shared-record", "shared-take", Buffer.from("shared")),
    );

    assert.deepEqual(
      (await awaitMaybe(adapterA.listForRecord("shared-record"))).map(
        (meta) => meta.storageKey,
      ),
      [created.storageKey],
    );
    assert.equal(
      (await awaitMaybe(adapterA.getByTake("shared-record", "shared-take")))
        ?.bytes.toString("utf8"),
      "shared",
    );
    assert.equal(
      await awaitMaybe(adapterA.totalBytesForRecord("shared-record")),
      6,
    );
  });

  it("preserves both sequential puts made through shared adapters", async () => {
    const objects = createMemoryObjectStore();
    const adapterA = createMediaStoreOnObjectStore(objects);
    const adapterB = createMediaStoreOnObjectStore(objects);
    const first = await awaitMaybe(
      adapterA.put("shared-put", "first", Buffer.from("one")),
    );
    const second = await awaitMaybe(
      adapterB.put("shared-put", "second", Buffer.from("two")),
    );

    assert.deepEqual(
      (await awaitMaybe(adapterA.listForRecord("shared-put")))
        .map((meta) => meta.storageKey)
        .sort(),
      [first.storageKey, second.storageKey].sort(),
    );
    assert.equal(await awaitMaybe(adapterB.totalBytesForRecord("shared-put")), 6);
  });

  it("hydrates a persisted record index before a restarted adapter puts media", async () => {
    const objects = createMemoryObjectStore();
    const firstAdapter = createMediaStoreOnObjectStore(objects);
    const old = await awaitMaybe(
      firstAdapter.put("ps-restart-put", "old-take", Buffer.from("old")),
    );

    const restarted = createMediaStoreOnObjectStore(objects);
    const added = await awaitMaybe(
      restarted.put("ps-restart-put", "new-take", Buffer.from("newer")),
    );

    const listed = await awaitMaybe(restarted.listForRecord("ps-restart-put"));
    assert.deepEqual(
      listed.map((meta) => meta.storageKey).sort(),
      [old.storageKey, added.storageKey].sort(),
    );
    assert.equal(
      (await awaitMaybe(restarted.getByTake("ps-restart-put", "old-take")))
        ?.bytes.toString("utf8"),
      "old",
    );
    assert.equal(
      await awaitMaybe(restarted.totalBytesForRecord("ps-restart-put")),
      8,
    );
  });

  it("hydrates a persisted record index before a restarted adapter soft-deletes", async () => {
    const objects = createMemoryObjectStore();
    const firstAdapter = createMediaStoreOnObjectStore(objects);
    const retained = await awaitMaybe(
      firstAdapter.put("ps-restart-delete", "retained", Buffer.from("keep")),
    );
    const removed = await awaitMaybe(
      firstAdapter.put("ps-restart-delete", "removed", Buffer.from("gone")),
    );

    const restarted = createMediaStoreOnObjectStore(objects);
    await awaitMaybe(restarted.softDelete(removed.storageKey));

    const listed = await awaitMaybe(restarted.listForRecord("ps-restart-delete"));
    assert.deepEqual(listed.map((meta) => meta.storageKey), [retained.storageKey]);
    assert.equal(
      (await awaitMaybe(restarted.getByTake("ps-restart-delete", "retained")))
        ?.bytes.toString("utf8"),
      "keep",
    );
    assert.equal(await awaitMaybe(restarted.get(removed.storageKey)), undefined);
    assert.equal(
      await awaitMaybe(restarted.totalBytesForRecord("ps-restart-delete")),
      8,
    );
  });

  it("object-store replacement deletes exact keys and persists failed-cleanup quota", async () => {
    const objects = new Map<string, Buffer>();
    let failDelete = false;
    const objectStore = {
      backend: "test-object",
      putObject(key: string, bytes: Buffer) { objects.set(key, Buffer.from(bytes)); },
      getObject(key: string) { return objects.get(key); },
      deleteObject(key: string) {
        if (failDelete) throw new Error("delete unavailable");
        return objects.delete(key);
      },
    };
    const store = createMediaStoreOnObjectStore(objectStore);
    const first = await awaitMaybe(store.put("ps-object-replace", "take", Buffer.from("one")));
    const second = await awaitMaybe(store.put("ps-object-replace", "take", Buffer.from("two")));
    assert.equal(await awaitMaybe(store.hardDelete(first.storageKey)), true);
    assert.equal(await awaitMaybe(store.totalBytesForRecord("ps-object-replace")), 3);
    assert.equal(objects.has(first.storageKey), false);

    failDelete = true;
    await assert.rejects(async () => await awaitMaybe(store.hardDelete(second.storageKey)));
    // A fresh adapter has no process-local state, so this proves the quota
    // reservation survives a restart when exact deletion cannot complete.
    const restarted = createMediaStoreOnObjectStore(objectStore);
    assert.equal(await awaitMaybe(restarted.totalBytesForRecord("ps-object-replace")), 3);
  });

  it("createObjectStoreFromEnv / createMediaStoreFromEnv memory", async () => {
    const obj = createObjectStoreFromEnv({
      PRACTICE_RELAY_OBJECT_STORE: "memory",
    } as NodeJS.ProcessEnv);
    assert.equal(obj.backend, "memory");
    const media = createMediaStoreFromEnv({
      PRACTICE_RELAY_OBJECT_STORE: "memory",
    } as NodeJS.ProcessEnv);
    const meta = await awaitMaybe(media.put("ps-e", "t", Buffer.from("env")));
    assert.ok(await awaitMaybe(media.get(meta.storageKey)));
  });

  it("S3-compatible client put/get/delete with mock fetch", async () => {
    const objects = new Map<string, Buffer>();
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      // path-style: http://localhost:9000/bucket/key
      const u = new URL(url);
      const parts = u.pathname.replace(/^\//, "").split("/");
      const key = parts.slice(1).map(decodeURIComponent).join("/");
      if (method === "PUT") {
        let body: Buffer = Buffer.alloc(0);
        if (init?.body) {
          const raw = init.body as unknown;
          if (Buffer.isBuffer(raw)) body = Buffer.from(raw);
          else if (raw instanceof Uint8Array) body = Buffer.from(raw);
          else if (raw instanceof ArrayBuffer) body = Buffer.from(new Uint8Array(raw));
          else if (typeof raw === "string") body = Buffer.from(raw);
        }
        objects.set(key, body);
        return new Response(null, { status: 200 });
      }
      if (method === "GET") {
        const b = objects.get(key);
        if (!b) return new Response("not found", { status: 404 });
        return new Response(b, { status: 200 });
      }
      if (method === "DELETE") {
        const ok = objects.delete(key);
        return new Response(null, { status: ok ? 204 : 404 });
      }
      return new Response("no", { status: 405 });
    };

    const config: S3CompatibleConfig = {
      endpoint: "http://localhost:9000",
      bucket: "practice-relay",
      accessKey: "minio",
      secretKey: "minio123",
      forcePathStyle: true,
      region: "us-east-1",
      fetchImpl,
    };
    const s3 = createS3CompatibleObjectStore(config);
    assert.equal(s3.backend, "s3");
    await awaitMaybe(s3.putObject("records/a.bin", Buffer.from("s3-bytes"), {
      contentType: "application/octet-stream",
    }));
    const got = await awaitMaybe(s3.getObject("records/a.bin"));
    assert.equal(got?.toString("utf8"), "s3-bytes");
    assert.equal(await awaitMaybe(s3.deleteObject?.("records/a.bin") ?? false), true);
    assert.equal(await awaitMaybe(s3.getObject("records/a.bin")), undefined);
  });

  it("createObjectStoreFromEnv s3 requires credentials", () => {
    assert.throws(() =>
      createObjectStoreFromEnv({
        PRACTICE_RELAY_OBJECT_STORE: "s3",
      } as NodeJS.ProcessEnv),
    );
  });
});
