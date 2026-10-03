/** Regression coverage for Motif-to-Laban subset mapping safety and fidelity. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  motifToLabanSubset,
  type LabanSubsetSymbol,
  type UnvalidatedMotifDocument,
} from "../src/index.ts";

test("Motif conversion keeps fixed mappings and safely falls back for unknown symbols", () => {
  const symbols = [
    "effort_strong",
    "effort_light",
    "phrase_begin",
    "phrase_end",
    "turn",
    "twist",
    "stillness",
    "balance",
    "ordinary_unknown",
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "gesture_unknown",
    "walk",
    "run",
    "walk",
  ];
  const doc: UnvalidatedMotifDocument = {
    schemaVersion: "0.2.0",
    profile: "mvei-motif",
    id: "safe-fallbacks",
    completeness: "partial",
    items: symbols.map((symbol, order) => ({ id: `item-${order}`, symbol, order })),
  };

  const result = motifToLabanSubset(doc);
  const byMotifSymbol = new Map<string, LabanSubsetSymbol>(
    result.symbols.map((mapped) => [mapped.motifSymbol!, mapped]),
  );
  const mappingShape = (symbol: string) => {
    const mapped = byMotifSymbol.get(symbol)!;
    return {
      kind: mapped.kind,
      column: mapped.column,
      direction: mapped.direction,
      level: mapped.level,
    };
  };
  const warningsFor = (id: string) =>
    result.migrationProvenance!.warnings!.filter((warning) => warning.startsWith(`${id}:`));

  assert.deepEqual(mappingShape("effort_strong"), { kind: "level", column: "body", direction: "place", level: "high" });
  assert.deepEqual(mappingShape("effort_light"), { kind: "level", column: "body", direction: "place", level: "low" });
  assert.deepEqual(mappingShape("phrase_begin"), { kind: "stillness", column: "body", direction: "place", level: "middle" });
  assert.deepEqual(mappingShape("phrase_end"), { kind: "stillness", column: "body", direction: "place", level: "middle" });
  assert.deepEqual(mappingShape("turn"), { kind: "turn", column: "body", direction: "right", level: "middle" });
  assert.deepEqual(mappingShape("twist"), { kind: "turn", column: "body", direction: "left", level: "middle" });
  assert.deepEqual(mappingShape("stillness"), { kind: "stillness", column: "body", direction: "place", level: "middle" });
  assert.deepEqual(mappingShape("balance"), { kind: "stillness", column: "body", direction: "place", level: "middle" });

  const fallback = mappingShape("ordinary_unknown");
  for (const specialSymbol of ["__proto__", "constructor", "prototype", "toString"]) {
    assert.deepEqual(mappingShape(specialSymbol), fallback);
  }
  assert.deepEqual(warningsFor("item-8"), []);
  assert.deepEqual(warningsFor("item-9"), []);
  assert.deepEqual(warningsFor("item-10"), []);
  assert.deepEqual(warningsFor("item-11"), []);
  assert.deepEqual(warningsFor("item-12"), []);

  assert.deepEqual(mappingShape("gesture_unknown"), { kind: "gesture", column: "arm_right", direction: "place", level: "middle" });
  assert.deepEqual(
    result.symbols.slice(-3).map((mapped) => mapped.column),
    ["support_right", "support_left", "support_right"],
  );
});

test("typed and browser consumers use the same projection implementation", async () => {
  const browser = await import("../browser/transforms.mjs");
  assert.equal(browser.motifToLabanSubset, motifToLabanSubset);
});
