/** Regression coverage for optional import-warning path formatting and shape. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatImportWarning,
  pushWarning,
  type ImportWarning,
} from "../src/projections/import-warnings.ts";

test("formatImportWarning preserves the optional-path contract", () => {
  assert.equal(
    formatImportWarning({ code: "UNKNOWN_TIER", message: "omitted path" }),
    "[UNKNOWN_TIER] omitted path",
  );
  assert.equal(
    formatImportWarning({ code: "UNKNOWN_TIER", message: "undefined path", path: undefined }),
    "[UNKNOWN_TIER] undefined path",
  );
  assert.equal(
    formatImportWarning({ code: "UNKNOWN_TIER", message: "empty path", path: "" }),
    "[UNKNOWN_TIER] empty path",
  );
  assert.equal(
    formatImportWarning({ code: "UNKNOWN_TIER", message: "whitespace path", path: " \t " }),
    "[UNKNOWN_TIER] whitespace path ( \t )",
  );
  assert.equal(
    formatImportWarning({ code: "UNKNOWN_TIER", message: "ordinary path", path: "tiers/region" }),
    "[UNKNOWN_TIER] ordinary path (tiers/region)",
  );
});

test("pushWarning omits only undefined and empty paths while preserving warning order", () => {
  const warnings: ImportWarning[] = [];

  pushWarning(warnings, "UNKNOWN_TIER", "omitted path");
  pushWarning(warnings, "MISSING_MEDIA", "undefined path", undefined);
  pushWarning(warnings, "EMPTY_ANNOTATION", "empty path", "");
  pushWarning(warnings, "ORPHAN_COMMENT", "whitespace path", " \t ");
  pushWarning(warnings, "EMPTY_DOCUMENT", "ordinary path", "tiers/region");

  assert.deepEqual(warnings, [
    { code: "UNKNOWN_TIER", message: "omitted path" },
    { code: "MISSING_MEDIA", message: "undefined path" },
    { code: "EMPTY_ANNOTATION", message: "empty path" },
    { code: "ORPHAN_COMMENT", message: "whitespace path", path: " \t " },
    { code: "EMPTY_DOCUMENT", message: "ordinary path", path: "tiers/region" },
  ]);
  assert.deepEqual(
    warnings.map((warning) => Object.hasOwn(warning, "path")),
    [false, false, false, true, true],
  );
});
