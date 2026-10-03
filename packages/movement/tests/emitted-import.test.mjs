/** Plain-Node smoke test for the emitted public package entrypoints. */
import assert from "node:assert/strict";
import test from "node:test";

test("emitted movement root and glyph exports load without a TypeScript loader", async () => {
  const movement = await import("@practice-relay/movement");
  const glyphs = await import("@practice-relay/movement/glyphs");
  assert.equal(movement.PACKAGE, "@practice-relay/movement");
  assert.equal(typeof movement.motifToLabanSubset, "function");
  assert.equal(movement.MOVEMENT_CORPUS_INDEX.fixtures.length, 10);
  assert.equal(movement.MOVEMENT_PROFILE_SUMMARIES[0].id, "mvei-motif");
  assert.match(glyphs.renderGlyphSvg("walk"), /<svg/);
});
