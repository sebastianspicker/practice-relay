/**
 * Tests: laban-subset.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadLabanSubset,
  loadCorpusLabanSubset,
  renderLabanSubsetStaffHtml,
  addLabanSymbol,
  removeLabanSymbol,
  addSymbolOnColumn,
  removeSymbolsOnColumn,
  removeSymbolOnColumn,
  symbolsOnColumn,
} from "./laban-subset.mjs";
import { createHistory } from "./history.mjs";

test("load corpus laban-subset-04 and render multi-staff HTML", () => {
  const doc = loadCorpusLabanSubset();
  assert.equal(doc.profile, "mvei-laban-subset");
  assert.equal(doc.id, "laban-subset-04");
  assert.ok(doc.symbols.length >= 8);
  assert.ok(doc.staff?.columns?.includes("arm_left"));
  const html = renderLabanSubsetStaffHtml(doc);
  assert.match(html, /data-profile="mvei-laban-subset"/);
  assert.match(html, /data-column="support_right"/);
  assert.match(html, /role="img"/);

  const hostile = renderLabanSubsetStaffHtml({
    ...doc,
    symbols: [{ ...doc.symbols[0], id: `symbol'&<>"` }],
  });
  assert.match(hostile, /symbol&#39;&amp;&lt;&gt;&quot;/);
  assert.doesNotMatch(hostile, /symbol'&/);
  assert.match(html, /multi-staff/);
  assert.doesNotMatch(html, /first browser Laban/i);
});

test("laban-subset edits integrate with undo history", () => {
  let doc = loadLabanSubset({
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: "ls-edit",
    completeness: "sketch",
    staff: { columns: ["body"] },
    measures: [{ id: "m0", index: 0, beats: 4 }],
    symbols: [],
  });
  const hist = createHistory(doc);
  doc = addLabanSymbol(hist.get(), {
    id: "s1",
    kind: "stillness",
    column: "body",
    measureId: "m0",
  });
  hist.push(doc);
  assert.equal(hist.get().symbols.length, 1);
  hist.undo();
  assert.equal(hist.get().symbols.length, 0);
  hist.redo();
  doc = removeLabanSymbol(hist.get(), "s1");
  hist.push(doc);
  assert.equal(hist.get().symbols.length, 0);
});

test("multi-staff column add/remove symbols", () => {
  let doc = loadLabanSubset({
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: "ls-cols",
    completeness: "sketch",
    staff: { columns: ["body"] },
    measures: [
      { id: "m0", index: 0, beats: 4 },
      { id: "m1", index: 1, beats: 4 },
    ],
    symbols: [],
  });
  doc = addSymbolOnColumn(doc, "arm_right", {
    id: "s-arm",
    kind: "gesture",
    measureId: "m0",
    motifSymbol: "gesture_arm",
  });
  assert.ok(doc.staff.columns.includes("arm_right"));
  assert.equal(symbolsOnColumn(doc, "arm_right").length, 1);
  doc = addSymbolOnColumn(doc, "arm_right", {
    id: "s-arm-2",
    kind: "gesture",
    measureId: "m1",
  });
  assert.equal(symbolsOnColumn(doc, "arm_right", "m0").length, 1);
  doc = removeSymbolOnColumn(doc, "arm_right", "s-arm");
  assert.equal(symbolsOnColumn(doc, "arm_right").length, 1);
  doc = removeSymbolsOnColumn(doc, "arm_right");
  assert.equal(symbolsOnColumn(doc, "arm_right").length, 0);
  assert.throws(() => removeSymbolOnColumn(doc, "body", "missing"));
});
