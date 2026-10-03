/** Single-process streaming lifecycle, quota, ownership, and recovery tests. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createFilesystemMediaStore, createMediaStoreFromEnv } from "./filesystem-media-store.ts";
import { createFilesystemObjectStore } from "./object-store.ts";
import { MediaIntegrityError, MediaQuotaError } from "./types.ts";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "practice-relay-media-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("filesystem lifecycle streams, verifies, and survives restart", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root);
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "record-1", takeId: "take-1", declaredByteSize: 7, contentType: "video/mp4" });
  const staged = await media.stageUpload(reservation, Readable.from([Buffer.from("payload")]));
  const pending = await media.storeUpload(reservation, staged);
  await media.attachUpload(reservation);
  await staged.cleanup();

  const restarted = createFilesystemMediaStore(root);
  await restarted.initialize();
  assert.equal(await restarted.totalBytesForRecord("record-1"), 7);
  const download = await restarted.stageDownload(pending.storageKey);
  assert.ok(download);
  const chunks: Buffer[] = [];
  for await (const chunk of download.createReadStream()) chunks.push(chunk as Buffer);
  assert.equal(Buffer.concat(chunks).toString(), "payload");
  await download.cleanup();
}));

test("filesystem immutable collision preserves the winning object", async () => withRoot(async (root) => {
  const objects = createFilesystemObjectStore(root);
  const first = path.join(root, "first.stage"), second = path.join(root, "second.stage");
  await writeFile(first, "first", { mode: 0o600 });
  await writeFile(second, "second", { mode: 0o600 });
  await objects.putFile("record/key.bin", first, { contentType: "application/octet-stream", byteSize: 5, sha256: "x" });
  await assert.rejects(objects.putFile("record/key.bin", second, { contentType: "application/octet-stream", byteSize: 6, sha256: "y" }));
  assert.equal(await readFile(path.join(root, "record/key.bin"), "utf8"), "first");
}));

test("download stages and rejects corrupted bytes before exposure", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root);
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "record-2", takeId: "take-2", contentType: "application/octet-stream" });
  const staged = await media.stageUpload(reservation, Readable.from("sound"));
  const meta = await media.storeUpload(reservation, staged);
  await media.attachUpload(reservation);
  await staged.cleanup();
  await writeFile(path.join(root, meta.storageKey), "wrong", { mode: 0o600 });
  await assert.rejects(media.stageDownload(meta.storageKey), MediaIntegrityError);
}));

test("reservation quota includes pending objects and unknown lengths reserve the ceiling", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { maxObjectBytes: 10, maxRecordBytes: 12, maxActiveUploadsPerRecord: 2 } });
  await media.initialize();
  const first = await media.reserveUpload({ recordId: "quota", takeId: "a", declaredByteSize: 8, contentType: "application/octet-stream" });
  await assert.rejects(media.reserveUpload({ recordId: "quota", takeId: "b", declaredByteSize: 5, contentType: "application/octet-stream" }), MediaQuotaError);
  await media.abandonUpload(first);
  const unknown = await media.reserveUpload({ recordId: "quota", takeId: "c", contentType: "application/octet-stream" });
  assert.equal(unknown.reservedBytes, 10);
}));

test("abandoned object stays charged until reference-checked recovery deletes it", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { leaseMs: 1_000 } });
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "recover", takeId: randomUUID(), declaredByteSize: 3, contentType: "application/octet-stream" });
  const staged = await media.stageUpload(reservation, Readable.from("old"));
  await media.storeUpload(reservation, staged);
  const recovered = await media.recover({ now: new Date(Date.now() + 2_000), isReferenced: async () => false });
  assert.equal(recovered.deleted, 1);
  assert.equal(await media.totalBytesForRecord("recover"), 0);
  await staged.cleanup();
}));

test("a forged abandonment cannot release another upload's process slot", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { maxActiveTransfers: 1 } });
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "owned", takeId: "take", declaredByteSize: 1, contentType: "application/octet-stream" });
  await media.abandonUpload({ ...reservation, ownerToken: randomUUID() });
  await assert.rejects(
    media.reserveUpload({ recordId: "other", takeId: "take", declaredByteSize: 1, contentType: "application/octet-stream" }),
    /process media transfer capacity exhausted/u,
  );
  await media.abandonUpload(reservation);
  const next = await media.reserveUpload({ recordId: "other", takeId: "take", declaredByteSize: 1, contentType: "application/octet-stream" });
  await media.abandonUpload(next);
}));

test("recovery promotes referenced staged objects into durable metadata", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { leaseMs: 1_000 } });
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "attached-record", takeId: "attached-take", declaredByteSize: 4, contentType: "audio/wav" });
  const staged = await media.stageUpload(reservation, Readable.from("kept"));
  const pending = await media.storeUpload(reservation, staged);
  const recovered = await media.recover({
    now: new Date(Date.now() + 2_000),
    isReferenced: async (candidate) => candidate.storageKey === pending.storageKey,
  });
  assert.deepEqual(recovered, { examined: 1, deleted: 0, retained: 1, failed: 0 });
  await staged.cleanup();

  const restarted = createFilesystemMediaStore(root);
  await restarted.initialize();
  assert.deepEqual((await restarted.listForRecord("attached-record")).map((meta) => meta.storageKey), [pending.storageKey]);
  const download = await restarted.stageDownload(pending.storageKey);
  assert.ok(download);
  await download.cleanup();
}));

test("caller cancellation aborts upload staging and releases an aborted download", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { maxActiveTransfers: 1 } });
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "cancel", takeId: "take", declaredByteSize: 4, contentType: "application/octet-stream" });
  const uploadAbort = new AbortController();
  uploadAbort.abort(new Error("caller cancelled upload"));
  await assert.rejects(
    media.stageUpload(reservation, Readable.from("data"), { signal: uploadAbort.signal }),
    /caller cancelled upload/u,
  );
  await media.abandonUpload(reservation);

  const stored = await media.reserveUpload({ recordId: "cancel", takeId: "stored", declaredByteSize: 4, contentType: "application/octet-stream" });
  const staged = await media.stageUpload(stored, Readable.from("data"));
  const meta = await media.storeUpload(stored, staged);
  await media.attachUpload(stored);
  await staged.cleanup();
  const downloadAbort = new AbortController();
  downloadAbort.abort(new Error("caller cancelled download"));
  await assert.rejects(media.stageDownload(meta.storageKey, { signal: downloadAbort.signal }), /caller cancelled download/u);
  const next = await media.reserveUpload({ recordId: "after-cancel", takeId: "take", declaredByteSize: 1, contentType: "application/octet-stream" });
  await media.abandonUpload(next);
}));

test("promotion rechecks a concurrent replacement before crediting old bytes", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root, { limits: { leaseMs: 1_000 } });
  await media.initialize();
  const old = await media.reserveUpload({ recordId: "race", takeId: "take", declaredByteSize: 4, contentType: "application/octet-stream" });
  const oldStage = await media.stageUpload(old, Readable.from("old!"));
  const oldMeta = await media.storeUpload(old, oldStage);
  await oldStage.cleanup();
  let canonicalKey = oldMeta.storageKey;
  let checks = 0;
  const first = await media.recover({
    now: new Date(Date.now() + 2_000),
    isReferenced: async (candidate) => {
      checks += 1;
      const observed = canonicalKey === candidate.storageKey;
      if (checks === 1) {
        const replacement = await media.reserveUpload({ recordId: "race", takeId: "take", declaredByteSize: 3, contentType: "application/octet-stream" });
        const replacementStage = await media.stageUpload(replacement, Readable.from("new"));
        const replacementMeta = await media.storeUpload(replacement, replacementStage);
        canonicalKey = replacementMeta.storageKey;
        await media.attachUpload(replacement, { replacedStorageKey: candidate.storageKey });
        await replacementStage.cleanup();
      }
      return observed;
    },
  });
  assert.deepEqual(first, { examined: 1, deleted: 0, retained: 0, failed: 0 });
  assert.equal(checks, 2);
  assert.equal(await readFile(path.join(root, oldMeta.storageKey), "utf8"), "old!");
  assert.equal(await media.totalBytesForRecord("race"), 7);

  const second = await media.recover({ isReferenced: async (candidate) => canonicalKey === candidate.storageKey });
  assert.deepEqual(second, { examined: 1, deleted: 1, retained: 0, failed: 0 });
  assert.equal(await media.totalBytesForRecord("race"), 3);
  assert.deepEqual(await media.recover({ isReferenced: async () => false }), { examined: 0, deleted: 0, retained: 0, failed: 0 });
  assert.equal(await media.totalBytesForRecord("race"), 3);
}));

test("single-process S3 metadata survives restart and retains pending quota", async () => withRoot(async (root) => {
  const objects = new Map<string, Buffer>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const key = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url).pathname;
    if (init?.method === "PUT") {
      if (objects.has(key)) return new Response(null, { status: 412 });
      const chunks: Buffer[] = [];
      for await (const chunk of init?.body as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      objects.set(key, Buffer.concat(chunks));
      return new Response(null, { status: 200 });
    }
    if (init?.method === "GET") {
      const bytes = objects.get(key);
      return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: objects.delete(key) ? 204 : 404 });
    }
    return new Response(null, { status: 405 });
  };
  const env = {
    PRACTICE_RELAY_OBJECT_STORE: "s3",
    PRACTICE_RELAY_S3_ENDPOINT: "https://objects.example.test",
    PRACTICE_RELAY_S3_BUCKET: "media",
    PRACTICE_RELAY_S3_ACCESS_KEY: "access",
    PRACTICE_RELAY_S3_SECRET_KEY: "secret",
  } as NodeJS.ProcessEnv;
  const options = { mediaRoot: root, stagingRoot: path.join(root, ".staging"), fetchImpl, limits: { leaseMs: 1_000 } };
  const first = createMediaStoreFromEnv(env, options);
  await first.initialize();
  const attached = await first.reserveUpload({ recordId: "s3-record", takeId: "attached", declaredByteSize: 4, contentType: "application/octet-stream" });
  const attachedStage = await first.stageUpload(attached, Readable.from("kept"));
  const attachedMeta = await first.storeUpload(attached, attachedStage);
  await first.attachUpload(attached); await attachedStage.cleanup();
  const pending = await first.reserveUpload({ recordId: "s3-record", takeId: "pending", declaredByteSize: 3, contentType: "application/octet-stream" });
  const pendingStage = await first.stageUpload(pending, Readable.from("old"));
  await first.storeUpload(pending, pendingStage); await pendingStage.cleanup();
  await first.close();

  const restarted = createMediaStoreFromEnv(env, options);
  await restarted.initialize();
  assert.equal(await restarted.totalBytesForRecord("s3-record"), 7);
  const download = await restarted.stageDownload(attachedMeta.storageKey);
  assert.ok(download); await download.cleanup();
  const recovered = await restarted.recover({ now: new Date(Date.now() + 2_000), isReferenced: async () => false });
  assert.deepEqual(recovered, { examined: 1, deleted: 1, retained: 0, failed: 0 });
  assert.equal(await restarted.totalBytesForRecord("s3-record"), 4);
  await restarted.close();
}));
