/** Browser validation must accept and reject the same Motif documents as Ajv. */
import assert from "node:assert/strict";
import test from "node:test";
import { MOVEMENT_CORPUS } from "../src/index.ts";
import { browserAccepts, cloneDocument, compileSchema, mutateDocument } from "./browser-ajv-parity.ts";

const validateWithAjv = compileSchema("../schemas/mvei-motif.schema.json");

const motifInputs = [
  ["canonical sketch", cloneDocument(MOVEMENT_CORPUS.motifSketch), true],
  ["unknown Motif symbol", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.items[0].symbol = "unknown"; }), false],
  ["unexpected document property", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.unexpected = true; }), false],
  ["malformed time anchor", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.items[0].timeAnchor = { bad: true }; }), false],
  ["negative order", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.items[0].order = -1; }), false],
  ["unexpected co-timeline annex property", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.musicCoTimeline.unexpected = true; }), false],
  ["unexpected co-timeline anchor property", mutateDocument(MOVEMENT_CORPUS.motifSketch, (value) => { value.musicCoTimeline.anchors[0].unexpected = true; }), false],
] as const;

for (const [label, input, expected] of motifInputs) {
  test(`browser parser and Ajv agree for ${label}`, () => {
    const ajvAccepted = validateWithAjv(input);
    const browserAccepted = browserAccepts(input);
    assert.equal(ajvAccepted, expected, `Ajv ${label}: ${JSON.stringify(validateWithAjv.errors)}`);
    assert.equal(browserAccepted, expected, `browser ${label}`);
    assert.equal(browserAccepted, ajvAccepted, `${label}: ${JSON.stringify(validateWithAjv.errors)}`);
  });
}
