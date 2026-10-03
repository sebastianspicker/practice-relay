/** Source-level tests for deterministic, safe movement engraving. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renderMotifPrintHtml,
  renderMotifToSvg,
} from "../src/engraver/index.ts";

const motif = {
  profile: "mvei-motif",
  id: "motif<&",
  title: "Title <script>",
  items: [
    { id: "second", symbol: "travel", order: 1 },
    { id: "first", symbol: "walk", order: 0 },
  ],
};

test("engraver sorts without mutation, wraps rows, and escapes markup", () => {
  const svg = renderMotifToSvg(motif, { maxPerRow: 1, stroke: '\"<&' });
  assert.ok(svg.indexOf('data-item-id="first"') < svg.indexOf('data-item-id="second"'));
  assert.match(svg, /data-item-id="second" data-row="1"/);
  assert.match(svg, /Title &lt;script&gt;/);
  assert.match(svg, /stroke="&quot;&lt;&amp;"/);
  assert.deepEqual(motif.items.map(({ id }) => id), ["second", "first"]);
});

test("engraver validates unsafe geometry and print markup inputs", () => {
  assert.throws(() => renderMotifToSvg(motif, { maxPerRow: 0 }), /positive integer/);
  assert.throws(
    () => renderMotifToSvg({ ...motif, items: [{ id: "", symbol: "walk", order: 0 }] }),
    /id must be a non-empty string/,
  );
  const html = renderMotifPrintHtml(motif);
  assert.match(html, /<title>Title &lt;script&gt; - MvEI Workbench print<\/title>/);
});
