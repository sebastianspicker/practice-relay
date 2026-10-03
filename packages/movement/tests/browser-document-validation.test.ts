/** Regression coverage for the browser-safe public movement document parser. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MOVEMENT_CORPUS,
  MovementDocumentValidationError,
  parseMovementDocument,
} from "../src/index.ts";

test("browser parser accepts canonical package corpus without Node I/O", () => {
  const parsed = parseMovementDocument(JSON.stringify(MOVEMENT_CORPUS.motifSketch));
  assert.equal(parsed.profile, "mvei-motif");
});

test("browser parser returns one validation error type for malformed documents", () => {
  assert.throws(
    () => parseMovementDocument({ profile: "mvei-motif" }),
    MovementDocumentValidationError,
  );
});
