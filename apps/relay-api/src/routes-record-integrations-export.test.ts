/** Focused interop-export coverage for defensive stored-record projection. */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  addMember,
  addTrack,
  attachUsePolicySnapshot,
  createEmptyRecord,
  type Region,
  type WorkRecord,
} from "@practice-relay/work-record";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { demoPackageExport, interoperabilityExport } from "./application/exports.ts";
import { handleRecordIntegrationRoute } from "./routes-record-integrations.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes, type MockRes } from "./test-support/http-mocks.ts";

type ExportHarness = {
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

async function exportHarness(regions: Region[] = []): Promise<ExportHarness> {
  const store = createMemoryRecordStore();
  const auth = createAuthService("record-integration-export-test-secret");
  const session = (await auth.login("teacher-1", "teach"));
  assert.ok(session);
  const id = "record-integration-export";
  const record = addMember(createEmptyRecord(id, "Route export"), {
    userId: "teacher-1",
    role: "faculty",
  });
  (await store.create(attachUsePolicySnapshot({
    ...record,
    spine: { ...record.spine, regions },
  }, {
    id: "route-export-policy",
    subjectId: "teacher-1",
    purposes: ["course-assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  })));
  return {
    authorization: `Bearer ${session.token}`,
    id,
    runtime: createApiRuntime({ auth, recordStore: store }),
    store,
  };
}

async function dispatchExport(harness: ExportHarness): Promise<DispatchResult> {
  const response = mockRes();
  const request = mockReq(
    "/direct-record-integration-export",
    "POST",
    { format: "otio-json" },
    { authorization: harness.authorization },
  );
  const ctx: RequestContext = {
    runtime: harness.runtime,
    req: request,
    res: response as unknown as ServerResponse,
    method: "POST",
    pathname: "/direct-record-integration-export",
    requestId: "record-integration-export-test",
  };
  return {
    result: await handleRecordIntegrationRoute(ctx, {
      recordId: harness.id,
      action: "interop",
    }),
    request,
    response,
  };
}

function markerNames(response: MockRes): string[] {
  const result = JSON.parse(response.body) as { body: string };
  const timeline = JSON.parse(result.body) as {
    markers: Array<{ name: string }>;
  };
  return timeline.markers.map((marker) => marker.name);
}

function exportLossCodes(response: MockRes): string[] {
  const result = JSON.parse(response.body) as {
    losses: Array<{ code: string; omittedFields: string[] }>;
  };
  assert.ok(result.losses.every((loss) => loss.omittedFields.length > 0));
  return result.losses.map((loss) => loss.code);
}

async function storedRecord(harness: ExportHarness): Promise<WorkRecord> {
  const record = (await harness.store.get(harness.id));
  assert.ok(record);
  return record;
}

test("interop export retains normal region marker order", async () => {
  const harness = (await exportHarness([
    { id: "first", startMs: 0, endMs: 100 },
    { id: "second", startMs: 100, endMs: 200 },
  ]));
  const dispatched = await dispatchExport(harness);

  assert.equal(dispatched.result, "handled");
  assert.equal(dispatched.response.statusCode, 200);
  assert.deepEqual(markerNames(dispatched.response), ["first", "second"]);
  assert.deepEqual(exportLossCodes(dispatched.response), ["OTIO_WORK_RECORD_FIELD_OMISSIONS"]);
});

test("interop export rejects malformed stored WorkRecords before projection", async () => {
  for (const mutate of [
    (record: WorkRecord) => Reflect.deleteProperty(record, "spine"),
    (record: WorkRecord) => Reflect.set(record, "spine", null),
    (record: WorkRecord) => Reflect.set(record, "spine", {}),
  ]) {
    const harness = (await exportHarness());
    const malformed = (await storedRecord(harness));
    mutate(malformed);
    const originalGet = harness.runtime.recordStore.get;
    harness.runtime.recordStore.get = async (id) => id === harness.id ? malformed : originalGet(id);
    const dispatched = await dispatchExport(harness);

    assert.equal(dispatched.response.statusCode, 400);
    assert.match(dispatched.response.body, /invalid WorkRecord/);
    assert.doesNotMatch(dispatched.response.body, /Timeline\.1/);
  }
});

test("interop record release remains independent of evidence-specific policies", async () => {
  const harness = (await exportHarness());
  const record = (await storedRecord(harness));
  (await harness.store.update(harness.id, {
    ...record,
    representedSubjects: [{
      id: "teacher-1",
      type: "Person",
      label: "Teacher",
    }],
    usePolicies: [{
    id: "explicit-grant",
    representedSubjectId: "teacher-1",
    purpose: "course-assessment",
    destination: "lms",
    state: "granted",
    createdAt: "2026-08-29T00:00:00.000Z",
    }],
  }));
  const dispatched = await dispatchExport(harness);

  assert.equal(dispatched.response.statusCode, 200);
  assert.match(dispatched.response.body, /Timeline\.1/);
});

test("direct interop export retains the record-release approval contract", () => {
  const record = attachUsePolicySnapshot(
    createEmptyRecord("interop-direct", "Direct projection"),
    {
      id: "interop-direct-policy",
      subjectId: "performer-1",
      purposes: ["course-assessment"],
      exportAllowed: true,
      createdAt: "2026-08-29T00:00:00.000Z",
    },
  );
  const result = interoperabilityExport(record, "otio-json");
  assert.equal(JSON.parse(result.body).OTIO_SCHEMA, "Timeline.1");
});

test("demo ZIP export names the package after its actual record", () => {
  const record = attachUsePolicySnapshot(
    addTrack(createEmptyRecord("wr-demo", "Demo package"), {
      id: "demo-track",
      type: "video",
    }),
    {
      id: "demo-export-consent",
      subjectId: "demo-performer",
      purposes: ["course-assessment"],
      exportAllowed: true,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  );
  const result = demoPackageExport(record, true);

  assert.equal(result.format, "zip");
  assert.equal(result.filename, "wr-demo.work-record.zip");
});
