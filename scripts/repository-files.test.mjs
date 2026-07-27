/** Tests for contained repository file access. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

test("repository reads reject protected paths and external symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-repository-file-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-repository-outside-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "secrets"), { recursive: true });
  writeFileSync(join(root, "docs/readme.md"), "safe\n", "utf8");
  writeFileSync(join(root, "secrets/internal.md"), "test fixture\n", "utf8");
  writeFileSync(join(root, ".envrc"), "protected\n", "utf8");
  writeFileSync(join(outside, "external.md"), "external\n", "utf8");
  symlinkSync(join(outside, "external.md"), join(root, "docs/linked.md"));
  symlinkSync(outside, join(root, "external-docs"));
  symlinkSync(join(root, "secrets"), join(root, "docs/internal"));

  assert.equal(readRepositoryText(root, "docs/readme.md"), "safe\n");
  assert.equal(hasSafeRepositoryPath(root, ".envrc"), false);
  assert.equal(hasSafeRepositoryPath(root, "docs/linked.md"), false);
  assert.equal(hasSafeRepositoryPath(root, "external-docs/external.md"), false);
  assert.equal(hasSafeRepositoryPath(root, "docs/internal/internal.md"), false);
  assert.throws(() => readRepositoryText(root, "../outside.md"), /escapes/);
});
