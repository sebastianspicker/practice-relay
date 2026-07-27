/**
 * Tests - export.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  exportRecord,
  parseEafTierIds,
  describeExport,
  importEafToRecordParts,
  importOtioToRecordParts,
  buildOscDeepLinkProjection,
} from "../src/index.ts";
import { interopSample as sample } from "./fixtures.ts";

describe("interop-io exporters", () => {
  it("describeExport", () => {
    assert.match(
      describeExport({ workRecordId: "ps", format: "otio-json" }),
      /otio-json/,
    );
  });

  it("exports OTIO JSON with tracks", () => {
    const r = exportRecord(sample, "otio-json");
    const j = JSON.parse(r.body);
    assert.equal(j.OTIO_SCHEMA, "Timeline.1");
    assert.equal(j.metadata.workRecordId, "ps-io");
    assert.ok(j.tracks.children.length >= 3);
  });

  it("exports EAF with region and comment tiers", () => {
    const r = exportRecord(sample, "eaf");
    assert.match(r.body, /ANNOTATION_DOCUMENT/);
    const tiers = parseEafTierIds(r.body);
    assert.ok(tiers.includes("regions"));
    assert.ok(tiers.includes("comments"));
  });

  it("exports OSC cue map", () => {
    const r = exportRecord(sample, "osc-cue-map");
    const j = JSON.parse(r.body);
    assert.equal(j.kind, "practice-relay-osc-cue-map");
    assert.ok(j.cues.length >= 2);
  });

  it("exports musicxml-ref binding", () => {
    const r = exportRecord(sample, "musicxml-ref");
    const j = JSON.parse(r.body);
    assert.equal(j.musicxmlRef, "score.musicxml");
  });

  it("EAF round-trip import yields non-empty regions and comments", () => {
    const eaf = exportRecord(sample, "eaf").body;
    const parts = importEafToRecordParts(eaf);
    assert.ok(parts.regions.length >= 2, "expected imported regions");
    assert.ok(parts.comments.length >= 1, "expected imported comments");
    assert.ok(parts.regions[0]!.endMs > parts.regions[0]!.startMs);
    assert.match(parts.comments[0]!.body, /Watch timing|timing/i);
    assert.ok(Array.isArray(parts.warnings));
  });

  it("OTIO round-trip import yields tracks and takes", () => {
    const otio = exportRecord(sample, "otio-json").body;
    const parts = importOtioToRecordParts(otio);
    assert.ok(parts.tracks.length >= 3);
    assert.ok(parts.takes.length >= 1);
    assert.equal(parts.workRecordId, "ps-io");
    assert.ok(parts.durationMs > 0);
    assert.ok(Array.isArray(parts.warnings));
  });

  it("converts RationalTime frame durations to milliseconds", () => {
    for (const rate of [24, 25, 30]) {
      const parts = importOtioToRecordParts({
        tracks: {
          children: [
            {
              name: `${rate}fps`,
              children: [
                {
                  OTIO_SCHEMA: "Clip.1",
                  source_range: { duration: { value: rate * 10, rate } },
                },
              ],
            },
          ],
        },
      });
      assert.equal(parts.durationMs, 10_000, `${rate}fps duration`);
    }
  });

  it("ignores invalid RationalTime rates instead of inventing a duration", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const parts = importOtioToRecordParts({
        tracks: {
          children: [
            {
              children: [
                {
                  OTIO_SCHEMA: "Clip.1",
                  source_range: { duration: { value: 240, rate } },
                },
              ],
            },
          ],
        },
      });
      assert.equal(parts.durationMs, 0, `invalid rate ${String(rate)}`);
    }
  });

  it("rejects deeply nested OTIO input without recursive stack overflow", () => {
    const depth = 15_000;
    const otio = `${'{"child":'.repeat(depth)}null${"}".repeat(depth)}`;
    assert.throws(
      () => importOtioToRecordParts(otio),
      /OTIO input exceeds maximum nesting depth/,
    );
  });

  it("rejects EAF with excessive tier work", () => {
    const eaf = `<ANNOTATION_DOCUMENT>${"<TIER TIER_ID=\"extra\"></TIER>".repeat(257)}</ANNOTATION_DOCUMENT>`;
    assert.throws(
      () => importEafToRecordParts(eaf),
      /EAF input exceeds maximum tiers/,
    );
  });

  it("OSC deep-link projection is a multi-asset WorkRecord projection", () => {
    const proj = buildOscDeepLinkProjection(sample);
    assert.equal(proj.kind, "practice-relay-osc-deep-link");
    assert.match(proj.note, /Practice Relay is not the runtime/i);
    assert.ok(proj.endpoints.length >= 2);
    assert.ok(Array.isArray(proj.cues));
  });
});
