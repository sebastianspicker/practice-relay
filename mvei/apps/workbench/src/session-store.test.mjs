/**
 * Tests: session-store.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSketchMotif, addItem } from "./motif.mjs";
import {
  SESSION_KEY,
  serializeSession,
  deserializeSession,
  saveSession,
  loadSession,
  clearSession,
  createMemoryStorage,
} from "./session-store.mjs";

test("serialize/deserialize round-trips Motif", () => {
  let doc = createSketchMotif("sess-1", "Session");
  doc = addItem(doc, { id: "i1", symbol: "walk", order: 0 });
  const raw = serializeSession(doc);
  const loaded = deserializeSession(raw);
  assert.equal(loaded.id, "sess-1");
  assert.equal(loaded.items[0].symbol, "walk");
});

test("save/load/clear with memory storage", () => {
  const storage = createMemoryStorage();
  let doc = createSketchMotif("sess-2", "Persist");
  doc = addItem(doc, { id: "i1", symbol: "turn", order: 0 });
  saveSession(storage, doc);
  assert.ok(storage.getItem(SESSION_KEY));
  const loaded = loadSession(storage);
  assert.equal(loaded.id, "sess-2");
  assert.equal(loaded.items[0].symbol, "turn");
  clearSession(storage);
  assert.equal(loadSession(storage), null);
});
