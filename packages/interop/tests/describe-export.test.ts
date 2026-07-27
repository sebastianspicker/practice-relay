/** Unit tests for @practice-relay/interop export request describe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeExport } from "../src/index.ts";

test("describeExport formats request", () => {
  const msg = describeExport({
    workRecordId: "ps-1",
    format: "otio-json",
  });
  assert.match(msg, /ps-1/);
  assert.match(msg, /otio-json/);
});
