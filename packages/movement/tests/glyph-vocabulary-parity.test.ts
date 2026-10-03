/** Every generated Motif vocabulary symbol must have a dedicated bundled glyph. */
import assert from "node:assert/strict";
import test from "node:test";
import { getGlyph, listGlyphIds } from "../glyphs/index.ts";
import { MOTIF_SYMBOL_IDS } from "../vocabulary/motif-vocabulary.mjs";

test("bundled glyph ids and Motif vocabulary ids are the same set", () => {
  const glyphIds = listGlyphIds();
  const vocabularyIds: readonly string[] = MOTIF_SYMBOL_IDS;
  const missing = vocabularyIds.filter((id) => !glyphIds.includes(id));
  const extra = glyphIds.filter((id) => !vocabularyIds.includes(id));

  assert.deepEqual(missing, [], `vocabulary ids without a glyph: ${missing.join(",")}`);
  assert.deepEqual(extra, [], `glyph ids outside the vocabulary: ${extra.join(",")}`);
});

test("every vocabulary symbol resolves to a dedicated glyph, not the labelled placeholder", () => {
  const placeholder = getGlyph("__not-a-motif-symbol__");

  for (const id of MOTIF_SYMBOL_IDS) {
    const glyph = getGlyph(id);
    assert.notDeepEqual(glyph.paths, placeholder.paths, id);
    assert.notEqual(glyph.label, id, `${id} falls back to its own id as label`);
  }
});
