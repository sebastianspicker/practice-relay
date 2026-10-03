/** Source-level tests for the loss-aware open-intermediate importer. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

test("LabanWriter CLI neutralizes terminal controls without changing provenance", () => {
  const directory = mkdtempSync(join(tmpdir(), "labanwriter-terminal-"));
  const input = join(directory, "input.json");
  const note = "note\n\u001B]52;c;clipboard\u0007";
  const cellId = "cell\u001B[31m";
  const document = {
    schemaVersion: "0.2.0-lw-intermediate",
    source: "labanwriter-intermediate",
    id: "terminal-controls",
    notes: [note],
    measures: [],
    cells: [{
      id: cellId,
      column: "body",
      measureId: "m0",
      symbolHint: "path",
    }],
  };
  writeFileSync(input, JSON.stringify(document), "utf8");
  try {
    const cli = fileURLToPath(
      new URL("../src/labanwriter-import/cli.ts", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cli, input],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr.includes("\u001B"), false);
    assert.match(result.stderr, /note\\u000A\\u001B\]52;c;clipboard\\u0007/u);
    assert.match(result.stderr, /cell\\u001B\[31m/u);
    const emitted = JSON.parse(result.stdout);
    assert.equal(emitted.migrationProvenance.warnings[0], note);
    assert.equal(emitted.symbols[0].id, cellId);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
