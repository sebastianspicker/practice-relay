/**
 * Tests - routes-system-metrics.test.ts
 *
 * Why: preserve operations authorization, response metadata, and metrics gauges.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createDurableRecordStore, createMemoryRecordStore } from "@practice-relay/record-store";
import { initializeResponseMeta, responseMetaOf } from "./api-http.ts";
import { createRequestContext } from "./request-context.ts";
import { refreshStorageMetrics } from "./storage-metrics.ts";
import { handleSystemMetricsRoute } from "./routes-system-metrics.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

function metricsRuntime(auth = createAuthService("metrics-route-test-secret")): ApiRuntime {
  return createApiRuntime({ auth, recordStore: createMemoryRecordStore() });
}

async function metricsRequest(
  runtime: ApiRuntime,
  authorization?: string,
  responseMeta?: { requestId: string; corsOrigin: string },
) {
  const response = mockRes();
  if (responseMeta) {
    initializeResponseMeta(
      response as unknown as ServerResponse,
      responseMeta.requestId,
      responseMeta.corsOrigin,
    );
  }
  const result = await handleSystemMetricsRoute(createRequestContext(
    runtime,
    mockReq(
      "/metrics",
      "GET",
      undefined,
      authorization === undefined ? undefined : { authorization },
    ),
    response as unknown as ServerResponse,
  ));
  assert.equal(result, "handled");
  return response;
}

async function adminAuthorization(runtime: ApiRuntime): Promise<string> {
  const session = (await runtime.auth.login("ops-1", "ops"));
  assert.ok(session);
  return `Bearer ${session.token}`;
}

describe("system metrics route", () => {
  it("rejects missing and non-admin bearers before counting media", async () => {
    let mediaCalls = 0;
    const unauthenticatedRuntime = metricsRuntime();
    unauthenticatedRuntime.mediaStore.totalBytesAll = async () => {
      mediaCalls += 1;
      return 37;
    };
    const unauthenticated = await metricsRequest(unauthenticatedRuntime);
    assert.equal(unauthenticated.statusCode, 401);
    assert.deepEqual(JSON.parse(unauthenticated.body), {
      title: "Unauthorized",
      status: 401,
      detail: "valid bearer session required",
    });

    const auth = createAuthService("metrics-route-test-secret");
    const teacherSession = (await auth.login("teacher-1", "teach"));
    assert.ok(teacherSession);
    const nonAdminRuntime = metricsRuntime(auth);
    nonAdminRuntime.mediaStore.totalBytesAll = async () => {
      mediaCalls += 1;
      return 37;
    };
    const nonAdmin = await metricsRequest(
      nonAdminRuntime,
      `Bearer ${teacherSession.token}`,
    );
    assert.equal(nonAdmin.statusCode, 403);
    assert.deepEqual(JSON.parse(nonAdmin.body), {
      title: "Forbidden",
      status: 403,
      detail: "operations admin role required",
    });
    assert.equal(mediaCalls, 0);
  });

  it("writes admin metrics with the standard metadata, CORS, and gauges", async () => {
    const runtime = metricsRuntime();
    runtime.mediaStore.totalBytesAll = async () => 37;
    await refreshStorageMetrics(runtime);
    const response = await metricsRequest(
      runtime,
      (await adminAuthorization(runtime)),
      { requestId: "metrics-37", corsOrigin: "https://studio.example" },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["content-type"],
      "text/plain; version=0.0.4; charset=utf-8",
    );
    assert.equal(response.headers["x-request-id"], "metrics-37");
    assert.equal(
      response.headers["access-control-allow-origin"],
      "https://studio.example",
    );
    assert.equal(
      response.headers["access-control-allow-headers"],
      "content-type, authorization, x-request-id, if-match",
    );
    assert.equal(
      response.headers["access-control-allow-methods"],
      "GET,POST,PUT,PATCH,OPTIONS",
    );
    assert.equal(response.headers.vary, "Origin");
    assert.equal(
      responseMetaOf(response as unknown as ServerResponse)?.status,
      200,
    );
    assert.match(response.body, /^practice_relay_record_count 0$/m);
    assert.match(response.body, /^practice_relay_media_bytes 37$/m);
    assert.match(response.body, /^practice_relay_audit_events 0$/m);
  });

  it("awaits asynchronous media-byte totals", async () => {
    const runtime = metricsRuntime();
    runtime.mediaStore.totalBytesAll = async () => 41;
    await refreshStorageMetrics(runtime);

    const response = await metricsRequest(runtime, (await adminAuthorization(runtime)));

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /^practice_relay_media_bytes 41$/m);
  });

  it("falls back to zero for failed synchronous and asynchronous media totals", async () => {
    const synchronousRuntime = metricsRuntime();
    synchronousRuntime.mediaStore.totalBytesAll = async () => {
      throw new Error("media unavailable");
    };
    const synchronousResponse = await metricsRequest(
      synchronousRuntime,
      (await adminAuthorization(synchronousRuntime)),
    );
    assert.equal(synchronousResponse.statusCode, 200);
    assert.match(synchronousResponse.body, /^practice_relay_media_bytes 0$/m);

    const asynchronousRuntime = metricsRuntime();
    asynchronousRuntime.mediaStore.totalBytesAll = async () =>
      Promise.reject(new Error("media unavailable"));
    const asynchronousResponse = await metricsRequest(
      asynchronousRuntime,
      (await adminAuthorization(asynchronousRuntime)),
    );
    assert.equal(asynchronousResponse.statusCode, 200);
    assert.match(asynchronousResponse.body, /^practice_relay_media_bytes 0$/m);
  });

  it("reports durable audit events from an isolated store", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "practice-relay-metrics-"));
    try {
      const durable = createDurableRecordStore({ rootDir: root });
      (await durable.appendEvent("ps-metrics", "export"));
      (await durable.appendEvent("ps-metrics", "import"));
      const runtime = createApiRuntime({ recordStore: durable });
      runtime.mediaStore.totalBytesAll = async () => 0;
      await refreshStorageMetrics(runtime);

      const response = await metricsRequest(
        runtime,
        (await adminAuthorization(runtime)),
      );

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /^practice_relay_audit_events 2$/m);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it("scrapes reuse the last snapshot and expose refresh failures without scanning", async () => {
  const runtime = metricsRuntime();
  runtime.mediaStore.totalBytesAll = async () => 42;
  await refreshStorageMetrics(runtime);
  const authorization = await adminAuthorization(runtime);
  runtime.mediaStore.totalBytesAll = async () => { throw new Error("offline"); };
  runtime.recordStore.list = async () => { throw new Error("enumeration forbidden"); };
  const first = await metricsRequest(runtime, authorization);
  assert.match(first.body, /^practice_relay_media_bytes 42$/m);
  await refreshStorageMetrics(runtime);
  const second = await metricsRequest(runtime, authorization);
  assert.match(second.body, /^practice_relay_media_bytes 42$/m);
  assert.match(second.body, /^practice_relay_storage_refresh_failures_total 1$/m);
});
