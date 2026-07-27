/**
 * Tests - index.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMotifDocument,
  summarizeMotif,
  formatMotifSummary,
  readMotifSummaryText,
} from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sketch = join(
  here,
  "../../../../packages/movement-encode/fixtures/corpus/motif-sketch-01.json",
);

test("reads corpus Motif and prints summary", () => {
  const raw = readFileSync(sketch, "utf8");
  const doc = loadMotifDocument(raw);
  assert.equal(doc.profile, "mvei-motif");
  const summary = summarizeMotif(doc);
  assert.ok(summary.itemCount >= 1);
  assert.ok(summary.symbols.walk >= 1 || Object.keys(summary.symbols).length >= 1);
  const text = formatMotifSummary(summary);
  assert.match(text, /reference-reader/);
  assert.match(text, /mvei-motif/);
  assert.doesNotMatch(text, /first browser Laban/i);
  assert.equal(readMotifSummaryText(raw), text);
});

test("rejects non-motif profile", () => {
  assert.throws(
    () =>
      loadMotifDocument({
        profile: "mvei-laban-subset",
        id: "x",
        items: [],
      }),
    /mvei-motif only/,
  );
});
