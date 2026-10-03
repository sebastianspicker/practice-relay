/** API regressions for latest-record transitions and actor-bound pagination. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { createRequestContext } from "./request-context.ts";
import { executeRecordCommand } from "./application/records.ts";
import { handleRequestWithRuntime } from "./router.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

async function fixture() {
  const runtime = createApiRuntime({ recordStore: createMemoryRecordStore() });
  const session = await runtime.auth.login("teacher-1", "teach");
  assert.ok(session);
  return { runtime, authorization: `Bearer ${session.token}` };
}

async function request(runtime: ApiRuntime, url: string, authorization: string) {
  const res = mockRes();
  await handleRequestWithRuntime(runtime, mockReq(url, "GET", undefined, { authorization }), res as unknown as ServerResponse);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

test("parallel commands retain both changes and audit the authenticated actor", async () => {
  const { runtime, authorization } = await fixture();
  await runtime.recordStore.create(addMember(createEmptyRecord("parallel", "Parallel"), { userId: "teacher-1", role: "faculty" }));
  const ctx = createRequestContext(runtime, mockReq("/work-records/parallel/tracks", "POST", {}, { authorization }), mockRes() as unknown as ServerResponse);
  await Promise.all(["a", "b"].map((id) => executeRecordCommand(ctx, "parallel", { type: "add-track", track: { id, type: "video" } })));
  const record = await runtime.recordStore.get("parallel");
  assert.equal(record?.revision, 2);
  assert.deepEqual(record?.tracks.map((track) => track.id).sort(), ["a", "b"]);
  assert.ok((await runtime.recordStore.listEvents("parallel")).slice(-2).every((event) => event.actorId === "teacher-1"));
  ctx.req.headers["if-match"] = '"0"';
  await assert.rejects(executeRecordCommand(ctx, "parallel", { type: "rename-record", title: "stale" }), /revision conflict/i);
  delete ctx.req.headers["if-match"];
  await runtime.recordStore.mutate("parallel", (latest) => ({ ...latest, members: [] }));
  await assert.rejects(executeRecordCommand(ctx, "parallel", { type: "rename-record", title: "revoked" }), /membership required/);
  assert.equal((await runtime.recordStore.get("parallel"))?.title, "Parallel");
});

test("summary pages are bounded, ordered, filter-bound, and recheck membership", async () => {
  const { runtime, authorization } = await fixture();
  for (let index = 0; index < 103; index += 1) {
    await runtime.recordStore.create(addMember(createEmptyRecord(`record-${String(index).padStart(3, "0")}`, "Study"), { userId: "teacher-1", role: "faculty" }));
  }
  runtime.recordStore.listByMember = async () => { throw new Error("full collection forbidden"); };
  const first = await request(runtime, "/work-records", authorization);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 50);
  assert.deepEqual(Object.keys(first.body.items[0]).sort(), ["id", "revision", "title"]);
  await runtime.recordStore.mutate("record-050", (record) => ({ ...record, members: [] }));
  const second = await request(runtime, `/work-records?cursor=${first.body.nextCursor}`, authorization);
  assert.equal(second.body.items[0].id, "record-051");
  assert.equal(second.body.items.length, 50);
  const third = await request(runtime, `/work-records?cursor=${second.body.nextCursor}`, authorization);
  assert.equal(third.body.items.length, 2);
  assert.equal(third.body.nextCursor, null);
  assert.equal((await request(runtime, `/work-records?title=changed&cursor=${first.body.nextCursor}`, authorization)).status, 400);
  const other = await runtime.auth.login("student-1", "learn");
  assert.ok(other);
  assert.equal((await request(runtime, `/work-records?cursor=${first.body.nextCursor}`, `Bearer ${other.token}`)).status, 400);
  for (const limit of ["0", "101", "1.5", "invalid"]) assert.equal((await request(runtime, `/work-records?limit=${limit}`, authorization)).status, 400);
});

test("HTTP distinguishes malformed and stale revision preconditions", async () => {
  const { runtime, authorization } = await fixture();
  await runtime.recordStore.create(addMember(createEmptyRecord("revision", "Revision"), { userId: "teacher-1", role: "faculty" }));
  for (const [header, status] of [["invalid", 400], ['"0', 400], ['"1"', 409], ['"0"', 200]] as const) {
    const response = mockRes();
    await handleRequestWithRuntime(runtime, mockReq("/work-records/revision", "PATCH", { title: "Updated" }, {
      authorization, "if-match": header,
    }), response as unknown as ServerResponse);
    assert.equal(response.statusCode, status, response.body);
  }
  assert.equal((await runtime.recordStore.get("revision"))?.revision, 1);
});


test("membership revocation during a slow body prevents a subsequent export", async () => {
  const { runtime, authorization } = await fixture();
  await runtime.recordStore.create(addMember(createEmptyRecord("slow-export", "Private"), { userId: "teacher-1", role: "faculty" }));
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
  const stream = new Readable({ read() { bodyStarted(); } });
  const req = stream as IncomingMessage;
  req.url = "/work-records/slow-export/export";
  req.method = "POST";
  req.headers = { authorization };
  const response = mockRes();
  const pending = handleRequestWithRuntime(runtime, req, response as unknown as ServerResponse);
  await started;
  await runtime.recordStore.mutate("slow-export", (record) => ({ ...record, members: [] }));
  stream.push(JSON.stringify({ format: "json" }));
  stream.push(null);
  await pending;
  assert.equal(response.statusCode, 403, response.body);
  assert.ok(!response.body.includes("Private"));
});

test("oversized PATCH titles are rejected without a revision change", async () => {
  const { runtime, authorization } = await fixture();
  await runtime.recordStore.create(addMember(createEmptyRecord("long-title", "Unchanged"), { userId: "teacher-1", role: "faculty" }));
  const response = mockRes();
  await handleRequestWithRuntime(runtime, mockReq("/work-records/long-title", "PATCH", { title: "x".repeat(501) }, { authorization }), response as unknown as ServerResponse);
  assert.equal(response.statusCode, 400, response.body);
  assert.equal((await runtime.recordStore.get("long-title"))?.revision, 0);
});
