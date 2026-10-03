/** Browser validation must accept and reject the same Laban documents as Ajv. */
import assert from "node:assert/strict";
import test from "node:test";
import { MOVEMENT_CORPUS } from "../src/index.ts";
import { browserAccepts, cloneDocument, compileSchema, mutateDocument } from "./browser-ajv-parity.ts";

const validateWithAjv = compileSchema("../schemas/mvei-laban-subset.schema.json");

const labanInputs = [
  ["canonical Laban subset", cloneDocument(MOVEMENT_CORPUS.labanSubset04), true],
  ["invalid staff column", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.staff.columns[0] = "wing"; }), false],
  ["invalid symbol column", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.symbols[0].column = "wing"; }), false],
  ["invalid symbol direction", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.symbols[0].direction = "sideways"; }), false],
  ["invalid symbol level", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.symbols[0].level = "floating"; }), false],
  ["unexpected symbol property", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.symbols[0].unexpected = true; }), false],
  ["co-timeline anchor media fragment", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.musicCoTimeline.anchors[0].mediaFragment = "#t=0,2"; }), true],
  ["unexpected co-timeline annex property", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.musicCoTimeline.unexpected = true; }), false],
  ["unexpected co-timeline anchor property", mutateDocument(MOVEMENT_CORPUS.labanSubset04, (value) => { value.musicCoTimeline.anchors[0].unexpected = true; }), false],
] as const;

for (const [label, input, expected] of labanInputs) {
  test(`browser parser and Ajv agree for ${label}`, () => {
    const ajvAccepted = validateWithAjv(input);
    const browserAccepted = browserAccepts(input);
    assert.equal(ajvAccepted, expected, `Ajv ${label}: ${JSON.stringify(validateWithAjv.errors)}`);
    assert.equal(browserAccepted, expected, `browser ${label}`);
    assert.equal(browserAccepted, ajvAccepted, `${label}: ${JSON.stringify(validateWithAjv.errors)}`);
  });
}
