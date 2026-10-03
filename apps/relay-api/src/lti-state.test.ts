/** Verify shared launch expiry and consume-before-validation semantics. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { consumePendingLtiLaunch, registerPendingLtiLaunch } from "./lti-state.ts";
import { createApiRuntime } from "./runtime.ts";
const launch = { nonce: "nonce", issuer: "https://issuer.example", audience: "tool", deploymentId: "deployment" };

test("returns a pending launch only once across concurrent requests", async () => {
  const runtime = createApiRuntime();
  await registerPendingLtiLaunch(runtime, "state", launch);
  const consumed = await Promise.all([consumePendingLtiLaunch(runtime, "state"), consumePendingLtiLaunch(runtime, "state")]);
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.equal(consumed.find(Boolean)?.nonce, "nonce");
});

test("rejects launch state at its exact expiration boundary", async () => {
  const runtime = createApiRuntime();
  await runtime.coordination.registerLtiLaunch("expired", launch, { now: 10_000, ttlMs: 1 });
  assert.equal(await runtime.coordination.consumeLtiLaunch("expired", 10_001), undefined);
});
