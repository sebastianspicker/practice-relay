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
});
