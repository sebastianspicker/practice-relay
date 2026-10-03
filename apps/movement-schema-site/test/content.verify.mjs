/** The static site must be an exact rendering of package-derived content. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MOVEMENT_CORPUS_INDEX,
  MOVEMENT_PROFILE_SUMMARIES,
} from "@practice-relay/movement/browser";
import {
  CORPUS_INDEX,
  CORPUS_SAMPLES,
  IMPLEMENTED_PROFILES,
  MIGRATION,
  buildPageHtml,
  getSiteCopy,
  listsCorpus,
} from "../src/content.mjs";

test("site profile and corpus data exactly equal the movement package exports", () => {
  assert.deepEqual(IMPLEMENTED_PROFILES, MOVEMENT_PROFILE_SUMMARIES);
  assert.deepEqual(CORPUS_SAMPLES, MOVEMENT_CORPUS_INDEX.fixtures);
  assert.deepEqual(CORPUS_INDEX, MOVEMENT_CORPUS_INDEX);
  assert.deepEqual(getSiteCopy().corpusIndex, MOVEMENT_CORPUS_INDEX);
  assert.deepEqual(listsCorpus(), MOVEMENT_CORPUS_INDEX.fixtures.map(({ id }) => id));
});

test("checked-in site index is exactly generated and includes every corpus fixture", () => {
  const html = buildPageHtml();
  assert.equal(readFileSync(new URL("../index.html", import.meta.url), "utf8"), html);
  for (const { id } of MOVEMENT_CORPUS_INDEX.fixtures) {
    assert.match(html, new RegExp(`<code>${id}</code>`));
  }
});

test("LabanWriter scope states the implemented JSON path and excluded .lw decoder", () => {
  assert.match(MIGRATION.summary, /intermediate JSON import exists/);
  assert.match(MIGRATION.summary, /Proprietary \.lw decoding/);
  assert.doesNotMatch(MIGRATION.summary, /Lossy LabanWriter import/);
});
