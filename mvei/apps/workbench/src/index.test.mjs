/** Smoke tests for MvEI Workbench re-export surface. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MVEI_WORKBENCH_STATUS,
  scaffoldBanner,
  BRAND,
  STANDARD,
  createSketchMotif,
  validateMotifAgainstSchema,
} from "./index.mjs";

test("workbench scaffold exports MvEI Workbench surface", () => {
  assert.ok(MVEI_WORKBENCH_STATUS.includes("MvEI Workbench"));
  assert.match(scaffoldBanner(), /MvEI Workbench/);
  assert.match(scaffoldBanner(), /MvEI/);
  assert.equal(BRAND, "MvEI Workbench");
  assert.equal(STANDARD, "MvEI (Movement Encoding Initiative)");
});

test("workbench entry point re-exports Motif helpers", () => {
  const doc = createSketchMotif("via-entry-point");
  const result = validateMotifAgainstSchema(doc);
  assert.equal(result.ok, true, result.message);
});
