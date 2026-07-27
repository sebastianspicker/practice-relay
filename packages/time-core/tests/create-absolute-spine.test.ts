/** Unit tests for @practice-relay/time-core spine helpers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  createAbsoluteSpine,
} from "../src/index.ts";

test("createAbsoluteSpine returns absolute mode spine", () => {
  const spine = createAbsoluteSpine(12_000);
  assert.equal(spine.schemaVersion, SCHEMA_VERSION);
  assert.equal(spine.mode, "absolute");
  assert.equal(spine.durationMs, 12_000);
  assert.equal(spine.markers, undefined);
  assert.equal(spine.regions, undefined);
});

test("createAbsoluteSpine accepts zero duration", () => {
  assert.equal(createAbsoluteSpine(0).durationMs, 0);
});

test("createAbsoluteSpine rejects negative and non-finite durations", () => {
  for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => createAbsoluteSpine(duration),
      (error: unknown) =>
        error instanceof RangeError &&
        /durationMs must be a finite non-negative number/.test(error.message),
    );
  }
});
