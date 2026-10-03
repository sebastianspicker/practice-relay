/** Characterization of the media upload route through the real router, record store, and media store. */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test, type TestContext } from "node:test";
import {
  createMemoryMediaStore,
  type MediaStoreAdapter,
  type MediaStoreLimits,
  type MediaUploadReservation,
} from "@practice-relay/media-store";
import { createMemoryRecordStore, type RecordStoreAdapter } from "@practice-relay/record-store";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockRes } from "./test-support/http-mocks.ts";

const recordId = "upload-characterization";
const takeId = "take-1";

type Harness = {
  media: MediaStoreAdapter;
  reservations: MediaUploadReservation[];
  recordStore: RecordStoreAdapter;
  upload: (body: Buffer, headers?: Record<string, string>) => Promise<{ status: number; json: Record<string, unknown> }>;
};

async function harness(
  t: TestContext,
  options: { limits?: Partial<MediaStoreLimits>; failMutation?: boolean; loseLease?: boolean } = {},
): Promise<Harness> {
  const dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "relay-upload-")));
  const base = createMemoryMediaStore({ stagingRoot: path.join(dir, "staging"), limits: options.limits });
  await base.initialize();
  const reservations: MediaUploadReservation[] = [];
  const media: MediaStoreAdapter = {
    ...base,
    async reserveUpload(input) {
      const reservation = await base.reserveUpload(input);
      reservations.push(reservation);
      return reservation;
    },
    async stageUpload(reservation, source, transferOptions) {
      if (options.loseLease) await base.abandonUpload(reservation);
      return base.stageUpload(reservation, source, transferOptions);
    },
  };
  const memory = createMemoryRecordStore();
  await memory.create(addMember(createEmptyRecord(recordId, "Upload"), { userId: "teacher-1", role: "faculty" }));
  const recordStore: RecordStoreAdapter = options.failMutation
    ? { ...memory, mutate: async () => { throw new Error("simulated record store failure"); } }
    : memory;
  const runtime = createApiRuntime({ recordStore, mediaStore: media });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  t.after(async () => { await base.close(); rmSync(dir, { recursive: true, force: true }); });
  return {
    media, reservations, recordStore: memory,
    async upload(body, headers = {}) {
      const req = Readable.from([body]) as IncomingMessage;
      req.url = `/work-records/${recordId}/takes/${takeId}/media`;
      req.method = "POST";
      req.headers = { authorization: `Bearer ${session.token}`, "content-type": "application/octet-stream", ...headers };
      const res = mockRes();
      await handleRequestWithRuntime(runtime, req, res as unknown as ServerResponse);
      return { status: res.statusCode, json: JSON.parse(res.body) as Record<string, unknown> };
    },
  };
}

test("successful upload attaches media and advances the record revision", async (t) => {
  const h = await harness(t);
  const before = await h.recordStore.get(recordId);
  assert.ok(before);
  const response = await h.upload(Buffer.from("motif"), { "content-length": "5" });
  assert.equal(response.status, 200);
  assert.equal(response.json.cleanupPending, false);
  const media = response.json.media as { storageKey: string; byteSize: number };
  assert.equal(media.byteSize, 5);
  assert.match(media.storageKey, new RegExp(`^${recordId}/${takeId}-[0-9a-f-]{36}\\.bin$`, "u"));
  const after = await h.recordStore.get(recordId);
  assert.ok(after);
  assert.equal(after.revision, (before.revision ?? 0) + 1);
  assert.deepEqual(after.takeIds, [takeId]);
  assert.equal(after.takes[0]?.storageKey, media.storageKey);
  assert.equal(after.takes[0]?.mediaPath, `media://${media.storageKey}`);
  assert.equal(await h.media.totalBytesForRecord(recordId), 5);
  assert.equal((await h.media.listForRecord(recordId)).length, 1);
});

test("a record mutation failure after storing bytes abandons the upload and returns 500", async (t) => {
  const h = await harness(t, { failMutation: true });
  const response = await h.upload(Buffer.from("motif"), { "content-length": "5" });
  assert.equal(response.status, 500);
  assert.equal(response.json.title, "Internal Server Error");
  assert.equal(response.json.detail, "unexpected internal error");
  assert.equal(h.reservations.length, 1);
  assert.equal(await h.media.totalBytesAll(), 0);
  assert.equal(await h.media.totalBytesForRecord(recordId), 0);
  assert.deepEqual(await h.media.listForRecord(recordId), []);
  assert.equal(await h.media.stageDownload(h.reservations[0]!.storageKey), undefined);
  const record = await h.recordStore.get(recordId);
  assert.deepEqual(record?.takes, []);
});

test("a declared body above the object limit is rejected with 413 and nothing is stored", async (t) => {
  const h = await harness(t, { limits: { maxObjectBytes: 4 } });
  const response = await h.upload(Buffer.from("too large"), { "content-length": "9" });
  assert.equal(response.status, 413);
  assert.equal(response.json.title, "Payload Too Large");
  assert.equal(await h.media.totalBytesAll(), 0);
  assert.deepEqual((await h.recordStore.get(recordId))?.takes, []);
});

test("an undeclared stream above the object limit is rejected with 413 and released", async (t) => {
  const h = await harness(t, { limits: { maxObjectBytes: 4 } });
  const response = await h.upload(Buffer.from("too large"));
  assert.equal(response.status, 413);
  assert.match(String(response.json.detail), /media stream exceeds/u);
  assert.equal(await h.media.totalBytesAll(), 0);
  assert.deepEqual((await h.recordStore.get(recordId))?.takes, []);
});

test("a lost upload lease returns 409 without touching the record", async (t) => {
  const h = await harness(t, { loseLease: true });
  const response = await h.upload(Buffer.from("motif"), { "content-length": "5" });
  assert.equal(response.status, 409);
  assert.equal(response.json.title, "Conflict");
  assert.equal(await h.media.totalBytesAll(), 0);
  assert.deepEqual((await h.recordStore.get(recordId))?.takes, []);
});
