/** Real-stream regression coverage for media download ingress and CORS metadata. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createMemoryMediaStore } from "@practice-relay/media-store";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";

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
