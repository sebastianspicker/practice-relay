/** Unit tests for MvEI Workbench Motif load/emit/edit/validate (shared schema path). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMotif,
  emitMotif,
  createSketchMotif,
  addItem,
  updateItem,
  removeItem,
  reorderItems,
} from "./motif.mjs";
import { validateMotifAgainstSchema } from "./validate-motif.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_SKETCH_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/fixtures/corpus/motif-sketch-01.json",
);
const CORPUS_PARTIAL_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/fixtures/corpus/motif-partial-02.json",
);

function roundTrip(doc) {
  return loadMotif(emitMotif(doc));
}

function assertExactError(thunk, ExpectedError, message) {
  let error;
  try {
    thunk();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof Error, "expected function to throw");
  assert.equal(error.constructor, ExpectedError);
  assert.equal(error.message, message);
}

test("loadMotif preserves parse, validation, and record identity semantics", () => {
  const valid = {
    schemaVersion: "0.2.0",
    profile: "mvei-motif",
    id: "motif-validation",
    completeness: "sketch",
    items: [],
  };

  for (const input of [null, [], 1]) {
    assertExactError(
      () => loadMotif(input),
      TypeError,
      "Motif document must be a JSON object",
    );
  }
  assert.deepEqual(loadMotif(JSON.stringify(valid)), valid);
  assert.strictEqual(loadMotif(valid), valid);

  const invalidJson = "{not-json";
  let expectedParseError;
  let actualParseError;
  try {
    JSON.parse(invalidJson);
  } catch (error) {
    expectedParseError = error;
  }
  try {
    loadMotif(invalidJson);
  } catch (error) {
    actualParseError = error;
  }
  assert.equal(actualParseError.constructor, expectedParseError.constructor);
  assert.equal(actualParseError.message, expectedParseError.message);

  assertExactError(
    () => loadMotif({ ...valid, profile: "other" }),
    Error,
    'Expected profile "mvei-motif", got "other"',
  );
  assertExactError(
    () => loadMotif({ ...valid, schemaVersion: "other" }),
    Error,
    'Expected schemaVersion 0.1.0-stub|0.2.0, got "other"',
  );
  assertExactError(
    () => loadMotif({ ...valid, id: "" }),
    Error,
    "Motif document requires non-empty string id",
  );
  assertExactError(
    () => loadMotif({ ...valid, id: 1 }),
    Error,
    "Motif document requires non-empty string id",
  );
  assertExactError(
    () => loadMotif({ ...valid, completeness: "other" }),
    Error,
    'completeness must be sketch|partial|complete, got "other"',
  );
  assertExactError(
    () => loadMotif({ ...valid, items: {} }),
    Error,
    "Motif document requires items array",
  );

  const frozen = Object.freeze({ ...valid, items: Object.freeze([]) });
  assert.strictEqual(loadMotif(frozen), frozen);

  let profileReads = 0;
  const profileAccessor = {
    ...valid,
    get profile() {
      profileReads += 1;
      return profileReads === 1 ? "other" : "later";
    },
  };
  assertExactError(
    () => loadMotif(profileAccessor),
    Error,
    'Expected profile "mvei-motif", got "later"',
  );
  assert.equal(profileReads, 2);

  let completenessReads = 0;
  const completenessAccessor = {
    ...valid,
    get completeness() {
      completenessReads += 1;
      return completenessReads === 1 ? "sketch" : "other";
    },
  };
  assertExactError(
    () => loadMotif(completenessAccessor),
    Error,
    'completeness must be sketch|partial|complete, got "other"',
  );
  assert.equal(completenessReads, 3);
});

test("createSketchMotif → validateMotifAgainstSchema ok", () => {
  const doc = createSketchMotif("motif-new-sketch", "Empty sketch");
  const result = validateMotifAgainstSchema(doc);
  assert.equal(result.ok, true, result.message);
  assert.equal(doc.completeness, "sketch");
  assert.equal(doc.profile, "mvei-motif");
  assert.deepEqual(doc.items, []);
});

test("loadMotif from shared corpus motif-sketch-01.json → ok, completeness sketch", () => {
  const raw = readFileSync(CORPUS_SKETCH_PATH, "utf8");
  const doc = loadMotif(raw);
  assert.equal(doc.id, "motif-sketch-01");
  assert.equal(doc.completeness, "sketch");
  assert.equal(doc.profile, "mvei-motif");
  const result = validateMotifAgainstSchema(doc);
  assert.equal(result.ok, true, result.message);
});

test("loadMotif motif-partial-02 → completeness partial validates", () => {
  const raw = readFileSync(CORPUS_PARTIAL_PATH, "utf8");
  const doc = loadMotif(raw);
  assert.equal(doc.id, "motif-partial-02");
  assert.equal(doc.completeness, "partial");
  const result = validateMotifAgainstSchema(doc);
  assert.equal(result.ok, true, result.message);
});

test("emitMotif then loadMotif round-trip preserves id and items", () => {
  const raw = readFileSync(CORPUS_PARTIAL_PATH, "utf8");
  const original = loadMotif(raw);
  const reloaded = roundTrip(original);
  assert.equal(reloaded.id, original.id);
  assert.deepEqual(reloaded.items, original.items);
  assert.equal(reloaded.completeness, original.completeness);
  assert.equal(reloaded.profile, original.profile);
});

test("invalid motif (missing profile) fails validate", () => {
  const bad = {
    schemaVersion: "0.1.0-stub",
    id: "bad-motif",
    completeness: "sketch",
    items: [],
  };
  const result = validateMotifAgainstSchema(bad);
  assert.equal(result.ok, false);
  assert.match(result.message, /profile|required/i);

  assert.throws(() => loadMotif(bad), /profile/);
});

test("addItem appends without mutating original", () => {
  const doc = createSketchMotif("m1");
  const next = addItem(doc, { id: "i1", symbol: "walk", order: 0 });
  assert.equal(doc.items.length, 0);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].symbol, "walk");
  const result = validateMotifAgainstSchema(next);
  assert.equal(result.ok, true, result.message);
});

test("emitMotif produces parseable stable JSON string", () => {
  const doc = createSketchMotif("emit-1", "Title");
  const s = emitMotif(doc);
  assert.equal(typeof s, "string");
  assert.ok(s.endsWith("\n"));
  const again = loadMotif(s);
  assert.equal(again.id, "emit-1");
});

/**
 * Full edit cycle on sketch: add → update → reorder → remove → emit →
 * shared-schema validate → load. Drives shipped edit ops + validate-motif Ajv.
 */
test("sketch: add/update/remove/reorder → emit → schema validate → load", () => {
  let doc = createSketchMotif("motif-edit-sketch", "Edit cycle sketch");
  doc = addItem(doc, { id: "i1", symbol: "walk" });
  doc = addItem(doc, { id: "i2", symbol: "turn" });
  doc = addItem(doc, { id: "i3", symbol: "stillness" });
  assert.equal(doc.items.length, 3);
  assert.equal(doc.items[0].order, 0);
  assert.equal(doc.items[2].order, 2);

  doc = updateItem(doc, "i2", { symbol: "twist", durationHint: "short" });
  assert.equal(doc.items.find((i) => i.id === "i2")?.symbol, "twist");
  assert.equal(doc.items.find((i) => i.id === "i2")?.durationHint, "short");

  doc = reorderItems(doc, ["i3", "i1", "i2"]);
  assert.deepEqual(
    doc.items.map((i) => i.id),
    ["i3", "i1", "i2"],
  );
  assert.deepEqual(
    doc.items.map((i) => i.order),
    [0, 1, 2],
  );

  doc = removeItem(doc, "i1");
  assert.equal(doc.items.length, 2);
  assert.ok(!doc.items.some((i) => i.id === "i1"));

  const emitted = emitMotif(doc);
  const reloaded = loadMotif(emitted);
  assert.equal(reloaded.id, "motif-edit-sketch");
  assert.equal(reloaded.completeness, "sketch");
  assert.equal(reloaded.profile, "mvei-motif");
  assert.deepEqual(
    reloaded.items.map((i) => i.id),
    ["i3", "i2"],
  );

  const schema = validateMotifAgainstSchema(reloaded);
  assert.equal(schema.ok, true, schema.message);
});

/**
 * Edit cycle on real corpus partial Motif (shared schema, no app-local fork).
 */
test("partial corpus: update/reorder → emit → schema validate → load", () => {
  const raw = readFileSync(CORPUS_PARTIAL_PATH, "utf8");
  let doc = loadMotif(raw);
  assert.equal(doc.completeness, "partial");
  assert.ok(doc.items.length >= 2, "partial corpus should have items");

  const firstId = doc.items[0].id;
  doc = updateItem(doc, firstId, {
    symbol: "balance",
    durationHint: "edited",
  });
  assert.equal(doc.items.find((i) => i.id === firstId)?.symbol, "balance");
  assert.equal(
    doc.items.find((i) => i.id === firstId)?.durationHint,
    "edited",
  );

  const reversed = [...doc.items.map((i) => i.id)].reverse();
  doc = reorderItems(doc, reversed);
  assert.deepEqual(
    doc.items.map((i) => i.id),
    reversed,
  );
  assert.equal(doc.items[0].order, 0);
  assert.equal(doc.items[doc.items.length - 1].order, doc.items.length - 1);

  const emitted = emitMotif(doc);
  const reloaded = loadMotif(emitted);
  assert.equal(reloaded.id, doc.id);
  assert.equal(reloaded.completeness, "partial");
  assert.deepEqual(
    reloaded.items.map((i) => i.id),
    reversed,
  );

  const schema = validateMotifAgainstSchema(reloaded);
  assert.equal(schema.ok, true, schema.message);
});

test("updateItem / removeItem throw when id missing", () => {
  const doc = createSketchMotif("m-miss");
  assert.throws(() => updateItem(doc, "nope", { symbol: "x" }), /not found/);
  assert.throws(() => removeItem(doc, "nope"), /not found/);
});

test("reorderItems rejects non-permutation", () => {
  let doc = createSketchMotif("m-ord");
  doc = addItem(doc, { id: "a", symbol: "walk" });
  doc = addItem(doc, { id: "b", symbol: "turn" });
  assert.throws(() => reorderItems(doc, ["a"]), /length/);
  assert.throws(() => reorderItems(doc, ["a", "a"]), /duplicate/i);
  assert.throws(() => reorderItems(doc, ["a", "missing"]), /not found/);
});
