/** Source-level tests for the loss-aware open-intermediate importer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { importLabanWriterIntermediate } from "../src/labanwriter-import/index.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/labanwriter-import/lw-intermediate-01.json", import.meta.url),
);

test("LabanWriter fixture retains provenance and mapped movement fields", () => {
  const imported = importLabanWriterIntermediate(
    JSON.parse(readFileSync(fixturePath, "utf8")),
  );
  assert.equal(imported.document.profile, "mvei-laban-subset");
  assert.equal(imported.document.symbols[0]?.motifSymbol, "walk");
  assert.deepEqual(imported.document.staff?.columns, [
    "support_right",
    "support_left",
  ]);
  assert.ok(imported.warnings.includes("Imported via open intermediate - not binary .lw parse"));
  assert.equal(imported.document.migrationProvenance?.warnings, imported.warnings);
});

test("LabanWriter import reports defaults and rejects unsupported vocabulary", () => {
  const imported = importLabanWriterIntermediate({
    schemaVersion: "0.2.0-lw-intermediate",
    source: "labanwriter-intermediate",
    id: "defaults",
    measures: [],
    cells: [{
      id: "cell",
      column: "body",
      measureId: "m0",
      symbolHint: "path",
    }],
  });
  assert.deepEqual(imported.document.measures, [{ id: "m0", index: 0, beats: 4 }]);
  assert.equal(imported.document.symbols[0]?.direction, "place");
  assert.ok(imported.warnings.some((warning) => warning.includes("missing direction")));
  assert.throws(
    () => importLabanWriterIntermediate({
      schemaVersion: "0.2.0-lw-intermediate",
      source: "labanwriter-intermediate",
      id: "invalid",
      measures: [],
      cells: [{
        id: "cell",
        column: "unsupported",
        measureId: "m0",
        symbolHint: "path",
      }],
    }),
    /cells\[0\]\.column is not supported/,
  );
});
