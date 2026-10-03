/** Focused ordering and input-boundary coverage for system admin routes. */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import {
  createDurableRecordStore,
  createMemoryRecordStore,
} from "@practice-relay/record-store";
import { createRequestContext } from "./request-context.ts";
import { handleSystemRestoreRoute } from "./routes-system-admin.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

function restoreDetail(response: Awaited<ReturnType<typeof mockRes>>): string {
  return (JSON.parse(response.body) as { detail: string }).detail;
}

async function restoreRequest(
  runtime: ApiRuntime,
  body: unknown,
  authorization?: string,
) {
  const response = mockRes();
  const headers = authorization === undefined ? undefined : { authorization };
  const result = await handleSystemRestoreRoute(createRequestContext(
    runtime,
    mockReq("/ops/restore", "POST", body, headers),
    response as unknown as ServerResponse,
  ));
  assert.equal(result, "handled");
  return response;
}

test("system restore preserves gate ordering and validates backup IDs before restore", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-system-admin-"));
  const previousLabOps = process.env.PRACTICE_RELAY_LAB_OPS;
  const auth = createAuthService("system-admin-route-test-secret");
  const adminSession = (await auth.login("ops-1", "ops"));
  const teacherSession = (await auth.login("teacher-1", "teach"));
  assert.ok(adminSession);
  assert.ok(teacherSession);
  const admin = `Bearer ${adminSession.token}`;
  const teacher = `Bearer ${teacherSession.token}`;
  const durable = createDurableRecordStore({ rootDir: root });
  const durableRuntime = createApiRuntime({ auth, recordStore: durable });
  const originalRestore = durable.restoreFromBackup.bind(durable);
  let restoreCalls = 0;
  let restoredPath: string | undefined;
  durable.restoreFromBackup = (backupPath) => {
    restoreCalls += 1;
    restoredPath = backupPath;
    return originalRestore(backupPath);
  };

  try {
    delete process.env.PRACTICE_RELAY_LAB_OPS;
    const unauthenticated = await restoreRequest(durableRuntime, { backupId: null });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(restoreDetail(unauthenticated), "valid bearer session required");

    const nonAdmin = await restoreRequest(durableRuntime, { backupId: null }, teacher);
    assert.equal(nonAdmin.statusCode, 403);
    assert.equal(restoreDetail(nonAdmin), "operations admin role required");

    process.env.PRACTICE_RELAY_LAB_OPS = "0";
    const labDisabled = await restoreRequest(durableRuntime, { backupId: null }, admin);
    assert.equal(labDisabled.statusCode, 403);
    assert.equal(
      restoreDetail(labDisabled),
      "restore requires PRACTICE_RELAY_LAB_OPS=1",
    );

    process.env.PRACTICE_RELAY_LAB_OPS = "1";
    const memoryRuntime = createApiRuntime({
      auth,
      recordStore: createMemoryRecordStore(),
    });
    const nonDurable = await restoreRequest(memoryRuntime, { backupId: null }, admin);
    assert.equal(nonDurable.statusCode, 400);
    assert.equal(
      restoreDetail(nonDurable),
      "restore requires PRACTICE_RELAY_DATA durable store",
    );

    for (const body of [
      {},
      { backupId: null },
      { backupId: "" },
      { backupId: " \t\n " },
      { backupId: 1 },
      { backupId: false },
      { backupId: [] },
      { backupId: {} },
    ]) {
      const malformed = await restoreRequest(durableRuntime, body, admin);
      assert.equal(malformed.statusCode, 400);
      assert.equal(restoreDetail(malformed), "backupId required");
    }
    assert.equal(restoreCalls, 0);

    (await durable.appendEvent("_system", "test-seed"));
    const backup = (await durable.backup());
    const backupId = path.basename(backup.backupDir);
    const restored = await restoreRequest(
      durableRuntime,
      { backupId: `  ${backupId}  ` },
      admin,
    );
    assert.equal(restored.statusCode, 200, restored.body);
    assert.equal(restoreCalls, 1);
    assert.equal(restoredPath, realpathSync(backup.backupDir));
    assert.deepEqual(JSON.parse(restored.body), {
      ok: true,
      manifest: {
        createdAt: backup.createdAt,
        recordCount: backup.recordCount,
        recordIds: backup.recordIds,
        ...(backup.tenantId === undefined ? {} : { tenantId: backup.tenantId }),
        backupId,
      },
    });
  } finally {
    if (previousLabOps === undefined) delete process.env.PRACTICE_RELAY_LAB_OPS;
    else process.env.PRACTICE_RELAY_LAB_OPS = previousLabOps;
    rmSync(root, { recursive: true, force: true });
  }
});
