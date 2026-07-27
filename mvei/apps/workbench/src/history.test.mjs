/**
 * Tests: history.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "./history.mjs";
import { createSketchMotif, addItem } from "./motif.mjs";

test("undo/redo Motif edits", () => {
  let doc = createSketchMotif("h1", "History");
  const hist = createHistory(doc);
  doc = addItem(doc, { id: "i1", symbol: "walk", order: 0 });
  hist.push(doc);
  doc = addItem(doc, { id: "i2", symbol: "turn", order: 1 });
  hist.push(doc);
  assert.equal(hist.get().items.length, 2);
  assert.equal(hist.canUndo(), true);
  const u = hist.undo();
  assert.equal(u.items.length, 1);
  const r = hist.redo();
  assert.equal(r.items.length, 2);
  hist.reset(createSketchMotif("h2"));
  assert.equal(hist.canUndo(), false);
  assert.equal(hist.get().id, "h2");
});
