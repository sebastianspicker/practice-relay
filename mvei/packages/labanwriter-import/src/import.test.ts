/**
 * Tests - import.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importLabanWriterIntermediate } from "./index.ts";
import { validateMveiDocument } from "../../validator/src/cli.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../fixtures");

describe("labanwriter-import", () => {
  it("imports intermediate fixtures (incl. multi-column 03) to valid laban-subset", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lw-"));
    try {
      for (const name of [
        "lw-intermediate-01.json",
        "lw-intermediate-02.json",
        "lw-intermediate-03.json",
        "lw-intermediate-04.json",
        "lw-intermediate-05.json",
      ]) {
        const raw = JSON.parse(readFileSync(join(fixtures, name), "utf8"));
        const { document, warnings } = importLabanWriterIntermediate(raw);
        assert.equal(document.profile, "mvei-laban-subset");
        assert.ok(document.symbols.length >= 1);
        assert.ok(warnings.length >= 1);
        const out = path.join(dir, name);
        writeFileSync(out, JSON.stringify(document, null, 2));
        const result = validateMveiDocument(out);
        assert.equal(result.ok, true, result.message);
      }
      const dense = JSON.parse(
        readFileSync(join(fixtures, "lw-intermediate-03.json"), "utf8"),
      );
      const { document } = importLabanWriterIntermediate(dense);
      assert.ok(document.symbols.length >= 8);
      assert.ok(document.staff?.columns?.includes("arm_left"));
      assert.ok(document.staff?.columns?.includes("head"));
      const gradual = JSON.parse(
        readFileSync(join(fixtures, "lw-intermediate-04.json"), "utf8"),
      );
      const gradualDoc = importLabanWriterIntermediate(gradual).document;
      assert.ok(gradualDoc.symbols.length >= 10);
      assert.ok(gradualDoc.measures.length >= 5);
      const denser = JSON.parse(
        readFileSync(join(fixtures, "lw-intermediate-05.json"), "utf8"),
      );
      const denserDoc = importLabanWriterIntermediate(denser).document;
      assert.ok(denserDoc.symbols.length >= 20);
      assert.ok(denserDoc.measures.length >= 8);
      assert.ok(denserDoc.staff?.columns?.includes("leg_left"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed roots and required arrays with controlled errors", () => {
    for (const [input, expected] of [
      [null, /root must be a non-null JSON object/i],
      [{}, /schemaVersion/i],
      [
        {
          schemaVersion: "0.2.0-lw-intermediate",
          source: "labanwriter-intermediate",
          id: " ",
          measures: [],
          cells: [],
        },
        /id must be a non-empty string/i,
      ],
      [
        {
          schemaVersion: "0.2.0-lw-intermediate",
          source: "labanwriter-intermediate",
          id: "x",
          measures: {},
          cells: [],
        },
        /measures must be an array/i,
      ],
      [
        {
          schemaVersion: "0.2.0-lw-intermediate",
          source: "labanwriter-intermediate",
          id: "x",
          measures: [],
          cells: {},
        },
        /cells must be an array/i,
      ],
    ] as const) {
      assert.throws(
        () => importLabanWriterIntermediate(input),
        (error: unknown) => error instanceof TypeError && expected.test(error.message),
      );
    }
  });

  it("rejects malformed measure and cell primitives before mapping", () => {
    const base = {
      schemaVersion: "0.2.0-lw-intermediate",
      source: "labanwriter-intermediate",
      id: "lw-runtime-check",
      measures: [{ id: "m0", index: 0 }],
      cells: [
        { id: "c0", column: "body", measureId: "m0", symbolHint: "stillness" },
      ],
    };
    for (const [input, expected] of [
      [{ ...base, measures: [{ id: "m0", index: Number.NaN }] }, /measures\[0\]\.index/i],
      [{ ...base, cells: [{ ...base.cells[0], id: null }] }, /cells\[0\]\.id/i],
      [{ ...base, cells: [{ ...base.cells[0], column: 3 }] }, /cells\[0\]\.column/i],
      [{ ...base, cells: [{ ...base.cells[0], measureId: null }] }, /cells\[0\]\.measureId/i],
      [{ ...base, cells: [{ ...base.cells[0], symbolHint: false }] }, /cells\[0\]\.symbolHint/i],
      [
        {
          ...base,
          cells: [
            { ...base.cells[0], durationBeats: Number.POSITIVE_INFINITY },
          ],
        },
        /durationBeats/i,
      ],
    ] as const) {
      assert.throws(
        () => importLabanWriterIntermediate(input),
        (error: unknown) => error instanceof TypeError && expected.test(error.message),
      );
    }
  });

  it("CLI reports invalid input without emitting a malformed document", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lw-cli-"));
    try {
      const input = path.join(dir, "invalid.json");
      writeFileSync(input, "{}");
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", join(here, "cli.ts"), input],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ERROR: Invalid LabanWriter intermediate: schemaVersion/i,
      );
      assert.doesNotMatch(result.stderr, /\n\s*at\s/);
      assert.equal(result.stdout, "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
