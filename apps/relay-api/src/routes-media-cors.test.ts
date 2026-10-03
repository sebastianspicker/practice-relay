/** Real-stream regression coverage for media download ingress and CORS metadata. */
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createMemoryMediaStore } from "@practice-relay/media-store";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { handleRequestWithRuntime } from "./router.ts";
import { handleMediaRoutes, mediaTransferLifetime } from "./routes-media.ts";
import { createApiRuntime } from "./runtime.ts";
import { createRequestContext, type RequestContext } from "./request-context.ts";

test("media download returns CORS only to an ingress-approved origin", async () => {
  const media = createMemoryMediaStore();
  await media.initialize();
  const recordStore = createMemoryRecordStore();
  const recordId = "media-cors-record";
  const takeId = "motif-json";
  const reservation = await media.reserveUpload({
    recordId,
    takeId,
    declaredByteSize: 5,
    contentType: "application/json",
  });
  const staged = await media.stageUpload(reservation, Readable.from(["motif"]));
  let meta;
  try {
    meta = await media.storeUpload(reservation, staged);
    await media.attachUpload(reservation);
  } finally {
    await staged.cleanup();
  }

  let record = addMember(createEmptyRecord(recordId, "Media CORS"), {
    userId: "teacher-1",
    role: "faculty",
  });
  record = {
    ...record,
    takeIds: [takeId],
    takes: [{
      id: takeId,
      storageKey: meta.storageKey,
      contentType: meta.contentType,
      sha256: meta.sha256,
      byteSize: meta.byteSize,
      mediaPath: `media://${meta.storageKey}`,
    }],
  };
  await recordStore.create(record);

  let downloadCalls = 0;
  const runtime = createApiRuntime({
    recordStore,
    mediaStore: {
      ...media,
      stageDownload(storageKey, options) {
        downloadCalls += 1;
        return media.stageDownload(storageKey, options);
      },
    },
    ingress: {
      allowedOrigins: new Set(["https://studio.example"]),
      allowedHosts: new Set(),
    },
  });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  const server = createServer((req, res) => { void handleRequestWithRuntime(runtime, req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/media/${meta.storageKey}`;
  const authorization = `Bearer ${session.token}`;

  try {
    const allowed = await fetch(url, {
      headers: { authorization, origin: "https://studio.example" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://studio.example");
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await allowed.text(), "motif");
    assert.equal(downloadCalls, 1);

    const rejected = await fetch(url, {
      headers: { authorization, origin: "https://untrusted.example" },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    assert.match(await rejected.text(), /untrusted Origin header/u);
    assert.equal(downloadCalls, 1, "rejected origins do not reach media storage");
  } finally {
    server.close();
    await once(server, "close");
    await media.close();
  }
});

test("media download rechecks membership after staging", async () => {
  const media = createMemoryMediaStore();
  await media.initialize();
  const recordStore = createMemoryRecordStore();
  const recordId = "media-revocation-record";
  const takeId = "take-1";
  const reservation = await media.reserveUpload({
    recordId,
    takeId,
    declaredByteSize: 7,
    contentType: "application/octet-stream",
  });
  const uploadStage = await media.stageUpload(reservation, Readable.from(["private"]));
  let meta;
  try {
    meta = await media.storeUpload(reservation, uploadStage);
    await media.attachUpload(reservation);
  } finally {
    await uploadStage.cleanup();
  }
  const record = {
    ...addMember(createEmptyRecord(recordId, "Revocable media"), {
      userId: "teacher-1",
      role: "faculty",
    }),
    takeIds: [takeId],
    takes: [{
      id: takeId,
      storageKey: meta.storageKey,
      contentType: meta.contentType,
      sha256: meta.sha256,
      byteSize: meta.byteSize,
      mediaPath: `media://${meta.storageKey}`,
    }],
  };
  await recordStore.create(record);

  let releaseStage: () => void = () => {};
  const stageGate = new Promise<void>((resolve) => { releaseStage = resolve; });
  let announceStage: () => void = () => {};
  const stageStarted = new Promise<void>((resolve) => { announceStage = resolve; });
  let cleanupCalls = 0;
  const runtime = createApiRuntime({
    recordStore,
    mediaStore: {
      ...media,
      async stageDownload(storageKey, options) {
        const staged = await media.stageDownload(storageKey, options);
        announceStage();
        await stageGate;
        if (!staged) return undefined;
        return {
          ...staged,
          async cleanup() {
            cleanupCalls += 1;
            await staged.cleanup();
          },
        };
      },
    },
  });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  const server = createServer((req, res) => { void handleRequestWithRuntime(runtime, req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const pending = fetch(
      `http://127.0.0.1:${address.port}/media/${meta.storageKey}`,
      { headers: { authorization: `Bearer ${session.token}` } },
    );
    await stageStarted;
    await recordStore.mutate(recordId, (latest) => ({ ...latest, members: [] }));
    releaseStage();
    const denied = await pending;
    assert.equal(denied.status, 403);
    assert.notEqual(await denied.text(), "private");
    assert.equal(cleanupCalls, 1);
  } finally {
    releaseStage();
    server.close();
    await once(server, "close");
    await media.close();
  }
});

test("media transfer lifetime aborts at its deadline and dispose clears it", async () => {
  const request = new EventEmitter();
  const response = Object.assign(new EventEmitter(), { writableFinished: false });
  const context = {
    req: request,
    res: response,
  } as unknown as RequestContext;
  const expiring = mediaTransferLifetime(context, 10);
  await new Promise<void>((resolve) => {
    expiring.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  assert.match(String(expiring.signal.reason), /media transfer timed out/u);
  expiring.dispose();

  const disposed = mediaTransferLifetime(context, 10);
  disposed.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(disposed.signal.aborted, false);
});

test("media download deadline releases a stalled staged transfer", async () => {
  const media = createMemoryMediaStore();
  await media.initialize();
  const recordStore = createMemoryRecordStore();
  const recordId = "media-timeout-record";
  const takeId = "take-1";
  const reservation = await media.reserveUpload({
    recordId,
    takeId,
    declaredByteSize: 7,
    contentType: "application/octet-stream",
  });
  const uploadStage = await media.stageUpload(reservation, Readable.from(["private"]));
  let meta;
  try {
    meta = await media.storeUpload(reservation, uploadStage);
    await media.attachUpload(reservation);
  } finally {
    await uploadStage.cleanup();
  }
  await recordStore.create({
    ...addMember(createEmptyRecord(recordId, "Expiring media"), {
      userId: "teacher-1",
      role: "faculty",
    }),
    takeIds: [takeId],
    takes: [{
      id: takeId,
      storageKey: meta.storageKey,
      contentType: meta.contentType,
      sha256: meta.sha256,
      byteSize: meta.byteSize,
      mediaPath: `media://${meta.storageKey}`,
    }],
  });

  let releaseCleanup: () => void = () => {};
  const cleaned = new Promise<void>((resolve) => { releaseCleanup = resolve; });
  let cleanupCalls = 0;
  const runtime = createApiRuntime({
    recordStore,
    mediaStore: {
      ...media,
      async stageDownload(storageKey, options) {
        const staged = await media.stageDownload(storageKey, options);
        if (!staged) return undefined;
        return {
          ...staged,
          createReadStream: () => new Readable({ read() {} }),
          async cleanup() {
            cleanupCalls += 1;
            await staged.cleanup();
            releaseCleanup();
          },
        };
      },
    },
  });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  const server = createServer((req, res) => {
    const context = createRequestContext(runtime, req, res);
    void handleMediaRoutes(context, 25).catch((error) => res.destroy(error));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await assert.rejects(
      fetch(`http://127.0.0.1:${address.port}/media/${meta.storageKey}`, {
        headers: { authorization: `Bearer ${session.token}` },
      }).then((response) => response.arrayBuffer()),
    );
    await cleaned;
    assert.equal(cleanupCalls, 1);
  } finally {
    server.close();
    await once(server, "close");
    await media.close();
  }
});
