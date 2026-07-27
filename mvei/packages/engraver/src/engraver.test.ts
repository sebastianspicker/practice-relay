/**
 * Tests - engraver.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMotifToSvg, renderMotifPrintHtml } from "./index.ts";

describe("engraver", () => {
  it("renders Motif items with data-item-id", () => {
    const svg = renderMotifToSvg({
      profile: "mvei-motif",
      id: "m1",
      title: "Test engrave",
      items: [
        { id: "i1", symbol: "walk", order: 0 },
        { id: "i2", symbol: "turn", order: 1 },
      ],
    });
    assert.match(svg, /data-item-id="i1"/);
    assert.match(svg, /data-item-id="i2"/);
    assert.match(svg, /Test engrave/);
    assert.match(svg, /data-baseline=/);
    assert.match(svg, /data-symbol="walk"/);
  });

  it("wraps longer motifs to multi-row staff", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      symbol: i % 2 === 0 ? "walk" : "turn",
      order: i,
    }));
    const svg = renderMotifToSvg(
      { profile: "mvei-motif", id: "long", title: "Long motif", items },
      { maxPerRow: 4 },
    );
    assert.match(svg, /data-row="0"/);
    assert.match(svg, /data-row="1"/);
    assert.match(svg, /data-row="2"/);
    assert.match(svg, /data-staff-row="0"/);
    assert.match(svg, /data-staff-row="2"/);
    assert.doesNotMatch(svg, /first browser Laban/i);
  });

  it("richer spacing + barlines options", () => {
    const svg = renderMotifToSvg(
      {
        profile: "mvei-motif",
        id: "space",
        title: "Spaced",
        items: [
          { id: "a", symbol: "walk", order: 0 },
          { id: "b", symbol: "gesture_arm", order: 1 },
          { id: "c", symbol: "stillness", order: 2 },
        ],
      },
      { cellSize: 72, barlines: true, maxPerRow: 8 },
    );
    assert.match(svg, /data-barline=/);
    assert.match(svg, /data-baseline=/);
    assert.match(svg, /data-glyph-box=/);
    assert.match(svg, /data-staff-baseline=/);
    // padX*2 + 3*stride - gap = 24 + 3*(72+4) - 4 = 248
    assert.match(svg, /width="248"/);
    assert.match(svg, /#eef4ea|#f0eaf4|#f4f0e8/); // family fills
  });

  it("rejects non-motif profile", () => {
    assert.throws(
      () =>
        renderMotifToSvg({
          profile: "other",
          id: "x",
          items: [],
        }),
      /profile must be "mvei-motif"/i,
    );
  });

  it("rejects malformed document and item primitives with descriptive errors", () => {
    for (const [doc, expected] of [
      [null, /document must be a non-null object/i],
      [{ profile: "mvei-motif", id: " ", items: [] }, /id must be a non-empty string/i],
      [{ profile: "mvei-motif", id: "x", items: null }, /items must be an array/i],
      [{ profile: "mvei-motif", id: "x", items: [{ id: "i", symbol: null, order: 0 }] }, /item 0 symbol must be a non-empty string/i],
      [{ profile: "mvei-motif", id: "x", items: [{ id: "", symbol: "walk", order: 0 }] }, /item 0 id must be a non-empty string/i],
    ] as const) {
      assert.throws(
        () => renderMotifToSvg(doc as unknown as Parameters<typeof renderMotifToSvg>[0]),
        expected,
      );
    }
  });

  it("rejects malformed optional layout fields", () => {
    const doc = { profile: "mvei-motif", id: "x", items: [] };
    assert.throws(
      () => renderMotifToSvg(doc, null as unknown as Parameters<typeof renderMotifToSvg>[1]),
      /options must be an object/i,
    );
    assert.throws(() => renderMotifToSvg(doc, { maxPerRow: 1.5 }), /maxPerRow/i);
    assert.throws(
      () => renderMotifToSvg(doc, { barlines: "yes" as unknown as boolean }),
      /barlines must be a boolean/i,
    );
  });

  it("print HTML wraps SVG for PDF path", () => {
    const html = renderMotifPrintHtml({
      profile: "mvei-motif",
      id: "m1",
      title: "Print me",
      items: [{ id: "i1", symbol: "walk", order: 0 }],
    });
    assert.match(html, /<svg/);
    assert.match(html, /Print \/ Save as PDF/);
    assert.doesNotMatch(html, /first browser Laban/i);
  });

  it("escapes SVG payloads and rejects non-finite layout values", () => {
    const payload = `unsafe\" onload=\"alert(1)\"><script>alert(1)</script>`;
    const svg = renderMotifToSvg(
      {
        profile: "mvei-motif",
        id: payload,
        title: payload,
        items: [{ id: payload, symbol: payload, order: 1 }],
      },
      { stroke: payload },
    );

    assert.match(svg, /data-item-id="unsafe&quot; onload=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(svg, /data-order="1"/);
    assert.match(svg, /stroke="unsafe&quot; onload=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.doesNotMatch(svg, /<script\b|\sonload="/i);
    assert.throws(() => renderMotifToSvg({ profile: "mvei-motif", id: "x", items: [{ id: "x", symbol: "walk", order: payload as unknown as number }] }), RangeError);
    assert.throws(() => renderMotifToSvg({ profile: "mvei-motif", id: "x", items: [{ id: "x", symbol: "walk", order: Number.NaN }] }), RangeError);
    assert.throws(() => renderMotifToSvg({ profile: "mvei-motif", id: "x", items: [] }, { cellSize: Number.POSITIVE_INFINITY }), RangeError);
  });
});
