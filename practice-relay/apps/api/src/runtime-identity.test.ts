/**
 * API runtime-identity regression tests.
 * Why: servers created before adapter swaps must still use the live test hooks.
 */
import assert from "node:assert/strict";
import type { Server, ServerResponse } from "node:http";
import { test } from "node:test";
import { createMemoryMediaStore } from "@practice-relay/media-store";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  __setMediaStoreForTests,
  __setStoreForTests,
  assertDirectRuntimeIdentity,
  createAppServer,
  resolveApiListenOptions,
} from "./index.ts";
import {
  mockReq,
  mockRes,
  type MockRes,
} from "./test-support/http-mocks.ts";

async function requestExistingServer(
  server: Server,
  url: string,
): Promise<MockRes> {
  const response = mockRes();
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const captureEnd = response.end;
  response.end = (chunk) => {
    captureEnd(chunk);
    finish();
    return response;
  };
  server.emit(
    "request",
    mockReq(url),
    response as unknown as ServerResponse,
  );
  await finished;
  return response;
}

test("an existing server observes later record and media adapter swaps", async () => {
  const server = createAppServer();
  const recordStore = createMemoryRecordStore();
  recordStore.backend = "runtime-record-swap";
  const mediaStore = createMemoryMediaStore();
  mediaStore.backend = "runtime-media-swap";

  __setStoreForTests(recordStore);
  __setMediaStoreForTests(mediaStore);
  try {
    const response = await requestExistingServer(server, "/readyz");
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      checks: { storeBackend: string; mediaBackend: string };
    };
    assert.equal(body.checks.storeBackend, "runtime-record-swap");
    assert.equal(body.checks.mediaBackend, "runtime-media-swap");
  } finally {
    __setStoreForTests(createMemoryRecordStore());
    __setMediaStoreForTests(createMemoryMediaStore());
    server.removeAllListeners();
  }
});

test("direct API listener defaults to loopback and guards non-loopback use", () => {
  assert.deepEqual(resolveApiListenOptions({}), {
    host: "127.0.0.1",
    port: 8787,
  });
  assert.throws(
    () => resolveApiListenOptions({ PRACTICE_RELAY_HOST: "0.0.0.0" }),
    /requires strict secrets and configured auth users/,
  );
  assert.deepEqual(
    resolveApiListenOptions({
      PRACTICE_RELAY_HOST: "0.0.0.0",
      PORT: "9000",
      PRACTICE_RELAY_REQUIRE_SECRETS: "1",
      PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1",
    }),
    { host: "0.0.0.0", port: 9000 },
  );
  assert.throws(() => resolveApiListenOptions({ PORT: "0" }), /1 to 65535/);
});

test("direct API runtime requires strict identities or an explicit synthetic opt-in", () => {
  assert.throws(() => assertDirectRuntimeIdentity({}), /ALLOW_SYNTHETIC_AUTH/);
  assert.doesNotThrow(() =>
    assertDirectRuntimeIdentity({ PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH: "1" }),
  );
  assert.doesNotThrow(() =>
    assertDirectRuntimeIdentity({
      PRACTICE_RELAY_REQUIRE_SECRETS: "1",
      PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1",
    }),
  );
});
