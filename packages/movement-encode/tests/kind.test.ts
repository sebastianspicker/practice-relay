/** Unit tests for @practice-relay/movement-encode kinds + Motif helpers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSymbolicMvEI,
  isAnnotationKind,
  createEmptyMotif,
  attachMusicCoTimeline,
  motifToLabanSubset,
  MOTIF_TO_SUBSET_LOSSINESS,
  createEmptyLabanSubset,
} from "../src/index.ts";

test("movement_annotation is not symbolic MvEI", () => {
  assert.equal(isSymbolicMvEI("movement_annotation"), false);
});

test("mvei-motif and laban-subset are symbolic", () => {
  assert.equal(isSymbolicMvEI("mvei-motif"), true);
  assert.equal(isSymbolicMvEI("mvei-laban-subset"), true);
});

test("isAnnotationKind recognizes movement_annotation only", () => {
  assert.equal(isAnnotationKind("movement_annotation"), true);
  assert.equal(isAnnotationKind("mvei-motif"), false);
});

test("createEmptyMotif has profile mvei-motif and completeness sketch", () => {
  const doc = createEmptyMotif("motif-1", "Empty sketch");
  assert.equal(doc.profile, "mvei-motif");
  assert.equal(doc.completeness, "sketch");
  assert.equal(doc.schemaVersion, "0.2.0");
  assert.equal(doc.id, "motif-1");
  assert.equal(doc.title, "Empty sketch");
  assert.deepEqual(doc.items, []);
});

test("attachMusicCoTimeline adds annex hooks", () => {
  const base = createEmptyMotif("motif-ct", "With co-timeline");
  const withCt = attachMusicCoTimeline(base, {
    musicxmlRef: "scores/piece.musicxml",
    meiRef: "scores/piece.mei",
    anchors: [{ motifItemId: "i1", musicMeasure: "4", tMs: 1200 }],
  });
  assert.equal(withCt.musicCoTimeline?.schemaVersion, "0.1.0-annex");
  assert.equal(withCt.musicCoTimeline?.musicxmlRef, "scores/piece.musicxml");
  assert.equal(withCt.musicCoTimeline?.meiRef, "scores/piece.mei");
  assert.equal(withCt.musicCoTimeline?.anchors?.[0]?.motifItemId, "i1");
});

test("motifToLabanSubset is lossy and documents warnings", () => {
  assert.ok(MOTIF_TO_SUBSET_LOSSINESS.length >= 4);
  assert.ok(
    MOTIF_TO_SUBSET_LOSSINESS.some((w) => /simultaneousGroup/i.test(w)),
  );
  let doc = createEmptyMotif("map-1", "Map");
  doc = {
    ...doc,
    items: [
      { id: "i1", symbol: "walk", order: 0 },
      { id: "i2", symbol: "effort_strong", order: 1 },
      { id: "i3", symbol: "phrase_begin", order: 2 },
      { id: "i4", symbol: "gesture_arm", order: 3 },
      { id: "i5", symbol: "walk", order: 4 },
      { id: "i6", symbol: "travel", order: 5 },
    ],
  };
  const subset = motifToLabanSubset(doc);
  assert.equal(subset.profile, "mvei-laban-subset");
  assert.equal(subset.symbols.length, 6);
  assert.ok((subset.migrationProvenance?.warnings?.length ?? 0) >= 3);
  assert.ok(subset.staff?.columns?.includes("arm_right"));
  // Alternating support columns for walk
  const walks = subset.symbols.filter((s) => s.motifSymbol === "walk");
  assert.equal(walks.length, 2);
  assert.ok(
    walks.some((s) => s.column === "support_right") &&
      walks.some((s) => s.column === "support_left"),
  );
  // Same measure → shared simultaneousGroup
  const m0 = subset.symbols.filter((s) => s.measureId === "m0");
  assert.ok(m0.length >= 2);
  assert.ok(m0.every((s) => s.simultaneousGroup === "g-m0"));
  assert.ok(typeof m0[0]!.beatOffset === "number");
  const travel = subset.symbols.find((s) => s.motifSymbol === "travel");
  assert.equal(travel?.kind, "path");
  const empty = createEmptyLabanSubset("ls-empty");
  assert.equal(empty.profile, "mvei-laban-subset");
});
