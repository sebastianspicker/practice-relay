/** Deterministic verification for the maintainer-local suite selection. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { LOCAL_SUITES, selectLocalSuites } from "./run-local-suites.mjs";

test("a fresh clone skips every maintainer-local suite", () => {
  const { present, skipped } = selectLocalSuites("/repo", () => false);
  assert.deepEqual(present, []);
  assert.equal(skipped.length, LOCAL_SUITES.length);
});

test("only suites whose test directory exists are run", () => {
  const existing = new Set([join("/repo", "packages/handoff", "tests"), join("/repo", "apps/relay-web", "test")]);
  const { present, skipped } = selectLocalSuites("/repo", (path) => existing.has(path));
  assert.deepEqual(present.map((suite) => suite.workspace), ["packages/handoff", "apps/relay-web"]);
  assert.equal(skipped.length, LOCAL_SUITES.length - 2);
});
