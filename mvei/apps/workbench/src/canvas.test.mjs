/**
 * Tests: canvas.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSketchMotif } from "./motif.mjs";
import {
  addFromPalette,
  addFromPaletteKeyboard,
  moveItem,
  setItemTimeMs,
  MOTIF_PALETTE,
  validateMediaUrl,
  setEditorMode,
  modeAnnouncement,
  tileAriaLabel,
  renderPaletteButtonHtml,
  renderTileHtml,
  renderCanvasTilesHtml,
  FOCUS_STYLES,
  orderedItemIds,
  rovingTabindexState,
  navigateTiles,
  renderCanvasTilesHtmlA11y,
  renderTileHtmlA11y,
} from "./canvas.mjs";

test("palette add + reorder + time anchor", () => {
  assert.ok(MOTIF_PALETTE.includes("walk"));
  let doc = createSketchMotif("c1", "Canvas");
  doc = addFromPalette(doc, "walk");
  doc = addFromPalette(doc, "turn");
  assert.equal(doc.items.length, 2);
  doc = moveItem(doc, 0, 1);
  assert.equal(doc.items[0].symbol, "turn");
  doc = setItemTimeMs(doc, doc.items[0].id, 1200);
  assert.equal(doc.items[0].timeAnchor.tMs, 1200);
});

test("validateMediaUrl and editor mode", () => {
  assert.equal(validateMediaUrl("").ok, false);
  assert.equal(validateMediaUrl("https://example.com/a.mp4").ok, true);
  assert.equal(validateMediaUrl("ftp://x").ok, false);
  assert.equal(setEditorMode({}, "laban-subset").mode, "laban-subset");
  assert.throws(() => setEditorMode({}, "race"));
  assert.match(modeAnnouncement("motif"), /Motif canvas/);
  assert.match(modeAnnouncement("laban-subset"), /laban-subset staff/);
  /** @type {string[]} */
  const announced = [];
  const next = setEditorMode({ mode: "motif" }, "laban-subset", {
    announce: (t) => announced.push(t),
  });
  assert.equal(next.mode, "laban-subset");
  assert.equal(announced.length, 1);
  assert.match(announced[0], /laban-subset/);
  assert.match(next.lastAnnouncement || "", /laban-subset/);
});

test("a11y: aria tiles, keyboard palette add, focus styles", () => {
  let doc = createSketchMotif("a11y", "A11y");
  doc = addFromPaletteKeyboard(doc, "walk", { key: "Enter" });
  assert.equal(doc.items.length, 1);
  doc = addFromPaletteKeyboard(doc, "turn", { key: " " });
  assert.equal(doc.items.length, 2);
  doc = addFromPaletteKeyboard(doc, "jump", { key: "Tab" });
  assert.equal(doc.items.length, 2);

  const item = doc.items[0];
  assert.match(tileAriaLabel(item), /walk/);
  const btn = renderPaletteButtonHtml("walk");
  assert.match(btn, /aria-label="Add walk to Motif"/);
  assert.match(btn, /type="button"/);
  const tile = renderTileHtml(item);
  assert.match(tile, /role="listitem"/);
  assert.match(tile, /tabindex="0"/);
  assert.match(tile, /aria-label=/);

  const hostileTile = renderTileHtml({
    id: `tile'&<>"`,
    symbol: `walk'&<>"`,
    order: 0,
  });
  assert.match(hostileTile, /tile&#39;&amp;&lt;&gt;&quot;/);
  assert.doesNotMatch(hostileTile, /tile'&/);
  const canvas = renderCanvasTilesHtml(doc);
  assert.match(canvas, /role="list"/);
  assert.match(FOCUS_STYLES, /:focus-visible/);
});

test("a11y: roving tabindex, aria-selected, keyboard tile navigation", () => {
  let doc = createSketchMotif("nav", "Nav");
  doc = addFromPalette(doc, "walk");
  doc = addFromPalette(doc, "turn");
  doc = addFromPalette(doc, "stillness");
  const ids = orderedItemIds(doc);
  assert.equal(ids.length, 3);

  const state0 = rovingTabindexState(doc, null);
  assert.equal(state0.filter((s) => s.tabIndex === 0).length, 1);
  assert.equal(state0[0].ariaSelected, true);

  let sel = ids[0];
  let nav = navigateTiles(doc, sel, { key: "ArrowRight" });
  assert.equal(nav.selectedId, ids[1]);
  assert.equal(nav.changed, true);
  sel = nav.selectedId;
  nav = navigateTiles(doc, sel, { key: "End" });
  assert.equal(nav.selectedId, ids[2]);
  nav = navigateTiles(doc, nav.selectedId, { key: "Home" });
  assert.equal(nav.selectedId, ids[0]);

  const html = renderCanvasTilesHtmlA11y(doc, ids[1]);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /tabindex="-1"/);
  const tile = renderTileHtmlA11y(doc.items[1], { selected: true, tabIndex: 0 });
  assert.match(tile, /role="option"/);
  assert.match(tile, /aria-selected="true"/);
});
