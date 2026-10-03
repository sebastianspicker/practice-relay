/** Immutable authoring, extension preservation, and invalid-input regression checks. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendMotifItem, createMotifHistory, emitMotif, loadMotif, MAX_MOTIF_BYTES,
  moveMotifItem, parseTimeAnchor, removeMotifItem, updateMotifItem, validateMotif,
} from "../browser/authoring.mjs";

const source = {
  schemaVersion: "0.2.0", profile: "mvei-motif", id: "phrase", completeness: "partial",
  items: [
    { id: "first", symbol: "walk", order: 4, durationHint: "sustained", timeAnchor: { tMs: 0, musicMeasure: "m1" } },
    { id: "second", symbol: "turn", order: 1, timeAnchor: { tMs: 4200 } },
  ],
  annotationLinks: [{ system: "other", uri: "urn:annotation:1", providerExtension: { untouched: true } }],
};

test("editing and export preserve permitted nested extensions and isolate inputs", () => {
  const document = loadMotif(source);
  const edited = updateMotifItem(document, 0, { symbol: "balance" });
  assert.equal(document.items[0].symbol, "walk");
  assert.deepEqual(edited.annotationLinks, source.annotationLinks);
  assert.deepEqual(edited.items[0].timeAnchor, source.items[0].timeAnchor);
  assert.equal(edited.items[0].durationHint, "sustained");
  assert.deepEqual(loadMotif(emitMotif(edited)), edited);
  edited.items[0].symbol = "jump";
  assert.equal(source.items[0].symbol, "walk");
});

test("document operations use displayed order and preserve unrelated fields", () => {
  const document = loadMotif(source);
  const moved = moveMotifItem(document, 0, -1);
  assert.deepEqual(moved.items.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(moved.items.map((item) => item.order), [0, 1]);
  assert.deepEqual(moved.annotationLinks, source.annotationLinks);
  assert.equal(appendMotifItem(document, "third").items[2].order, 5);
  assert.throws(() => appendMotifItem(document, "first"), /identity/);
  assert.throws(() => moveMotifItem(document, 1, -1), /direction/);
  assert.equal(removeMotifItem(document, 0).items[0].id, "second");
});

test("blank time remains unset while malformed and nonfinite anchors fail", () => {
  assert.equal(parseTimeAnchor(""), undefined);
  assert.equal(parseTimeAnchor("  "), undefined);
  assert.equal(parseTimeAnchor("0"), 0);
  assert.equal(parseTimeAnchor("4200.5"), 4200.5);
  for (const invalid of ["no", "Infinity", "NaN", "12ms", "0x10", "1e999"]) {
    assert.throws(() => parseTimeAnchor(invalid), /finite/);
  }
});

test("invalid documents, oversized JSON and Laban imports never become editable Motif", () => {
  assert.equal(validateMotif(source).valid, true);
  assert.equal(validateMotif({ ...source, items: [{ id: "a", order: 0, symbol: "invented" }] }).valid, false);
  assert.throws(() => loadMotif(" ".repeat(MAX_MOTIF_BYTES + 1)), /2 MiB/);
  assert.throws(() => loadMotif({ schemaVersion: "0.2.0", profile: "mvei-laban-subset", id: "l", completeness: "partial", measures: [], symbols: [] }), /Only Motif/);
});

test("history isolates snapshots, bounds undo, rejects invalid pushes and clears redo", () => {
  const document = loadMotif(source);
  const history = createMotifHistory(document, 2);
  const exposed = history.get(); exposed.items.pop();
  assert.equal(history.get().items.length, 2);
  history.push(appendMotifItem(document, "third"));
  history.push(removeMotifItem(history.get(), 0));
  history.push(removeMotifItem(history.get(), 0));
  assert.equal(history.undo().items.length, 2);
  assert.equal(history.undo().items.length, 3);
  assert.equal(history.canUndo(), false);
  assert.equal(history.redo().items.length, 2);
  assert.throws(() => history.push({ ...document, profile: "bad" } as never));
  assert.equal(history.get().items.length, 2);
  history.push(document);
  assert.equal(history.canRedo(), false);
  history.reset(document);
  assert.equal(history.canUndo(), false);
});
