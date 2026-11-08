/** Smoke test of the W2 core record workflow through the real router and in-memory runtime. */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { test } from "node:test";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

/** Streaming-capable response sink so binary media bytes are captured exactly. */
class BinaryRes extends Writable {
  statusCode = 0;
  chunks: Buffer[] = [];
  writeHead(code: number): this { this.statusCode = code; return this; }
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void { this.chunks.push(Buffer.from(chunk)); done(); }
}

test("faculty drives create, take, media, consent, export, interop, and download; a non-member is denied", async () => {
  const runtime = createApiRuntime();
  const faculty = await runtime.auth.login("teacher-1", "teach");
  const student = await runtime.auth.login("student-1", "learn");
  assert.ok(faculty);
  assert.ok(student);

  const call = async (path: string, method: string, token: string, body?: unknown) => {
    const res = mockRes();
    await handleRequestWithRuntime(runtime, mockReq(path, method, body, { authorization: `Bearer ${token}` }), res as unknown as ServerResponse);
    return res;
  };
  const json = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>;
  const id = "core-smoke";
  const base = `/work-records/${id}`;

  const created = await call("/work-records", "POST", faculty.token, { id, title: "Core smoke" });
  assert.equal(created.statusCode, 201);

  const track = await call(`${base}/tracks`, "POST", faculty.token, { id: "track-1", type: "video" });
  assert.equal(track.statusCode, 200);
  assert.equal(json(track).tracks[0].id, "track-1");
  const take = await call(`${base}/takes`, "POST", faculty.token, { id: "take-1", label: "Take 1" });
  assert.equal(take.statusCode, 200);
  assert.equal(json(take).takes[0].id, "take-1");

  const bytes = Buffer.alloc(4096, "relay-media-");
  const upload = Readable.from([bytes]) as IncomingMessage;
  upload.url = `${base}/takes/take-1/media`;
  upload.method = "POST";
  upload.headers = { authorization: `Bearer ${faculty.token}`, "content-type": "application/octet-stream", "content-length": String(bytes.length) };
  const uploaded = mockRes();
  await handleRequestWithRuntime(runtime, upload, uploaded as unknown as ServerResponse);
  assert.equal(uploaded.statusCode, 200);
  const storageKey = json(uploaded).media.storageKey as string;
  assert.equal(json(uploaded).media.byteSize, bytes.length);
  assert.equal(json(uploaded).record.takes[0].storageKey, storageKey);

  const beforeConsent = Date.now();
  const consent = await call(`${base}/consent`, "POST", faculty.token, { purposes: ["course-assessment"], exportAllowed: true, createdAt: "2020-01-01T00:00:00Z" });
  assert.equal(consent.statusCode, 200);
  assert.equal(json(consent).usePolicySnapshots.at(-1).exportAllowed, true);
  assert.ok(Date.parse(json(consent).usePolicySnapshots.at(-1).createdAt) >= beforeConsent, "server stamps the release decision time");

  const exported = await call(`${base}/export`, "POST", faculty.token, { format: "json" });
  assert.equal(exported.statusCode, 200);
  assert.equal(json(exported).validated, true);
  const zipped = await call(`${base}/export`, "POST", faculty.token, { format: "zip" });
  assert.equal(zipped.statusCode, 200);
  assert.equal(zipped.headers["content-type"], "application/zip");

  const interop = await call(`${base}/interop`, "POST", faculty.token, { format: "otio-json" });
  assert.equal(interop.statusCode, 200);
  assert.equal(JSON.parse(json(interop).body as string).OTIO_SCHEMA, "Timeline.1");

  const download = new BinaryRes();
  const downloadReq = mockReq(`/media/${storageKey}`, "GET", undefined, { authorization: `Bearer ${faculty.token}` });
  await handleRequestWithRuntime(runtime, downloadReq, download as unknown as ServerResponse);
  assert.equal(download.statusCode, 200);
  assert.ok(Buffer.concat(download.chunks).equals(bytes));

  const denied = await call(base, "GET", student.token);
  assert.equal(denied.statusCode, 403);
});
