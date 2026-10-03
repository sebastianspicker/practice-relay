/** Source-level tests for file and schema validation boundaries. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { validateMveiDocument } from "../src/validator/index.ts";

const movementRequire = createRequire(import.meta.url);
const motifFixture = movementRequire.resolve(
  "@practice-relay/movement/fixtures/corpus/motif-sketch-01.json",
);

test("validator accepts a canonical Motif fixture", () => {
  assert.deepEqual(validateMveiDocument(motifFixture), {
    ok: true,
    message: `OK ${motifFixture}`,
  });
});

test("validator fails closed for missing, malformed, and unknown documents", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "movement-toolkit-validator-"));
  try {
    const malformed = join(temporaryDirectory, "malformed.json");
    const unknown = join(temporaryDirectory, "unknown.json");
    writeFileSync(malformed, "{", "utf8");
    writeFileSync(unknown, "{}", "utf8");
    assert.match(validateMveiDocument(join(temporaryDirectory, "missing.json")).message, /File not found/);
    assert.match(validateMveiDocument(malformed).message, /Invalid JSON/);
    assert.deepEqual(validateMveiDocument(unknown), {
      ok: false,
      message:
        "Unknown document type (need profile=mvei-motif|mvei-laban-subset or kind=movement_annotation)",
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
