/** Streaming S3 signing, immutable publication, and abort behavior tests. */
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256hexUtf8 } from "./hashing.ts";
import { createS3CompatibleObjectStore } from "./s3-store.ts";

const base = { endpoint: "https://objects.example.test", bucket: "practice-relay", accessKey: "access", secretKey: "secret" };

test("S3 PUT streams the staged file with signed immutable headers", async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "media-s3-"));
  try {
    const filePath = path.join(root, "stage");
    await writeFile(filePath, "payload");
    let init: RequestInit | undefined;
    let body = "";
    const store = createS3CompatibleObjectStore({ ...base, fetchImpl: async (_url, request) => {
      init = request;
      for await (const chunk of request?.body as unknown as AsyncIterable<Uint8Array>) body += Buffer.from(chunk).toString();
      return new Response(null, { status: 200 });
    } });
    await store.putFile("record/take.bin", filePath, { contentType: "video/mp4", byteSize: 7, sha256: sha256hexUtf8("payload") });
    const headers = new Headers(init?.headers);
    assert.equal(body, "payload");
    assert.equal(headers.get("if-none-match"), "*");
    assert.equal(headers.get("content-length"), "7");
    assert.equal(headers.get("x-amz-content-sha256"), sha256hexUtf8("payload"));
    assert.match(headers.get("authorization") ?? "", /if-none-match/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("S3 GET returns a stream and refuses redirects", async () => {
  const store = createS3CompatibleObjectStore({ ...base, fetchImpl: async () => new Response("payload", { status: 200 }) });
  const stream = await store.getStream("record/take.bin");
  assert.ok(stream);
  let body = "";
  for await (const chunk of stream) body += Buffer.from(chunk).toString();
  assert.equal(body, "payload");

  const redirects = createS3CompatibleObjectStore({ ...base, fetchImpl: async () => new Response(null, { status: 302 }) });
  await assert.rejects(redirects.getStream("record/take.bin"), /redirects are refused/);
});

test("S3 immutable conflicts and already-aborted transfers fail closed", async () => {
  const conflict = createS3CompatibleObjectStore({ ...base, fetchImpl: async () => new Response(null, { status: 412 }) });
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "media-s3-"));
  try {
    const filePath = path.join(root, "stage"); await writeFile(filePath, "x");
    await assert.rejects(conflict.putFile("record/take.bin", filePath, { contentType: "application/octet-stream", byteSize: 1, sha256: sha256hexUtf8("x") }), /already exists/);
  } finally { await rm(root, { recursive: true, force: true }); }

  const controller = new AbortController(); controller.abort();
  const aborted = createS3CompatibleObjectStore({ ...base, fetchImpl: async (_url, init) => {
    assert.equal(init?.signal?.aborted, true);
    throw init?.signal?.reason;
  } });
  await assert.rejects(aborted.getStream("record/take.bin", { signal: controller.signal }));
});
