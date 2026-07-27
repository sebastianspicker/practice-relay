/** Tests for the shared no-read boundary used by release validators. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";

test("protected paths are rejected before repository-wide reads", () => {
  for (const path of [
    ".env",
    ".env.example",
    ".envrc",
    ".ENV-backup",
    "deploy/secrets/README.md",
    "deploy/secrets/example/config.txt",
    "practice-relay/data/records.sqlite3",
    "local/server.log",
    "logs/events.jsonl",
    "audit-events.jsonl",
    "certificates/signing.pem",
    "keys/signing-material",
    "DEPLOY/SECRETS/example.txt",
    "packages/API/KEYS/material.ts",
    ".cursor/rules/project.mjs",
    ".serena/project.yml",
  ]) {
    assert.equal(isProtectedRepositoryPath(path), true, path);
  }
});

test("maintained source and public documentation remain readable", () => {
  for (const path of [
    "README.md",
    "docs/ALPHA.md",
    "scripts/verify-public-hygiene.mjs",
    "practice-relay/apps/api/src/index.ts",
    "practice-relay/apps/web/src/data/record-summary.mjs",
  ]) {
    assert.equal(isProtectedRepositoryPath(path), false, path);
  }
});
