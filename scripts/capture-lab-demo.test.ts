/**
 * Capture lab pipeline tests - valid movement_annotation + Motif sketch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCaptureLabDemo } from "./capture-lab-demo.ts";
import {
  landmarksToAnnotation,
  annotationToMotifSketch,
} from "../mvei/packages/capture-bridge/src/index.ts";

describe("capture-lab-demo", () => {
  it("runCaptureLabDemo produces valid annotation and Motif sketch files", () => {
    const testResultsDir = join(process.cwd(), "test-results");
    mkdirSync(testResultsDir, { recursive: true });
    const outDir = mkdtempSync(
      join(testResultsDir, "capture-lab-test-"),
    );
    try {
      const result = runCaptureLabDemo({ outDir });

      assert.equal(result.annotation.kind, "movement_annotation");
      assert.equal(result.annotation.schemaVersion, "0.1.0");
      assert.ok(result.annotation.events.length >= 1);
      for (const ev of result.annotation.events) {
        assert.equal(ev.source, "plugin_pose");
        assert.equal(ev.quality, "sketch");
        assert.ok(ev.id && ev.regionId && ev.label);
      }

      assert.equal(result.motifSketch.profile, "mvei-motif");
      assert.equal(result.motifSketch.completeness, "sketch");
      assert.ok(result.motifSketch.items.length >= 1);

      const annFile = JSON.parse(
        readFileSync(join(outDir, "movement_annotation.json"), "utf8"),
      );
      const motifFile = JSON.parse(
        readFileSync(join(outDir, "motif-sketch.json"), "utf8"),
      );
      const notesFile = JSON.parse(
        readFileSync(join(outDir, "package-notes.json"), "utf8"),
      );
      assert.equal(annFile.kind, "movement_annotation");
      assert.equal(motifFile.profile, "mvei-motif");
      assert.equal(
        notesFile.sources.landmarks,
        "mvei/packages/capture-bridge/fixtures/landmarks-sample.json",
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("rejects landmarks outside the repository", () => {
    const externalDir = mkdtempSync(join(tmpdir(), "capture-lab-external-"));
    const landmarksPath = join(externalDir, "landmarks.json");
    try {
      writeFileSync(
        landmarksPath,
        readFileSync(
          "mvei/packages/capture-bridge/fixtures/landmarks-sample.json",
          "utf8",
        ),
      );
      assert.throws(
        () => runCaptureLabDemo({ landmarksPath }),
        /escapes repository root/,
      );
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("package functions alone produce valid structures", () => {
    const doc = {
      schemaVersion: "0.2.0-landmarks" as const,
      source: "opencap" as const,
      id: "unit",
      frames: [
        { tMs: 0, points: [{ name: "nose", x: 0.1, y: 0.1 }] },
        { tMs: 50, points: [{ name: "nose", x: 0.5, y: 0.5 }] },
      ],
    };
    const ann = landmarksToAnnotation(doc);
    const motif = annotationToMotifSketch(ann);
    assert.equal(ann.kind, "movement_annotation");
    assert.ok(ann.events.length >= 1);
    assert.equal(motif.profile, "mvei-motif");
    assert.ok(motif.items.length === ann.events.length);
  });
});
