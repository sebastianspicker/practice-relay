/**
 * Golden / field-fixture tests for lossy ELAN + OTIO import.
 * Asserts stable ImportWarningCode values (LOSS-TAXONOMY.md).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  exportRecord,
  importEafToRecordParts,
  importOtioToRecordParts,
  warningCodes,
  formatImportWarning,
  type ImportWarningCode,
} from "../src/index.ts";
import { interopSample as sample } from "./fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../fixtures");
const partnerLabDir = join(here, "../../../fixtures/partner-lab");

function hasCode(
  codes: ImportWarningCode[],
  code: ImportWarningCode,
): boolean {
  return codes.includes(code);
}

describe("field ELAN/OTIO fidelity", () => {
  it("imports sample-field.eaf with UNKNOWN_TIER + MISSING_MEDIA codes", () => {
    const eaf = readFileSync(join(fixturesDir, "sample-field.eaf"), "utf8");
    const parts = importEafToRecordParts(eaf);

    assert.ok(parts.regions.length >= 3, "expected field regions");
    assert.ok(parts.comments.length >= 2, "expected field comments");
    assert.ok(Array.isArray(parts.warnings), "warnings array required");

    const codes = warningCodes(parts.warnings);
    assert.ok(hasCode(codes, "UNKNOWN_TIER"), `codes: ${codes.join(",")}`);
    assert.ok(hasCode(codes, "MISSING_MEDIA"), `codes: ${codes.join(",")}`);
    assert.equal(parts.regions[0]!.label, "warmup");
    assert.match(parts.comments[0]!.body, /alignment|downbeat/i);

    for (const w of parts.warnings) {
      assert.match(formatImportWarning(w), /^\[/);
    }
  });

  it("imports sample-nle.otio.json with OTIO loss codes", () => {
    const otio = readFileSync(
      join(fixturesDir, "sample-nle.otio.json"),
      "utf8",
    );
    const parts = importOtioToRecordParts(otio);

    assert.ok(parts.tracks.length >= 2, "expected NLE tracks");
    assert.ok(parts.takes.length >= 1, "expected at least one media take");
    assert.ok(parts.durationMs >= 12000);
    assert.equal(parts.workRecordId, "field-nle-01");

    const codes = warningCodes(parts.warnings);
    assert.ok(
      hasCode(codes, "UNSUPPORTED_OTIO_NODE"),
      `expected UNSUPPORTED_OTIO_NODE, got: ${codes.join(",")}`,
    );
    assert.ok(
      hasCode(codes, "MISSING_MEDIA"),
      `expected MISSING_MEDIA, got: ${codes.join(",")}`,
    );
    assert.ok(
      hasCode(codes, "GAP_SKIPPED"),
      `expected GAP_SKIPPED, got: ${codes.join(",")}`,
    );
    assert.ok(
      hasCode(codes, "TRANSITION_SKIPPED"),
      `expected TRANSITION_SKIPPED, got: ${codes.join(",")}`,
    );
    assert.ok(
      hasCode(codes, "MARKERS_NOT_IMPORTED"),
      `expected MARKERS_NOT_IMPORTED, got: ${codes.join(",")}`,
    );
  });

  it("imports partner-lab ELAN with richer loss codes", () => {
    const eaf = readFileSync(
      join(partnerLabDir, "partner-session.eaf"),
      "utf8",
    );
    const parts = importEafToRecordParts(eaf);
    const codes = warningCodes(parts.warnings);

    assert.ok(parts.regions.length >= 4, "entrance, duet-core, exit, bow");
    // Multiple unknown partner tiers: effort_weight, camera_notes, gesture_path, speaker_id, space_level
    const unknownTier = parts.warnings.filter((w) => w.code === "UNKNOWN_TIER");
    assert.ok(
      unknownTier.length >= 5,
      `expected ≥5 UNKNOWN_TIER, got ${unknownTier.length}: ${codes.join(",")}`,
    );
    assert.ok(
      unknownTier.some((w) => w.path === "gesture_path"),
      "gesture_path unknown tier",
    );
    assert.ok(
      unknownTier.some((w) => w.path === "speaker_id"),
      "speaker_id unknown tier",
    );
    assert.ok(hasCode(codes, "UNKNOWN_TIER"), codes.join(","));
    assert.ok(hasCode(codes, "MISSING_MEDIA"), codes.join(","));
    assert.ok(hasCode(codes, "EMPTY_ANNOTATION"), codes.join(","));
    assert.ok(hasCode(codes, "ORPHAN_COMMENT"), codes.join(","));
    assert.ok(hasCode(codes, "MISSING_TIME_SLOT"), codes.join(","));
  });

  it("imports partner-lab OTIO with NLE loss codes", () => {
    const otio = readFileSync(
      join(partnerLabDir, "partner-nle.otio.json"),
      "utf8",
    );
    const parts = importOtioToRecordParts(otio);
    const codes = warningCodes(parts.warnings);

    assert.equal(parts.workRecordId, "partner-lab-nle-01");
    assert.ok(parts.tracks.length >= 3);
    // Multiple gaps (Wide breath + black-hold, Boom audio-pad) and transitions
    const gaps = parts.warnings.filter((w) => w.code === "GAP_SKIPPED");
    const transitions = parts.warnings.filter(
      (w) => w.code === "TRANSITION_SKIPPED",
    );
    assert.ok(
      gaps.length >= 2,
      `expected ≥2 GAP_SKIPPED, got ${gaps.length}: ${codes.join(",")}`,
    );
    assert.ok(
      transitions.length >= 2,
      `expected ≥2 TRANSITION_SKIPPED, got ${transitions.length}: ${codes.join(",")}`,
    );
    assert.ok(hasCode(codes, "GAP_SKIPPED"), codes.join(","));
    assert.ok(hasCode(codes, "TRANSITION_SKIPPED"), codes.join(","));
    assert.ok(hasCode(codes, "UNSUPPORTED_OTIO_NODE"), codes.join(","));
    assert.ok(hasCode(codes, "MISSING_MEDIA"), codes.join(","));
    assert.ok(hasCode(codes, "MARKERS_NOT_IMPORTED"), codes.join(","));
  });

  it("round-trip EAF (our export shape) keeps regions/comments; MISSING_MEDIA code", () => {
    const eaf = exportRecord(sample, "eaf").body;
    const parts = importEafToRecordParts(eaf);
    assert.ok(parts.regions.length >= 2);
    assert.ok(parts.comments.length >= 1);
    const codes = warningCodes(parts.warnings);
    // Our export has empty MEDIA_FILE → missing-media warning is expected
    assert.ok(hasCode(codes, "MISSING_MEDIA"), codes.join(","));
  });

  it("round-trip OTIO (our export shape) keeps tracks/takes; MARKERS_NOT_IMPORTED", () => {
    const otio = exportRecord(sample, "otio-json").body;
    const parts = importOtioToRecordParts(otio);
    assert.ok(parts.tracks.length >= 3);
    assert.ok(parts.takes.length >= 1);
    assert.equal(parts.workRecordId, "ps-io");
    const codes = warningCodes(parts.warnings);
    assert.ok(hasCode(codes, "MARKERS_NOT_IMPORTED"), codes.join(","));
  });

  it("retains LIFO order for unsupported schemas nested in records and arrays", () => {
    const parts = importOtioToRecordParts({
      first: { OTIO_SCHEMA: "FirstUnsupported.1" },
      nested: [
        { OTIO_SCHEMA: "ArrayFirstUnsupported.1" },
        { OTIO_SCHEMA: "ArrayLastUnsupported.1" },
      ],
    });
    const schemas = parts.warnings
      .filter((warning) => warning.code === "UNSUPPORTED_OTIO_NODE")
      .map((warning) => warning.path);

    assert.deepEqual(schemas, [
      "ArrayLastUnsupported.1",
      "ArrayFirstUnsupported.1",
      "FirstUnsupported.1",
    ]);
  });

  it("deduplicates cyclic OTIO nodes without recursive traversal", () => {
    const otio: Record<string, unknown> = { OTIO_SCHEMA: "CycleUnsupported.1" };
    otio.self = otio;

    const parts = importOtioToRecordParts(otio);
    const schemas = parts.warnings
      .filter((warning) => warning.code === "UNSUPPORTED_OTIO_NODE")
      .map((warning) => warning.path);

    assert.deepEqual(schemas, ["CycleUnsupported.1"]);
  });

  it("rejects exactly 100001 visited OTIO nodes", () => {
    const otio = Array<unknown>(100_000).fill(null);

    assert.throws(
      () => importOtioToRecordParts(otio),
      /OTIO input exceeds maximum nodes \(100000\)/,
    );
  });

  it("retains HEAD compacted comment indexes after blank EAF annotations", () => {
    const parts = importEafToRecordParts(`
      <ANNOTATION_DOCUMENT>
        <TIME_ORDER>
          <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
          <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="100" />
          <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="200" />
          <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="300" />
          <TIME_SLOT TIME_SLOT_ID="ts5" TIME_VALUE="220" />
          <TIME_SLOT TIME_SLOT_ID="ts6" TIME_VALUE="280" />
          <TIME_SLOT TIME_SLOT_ID="ts7" TIME_VALUE="400" />
          <TIME_SLOT TIME_SLOT_ID="ts8" TIME_VALUE="500" />
          <TIME_SLOT TIME_SLOT_ID="ts9" TIME_VALUE="600" />
          <TIME_SLOT TIME_SLOT_ID="ts10" TIME_VALUE="700" />
          <TIME_SLOT TIME_SLOT_ID="ts11" TIME_VALUE="800" />
          <TIME_SLOT TIME_SLOT_ID="ts12" TIME_VALUE="900" />
        </TIME_ORDER>
        <TIER TIER_ID="regions">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-a" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>A</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-b" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4"><ANNOTATION_VALUE>B</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="comments">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-filtered-a" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE> </ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-retained-b" TIME_SLOT_REF1="ts5" TIME_SLOT_REF2="ts6"><ANNOTATION_VALUE>retained B</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-filtered-orphan" TIME_SLOT_REF1="ts7" TIME_SLOT_REF2="ts8"><ANNOTATION_VALUE> </ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-orphan-one" TIME_SLOT_REF1="ts9" TIME_SLOT_REF2="ts10"><ANNOTATION_VALUE>orphan one</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-orphan-two" TIME_SLOT_REF1="ts11" TIME_SLOT_REF2="ts12"><ANNOTATION_VALUE>orphan two</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
      </ANNOTATION_DOCUMENT>
    `);

    assert.deepEqual(
      parts.comments.map(({ id, regionId, authorId, body }) => ({
        id,
        regionId,
        authorId,
        body,
      })),
      [
        {
          id: "c-retained-b",
          regionId: "r-a",
          authorId: "imported",
          body: "retained B",
        },
        {
          id: "c-orphan-one",
          regionId: "r-b",
          authorId: "imported",
          body: "orphan one",
        },
        {
          id: "c-orphan-two",
          regionId: "r-import-2",
          authorId: "imported",
          body: "orphan two",
        },
      ],
    );
    assert.deepEqual(
      parts.warnings.map(({ code, path }) => ({ code, path })),
      [
        { code: "MISSING_MEDIA", path: undefined },
        { code: "EMPTY_ANNOTATION", path: "c-filtered-a" },
        { code: "EMPTY_ANNOTATION", path: "c-filtered-orphan" },
        { code: "ORPHAN_COMMENT", path: "c-orphan-two" },
      ],
    );
  });

  it("keeps the first duplicate exact region and inclusive overlap endpoint", () => {
    const parts = importEafToRecordParts(`
      <ANNOTATION_DOCUMENT><TIME_ORDER>
        <TIME_SLOT TIME_SLOT_ID="ts0" TIME_VALUE="0" />
        <TIME_SLOT TIME_SLOT_ID="ts50" TIME_VALUE="50" />
        <TIME_SLOT TIME_SLOT_ID="ts100" TIME_VALUE="100" />
      </TIME_ORDER><TIER TIER_ID="regions">
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-first" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>first</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-second" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>second</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
      </TIER><TIER TIER_ID="comments">
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-exact" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>exact</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-inclusive" TIME_SLOT_REF1="ts50" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>inclusive</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
      </TIER></ANNOTATION_DOCUMENT>
    `);

    assert.deepEqual(
      parts.comments.map(({ id, regionId }) => ({ id, regionId })),
      [
        { id: "c-exact", regionId: "r-first" },
        { id: "c-inclusive", regionId: "r-first" },
      ],
    );
  });

  it("rejects the 10001st EAF annotation", () => {
    const annotation =
      '<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-limit" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>value</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>';
    const eaf = `<ANNOTATION_DOCUMENT><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" /><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1" /></TIME_ORDER><TIER TIER_ID="regions">${annotation.repeat(10_001)}</TIER></ANNOTATION_DOCUMENT>`;

    assert.throws(
      () => importEafToRecordParts(eaf),
      /EAF input exceeds maximum annotations \(10000\)/,
    );
  });

  it("accepts exactly 10000 EAF annotations", () => {
    const annotation =
      '<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-limit" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>value</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>';
    const eaf = `<ANNOTATION_DOCUMENT><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" /><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1" /></TIME_ORDER><TIER TIER_ID="regions">${annotation.repeat(10_000)}</TIER></ANNOTATION_DOCUMENT>`;

    assert.equal(importEafToRecordParts(eaf).regions.length, 10_000);
  });

  it("shares the annotation limit across region and comment tiers", () => {
    const region =
      '<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-region" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>region</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>';
    const comment =
      '<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a-comment" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>comment</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>';
    const eaf = `<ANNOTATION_DOCUMENT><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" /><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1" /></TIME_ORDER><TIER TIER_ID="regions">${region.repeat(5_000)}</TIER><TIER TIER_ID="comments">${comment.repeat(5_001)}</TIER></ANNOTATION_DOCUMENT>`;

    assert.throws(
      () => importEafToRecordParts(eaf),
      /EAF input exceeds maximum annotations \(10000\)/,
    );
  });

  it("emits ordered preflight warnings before an empty-document warning", () => {
    const parts = importEafToRecordParts(
      '<ANNOTATION_DOCUMENT><TIER TIER_ID="ignored-first"></TIER><TIER TIER_ID="regions"></TIER><TIER TIER_ID="ignored-second"></TIER></ANNOTATION_DOCUMENT>',
    );

    assert.deepEqual(
      parts.warnings.map(({ code, path }) => ({ code, path })),
      [
        { code: "UNKNOWN_TIER", path: "ignored-first" },
        { code: "UNKNOWN_TIER", path: "ignored-second" },
        { code: "MISSING_MEDIA", path: undefined },
        { code: "EMPTY_DOCUMENT", path: undefined },
      ],
    );
  });

  it("keeps nested, equal-start, and empty-region overlap associations", () => {
    const documentFor = (regions: string) => `
      <ANNOTATION_DOCUMENT><TIME_ORDER>
        <TIME_SLOT TIME_SLOT_ID="ts0" TIME_VALUE="0" />
        <TIME_SLOT TIME_SLOT_ID="ts25" TIME_VALUE="25" />
        <TIME_SLOT TIME_SLOT_ID="ts30" TIME_VALUE="30" />
        <TIME_SLOT TIME_SLOT_ID="ts60" TIME_VALUE="60" />
        <TIME_SLOT TIME_SLOT_ID="ts75" TIME_VALUE="75" />
        <TIME_SLOT TIME_SLOT_ID="ts90" TIME_VALUE="90" />
        <TIME_SLOT TIME_SLOT_ID="ts100" TIME_VALUE="100" />
      </TIME_ORDER><TIER TIER_ID="regions">${regions}</TIER><TIER TIER_ID="comments">
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="c-check" TIME_SLOT_REF1="ts30" TIME_SLOT_REF2="ts60"><ANNOTATION_VALUE>check</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
      </TIER></ANNOTATION_DOCUMENT>`;
    const annotation = (id: string, start: string, end: string) =>
      `<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="${id}" TIME_SLOT_REF1="${start}" TIME_SLOT_REF2="${end}"><ANNOTATION_VALUE>${id}</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>`;
    const cases = [
      {
        name: "nested",
        regions:
          annotation("a-reg-outer", "ts0", "ts100") +
          annotation("a-reg-inner", "ts25", "ts75"),
        regionId: "r-outer",
        orphan: false,
      },
      {
        name: "equal-start",
        regions:
          annotation("a-reg-first", "ts0", "ts100") +
          annotation("a-reg-second", "ts0", "ts90"),
        regionId: "r-first",
        orphan: false,
      },
      { name: "empty", regions: "", regionId: "r-import-0", orphan: true },
    ];

    for (const testCase of cases) {
      const parts = importEafToRecordParts(documentFor(testCase.regions));
      assert.equal(parts.comments[0]!.regionId, testCase.regionId, testCase.name);
      assert.equal(
        parts.warnings.some((warning) => warning.code === "ORPHAN_COMMENT"),
        testCase.orphan,
        testCase.name,
      );
    }
  });
});
