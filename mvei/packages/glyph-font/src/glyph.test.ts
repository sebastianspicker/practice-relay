/**
 * Tests - glyph.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GLYPH_FONT_STATUS,
  listGlyphIds,
  renderGlyphSvg,
  getGlyph,
} from "./index.ts";
import { MOTIF_SYMBOL_IDS as VOCAB } from "../../../../packages/movement-encode/vocab/motif-vocabulary.mjs";

describe("glyph-font", () => {
  it("is mvp-svg with vocabulary coverage", () => {
    assert.equal(GLYPH_FONT_STATUS, "mvp-svg");
    assert.ok(listGlyphIds().includes("walk"));
    const svg = renderGlyphSvg("walk");
    assert.match(svg, /<svg/);
    assert.match(svg, /Walk/);
  });

  it("covers full Motif vocabulary with multi-path glyphs", () => {
    for (const id of VOCAB) {
      assert.ok(listGlyphIds().includes(id), `missing glyph ${id}`);
      const g = getGlyph(id);
      assert.ok(g.paths.length >= 2, `${id} should have richer multi-path form`);
      const svg = renderGlyphSvg(id);
      assert.match(svg, /<path /);
    }
  });

  it("escapes unknown labels and stroke attributes and rejects non-finite sizes", () => {
    const payload = `unknown" onload="alert(1)"><script>alert(1)</script>`;
    const stroke = `red" onload="alert(1)"><script>alert(1)</script>`;
    const svg = renderGlyphSvg(payload, { stroke });

    assert.match(svg, /aria-label="unknown&quot; onload=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(svg, /stroke="red&quot; onload=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.doesNotMatch(svg, /<script\b|\sonload="/i);
    assert.throws(() => renderGlyphSvg("walk", { size: Number.NaN }), RangeError);
    assert.throws(() => renderGlyphSvg("walk", { size: Number.POSITIVE_INFINITY }), RangeError);
  });
});
