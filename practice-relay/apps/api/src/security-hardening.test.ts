/**
 * Focused regressions for API throttling, request draining, media provenance,
 * server timeouts, and AGS authorization order.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryMediaStore } from "@practice-relay/media-store";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  API_HEADERS_TIMEOUT_MS,
  API_KEEP_ALIVE_TIMEOUT_MS,
  API_REQUEST_TIMEOUT_MS,
  __resetMetricsForTests,
  createAppServer,
  renderPrometheusMetrics,
} from "./index.ts";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import {
  mockReq,
  mockRes,
  type MockRes,
} from "./test-support/http-mocks.ts";

type ApiInput = {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function freshRuntime(): ApiRuntime {
  return createApiRuntime({
    recordStore: createMemoryRecordStore(),
    mediaStore: createMemoryMediaStore(),
    failedLoginAttempts: new Map(),
    failedLoginSources: new Map(),
  });
}

async function api(runtime: ApiRuntime, input: ApiInput) {
  const res = mockRes();
  await handleRequestWithRuntime(
    runtime,
    mockReq(input.url, input.method, input.body, input.headers),
    res as unknown as ServerResponse,
  );
  return {
    status: res.statusCode,
    body: res.body ? (JSON.parse(res.body) as unknown) : null,
    headers: res.headers,
  };
}

async function facultyBearer(runtime: ApiRuntime): Promise<string> {
  const response = await api(runtime, {
    method: "POST",
    url: "/auth/login",
    body: { userId: "teacher-1", password: "teach" },
  });
  assert.equal(response.status, 200);
  return `Bearer ${(response.body as { token: string }).token}`;
}

function pausedRequest(url: string, method: string) {
  const req = new Readable({ read() {} }) as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = {};
  let resumeCalls = 0;
  req.resume = (() => {
    resumeCalls += 1;
    return req;
  }) as IncomingMessage["resume"];
  return { req, resumeCalls: () => resumeCalls };
}

test("account throttles survive attacker-cardinality saturation", async () => {
  const runtime = freshRuntime();
  const target = `missing-target-${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await api(runtime, {
      method: "POST",
      url: "/auth/login",
      body: { userId: target, password: "wrong" },
    });
    assert.equal(response.status, 401);
  }
  assert.equal(
    (await api(runtime, {
      method: "POST",
      url: "/auth/login",
      body: { userId: target, password: "wrong" },
    })).status,
    429,
  );

  const resetAt = Date.now() + 60_000;
  let index = 0;
  while (runtime.failedLoginAttempts.size < 10_000) {
    runtime.failedLoginAttempts.set(`flood:${index}`, { count: 1, resetAt });
    index += 1;
  }
  await api(runtime, {
    method: "POST",
    url: "/auth/login",
    body: { userId: `new-fake-${randomUUID()}`, password: "wrong" },
  });
  assert.equal(runtime.failedLoginAttempts.size, 10_000);
  assert.equal(
    (await api(runtime, {
      method: "POST",
      url: "/auth/login",
      body: { userId: target, password: "wrong" },
    })).status,
    429,
  );
});

test("source aggregation is bounded and does not reveal account existence", async () => {
  const runtime = freshRuntime();
  const first = await api(runtime, {
    method: "POST",
    url: "/auth/login",
    body: { userId: `missing-${randomUUID()}`, password: "wrong" },
  });
  assert.equal(first.status, 401);
  assert.equal(runtime.failedLoginSources.get("unknown")?.count, 1);

  runtime.failedLoginSources.set("unknown", {
    count: 100,
    resetAt: Date.now() + 60_000,
  });
  const known = await api(runtime, {
    method: "POST",
    url: "/auth/login",
    body: { userId: "teacher-1", password: "teach" },
  });
  const missing = await api(runtime, {
    method: "POST",
    url: "/auth/login",
    body: { userId: `missing-${randomUUID()}`, password: "wrong" },
  });
  assert.equal(known.status, 429);
  assert.equal(missing.status, 429);
  assert.deepEqual(known.body, missing.body);
});

test("unsupported, unmatched, and rejected paused requests are drained", async () => {
  const runtime = freshRuntime();
  const cases = [
    { url: "/health", method: "POST", status: 405, allow: "GET" },
    {
      url: "/work-records/record-id/tracks",
      method: "GET",
      status: 405,
      allow: "POST",
    },
    {
      url: "/work-records/record-id/comments/comment-id/resolve",
      method: "GET",
      status: 405,
      allow: "POST",
    },
    { url: "/not-a-route", method: "POST", status: 404 },
    { url: "/work-records", method: "POST", status: 401 },
  ];
  for (const expected of cases) {
    const paused = pausedRequest(expected.url, expected.method);
    const res = mockRes();
    await handleRequestWithRuntime(
      runtime,
      paused.req,
      res as unknown as ServerResponse,
    );
    assert.equal(res.statusCode, expected.status);
    assert.equal(paused.resumeCalls(), 1);
    if (expected.allow) assert.equal(res.headers.allow, expected.allow);
  }
});

test("JSON endpoints reject non-object roots as client errors", async () => {
  const runtime = freshRuntime();
  for (const body of [null, [], "credentials"]) {
    const response = await api(runtime, {
      method: "POST",
      url: "/auth/login",
      body,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      title: "Bad Request",
      status: 400,
      detail: "JSON body must be an object",
    });
  }
});

test("OPTIONS requests record their actual 204 metrics status", async () => {
  const runtime = freshRuntime();
  __resetMetricsForTests();
  assert.equal(
    (await api(runtime, { method: "OPTIONS", url: "/health" })).status,
    204,
  );
  assert.match(
    renderPrometheusMetrics(),
    /practice_relay_request_count\{method="OPTIONS",path="\/health",status="204"\} 1/,
  );
});

test("API server applies explicit header, request, and keep-alive timeouts", () => {
  const server = createAppServer();
  assert.equal(server.headersTimeout, API_HEADERS_TIMEOUT_MS);
  assert.equal(server.requestTimeout, API_REQUEST_TIMEOUT_MS);
  assert.equal(server.keepAliveTimeout, API_KEEP_ALIVE_TIMEOUT_MS);
});

test("OTIO import strips caller-controlled take mediaPath values", async () => {
  const runtime = freshRuntime();
  const authorization = await facultyBearer(runtime);
  const recordId = `ps-otio-media-${randomUUID()}`;
  assert.equal(
    (await api(runtime, {
      method: "POST",
      url: "/work-records",
      body: { id: recordId, title: "OTIO provenance" },
      headers: { authorization },
    })).status,
    201,
  );
  const privateUrl = "http://127.0.0.1/private/capture.mov";
  const otio = {
    OTIO_SCHEMA: "Timeline.1",
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          name: "Private clip",
          kind: "video",
          children: [
            {
              OTIO_SCHEMA: "Clip.1",
              media_reference: {
                OTIO_SCHEMA: "ExternalReference.1",
                target_url: privateUrl,
              },
            },
          ],
        },
      ],
    },
  };
  const imported = await api(runtime, {
    method: "POST",
    url: `/work-records/${recordId}/interop`,
    body: {
      importFormat: "otio-json",
      importBody: JSON.stringify(otio),
    },
    headers: { authorization },
  });
  assert.equal(imported.status, 200);
  const persisted = runtime.recordStore.get(recordId)!;
  assert.equal(persisted.takes.length, 1);
  assert.equal(persisted.takes[0]?.mediaPath, undefined);
  assert.equal(persisted.takes[0]?.storageKey, undefined);
  assert.doesNotMatch(JSON.stringify(persisted.takes), /127\.0\.0\.1|private/);
});

test("interop rejects ambiguous and malformed imports without persisting them", async () => {
  const runtime = freshRuntime();
  const authorization = await facultyBearer(runtime);
  const invalidOtio = JSON.stringify({
    tracks: {
      children: [{ name: "Unknown", kind: "not-a-track-type", children: [] }],
    },
  });
  const invalidEaf = `
    <ANNOTATION_DOCUMENT><TIME_ORDER>
      <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/>
      <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="100"/>
    </TIME_ORDER><TIER TIER_ID="regions"><ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="invalid id" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Invalid</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
    </ANNOTATION></TIER></ANNOTATION_DOCUMENT>`;
  const duplicateEaf = `
    <ANNOTATION_DOCUMENT><TIME_ORDER>
      <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/>
      <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="100"/>
    </TIME_ORDER><TIER TIER_ID="regions"><ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>First</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Duplicate</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
    </ANNOTATION></TIER></ANNOTATION_DOCUMENT>`;
  const cases = [
    { body: { importBody: "{}" }, detail: "importFormat" },
    { body: { importFormat: "unknown", importBody: "{}" }, detail: "importFormat" },
    { body: { importBody: "" }, detail: "importBody" },
    { body: { importFormat: "otio-json", importBody: invalidOtio }, detail: "track" },
    { body: { importFormat: "eaf", importBody: invalidEaf }, detail: "region" },
    { body: { importFormat: "eaf", importBody: duplicateEaf }, detail: "region" },
  ];
  for (const [index, testCase] of cases.entries()) {
    const recordId = `ps-bad-interop-${index}-${randomUUID()}`;
    assert.equal(
      (await api(runtime, {
        method: "POST",
        url: "/work-records",
        body: { id: recordId, title: "Invalid interop" },
        headers: { authorization },
      })).status,
      201,
    );
    const response = await api(runtime, {
      method: "POST",
      url: `/work-records/${recordId}/interop`,
      body: testCase.body,
      headers: { authorization },
    });
    assert.equal(response.status, 400);
    assert.match(
      String((response.body as { detail?: string }).detail ?? ""),
      new RegExp(testCase.detail, "i"),
    );
    const saved = runtime.recordStore.get(recordId)!;
    assert.deepEqual(saved.tracks, []);
    assert.deepEqual(saved.spine.regions, []);
  }
});

test("interop preserves revision conflicts while translating import failures", async () => {
  const backing = createMemoryRecordStore();
  const runtime = createApiRuntime({
    recordStore: {
      ...backing,
      update() {
        throw new Error("record revision conflict");
      },
    },
    mediaStore: createMemoryMediaStore(),
    failedLoginAttempts: new Map(),
    failedLoginSources: new Map(),
  });
  const authorization = await facultyBearer(runtime);
  const recordId = `ps-interop-conflict-${randomUUID()}`;
  assert.equal(
    (await api(runtime, {
      method: "POST",
      url: "/work-records",
      body: { id: recordId, title: "Interop conflict" },
      headers: { authorization },
    })).status,
    201,
  );
  const response = await api(runtime, {
    method: "POST",
    url: `/work-records/${recordId}/interop`,
    body: {
      importFormat: "otio-json",
      importBody: JSON.stringify({
        tracks: { children: [{ name: "Video", kind: "video", children: [] }] },
      }),
    },
    headers: { authorization },
  });
  assert.equal(response.status, 409);
  assert.match(
    String((response.body as { detail?: string }).detail ?? ""),
    /revision conflict/i,
  );
});

test("replaced media is inaccessible when old-blob cleanup fails", async () => {
  const backing = createMemoryMediaStore();
  let cleanupFailureKey: string | undefined;
  const runtime = createApiRuntime({
    recordStore: createMemoryRecordStore(),
    mediaStore: {
      ...backing,
      hardDelete(storageKey) {
        if (storageKey === cleanupFailureKey) {
          throw new Error("simulated cleanup failure");
        }
        return backing.hardDelete(storageKey);
      },
    },
    failedLoginAttempts: new Map(),
    failedLoginSources: new Map(),
  });
  const authorization = await facultyBearer(runtime);
  const recordId = `ps-media-replace-${randomUUID()}`;
  assert.equal(
    (await api(runtime, {
      method: "POST",
      url: "/work-records",
      body: { id: recordId, title: "Replacement cleanup" },
      headers: { authorization },
    })).status,
    201,
  );

  const first = await api(runtime, {
    method: "POST",
    url: `/work-records/${recordId}/takes/take-1/media`,
    body: { bytes: "first" },
    headers: { authorization, "content-type": "video/mp4" },
  });
  assert.equal(first.status, 200);
  const oldKey = (first.body as { media: { storageKey: string } }).media
    .storageKey;
  cleanupFailureKey = oldKey;

  const replacement = await api(runtime, {
    method: "POST",
    url: `/work-records/${recordId}/takes/take-1/media`,
    body: { bytes: "replacement" },
    headers: { authorization, "content-type": "video/mp4" },
  });
  assert.equal(replacement.status, 200);
  assert.equal(
    (replacement.body as { cleanupPending: boolean }).cleanupPending,
    true,
  );
  const newKey = (
    replacement.body as { media: { storageKey: string } }
  ).media.storageKey;

  assert.equal(
    (await api(runtime, {
      method: "GET",
      url: `/media/${oldKey}`,
      headers: { authorization },
    })).status,
    404,
  );
  assert.equal(
    (await api(runtime, {
      method: "GET",
      url: `/media/${newKey}`,
      headers: { authorization },
    })).status,
    200,
  );
});

test("invalid AGS bearer is rejected before JSON iteration, then drained", async () => {
  const runtime = freshRuntime();
  const req = mockReq(
    "/lti/ags/scores",
    "POST",
    { recordId: "ps-demo", userId: "student-1" },
    { authorization: "Bearer definitely-invalid" },
  );
  const originalIterator = req[Symbol.asyncIterator].bind(req);
  let iteratorCalls = 0;
  req[Symbol.asyncIterator] = (() => {
    iteratorCalls += 1;
    return originalIterator();
  }) as IncomingMessage[typeof Symbol.asyncIterator];
  const originalResume = req.resume.bind(req);
  let resumeCalls = 0;
  req.resume = (() => {
    resumeCalls += 1;
    return originalResume();
  }) as IncomingMessage["resume"];

  const res: MockRes = mockRes();
  await handleRequestWithRuntime(
    runtime,
    req,
    res as unknown as ServerResponse,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(iteratorCalls, 0);
  assert.equal(resumeCalls, 1);
});
