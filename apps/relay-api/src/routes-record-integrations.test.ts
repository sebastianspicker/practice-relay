/** Focused direct-route coverage for OTIO import persistence and validation. */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  addMember,
  addTrack,
  createEmptyRecord,
} from "@practice-relay/work-record";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { handleRecordIntegrationRoute } from "./routes-record-integrations.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes, type MockRes } from "./test-support/http-mocks.ts";

type IntegrationHarness = {
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

async function integrationHarness(existingTrack = false): Promise<IntegrationHarness> {
  const store = createMemoryRecordStore();
  const auth = createAuthService("record-integration-route-test-secret");
  const session = (await auth.login("teacher-1", "teach"));
  assert.ok(session);
  const id = "record-integrations";
  let record = addMember(createEmptyRecord(id, "Route integrations"), {
    userId: "teacher-1",
    role: "faculty",
  });
  if (existingTrack) {
    record = addTrack(record, { id: "otio-tr-0", type: "audio", label: "Existing" });
  }
  (await store.create(record));
  return {
    authorization: `Bearer ${session.token}`,
    id,
    runtime: createApiRuntime({ auth, recordStore: store }),
    store,
  };
}

async function dispatchOtio(
  harness: IntegrationHarness,
  document: object,
): Promise<DispatchResult> {
  const response = mockRes();
  const request = mockReq("/direct-record-integration", "POST", {
    importBody: JSON.stringify(document),
    importFormat: "otio-json",
  }, {
    authorization: harness.authorization,
  });
  const ctx: RequestContext = {
    runtime: harness.runtime,
    req: request,
    res: response as unknown as ServerResponse,
    method: "POST",
    pathname: "/direct-record-integration",
    requestId: "record-integration-test",
  };
  return {
    result: await handleRecordIntegrationRoute(ctx, {
      recordId: harness.id,
      action: "interop",
    } satisfies RecordRouteParams),
    request,
    response,
  };
}

function otioDocument(kind: unknown, targetUrl?: unknown, includeGap = false): object {
  const children: object[] = [{
    OTIO_SCHEMA: "Clip.1",
    media_reference: targetUrl === undefined
      ? null
      : { OTIO_SCHEMA: "ExternalReference.1", target_url: targetUrl },
  }];
  if (includeGap) children.push({ OTIO_SCHEMA: "Gap.1" });
  return {
    OTIO_SCHEMA: "Timeline.1",
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [{
        OTIO_SCHEMA: "Track.1",
        name: "Camera A",
        kind,
        children,
      }],
    },
  };
}

async function revision(harness: IntegrationHarness): Promise<number> {
  return (await harness.store.get(harness.id))?.revision ?? -1;
}

test("OTIO import persists valid tracks and takes without trusting target_url as mediaPath", async () => {
  const harness = (await integrationHarness());
  const response = await dispatchOtio(
    harness,
    otioDocument("video", "https://partner.example/camera-a.mp4", true),
  );

  assert.equal(response.result, "handled");
  assert.equal(response.response.statusCode, 200);
  assert.equal((await revision(harness)), 1);
  const body = JSON.parse(response.response.body) as {
    warnings: Array<{ code: string }>;
  };
  assert.ok(body.warnings.some((warning) => warning.code === "GAP_SKIPPED"));
  const record = (await harness.store.get(harness.id))!;
  assert.deepEqual(record.tracks.map((track) => track.id), ["otio-tr-0"]);
  assert.equal(record.takes[0]?.id, "otio-take-0");
  assert.equal(record.takes[0]?.mediaPath, undefined);
});

test("invalid OTIO track kind or ref returns 400 before persistence", async () => {
  for (const [document, detail, existingTrack] of [
    [otioDocument("unsupported"), "track type must be supported", false],
    [otioDocument("video", 42), "track ref must be a string of at most 4096 characters", false],
  ] as const) {
    const harness = (await integrationHarness(existingTrack));
    const response = await dispatchOtio(harness, document);
    assert.equal(response.result, "handled");
    assert.equal(response.response.statusCode, 400);
    assert.equal((await revision(harness)), 0);
    assert.equal((await harness.store.get(harness.id))?.tracks.length, existingTrack ? 1 : 0);
    assert.equal(
      (JSON.parse(response.response.body) as { detail: string }).detail,
      detail,
    );
  }
});

test("malformed duplicate generated OTIO track IDs remain ignored", async () => {
  const harness = (await integrationHarness(true));
  const response = await dispatchOtio(harness, otioDocument("unsupported"));

  assert.equal(response.response.statusCode, 200);
  assert.equal((await revision(harness)), 1);
  assert.deepEqual(
    (await harness.store.get(harness.id))?.tracks,
    [{ id: "otio-tr-0", type: "audio", label: "Existing" }],
  );
});
