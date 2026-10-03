/** Focused direct-route coverage for record mutation dispatch and body guards. */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  addMember,
  createEmptyRecord,
} from "@practice-relay/work-record";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { handleRecordMutationRoute } from "./routes-record-mutations.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes, type MockRes } from "./test-support/http-mocks.ts";

type MutationHarness = {
  authorization: string;
  id: string;
  runtime: ApiRuntime;
  store: Awaited<ReturnType<typeof createMemoryRecordStore>>;
};

type DispatchResult = {
  result: RouteResult;
  request: IncomingMessage;
  response: MockRes;
};

async function mutationHarness(): Promise<MutationHarness> {
  const store = createMemoryRecordStore();
  const auth = createAuthService("record-mutation-route-test-secret");
  const session = (await auth.login("teacher-1", "teach"));
  assert.ok(session);
  const id = "record-mutations";
  (await store.create(addMember(createEmptyRecord(id, "Route mutations"), {
    userId: "teacher-1",
    role: "faculty",
  })));
  return {
    authorization: `Bearer ${session.token}`,
    id,
    runtime: createApiRuntime({ auth, recordStore: store }),
    store,
  };
}

async function dispatch(
  harness: MutationHarness,
  method: string,
  action: string | undefined,
  body?: unknown,
): Promise<DispatchResult> {
  const response = mockRes();
  const request = mockReq("/direct-record-mutation", method, body, {
    authorization: harness.authorization,
  });
  const ctx: RequestContext = {
    runtime: harness.runtime,
    req: request,
    res: response as unknown as ServerResponse,
    method,
    pathname: "/direct-record-mutation",
    requestId: "record-mutation-test",
  };
  return {
    result: await handleRecordMutationRoute(ctx, {
      recordId: harness.id,
      action,
    } satisfies RecordRouteParams),
    request,
    response,
  };
}

async function revision(harness: MutationHarness): Promise<number> {
  return (await harness.store.get(harness.id))?.revision ?? -1;
}

test("every legal mutation pair applies its state transition and revision", async () => {
  const harness = (await mutationHarness());
  const mutations: ReadonlyArray<readonly [string, string, unknown]> = [
    ["POST", "tracks", { id: "track-1", type: "video", label: "Video" }],
    ["POST", "takes", { id: "take-1", label: "First take" }],
    ["PUT", "preferred-take", { takeId: "take-1" }],
    ["POST", "regions", { id: "region-1", startMs: 0, endMs: 100 }],
    ["POST", "comments", { regionId: "region-1", trackId: "track-1", body: "Review" }],
    ["POST", "consent", { id: "consent-1", purposes: ["course_assessment"] }],
    ["POST", "submit", { name: "submission-1" }],
    ["POST", "analysis", { id: "analysis-1" }],
    ["POST", "mvei", { id: "mvei-1", ref: "motif.json" }],
  ];

  for (const [index, [method, action, body]] of mutations.entries()) {
    const response = await dispatch(harness, method, action, body);
    assert.equal(response.result, "handled");
    assert.equal(response.response.statusCode, 200);
    assert.equal((await revision(harness)), index + 1);
    if (action === "submit") {
      const submitted = JSON.parse(response.response.body) as {
        ags: { kind: string; userId: string };
        revision: number;
        snapshots: Array<{ id: string; reason?: string }>;
        versions: Array<{ name: string; snapshotRef: string }>;
      };
      assert.equal(submitted.ags.kind, "ags-score-result");
      assert.equal(submitted.ags.userId, "teacher-1");
      assert.equal(submitted.revision, index + 1);
      assert.equal(submitted.versions[0]?.name, "submission-1");
      assert.equal(submitted.snapshots[0]?.reason, "submission-1");
      assert.equal(submitted.versions[0]?.snapshotRef, submitted.snapshots[0]?.id);
    }
  }

  const record = (await harness.store.get(harness.id))!;
  assert.equal(record.preferredTakeId, "take-1");
  assert.equal(record.spine.regions?.[0]?.id, "region-1");
  assert.equal(record.comments[0]?.body, "Review");
  assert.equal(record.usePolicySnapshots[0]?.id, "consent-1");
  assert.equal(record.versions[0]?.name, "submission-1");
  assert.deepEqual(record.tracks.map((track) => track.id), [
    "track-1",
    "analysis-1",
    "mvei-1",
  ]);
});

test("missing mutation pairs remain unmatched without changing the record", async () => {
  const harness = (await mutationHarness());
  for (const [method, action] of [["GET", "tracks"], ["POST", undefined]] as const) {
    const response = await dispatch(harness, method, action, { id: "ignored" });
    assert.equal(response.result, "unmatched");
    assert.equal(response.response.statusCode, 0);
    assert.equal((await revision(harness)), 0);
  }
});

test("inherited mutation keys cannot dispatch or consume a request body", async () => {
  const key = "GET:tracks";
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
  try {
    for (const inherited of [null, () => { throw new Error("hostile dispatch"); }]) {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        value: inherited,
      });
      const harness = (await mutationHarness());
      const response = await dispatch(harness, "GET", "tracks", { id: "ignored" });
      assert.equal(response.result, "unmatched");
      assert.equal(response.response.statusCode, 0);
      assert.equal(response.request.readableEnded, false);
      assert.equal((await revision(harness)), 0);
    }
  } finally {
    if (previous) Object.defineProperty(Object.prototype, key, previous);
    else Reflect.deleteProperty(Object.prototype, key);
  }
});

test("malformed track, region, and comment values return 400 without updates", async () => {
  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ["tracks", { id: 1, type: "video" }],
    ["tracks", { id: "track-1", type: 1 }],
    ["regions", { id: 1, startMs: 0, endMs: 100 }],
    ["regions", { id: "region-1", startMs: "0", endMs: 100 }],
    ["regions", { id: "region-1", startMs: 0, endMs: "100" }],
    ["comments", { regionId: 1, body: "Review" }],
    ["comments", { regionId: "region-1", body: 1 }],
  ];

  for (const [action, body] of malformed) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", action, body);
    assert.equal(response.result, "handled");
    assert.equal(response.response.statusCode, 400);
    assert.equal((await revision(harness)), 0);
  }
});

test("whitespace identifiers and an empty comment body defer to domain validation", async () => {
  const malformed: ReadonlyArray<readonly [string, unknown, RegExp]> = [
    ["tracks", { id: " ", type: "video" }, /track id must be a valid resource id/],
    ["regions", { id: " ", startMs: 0, endMs: 100 }, /region id must be a valid resource id/],
    ["comments", { regionId: " ", body: "Review" }, /regionId must be a valid resource id/],
    ["comments", { regionId: "region-1", body: "" }, /comment body must be a non-empty string/],
  ];

  for (const [action, body, detail] of malformed) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", action, body);
    assert.equal(response.response.statusCode, 400);
    assert.match(
      (JSON.parse(response.response.body) as { detail: string }).detail,
      detail,
    );
    assert.equal((await revision(harness)), 0);
  }
});

test("region labels accept strings or omission and reject non-string JSON", async () => {
  for (const label of [undefined, "Section A"] as const) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", "regions", {
      id: "region-1",
      startMs: 0,
      endMs: 100,
      label,
    });
    assert.equal(response.response.statusCode, 200);
    assert.equal((await harness.store.get(harness.id))?.spine.regions?.[0]?.label, label);
  }

  for (const label of [{}, [], null, 1]) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", "regions", {
      id: "region-1",
      startMs: 0,
      endMs: 100,
      label,
    });
    assert.equal(response.response.statusCode, 400);
    assert.equal((await revision(harness)), 0);
  }
});

test("analysis defaults omitted and null types but rejects non-analysis values", async () => {
  for (const body of [
    { id: "analysis-omitted" },
    { id: "analysis-null", type: null },
  ]) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", "analysis", body);
    assert.equal(response.response.statusCode, 200);
    assert.equal((await revision(harness)), 1);
    assert.equal((await harness.store.get(harness.id))?.tracks[0]?.type, "analysis");
  }

  for (const type of ["video", 1]) {
    const harness = (await mutationHarness());
    const response = await dispatch(harness, "POST", "analysis", {
      id: "analysis-invalid",
      type,
    });
    assert.equal(response.response.statusCode, 400);
    assert.equal((await revision(harness)), 0);
  }
});
