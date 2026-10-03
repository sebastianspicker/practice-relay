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
  projectOscBundle,
  toMaxDict,
  toOssianHint,
} from "../src/projections/index.ts";
import {
  addComment,
  addRegion,
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  createEmptyRecord,
  setPreferredTake,
  type WorkRecord,
} from "@practice-relay/work-record";

const sample = interopSample();

function interopSample(): WorkRecord {
  let record = createEmptyRecord("ps-io", "Interop sample");
  record = {
    ...record,
    spine: { ...record.spine, durationMs: 10_000 },
  };
  record = addTrack(record, { id: "v", type: "video", ref: "media/a.mp4" });
  record = addTrack(record, { id: "m", type: "music_notation", ref: "score.musicxml" });
  record = addTrack(record, { id: "c", type: "media_cues", ref: "cues.json" });
  record = addTake(record, { id: "t1", mediaPath: "media/a.mp4" });
  record = setPreferredTake(record, "t1");
  record = addRegion(record, { id: "r1", startMs: 0, endMs: 2_000, label: "intro" });
  record = addRegion(record, { id: "r2", startMs: 2_000, endMs: 5_000, label: "phrase" });
  record = addComment(record, { id: "c1", regionId: "r1", authorId: "teacher-1", body: "Watch timing", resolved: false });
  return attachUsePolicySnapshot(record, {
    id: "policy-io",
    subjectId: "performer-1",
    purposes: ["course-assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  });
}

function eafWithRegionAnnotations(annotationCount: number): string {
  const annotations = Array.from(
    { length: annotationCount },
    (_, index) =>
      `<ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-${index}" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>Region ${index}</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>`,
  ).join("");
  return `<ANNOTATION_DOCUMENT><HEADER MEDIA_FILE="source.mp4" /><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts0" TIME_VALUE="0" /><TIME_SLOT TIME_SLOT_ID="ts100" TIME_VALUE="100" /></TIME_ORDER><TIER TIER_ID="regions">${annotations}</TIER></ANNOTATION_DOCUMENT>`;
}

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

  it("attaches stable format-specific losses to every public export", () => {
    const exporters = [
      ["otio-json", "OTIO_WORK_RECORD_FIELD_OMISSIONS"],
      ["eaf", "EAF_WORK_RECORD_FIELD_OMISSIONS"],
      ["osc-cue-map", "OSC_CUE_MAP_WORK_RECORD_FIELD_OMISSIONS"],
      ["musicxml-ref", "MUSICXML_REF_WORK_RECORD_FIELD_OMISSIONS"],
    ] as const;

    for (const [format, code] of exporters) {
      const result = exportRecord(sample, format);
      assert.equal(result.format, format);
      assert.deepEqual(result.losses.map((loss) => loss.code), [code]);
      assert.ok(result.losses[0]!.message.length > 0);
      assert.ok(result.losses[0]!.omittedFields.length > 0);
    }

    const otio = exportRecord(sample, "otio-json").losses[0]!;
    assert.deepEqual(otio.omittedFields.slice(0, 6), [
      "schemaVersion", "profile", "revision", "members", "actors", "representedSubjects",
    ]);
    assert.ok(otio.omittedFields.includes("artifacts"));
    assert.ok(otio.omittedFields.includes("usePolicies"));
    assert.ok(otio.omittedFields.includes("spine.markers"));
    assert.ok(otio.omittedFields.includes("tracks[].id"));

    assert.ok(exportRecord(sample, "eaf").losses[0]!.omittedFields.includes("comments[].resolved"));
    assert.ok(exportRecord(sample, "osc-cue-map").losses[0]!.omittedFields.includes("tracks[non-cue]"));
    assert.ok(exportRecord(sample, "musicxml-ref").losses[0]!.omittedFields.includes("tracks[non-music]"));
  });

  it("rejects malformed or export-denied records before a projection is built", () => {
    const malformed = { ...sample, spine: { ...sample.spine, durationMs: -1 } };
    assert.throws(() => exportRecord(malformed, "otio-json"), /invalid WorkRecord/);

    const denied = { ...sample, usePolicySnapshots: [] };
    assert.throws(() => exportRecord(denied, "otio-json"), /export denied: use policy required/);
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
    assert.deepEqual(j.cues[0], {
      tMs: 0,
      address: "/practice-relay/ps-io/region",
      args: ["r1", "intro"],
    });
    assert.ok(j.cues.some((cue: { args: string[] }) => cue.args[0] === "c"));
    assert.ok(!j.cues.some((cue: { args: string[] }) => cue.args[0] === "v"));
    assert.ok(!j.cues.some((cue: { address: string }) => cue.address.endsWith("/preferred_take")));
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

  it("binds a populated overlapping comment using its original annotation index", () => {
    const parts = importEafToRecordParts(`
      <ANNOTATION_DOCUMENT>
        <HEADER MEDIA_FILE="source.mp4" />
        <TIME_ORDER>
          <TIME_SLOT TIME_SLOT_ID="ts0" TIME_VALUE="0" />
          <TIME_SLOT TIME_SLOT_ID="ts100" TIME_VALUE="100" />
          <TIME_SLOT TIME_SLOT_ID="ts900" TIME_VALUE="900" />
          <TIME_SLOT TIME_SLOT_ID="ts1000" TIME_VALUE="1000" />
          <TIME_SLOT TIME_SLOT_ID="ts2000" TIME_VALUE="2000" />
          <TIME_SLOT TIME_SLOT_ID="ts3000" TIME_VALUE="3000" />
        </TIME_ORDER>
        <TIER TIER_ID="regions">
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-reg-1" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts1000"><ANNOTATION_VALUE>Region</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
        </TIER>
        <TIER TIER_ID="comments">
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-empty" TIME_SLOT_REF1="ts2000" TIME_SLOT_REF2="ts3000"><ANNOTATION_VALUE></ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-live" TIME_SLOT_REF1="ts100" TIME_SLOT_REF2="ts900"><ANNOTATION_VALUE>reviewer: contained note</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
        </TIER>
      </ANNOTATION_DOCUMENT>
    `);

    assert.equal(parts.comments.length, 1);
    assert.equal(parts.comments[0]!.regionId, "r-1");
    assert.ok(parts.warnings.some((warning) => warning.code === "EMPTY_ANNOTATION"));
    assert.ok(!parts.warnings.some((warning) => warning.code === "ORPHAN_COMMENT"));
  });

  it("keeps orphan comments bound to a synthetic region id", () => {
    const parts = importEafToRecordParts(`
      <ANNOTATION_DOCUMENT>
        <HEADER MEDIA_FILE="source.mp4" />
        <TIME_ORDER>
          <TIME_SLOT TIME_SLOT_ID="ts0" TIME_VALUE="0" />
          <TIME_SLOT TIME_SLOT_ID="ts100" TIME_VALUE="100" />
        </TIME_ORDER>
        <TIER TIER_ID="regions"></TIER>
        <TIER TIER_ID="comments">
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-orphan" TIME_SLOT_REF1="ts0" TIME_SLOT_REF2="ts100"><ANNOTATION_VALUE>reviewer: orphan note</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION>
        </TIER>
      </ANNOTATION_DOCUMENT>
    `);

    assert.equal(parts.comments[0]!.regionId, "r-import-0");
    assert.ok(parts.warnings.some((warning) => warning.code === "ORPHAN_COMMENT"));
  });

  it("OTIO round-trip import yields tracks and takes", () => {
    const otio = exportRecord(sample, "otio-json").body;
    const parts = importOtioToRecordParts(otio);
    assert.ok(parts.tracks.length >= 3);
    assert.ok(parts.takes.length >= 1);
    assert.equal(parts.workRecordId, "ps-io");
    assert.ok(parts.durationMs > 0);
    assert.ok(Array.isArray(parts.warnings));
    assert.ok(
      parts.warnings.some((warning) => warning.code === "MARKERS_NOT_IMPORTED"),
      "OTIO marker loss must remain explicit",
    );
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

  it("ignores invalid RationalTime values instead of inventing a duration", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const parts = importOtioToRecordParts({
        tracks: {
          children: [
            {
              children: [
                {
                  OTIO_SCHEMA: "Clip.1",
                  source_range: { duration: { value, rate: 24 } },
                },
              ],
            },
          ],
        },
      });
      assert.equal(parts.durationMs, 0, `invalid value ${String(value)}`);
    }
  });

  it("ignores RationalTime durations that overflow milliseconds", () => {
    const parts = importOtioToRecordParts({
      tracks: {
        children: [
          {
            children: [
              {
                OTIO_SCHEMA: "Clip.1",
                source_range: {
                  duration: { value: Number.MAX_VALUE, rate: 1 },
                },
              },
            ],
          },
        ],
      },
    });
    assert.equal(parts.durationMs, 0);
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

  it("starts a new EAF annotation scan after an over-limit import fails", () => {
    assert.throws(
      () => importEafToRecordParts(eafWithRegionAnnotations(10_001)),
      /EAF input exceeds maximum annotations/,
    );

    const parts = importEafToRecordParts(eafWithRegionAnnotations(1));
    assert.equal(parts.regions.length, 1);
    assert.equal(parts.regions[0]!.id, "r-0");
  });

  it("does not bypass the EAF annotation limit after an over-limit import fails", () => {
    assert.throws(
      () => importEafToRecordParts(eafWithRegionAnnotations(10_001)),
      /EAF input exceeds maximum annotations/,
    );
    assert.throws(
      () => importEafToRecordParts(eafWithRegionAnnotations(15_000)),
      /EAF input exceeds maximum annotations/,
    );
  });

  it("OSC deep-link projection is a multi-asset WorkRecord projection", () => {
    const proj = buildOscDeepLinkProjection(sample);
    assert.equal(proj.kind, "practice-relay-osc-deep-link");
    assert.match(proj.note, /Practice Relay is not the runtime/i);
    assert.ok(proj.endpoints.length >= 2);
    assert.ok(proj.cues.some((cue) => cue.args[0] === "v"));
    assert.ok(proj.cues.some((cue) => cue.address.endsWith("/preferred_take")));
    assert.deepEqual(
      projectOscBundle(sample),
      toOssianHint(sample).cues,
    );
    assert.deepEqual(
      projectOscBundle(sample),
      toMaxDict(sample).dict.cues,
    );
  });
});
