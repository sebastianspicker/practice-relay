/** Durability policy and operational-reporting tests. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createDurableRecordStore,
  createMemoryRecordStore,
} from "@practice-relay/record-store";
import { checkReadiness } from "./application/readiness.ts";
import { createRequestContext } from "./request-context.ts";
import { createApiRuntime } from "./runtime.ts";
import { handleSystemHealthRoute } from "./routes-system-health.ts";
import { handleSystemReadinessRoute } from "./routes-system-readiness.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

async function withDurabilityPolicy<T>(
  value: string | undefined,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = process.env.PRACTICE_RELAY_REQUIRE_DURABLE;
  try {
    if (value === undefined) delete process.env.PRACTICE_RELAY_REQUIRE_DURABLE;
    else process.env.PRACTICE_RELAY_REQUIRE_DURABLE = value;
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PRACTICE_RELAY_REQUIRE_DURABLE;
    else process.env.PRACTICE_RELAY_REQUIRE_DURABLE = previous;
  }
}

test("required durability fails readiness for memory and accepts JSON storage", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-readiness-"));
  try {
    await withDurabilityPolicy("1", async () => {
      const memory = await checkReadiness(createApiRuntime({
        recordStore: createMemoryRecordStore(),
      }));
      assert.equal(memory.ok, false);
      assert.equal(memory.checks.durableConfigured, false);
      assert.equal(memory.checks.durableRequired, true);
      assert.equal(memory.checks.durableReady, false);
      const memoryResponse = mockRes();
      await handleSystemReadinessRoute(createRequestContext(
        createApiRuntime({ recordStore: createMemoryRecordStore() }),
        mockReq("/ready"),
        memoryResponse as unknown as ServerResponse,
      ));
      assert.equal(memoryResponse.statusCode, 503);

      const durableRuntime = createApiRuntime({
        recordStore: createDurableRecordStore({ rootDir: root }),
      });
      const durable = await checkReadiness(durableRuntime);
      assert.equal(durable.ok, true);
      assert.equal(durable.checks.durableConfigured, true);
      assert.equal(durable.checks.durableRequired, true);
      assert.equal(durable.checks.durableReady, true);
      const durableResponse = mockRes();
      await handleSystemReadinessRoute(createRequestContext(
        durableRuntime,
        mockReq("/ready"),
        durableResponse as unknown as ServerResponse,
      ));
      assert.equal(durableResponse.statusCode, 200);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("optional durability keeps a healthy memory runtime ready", async () => {
  await withDurabilityPolicy(undefined, async () => {
    const readiness = await checkReadiness(createApiRuntime({
      recordStore: createMemoryRecordStore(),
    }));
    assert.equal(readiness.ok, true);
    assert.equal(readiness.checks.durableRequired, false);
    assert.equal(readiness.checks.durableReady, true);
  });
});

test("health reports adapter durability instead of storage environment", () => {
  const previousData = process.env.PRACTICE_RELAY_DATA;
  process.env.PRACTICE_RELAY_DATA = "/configured/but-not-active";
  try {
    const runtime = createApiRuntime({ recordStore: createMemoryRecordStore() });
    const response = mockRes();
    const result = handleSystemHealthRoute(createRequestContext(
      runtime,
      mockReq("/health"),
      response as unknown as ServerResponse,
    ));
    assert.equal(result, "handled");
    assert.equal(response.statusCode, 200);
    assert.equal((JSON.parse(response.body) as { durable: boolean }).durable, false);
  } finally {
    if (previousData === undefined) delete process.env.PRACTICE_RELAY_DATA;
    else process.env.PRACTICE_RELAY_DATA = previousData;
  }
});
