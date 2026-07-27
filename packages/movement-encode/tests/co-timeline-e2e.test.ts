/**
 * Normative co-timeline e2e: Motif + real score.musicxml / score.mei on disk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachMusicCoTimeline,
  countMeiMeasures,
  countMusicXmlMeasures,
  createEmptyMotif,
  validateCoTimelineAnchors,
  type MotifDocument,
} from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const demoDir = join(root, "fixtures/demo");

test("demo Motif musicCoTimeline anchors fit MusicXML + MEI measure counts", () => {
  const motif = JSON.parse(
    readFileSync(join(demoDir, "motif.json"), "utf8"),
  ) as MotifDocument;
  const musicxml = readFileSync(join(demoDir, "score.musicxml"), "utf8");
  const mei = readFileSync(join(demoDir, "score.mei"), "utf8");

  assert.equal(motif.profile, "mvei-motif");
  assert.ok(motif.musicCoTimeline, "demo Motif must ship musicCoTimeline");
  assert.equal(
    motif.musicCoTimeline?.musicxmlRef,
    "fixtures/demo/score.musicxml",
  );
  assert.equal(motif.musicCoTimeline?.meiRef, "fixtures/demo/score.mei");

  const mxCount = countMusicXmlMeasures(musicxml);
  const meiCount = countMeiMeasures(mei);
  assert.equal(mxCount, 8);
  assert.equal(meiCount, 8);
  assert.equal(mxCount, meiCount);

  const check = validateCoTimelineAnchors(motif.musicCoTimeline, mxCount);
  assert.equal(check.ok, true, check.errors.join("; "));
  assert.ok((motif.musicCoTimeline?.anchors?.length ?? 0) >= 3);
});

test("attachMusicCoTimeline + real score fixtures on disk", () => {
  const musicxml = readFileSync(join(demoDir, "score.musicxml"), "utf8");
  const mei = readFileSync(join(demoDir, "score.mei"), "utf8");
  const measureCount = countMusicXmlMeasures(musicxml);
  assert.equal(measureCount, countMeiMeasures(mei));

  let doc = createEmptyMotif("ct-e2e", "Co-timeline e2e");
  doc = {
    ...doc,
    completeness: "partial",
    items: [
      {
        id: "i1",
        symbol: "walk",
        order: 0,
        timeAnchor: { tMs: 0, musicMeasure: "1" },
      },
      {
        id: "i2",
        symbol: "gesture_arm",
        order: 1,
        timeAnchor: { tMs: 2000, musicMeasure: "2" },
      },
      {
        id: "i3",
        symbol: "stillness",
        order: 2,
        timeAnchor: { tMs: 4000, musicMeasure: "3" },
      },
    ],
  };

  const withCt = attachMusicCoTimeline(doc, {
    musicxmlRef: "fixtures/demo/score.musicxml",
    meiRef: "fixtures/demo/score.mei",
    anchors: [
      { motifItemId: "i1", musicMeasure: "1", tMs: 0 },
      { motifItemId: "i2", musicMeasure: "2", tMs: 2000 },
      { motifItemId: "i3", musicMeasure: "3", tMs: 4000 },
    ],
  });

  const ok = validateCoTimelineAnchors(withCt.musicCoTimeline, measureCount);
  assert.equal(ok.ok, true, ok.errors.join("; "));

  const bad = attachMusicCoTimeline(doc, {
    musicxmlRef: "fixtures/demo/score.musicxml",
    anchors: [{ motifItemId: "i1", musicMeasure: "99", tMs: 0 }],
  });
  const fail = validateCoTimelineAnchors(bad.musicCoTimeline, measureCount);
  assert.equal(fail.ok, false);
  assert.match(fail.errors.join(" "), /out of range/);
});
