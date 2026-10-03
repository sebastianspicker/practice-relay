/** Regression proof for hostile Motif summaries and terminal-safe CLI output. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import {
  formatMotifSummary,
  loadMotifDocument,
  neutralizeTerminalScalar,
  summarizeMotif,
} from "../src/reference-reader/index.mjs";

const cliPath = fileURLToPath(new URL("../src/reference-reader/cli.mjs", import.meta.url));

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function verifyHostileSymbolNames() {
  const document = loadMotifDocument(
    JSON.stringify({
      schemaVersion: "0.4.0",
      profile: "mvei-motif",
      id: "hostile-symbol-names",
      items: [
        { id: "step-1", symbol: "step", order: 0 },
        { id: "proto-1", symbol: "__proto__", order: 1 },
        { id: "constructor-1", symbol: "constructor", order: 2 },
        { id: "prototype-1", symbol: "prototype", order: 3 },
        { id: "step-2", symbol: "step", order: 4 },
        { id: "proto-2", symbol: "__proto__", order: 5 },
      ],
    }),
  );

  const { symbols } = summarizeMotif(document);

  requireEqual(Object.getPrototypeOf(symbols), Object.prototype, "prototype");
  requireEqual(
    JSON.stringify(Object.keys(symbols)),
    JSON.stringify(["step", "__proto__", "constructor", "prototype"]),
    "symbol keys",
  );
  requireEqual(symbols.step, 2, "step count");
  requireEqual(symbols.__proto__, 2, "__proto__ count");
  requireEqual(symbols.constructor, 1, "constructor count");
  requireEqual(symbols.prototype, 1, "prototype count");
  requireEqual(
    Object.getOwnPropertyDescriptor(symbols, "__proto__")?.enumerable,
    true,
    "__proto__ enumerability",
  );
  return true;
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function writeFixture(file, document) {
  const script =
    "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[1], process.argv[2]);";
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script, file, JSON.stringify(document)],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
}

function verifyOrdinarySummary() {
  const output = formatMotifSummary({
    id: "motif-42",
    title: "Walking phrase",
    profile: "mvei-motif",
    schemaVersion: "0.4.0",
    completeness: "complete",
    itemCount: 2,
    symbols: { gesture: 1, step: 1 },
    anchorCount: 1,
    musicxmlRef: "score.musicxml",
    meiRef: null,
    annotationLinkCount: 3,
  });
  assert.equal(
    output,
    [
      "MvEI Motif summary (reference-reader · read-only · not engraver · not Workbench)",
      "id:            motif-42",
      "title:         Walking phrase",
      "profile:       mvei-motif",
      "schemaVersion: 0.4.0",
      "completeness:  complete",
      "items:         2",
      "symbols:",
      "  gesture: 1",
      "  step: 1",
      "co-timeline anchors: 1",
      "musicxmlRef:   score.musicxml",
      "meiRef:        -",
      "annotationLinks: 3",
    ].join("\n"),
  );
  assert.equal(output.endsWith("\n"), false);
}

function verifyTerminalScalarNeutralization() {
  assert.equal(
    neutralizeTerminalScalar(
      "\u0000\u0009\u000A\u000D\u001B\u001F\u007F\u0085\u009B\u2028\u2029",
    ),
    "\\u0000\\u0009\\u000A\\u000D\\u001B\\u001F\\u007F\\u0085\\u009B\\u2028\\u2029",
  );
  assert.equal(neutralizeTerminalScalar("café 𐐷 😀"), "café 𐐷 😀");
  assert.equal(
    neutralizeTerminalScalar("before\uD800after\uDC00"),
    "before\\uD800after\\uDC00",
  );
}

function verifyHostileScalarFormatting() {
  const output = formatMotifSummary({
    id: "id\r\nforged",
    title: "title\u001B[31m",
    profile: "mvei-motif\u009B",
    schemaVersion: "0.4\u2028x",
    completeness: "complete\u2029",
    itemCount: "5\t",
    symbols: { "z\n": "\u0007", "a\u001B": "\uD800" },
    anchorCount: "1\r",
    musicxmlRef: "music\u007F",
    meiRef: "mei\u0085",
    annotationLinkCount: "2\b",
  });
  assert.equal(
    output,
    [
      "MvEI Motif summary (reference-reader · read-only · not engraver · not Workbench)",
      "id:            id\\u000D\\u000Aforged",
      "title:         title\\u001B[31m",
      "profile:       mvei-motif\\u009B",
      "schemaVersion: 0.4\\u2028x",
      "completeness:  complete\\u2029",
      "items:         5\\u0009",
      "symbols:",
      "  a\\u001B: \\uD800",
      "  z\\u000A: \\u0007",
      "co-timeline anchors: 1\\u000D",
      "musicxmlRef:   music\\u007F",
      "meiRef:        mei\\u0085",
      "annotationLinks: 2\\u0008",
    ].join("\n"),
  );
  assert.equal(output.split("\n").length, 14);
  assert.equal(output.includes("\r"), false);
  assert.equal(output.includes("\u001B"), false);
  assert.equal(output.includes("\u009B"), false);
  assert.equal(output.includes("\u2028"), false);
  assert.equal(output.includes("\u2029"), false);
}

function verifyCliSuccessOutput() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "movement-toolkit-reference-reader-"));
  try {
    const ordinaryPath = join(temporaryDirectory, "ordinary.json");
    writeFixture(ordinaryPath, {
        schemaVersion: "0.4.0",
        profile: "mvei-motif",
        id: "ordinary",
        title: "Ordinary title",
        completeness: "complete",
        items: [{ id: "step-1", symbol: "step", order: 0 }],
    });
    const ordinaryResult = runCli([ordinaryPath]);
    assert.equal(ordinaryResult.status, 0);
    assert.equal(ordinaryResult.stderr, "");
    assert.equal(
      ordinaryResult.stdout,
      [
        "MvEI Motif summary (reference-reader · read-only · not engraver · not Workbench)",
        "id:            ordinary",
        "title:         Ordinary title",
        "profile:       mvei-motif",
        "schemaVersion: 0.4.0",
        "completeness:  complete",
        "items:         1",
        "symbols:",
        "  step: 1",
        "co-timeline anchors: 0",
        "musicxmlRef:   -",
        "meiRef:        -",
        "annotationLinks: 0",
        "",
      ].join("\n"),
    );

    const hostilePath = join(temporaryDirectory, "hostile.json");
    writeFixture(hostilePath, {
        schemaVersion: "0.4\u2028x",
        profile: "mvei-motif",
        id: "id\r\nforged",
        title: "title\u001B[31m",
        completeness: "complete\u2029",
        items: [
          { id: "step-1", symbol: "z\n", order: 0 },
          { id: "step-2", symbol: "a\u001B", order: 1 },
        ],
        musicCoTimeline: {
          anchors: [{}],
          musicxmlRef: "music\u007F",
          meiRef: "mei\u0085",
        },
        annotationLinks: [{}],
    });
    const hostileResult = runCli([hostilePath]);
    assert.equal(hostileResult.status, 0);
    assert.equal(hostileResult.stderr, "");
    assert.equal(
      hostileResult.stdout,
      [
        "MvEI Motif summary (reference-reader · read-only · not engraver · not Workbench)",
        "id:            id\\u000D\\u000Aforged",
        "title:         title\\u001B[31m",
        "profile:       mvei-motif",
        "schemaVersion: 0.4\\u2028x",
        "completeness:  complete\\u2029",
        "items:         2",
        "symbols:",
        "  a\\u001B: 1",
        "  z\\u000A: 1",
        "co-timeline anchors: 1",
        "musicxmlRef:   music\\u007F",
        "meiRef:        mei\\u0085",
        "annotationLinks: 1",
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function verifyCliUsageAndMissingFile() {
  const missingArgumentResult = runCli([]);
  assert.equal(missingArgumentResult.status, 2);
  assert.equal(missingArgumentResult.stdout, "");
  assert.equal(
    missingArgumentResult.stderr,
    "Usage: mvei-reference-read <motif.json>\n",
  );

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "movement-toolkit-reference-reader-"));
  try {
    const missingPath = join(temporaryDirectory, "missing-\r\n\u001B[31m.json");
    const missingFileResult = runCli([missingPath]);
    assert.equal(missingFileResult.status, 1);
    assert.equal(missingFileResult.stdout, "");
    assert.equal(
      missingFileResult.stderr,
      `ENOENT: no such file or directory, open '${neutralizeTerminalScalar(missingPath)}'\n`,
    );
    assert.equal(missingFileResult.stderr.split("\n").length, 2);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

test("reference reader preserves hostile symbol keys", verifyHostileSymbolNames);
test("reference reader formats ordinary summaries", verifyOrdinarySummary);
test("reference reader neutralizes terminal control scalars", verifyTerminalScalarNeutralization);
test("reference reader formats hostile scalars safely", verifyHostileScalarFormatting);
test("mvei-reference-read prints a safe summary", verifyCliSuccessOutput);
test("mvei-reference-read reports usage and missing files", verifyCliUsageAndMissingFile);
