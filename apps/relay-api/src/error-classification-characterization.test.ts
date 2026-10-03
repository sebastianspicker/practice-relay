/** Characterization of HTTP error classification through the real router and both error translators. */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test, type TestContext } from "node:test";
import { createMediaStoreOnObjectStore, createS3CompatibleObjectStore, type MediaStoreAdapter } from "@practice-relay/media-store";
import { createMemoryRecordStore, type RecordStoreAdapter } from "@practice-relay/record-store";
import { addMember, addTrack, createEmptyRecord, type WorkRecord } from "@practice-relay/work-record";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

const recordId = "classified";

type Problem = { status: number; title: string; detail: string };

type Options = {
  /** Record returned to pre-body route checks while the store holds the canonical record. */
  precheckView?: (record: WorkRecord) => WorkRecord;
  hideFromGet?: boolean;
  mutateFailure?: Error;
  /** Corrupt each transition result so the store's own write validation rejects it. */
  corruptWrites?: boolean;
  mediaStore?: MediaStoreAdapter;
};

async function harness(options: Options = {}) {
  const memory = createMemoryRecordStore();
  await memory.create(addTrack(addMember(createEmptyRecord(recordId, "Errors"), { userId: "teacher-1", role: "faculty" }), { id: "t1", type: "video" }));
  const recordStore: RecordStoreAdapter = {
    ...memory,
    async get(id) {
      if (options.hideFromGet) return undefined;
      const record = await memory.get(id);
      return record && options.precheckView ? options.precheckView(record) : record;
    },
    ...(options.mutateFailure ? {
      mutate: async () => { throw options.mutateFailure; },
      create: async () => { throw options.mutateFailure; },
    } : {}),
    ...(options.corruptWrites ? {
      mutate: (id, transition, mutationOptions) => memory.mutate(id, (latest) => ({ ...transition(latest), revision: -1 }), mutationOptions),
    } : {}),
  };
  const runtime = createApiRuntime({ recordStore, ...(options.mediaStore ? { mediaStore: options.mediaStore } : {}) });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  return {
    memory,
    async send(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Problem> {
      const auth = { authorization: `Bearer ${session.token}`, ...headers };
      const req = Buffer.isBuffer(body) ? Object.assign(Readable.from([body]) as IncomingMessage, { url, method, headers: auth })
        : mockReq(url, method, body, auth);
      const res = mockRes();
      await handleRequestWithRuntime(runtime, req, res as unknown as ServerResponse);
      const json = JSON.parse(res.body) as { title: string; detail: string };
      return { status: res.statusCode, title: json.title, detail: json.detail };
    },
  };
}

const demoted = (record: WorkRecord): WorkRecord => ({ ...record, members: [{ userId: "teacher-1", role: "faculty" }] });

async function demotedHarness() {
  const h = await harness({ precheckView: demoted });
  await h.memory.mutate(recordId, (record) => ({ ...record, members: [{ userId: "teacher-1", role: "student" }] }));
  return h;
}

test("role denial inside an operation translator answers 403 with the domain message", async () => {
  const h = await demotedHarness();
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/tracks`, { id: "t2", type: "video" }), {
    status: 403, title: "Forbidden", detail: "role denied: add_track requires sufficient role (student cannot admin)",
  });
});

test("role denial reaching the router answers 403 with the domain message", async () => {
  const h = await demotedHarness();
  assert.deepEqual(await h.send("PATCH", `/work-records/${recordId}`, { title: "Renamed" }), {
    status: 403, title: "Forbidden", detail: "role denied: edit_record requires sufficient role (student cannot admin)",
  });
});

test("duplicate domain identity inside an operation translator answers 409 with the domain message", async () => {
  const h = await harness();
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/tracks`, { id: "t1", type: "video" }), {
    status: 409, title: "Conflict", detail: "track id already exists: t1",
  });
});

test("duplicate record creation racing the precheck answers 409 with the store message", async () => {
  const h = await harness({ hideFromGet: true });
  assert.deepEqual(await h.send("POST", "/work-records", { id: recordId, title: "Again" }), {
    status: 409, title: "Conflict", detail: `record ${recordId} already exists`,
  });
});

test("an immutable media object conflict reaching the router answers 409 with the fixed detail", async (t: TestContext) => {
  const dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "relay-classify-")));
  const objectStore = createS3CompatibleObjectStore({
    endpoint: "https://objects.example.test", bucket: "practice-relay", accessKey: "access", secretKey: "secret",
    fetchImpl: async (_url, init) => {
      for await (const _chunk of init?.body as unknown as AsyncIterable<Uint8Array>) { /* drain */ }
      return new Response(null, { status: 412 });
    },
  });
  const mediaStore = createMediaStoreOnObjectStore(objectStore, { stagingRoot: path.join(dir, "staging") });
  await mediaStore.initialize();
  t.after(async () => { await mediaStore.close(); rmSync(dir, { recursive: true, force: true }); });
  const h = await harness({ mediaStore });
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/takes/take-1/media`, Buffer.from("motif"), {
    "content-type": "application/octet-stream", "content-length": "5",
  }), { status: 409, title: "Conflict", detail: "record already exists" });
});

test("revision conflicts answer 409 with the store message through both translators", async () => {
  const h = await harness();
  assert.equal((await h.send("POST", `/work-records/${recordId}/tracks`, { id: "t2", type: "video" }, { "if-match": "\"0\"" })).status, 200);
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/tracks`, { id: "t3", type: "video" }, { "if-match": "\"0\"" }), {
    status: 409, title: "Conflict", detail: `record ${recordId} revision conflict: expected 1, received 0`,
  });
  assert.deepEqual(await h.send("PATCH", `/work-records/${recordId}`, { title: "Renamed", revision: 0 }), {
    status: 409, title: "Conflict", detail: `record ${recordId} revision conflict: expected 1, received 0`,
  });
});

test("domain validation failures inside an operation translator answer 400 with the domain message", async () => {
  const h = await harness();
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/regions`, { id: "r1", startMs: 10, endMs: 5 }), {
    status: 400, title: "Bad Request", detail: "region times must be finite, nonnegative, and end after start",
  });
});

test("domain validation failures before a command runs answer 400 with the route message", async () => {
  const h = await harness();
  assert.deepEqual(await h.send("POST", `/work-records/${recordId}/tracks`, { id: "t2", type: "hologram" }), {
    status: 400, title: "Bad Request", detail: "track type must be supported",
  });
});

test("store write validation rejections answer 400 with the schema message", async () => {
  const h = await harness({ corruptWrites: true });
  const problem = await h.send("POST", `/work-records/${recordId}/regions`, { id: "r1", startMs: 0, endMs: 5 });
  assert.equal(problem.status, 400);
  assert.equal(problem.title, "Bad Request");
  assert.match(problem.detail, /invalid WorkRecord/);
  assert.equal((await h.memory.get(recordId))?.revision, 0);
});

test("unclassified failures answer a logged generic 500 in operation translators and at the router", async (t: TestContext) => {
  const log = t.mock.method(console, "log", () => {});
  const h = await harness({ mutateFailure: new Error("simulated record store failure") });
  const generic = { status: 500, title: "Internal Server Error", detail: "unexpected internal error" };
  const routes: readonly [string, string, unknown][] = [
    ["POST", `/work-records/${recordId}/tracks`, { id: "t2", type: "video" }],
    ["POST", `/work-records/${recordId}/comments`, { regionId: "r1", body: "note" }],
    ["POST", `/work-records/${recordId}/subjects`, { label: "Dancer" }],
    ["POST", "/work-records", { id: "fresh", title: "Fresh" }],
    ["PATCH", `/work-records/${recordId}`, { title: "Renamed" }],
  ];
  for (const [method, url, body] of routes) {
    assert.deepEqual(await h.send(method, url, body), generic, `${method} ${url}`);
  }
  const lines = log.mock.calls.map((call) => String(call.arguments[0]));
  const errors = lines.filter((line) => line.includes('"level":"error"'));
  // Every unclassified 500, including the router net's PATCH path, logs its cause once.
  assert.equal(errors.length, 5);
  assert.ok(errors.every((line) => line.includes("simulated record store failure")));
});

test("release denials answer 403 with the policy message on export, interop, and share", async () => {
  const h = await harness();
  for (const [url, body] of [
    [`/work-records/${recordId}/export`, {}],
    [`/work-records/${recordId}/interop`, { format: "otio-json" }],
    [`/work-records/${recordId}/share`, {}],
  ] as const) {
    const problem = await h.send("POST", url, body);
    assert.equal(problem.status, 403, url);
    assert.equal(problem.title, "Forbidden", url);
    assert.match(problem.detail, /^export denied: .*use policy required before export or share/u, url);
  }
});
