/**
 * Tests - capture.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  landmarksToAnnotation,
  annotationToMotifSketch,
} from "./index.ts";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/landmarks-sample.json",
);

describe("capture-bridge", () => {
  it("converts landmarks to annotation and motif sketch", () => {
    const doc = JSON.parse(readFileSync(fixture, "utf8"));
    const ann = landmarksToAnnotation(doc);
    assert.equal(ann.kind, "movement_annotation");
    assert.ok(ann.events.length >= 1);
    const motif = annotationToMotifSketch(ann);
    assert.equal(motif.profile, "mvei-motif");
    assert.ok(motif.items.length >= 1);
  });
});
