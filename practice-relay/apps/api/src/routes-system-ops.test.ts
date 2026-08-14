/** Focused contract checks for the ordered system-operations facade. */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createMemoryMediaStore,
  type MediaStoreAdapter,
} from "@practice-relay/media-store";
import {
  createDurableRecordStore,
} from "@practice-relay/record-store";
import { createRecordStore } from "@practice-relay/work-record-core";
import { createRequestContext } from "./request-context.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { handleSystemOpsRoutes } from "./routes-system-ops.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

type DispatchOptions = {
  method?: string;
  body?: unknown;
  authorization?: string;
};

async function dispatch(
  runtime: ApiRuntime,
  url: string,
  { method = "GET", body, authorization }: DispatchOptions = {},
) {
  const req = mockReq(
    url,
    method,
    body,
    authorization ? { authorization } : undefined,
  );
  const res = mockRes();
  const result = await handleSystemOpsRoutes(
    createRequestContext(runtime, req, res as unknown as ServerResponse),
  );
  return { req, res, result };
}

function adminBearer(runtime: ApiRuntime): string {
  const session = runtime.auth.login("ops-1", "ops");
  assert.ok(session);
  return `Bearer ${session.token}`;
}

test("system facade preserves all seven route matches, auth, and fall-through", async () => {
  const runtime = createApiRuntime({
    recordStore: createRecordStore(),
    mediaStore: createMemoryMediaStore(),
    objectStoreMode: "memory",
  });
  const admin = adminBearer(runtime);

  const health = await dispatch(runtime, "/health");
  assert.equal(health.result, "handled");
  assert.equal(health.res.statusCode, 200);
  assert.equal(JSON.parse(health.res.body).service, "practice-relay-api");

  const ready = await dispatch(runtime, "/readyz");
  assert.equal(ready.result, "handled");
  assert.equal(ready.res.statusCode, 200);
  assert.equal(JSON.parse(ready.res.body).ok, true);

  const metricsDenied = await dispatch(runtime, "/metrics");
  assert.equal(metricsDenied.result, "handled");
  assert.equal(metricsDenied.res.statusCode, 401);
  const metrics = await dispatch(runtime, "/metrics", { authorization: admin });
  assert.equal(metrics.result, "handled");
  assert.equal(metrics.res.statusCode, 200);
  assert.equal(
    metrics.res.headers["content-type"],
    "text/plain; version=0.0.4; charset=utf-8",
  );

  const backup = await dispatch(runtime, "/ops/backup", {
    method: "POST",
    authorization: admin,
  });
  assert.equal(backup.result, "handled");
  assert.equal(backup.res.statusCode, 400);
  assert.match(backup.res.body, /backup requires PRACTICE_RELAY_DATA durable store/);

  const backups = await dispatch(runtime, "/ops/backups", { authorization: admin });
  assert.equal(backups.result, "handled");
  assert.deepEqual(JSON.parse(backups.res.body), { backups: [], durable: false });

  const previousLabOps = process.env.PRACTICE_RELAY_LAB_OPS;
  delete process.env.PRACTICE_RELAY_LAB_OPS;
  try {
    const restore = await dispatch(
      runtime,
      "/ops/restore",
      { method: "POST", body: { backupId: "ignored" }, authorization: admin },
    );
    assert.equal(restore.result, "handled");
    assert.equal(restore.res.statusCode, 403);
    assert.match(restore.res.body, /restore requires PRACTICE_RELAY_LAB_OPS=1/);
  } finally {
    if (previousLabOps === undefined) delete process.env.PRACTICE_RELAY_LAB_OPS;
    else process.env.PRACTICE_RELAY_LAB_OPS = previousLabOps;
  }

  const audit = await dispatch(runtime, "/ops/audit", { authorization: admin });
  assert.equal(audit.result, "handled");
  assert.deepEqual(JSON.parse(audit.res.body), { events: [], durable: false });

  const unmatched = await dispatch(runtime, "/not-a-system-route");
  assert.equal(unmatched.result, "unmatched");
  assert.equal(unmatched.res.statusCode, 0);
  assert.equal(unmatched.res.body, "");
});

test("system facade preserves readiness and metrics media fallbacks", async () => {
  const media = createMemoryMediaStore();
  const failingMedia: MediaStoreAdapter = {
    ...media,
    totalBytesAll() {
      throw new Error("media unavailable");
    },
  };
  const runtime = createApiRuntime({
    recordStore: createRecordStore(),
    mediaStore: failingMedia,
    objectStoreMode: "memory",
  });
  const admin = adminBearer(runtime);

  const readiness = await dispatch(runtime, "/readyz");
  assert.equal(readiness.res.statusCode, 503);
  assert.equal(JSON.parse(readiness.res.body).checks.mediaRoot, false);

  const metrics = await dispatch(runtime, "/metrics", { authorization: admin });
  assert.equal(metrics.res.statusCode, 200);
  assert.match(metrics.res.body, /practice_relay_media_bytes 0/);
});

test("system facade authorizes restore before body parsing and keeps validation errors", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-system-routes-"));
  const previousLabOps = process.env.PRACTICE_RELAY_LAB_OPS;
  process.env.PRACTICE_RELAY_LAB_OPS = "1";
  try {
    const runtime = createApiRuntime({
      recordStore: createDurableRecordStore({ rootDir: root }),
      mediaStore: createMemoryMediaStore(),
      objectStoreMode: "memory",
    });
    const admin = adminBearer(runtime);

    const denied = await dispatch(runtime, "/ops/restore", {
      method: "POST",
      body: { bad: true },
    });
    assert.equal(denied.res.statusCode, 401);
    assert.equal(denied.req.readableEnded, false);

    const missing = await dispatch(runtime, "/ops/restore", {
      method: "POST",
      body: {},
      authorization: admin,
    });
    assert.equal(missing.res.statusCode, 400);
    assert.match(missing.res.body, /backupId required/);

    const traversal = await dispatch(
      runtime,
      "/ops/restore",
      { method: "POST", body: { backupId: "../outside" }, authorization: admin },
    );
    assert.equal(traversal.res.statusCode, 400);
    assert.match(traversal.res.body, /invalid backupId/);
  } finally {
    if (previousLabOps === undefined) delete process.env.PRACTICE_RELAY_LAB_OPS;
    else process.env.PRACTICE_RELAY_LAB_OPS = previousLabOps;
    rmSync(root, { recursive: true, force: true });
  }
});
