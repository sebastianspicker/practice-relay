/** Source-level tests for capture normalization and Motif suggestions. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  annotationToMotifSketch,
  landmarksToAnnotation,
  type LandmarkDocument,
} from "../src/capture/index.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/capture/landmarks-sample.json", import.meta.url),
);

test("capture fixture is normalized into deterministic stillness and travel events", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as LandmarkDocument;
  const annotation = landmarksToAnnotation(fixture);
  assert.deepEqual(annotation.events.map(({ label }) => label), ["stillness", "travel"]);
  assert.deepEqual(annotation.events.map(({ regionId }) => regionId), [
    "reg-t100",
    "reg-t200",
  ]);
  assert.match(annotation.events[1]!.notes ?? "", /mediapipe.*meanΔ=0\.2022/);
  assert.deepEqual(
    annotationToMotifSketch(annotation).items.map(({ symbol }) => symbol),
    ["stillness", "travel"],
  );
});

test("capture normalization handles unmatched or unknown observations conservatively", () => {
  const annotation = landmarksToAnnotation({
    schemaVersion: "0.2.0-landmarks",
    source: "other",
    id: "empty-points",
    frames: [
      { tMs: 0, points: [] },
      { tMs: 20, points: [{ name: "nose", x: 1, y: 1 }] },
    ],
  });
  assert.equal(annotation.events[0]?.label, "stillness");
  annotation.events[0]!.label = "unsupported-label";
  assert.equal(annotationToMotifSketch(annotation).items[0]?.symbol, "stillness");
});
