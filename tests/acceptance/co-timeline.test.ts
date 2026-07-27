/**
 * Practice Relay + MvEI co-timeline acceptance: music_notation track + Motif annex
 * against real fixtures/demo scores on disk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachMveiMotifTrack,
  attachMusicNotationTrack,
  createEmptyRecord,
  validateRecordCoTimeline,
} from "@practice-relay/work-record-core";
import {
  attachMusicCoTimeline,
  countMeiMeasures,
  countMusicXmlMeasures,
  validateCoTimelineAnchors,
  type MotifDocument,
} from "@practice-relay/movement-encode";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const demoDir = join(root, "fixtures/demo");

test("Practice Relay WorkRecord + Motif co-timeline anchors align with measure count", () => {
  const musicxml = readFileSync(join(demoDir, "score.musicxml"), "utf8");
  const mei = readFileSync(join(demoDir, "score.mei"), "utf8");
  const motif = JSON.parse(
    readFileSync(join(demoDir, "motif.json"), "utf8"),
  ) as MotifDocument;

  const measureCount = countMusicXmlMeasures(musicxml);
  assert.equal(measureCount, 8);
  assert.equal(countMeiMeasures(mei), measureCount);

  let score = createEmptyRecord("ps-cotl", "Week 6 co-timeline");
  score = attachMusicNotationTrack(score, {
    id: "tr-music",
    ref: "fixtures/demo/score.musicxml",
  });
  score = attachMveiMotifTrack(score, {
    id: "tr-motif",
    ref: "fixtures/demo/motif.json",
  });

  assert.ok(motif.musicCoTimeline);
  const annexOk = validateCoTimelineAnchors(
    motif.musicCoTimeline,
    measureCount,
  );
  assert.equal(annexOk.ok, true, annexOk.errors.join("; "));

  const scoreOk = validateRecordCoTimeline(score, motif, measureCount);
  assert.equal(scoreOk.ok, true, scoreOk.errors.join("; "));

  // Live attach path
  const live = attachMusicCoTimeline(
    { ...motif, musicCoTimeline: undefined },
    {
      musicxmlRef: "fixtures/demo/score.musicxml",
      meiRef: "fixtures/demo/score.mei",
      anchors: motif.musicCoTimeline!.anchors,
    },
  );
  const liveOk = validateCoTimelineAnchors(live.musicCoTimeline, measureCount);
  assert.equal(liveOk.ok, true, liveOk.errors.join("; "));
});
