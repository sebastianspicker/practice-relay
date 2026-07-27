/** Tests for evidence-derived Practice Relay handoff readiness. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { handoffChecks } from "./readiness.mjs";

test("readiness reflects retained versions, evidence, roles, and destination policies", () => {
  const checks = handoffChecks({
    versions: [{ id: "revision-05" }],
    artifacts: [{ id: "video" }],
    snapshots: [{ id: "snapshot-04" }],
    members: [{ userId: "ada-m" }],
    policies: [
      { purpose: "assessment", state: "granted" },
      { purpose: "archive", state: "denied" },
    ],
  });

  assert.deepEqual(checks.map((check) => check.complete), [true, true, true, true, false]);
  assert.equal(checks.at(-1)?.label, "Repository reuse needs review");
});

test("readiness does not invent completion for an empty record", () => {
  assert.deepEqual(
    handoffChecks({}).map((check) => check.complete),
    [false, false, false, false, false],
  );
});
