/** Runtime-state admission and single-use behavior contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { canonicalAccount, createMemoryRuntimeState } from "./index.ts";

test("login admission combines canonical account, source, failure, and in-flight bounds", async () => {
  const state = createMemoryRuntimeState();
  assert.equal(canonicalAccount(" User-1 "), " User-1 ");
  const first = await state.beginLogin({ account: "User-1", source: "source-a", accountLimit: 2 });
  const second = await state.beginLogin({ account: "User-1", source: "source-b", accountLimit: 2 });
  assert.ok(first);
  assert.ok(second);
  assert.equal(
    await state.beginLogin({ account: "User-1", source: "source-c", accountLimit: 2 }),
    undefined,
  );
  await state.finishLogin(first!, false);
  await state.finishLogin(second!, true);
  const next = await state.beginLogin({ account: "User-1", source: "source-c", accountLimit: 2 });
  assert.ok(next, "successful login clears account failures across sources");
});

test("neutral login completion releases capacity without charging a failure", async () => {
  const state = createMemoryRuntimeState();
  const attempt = await state.beginLogin({ account: "account:User", source: "source", accountLimit: 1 });
  assert.ok(attempt);
  await state.finishLogin(attempt!, null);
  assert.ok(await state.beginLogin({ account: "account:User", source: "source", accountLimit: 1 }));
});

test("failed login leases count against account and source windows", async () => {
  const state = createMemoryRuntimeState();
  const attempt = await state.beginLogin({ account: "", source: "", accountLimit: 1, sourceLimit: 1 });
  assert.ok(attempt);
  await state.finishLogin(attempt!, false);
  assert.equal(
    await state.beginLogin({ account: "", source: "", accountLimit: 1, sourceLimit: 1 }),
    undefined,
  );
});

test("LTI launch state expires, is bounded, and is consumed once", async () => {
  const state = createMemoryRuntimeState();
  const launch = {
    nonce: "nonce",
    issuer: "https://issuer.example",
    audience: "tool",
    deploymentId: "deployment",
  };
  await state.registerLtiLaunch("oldest", launch, { now: 1_000, ttlMs: 100, maxPending: 2 });
  await state.registerLtiLaunch("middle", launch, { now: 1_001, ttlMs: 100, maxPending: 2 });
  await state.registerLtiLaunch("newest", launch, { now: 1_002, ttlMs: 100, maxPending: 2 });
  assert.equal(await state.consumeLtiLaunch("oldest", 1_003), undefined);
  assert.ok(await state.consumeLtiLaunch("middle", 1_003));
  assert.equal(await state.consumeLtiLaunch("middle", 1_003), undefined);
  assert.equal(await state.consumeLtiLaunch("newest", 1_102), undefined);
});
