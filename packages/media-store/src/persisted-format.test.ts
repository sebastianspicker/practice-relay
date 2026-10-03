/** Persisted-format goldens: media migration history and filesystem storage layout. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createFilesystemMediaStore, MEDIA_MIGRATION_IDS, migrateMediaStore } from "./index.ts";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "practice-relay-media-format-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("media-store migration ids and SQL hashes match the released history", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
    transaction: async <T>(fn: (db: unknown) => Promise<T>) => fn(database),
  };
  await migrateMediaStore(database as never);
  assert.deepEqual(queries[1]!.values, ["practice-relay:migrate:media-store"]);
  const applied = queries.filter((query) => query.text.startsWith("INSERT INTO practice_relay_migrations"));
  assert.deepEqual(applied.map((query) => query.values), MEDIA_MIGRATION_IDS.map((id) => ["media-store", id]));
  assert.deepEqual([...MEDIA_MIGRATION_IDS], ["0001_media_lifecycle"]);
  // Statement 3 is the first migration's SQL (after table, lock, and applied-check statements).
  assert.equal(
    createHash("sha256").update(queries[3]!.text).digest("hex"),
    "903fa1d9e42b1113fcefeac6e23a556e83d46c449a7e81c0f2db81f19ccfe005",
    "historical migrations are immutable: add a new numbered migration instead of editing a released one",
  );
});

test("filesystem uploads use the immutable key format and the __media-state.json state file", async () => withRoot(async (root) => {
  const media = createFilesystemMediaStore(root);
  await media.initialize();
  const reservation = await media.reserveUpload({ recordId: "record-1", takeId: "take-1", declaredByteSize: 7, contentType: "video/mp4" });
  const staged = await media.stageUpload(reservation, Readable.from([Buffer.from("payload")]));
  const meta = await media.storeUpload(reservation, staged);
  await media.attachUpload(reservation);
  await staged.cleanup();

  assert.match(meta.storageKey, /^record-1\/take-1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/u);
  assert.equal(meta.storageKey, `record-1/take-1-${reservation.id}.bin`);
  assert.equal(await readFile(path.join(root, meta.storageKey), "utf8"), "payload");
  assert.deepEqual((await readdir(path.join(root, "record-1"))).sort(), [path.basename(meta.storageKey)]);
  assert.deepEqual((await readdir(root)).filter((name) => name !== ".staging").sort(), ["__media-state.json", "record-1"]);

  const state = JSON.parse(await readFile(path.join(root, "__media-state.json"), "utf8")) as { version: number; metas: Array<{ storageKey: string; byteSize: number }>; uploads: unknown[] };
  assert.equal(state.version, 1);
  assert.deepEqual(state.metas.map((entry) => [entry.storageKey, entry.byteSize]), [[meta.storageKey, 7]]);
  assert.deepEqual(state.uploads, []);
}));

test("replacing media deletes the old object and its legacy .meta.json sidecar", async () => withRoot(async (root) => {
  const bytes = Buffer.from("legacy");
  await mkdir(path.join(root, "record-1"), { mode: 0o700 });
  await writeFile(path.join(root, "record-1/take-1.bin"), bytes, { mode: 0o600 });
  await writeFile(path.join(root, "record-1/take-1.bin.meta.json"), JSON.stringify({
    storageKey: "record-1/take-1.bin",
    recordId: "record-1",
    takeId: "take-1",
    contentType: "application/octet-stream",
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    createdAt: new Date().toISOString(),
  }), { mode: 0o600 });

  const media = createFilesystemMediaStore(root);
  await media.initialize();
  assert.deepEqual((await media.listForRecord("record-1")).map((meta) => meta.storageKey), ["record-1/take-1.bin"]);
  const reservation = await media.reserveUpload({ recordId: "record-1", takeId: "take-1", declaredByteSize: 3, contentType: "application/octet-stream" });
  const staged = await media.stageUpload(reservation, Readable.from([Buffer.from("new")]));
  await media.storeUpload(reservation, staged);
  await media.attachUpload(reservation, { replacedStorageKey: "record-1/take-1.bin" });
  await staged.cleanup();

  assert.deepEqual((await readdir(path.join(root, "record-1"))).sort(), [`take-1-${reservation.id}.bin`]);
  assert.deepEqual((await media.listForRecord("record-1")).map((meta) => meta.storageKey), [reservation.storageKey]);
}));
