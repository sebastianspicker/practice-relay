/** Unit tests for MvEI Workbench shell brand + corpus load + Motif surface HTML. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml } from "./html-escape.mjs";
import {
  BRAND,
  STANDARD,
  scaffoldBanner,
  loadCorpusSketch,
  loadDemoMotif,
  renderShellHtml,
  renderAriaLiveRegion,
  announceToLiveRegion,
  MVEI_WORKBENCH_STATUS,
  DEMO_MOTIF_PATH,
} from "./shell.mjs";

const styles = readFileSync(new URL("./workbench.css", import.meta.url), "utf8");

test("MvEI Workbench HTML escaping covers text and attribute delimiters", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("MvEI Workbench index is byte-identical to its renderer", () => {
  const committed = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.equal(committed, renderShellHtml(loadDemoMotif()));
});

test("shell brand is MvEI Workbench with the archival-modernist contract", () => {
  assert.equal(BRAND, "MvEI Workbench");
  assert.equal(STANDARD, "MvEI (Movement Encoding Initiative)");
  assert.ok(MVEI_WORKBENCH_STATUS.includes("MvEI Workbench"));

  const banner = scaffoldBanner();
  assert.match(banner, /MvEI Workbench/);
  assert.match(banner, /MvEI/);
  assert.match(banner, /Partial Motif documents must validate/i);
  assert.doesNotMatch(banner, /first browser Laban/i);
  assert.doesNotMatch(banner, /first digital/i);
});

test("workbench styles preserve the hidden mode-panel contract", () => {
  assert.match(styles, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("workbench styles keep the compact navy and cobalt editor-shell contract", () => {
  assert.match(styles, /--navy:\s*#172033/);
  assert.match(styles, /--cobalt:\s*#164ce5/);
  assert.match(styles, /\.editor-shell\s*\{/);
  assert.match(styles, /\.motif-tile\[aria-selected="true"\]/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test("loadCorpusSketch returns sketch Motif from shared corpus", () => {
  const doc = loadCorpusSketch();
  assert.equal(doc.id, "motif-sketch-01");
  assert.equal(doc.completeness, "sketch");
  assert.ok(Array.isArray(doc.items));
  assert.ok(doc.items.length > 0);
});

test("loadDemoMotif loads fixtures/demo Motif through loadMotif", () => {
  assert.ok(DEMO_MOTIF_PATH.includes("fixtures/demo/motif.json"));
  const doc = loadDemoMotif();
  assert.equal(doc.profile, "mvei-motif");
  assert.ok(doc.items.length >= 3);
  assert.match(doc.id, /demo|week6/i);
});

test("renderShellHtml shows MvEI Workbench brand, mark, and Motif items", () => {
  const doc = loadDemoMotif();
  const html = renderShellHtml(doc);
  assert.match(html, /MvEI Workbench/);
  assert.match(html, /MvEI/);
  assert.match(html, new RegExp(doc.id));
  assert.match(html, /gesture_arm|walk|travel/);
  // Forbidden claim must not appear as a positive product claim (hyphenated disclaimer ok)
  assert.doesNotMatch(html, /(?<![\w-])first browser Laban(?![\w-])/i);
  assert.match(html, /Edit a local Motif sequence and store it in this browser\./);
  assert.match(html, /Articulated movement path mark/);
  assert.match(html, /<link rel="stylesheet" href="\.\/workbench\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/workbench\.css" \/>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="mvei-workbench-live"/);
  assert.match(html, /class="workbench-status"/);
  assert.match(html, /class="editor-shell"/);
  assert.match(html, /Editor mode: Motif canvas/);
});

test("aria-live helpers announce mode changes", () => {
  const region = renderAriaLiveRegion("hello");
  assert.match(region, /aria-live="polite"/);
  assert.match(region, /hello/);
  const el = { textContent: "" };
  announceToLiveRegion(el, "Editor mode: laban-subset staff");
  assert.match(el.textContent, /laban-subset/);
});
