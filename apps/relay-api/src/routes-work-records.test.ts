/** Focused annotation target validation at the WorkRecord route boundary. */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import {
  addMember,
  createEmptyRecord,
} from "@practice-relay/work-record";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { createAuthService } from "@practice-relay/auth";
import { createRequestContext } from "./request-context.ts";
import { handleWorkRecordRoutes } from "./routes-work-records.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

type AnnotationHarness = {
  response: Awaited<ReturnType<typeof mockRes>>;
  updates: () => number;
  record: () => Promise<ReturnType<typeof createEmptyRecord>>;
};

async function storedRecord(store: Awaited<ReturnType<typeof createMemoryRecordStore>>) {
  const record = (await store.get("annotation-target"));
  assert.ok(record);
  return record;
}

async function addAnnotation(
  target: unknown,
  includeTarget = true,
): Promise<AnnotationHarness> {
  const store = createMemoryRecordStore();
  const initial = addMember(createEmptyRecord("annotation-target", "Annotation target"), {
    userId: "teacher-1",
    role: "faculty",
  });
  (await store.create(initial));
  let updateCount = 0;
  const mutate = store.mutate.bind(store);
  store.mutate = (id, transition, options) => {
    updateCount += 1;
    return mutate(id, transition, options);
  };
  const auth = createAuthService("annotation-target-test-secret");
  const session = (await auth.login("teacher-1", "teach"));
  assert.ok(session);
  const res = mockRes();
  const runtime = createApiRuntime({ auth, recordStore: store });
  const result = await handleWorkRecordRoutes(createRequestContext(
    runtime,
    mockReq("/work-records/annotation-target/annotations", "POST", {
      body: { type: "TextualBody", value: "A note" },
      ...(includeTarget ? { target } : {}),
    }, { authorization: `Bearer ${session.token}` }),
    res as unknown as ServerResponse,
  ));
  assert.equal(result, "handled");
  return {
    response: res,
    updates: () => updateCount,
    record: async () => (await storedRecord(store)),
  };
}

test("annotations validate targets, preserve valid payloads, and reject invalid payloads", async () => {
  for (const target of ["", "https://example.test/canvas#fragment"]) {
    const harness = await addAnnotation(target);
    assert.equal(harness.response.statusCode, 201);
    assert.equal(harness.updates(), 1);
    const record = (await harness.record());
    assert.equal(record.annotations.length, 1);
    const [annotation] = record.annotations;
    assert.ok(annotation);
    assert.equal(annotation.target, target);
    assert.equal(annotation.creator, "teacher-1");
    assert.equal(annotation.type, "Annotation");
    assert.equal(record.revision, 1);
  }

  for (const target of [
    { source: "", selector: null, extra: { retained: true } },
    { source: "https://example.test/canvas", selector: "#section" },
    { source: "https://example.test/canvas", selector: { type: "FragmentSelector" } },
    { source: "https://example.test/canvas", selector: [0, 1] },
  ]) {
    const harness = await addAnnotation(target);
    assert.equal(harness.response.statusCode, 201);
    assert.equal(harness.updates(), 1);
    const record = (await harness.record());
    assert.equal(record.annotations.length, 1);
    const [annotation] = record.annotations;
    assert.ok(annotation);
    assert.deepEqual(annotation.target, target);
  }

  for (const target of [null, [], {}, { source: 1 }, { source: null }, false, 0]) {
    const harness = await addAnnotation(target);
    assert.equal(harness.response.statusCode, 400);
    assert.equal(harness.response.body, "{\"title\":\"Bad Request\",\"status\":400,\"detail\":\"annotation body and target are required\"}");
    assert.equal(harness.updates(), 0);
    assert.deepEqual((await harness.record()).annotations, []);
    assert.equal((await harness.record()).revision, 0);
  }

  const omitted = await addAnnotation(undefined, false);
  assert.equal(omitted.response.statusCode, 400);
  assert.equal(omitted.response.body, "{\"title\":\"Bad Request\",\"status\":400,\"detail\":\"annotation body and target are required\"}");
  assert.equal(omitted.updates(), 0);
  assert.deepEqual((await omitted.record()).annotations, []);
  assert.equal((await omitted.record()).revision, 0);

  const originalSource = Object.getOwnPropertyDescriptor(Object.prototype, "source");
  assert.notEqual(originalSource?.configurable, false);
  let sourceReads = 0;
  Object.defineProperty(Object.prototype, "source", {
    configurable: true,
    get() {
      sourceReads += 1;
      return "https://example.test/inherited";
    },
  });
  try {
    const inherited = await addAnnotation({});
    assert.equal(inherited.response.statusCode, 400);
    assert.equal(inherited.response.body, "{\"title\":\"Bad Request\",\"status\":400,\"detail\":\"annotation body and target are required\"}");
    assert.equal(inherited.updates(), 0);
    assert.deepEqual((await inherited.record()).annotations, []);
    assert.equal((await inherited.record()).revision, 0);
    assert.equal(sourceReads, 0);
  } finally {
    if (originalSource) Object.defineProperty(Object.prototype, "source", originalSource);
    else Reflect.deleteProperty(Object.prototype, "source");
  }
});
