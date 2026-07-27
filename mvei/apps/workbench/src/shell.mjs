/**
 * MvEI Workbench shell: brand chrome, corpus load, emit/load round-trip.
 *
 * Why: the alpha authoring surface edits local Motif data against the shared corpus.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitMotif, loadMotif } from "./motif.mjs";
import { escapeHtml } from "./html-escape.mjs";
import {
  MOTIF_PALETTE,
  renderCanvasTilesHtml,
  renderPaletteButtonHtml,
} from "./canvas.mjs";
import {
  loadCorpusLabanSubset,
  renderLabanSubsetStaffHtml,
} from "./laban-subset.mjs";

export const BRAND = "MvEI Workbench";
export const STANDARD = "MvEI (Movement Encoding Initiative)";

/** Compatibility alias used by re-exports / status smoke tests */
export const MVEI_WORKBENCH_STATUS =
  "MvEI Workbench alpha (Motif canvas, laban-subset staff, local session, accessibility)";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Shared corpus Motif sketch (real JSON, not a mock string) */
export const CORPUS_SKETCH_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/fixtures/corpus/motif-sketch-01.json",
);

export const CORPUS_PARTIAL_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/fixtures/corpus/motif-partial-02.json",
);

/** Coherent alpha demo Motif (fixtures/demo: Practice Relay-loadable path) */
export const DEMO_MOTIF_PATH = join(
  __dirname,
  "../../../../fixtures/demo/motif.json",
);

/**
 * Scaffold banner / chrome copy.
 * The banner identifies the editor, standard, and schema validation boundary.
 */
export function scaffoldBanner() {
  return [
    `${BRAND} Motif editor: authoring UI for ${STANDARD} Motif documents.`,
    "Partial Motif documents must validate against the current schema.",
    `Brand: ${BRAND} · Standard: ${STANDARD}.`,
  ].join("\n");
}

/**
 * Load the shared corpus sketch Motif from disk.
 * @returns {import("./motif.mjs").MotifDocument}
 */
export function loadCorpusSketch() {
  const raw = readFileSync(CORPUS_SKETCH_PATH, "utf8");
  return loadMotif(raw);
}

/**
 * Load the fixtures/demo Motif used by the alpha e2e scenario.
 * @returns {import("./motif.mjs").MotifDocument}
 */
export function loadDemoMotif() {
  const raw = readFileSync(DEMO_MOTIF_PATH, "utf8");
  return loadMotif(raw);
}

/**
 * Emit then load; returns the reloaded document (round-trip).
 * @param {import("./motif.mjs").MotifDocument} doc
 * @returns {import("./motif.mjs").MotifDocument}
 */
export function roundTrip(doc) {
  return loadMotif(emitMotif(doc));
}

/**
 * Alpha Motif surface HTML from shipped chrome + a real Motif document.
 * Ground-truth source for the MvEI Workbench alpha HTML surface.
 * Supports Motif canvas tiles + optional laban-subset multi-staff panel.
 * @param {import("./motif.mjs").MotifDocument} [doc]
 * @param {{ mode?: "motif"|"laban-subset", labanDoc?: object }} [opts]
 * @returns {string}
 */
/**
 * Live region HTML for mode / session announcements (full workflow a11y).
 * @param {string} [text]
 * @returns {string}
 */
export function renderAriaLiveRegion(text = "") {
  return `<div id="mvei-workbench-live" class="workbench-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(text)}</div>`;
}

/**
 * Apply text to an aria-live region element (DOM helper).
 * @param {{ textContent?: string } | null | undefined} el
 * @param {string} text
 */
export function announceToLiveRegion(el, text) {
  if (!el) return;
  el.textContent = String(text ?? "");
}

/** Render the MvEI Workbench alpha shell around an optional Motif or laban-subset document. */
export function renderShellHtml(doc = loadDemoMotif(), opts = {}) {
  const mode = opts.mode === "laban-subset" ? "laban-subset" : "motif";
  const modeMsg =
    mode === "laban-subset"
      ? "Editor mode: laban-subset staff. Pedagogical multi-column staff: not professional Labanotation density."
      : "Editor mode: Motif canvas. Sequence tiles with controlled vocabulary.";
  const items = (doc.items ?? [])
    .map(
      (it) =>
        `          <li><code>${escapeHtml(it.id)}</code> · ${escapeHtml(it.symbol)}${
          it.durationHint ? ` · ${escapeHtml(it.durationHint)}` : ""
        }</li>`,
    )
    .join("\n");

  const palette = MOTIF_PALETTE.map((s) => `        ${renderPaletteButtonHtml(s)}`).join(
    "\n",
  );
  const tiles = renderCanvasTilesHtml(doc);
  const labanDoc = opts.labanDoc ?? loadCorpusLabanSubset();
  const labanStaff = renderLabanSubsetStaffHtml(labanDoc);

  return `<!DOCTYPE html>
<!-- MvEI Workbench shell. Why: Motif authoring is a focused MvEI round-trip surface. -->
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(BRAND)}: ${escapeHtml(STANDARD)} Motif editor</title>
  <link rel="stylesheet" href="./workbench.css" />
</head>
<body>
  ${renderAriaLiveRegion(modeMsg)}
  <header class="workbench-header">
    <div class="brand"><svg class="mark" viewBox="0 0 48 48" role="img" aria-label="Articulated movement path mark"><path d="M8 37C14 37 15 12 24 12s7 24 16 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><circle cx="8" cy="37" r="3" fill="currentColor"/><circle cx="24" cy="12" r="3" fill="currentColor"/><circle cx="40" cy="36" r="3" fill="currentColor"/><path d="M11 25h9m8 0h9" stroke="var(--cobalt-light)" stroke-width="2"/></svg><span>${escapeHtml(BRAND)}</span></div>
    <div class="std"><span class="std-label">Standard</span>${escapeHtml(STANDARD)} · Motif authoring (alpha)</div>
  </header>
  <main>
    <div class="workspace-heading">
      <div>
        <h1>${escapeHtml(BRAND)}</h1>
        <p class="tagline">Edit a local Motif sequence and store it in this browser.</p>
      </div>
    </div>

    <div class="editor-shell">
    <section id="mode" aria-labelledby="mode-heading">
      <h2 id="mode-heading">Editor mode</h2>
      <div class="mode-bar" role="group" aria-label="Editor mode">
        <button type="button" data-mode="motif" aria-pressed="${mode === "motif" ? "true" : "false"}">Motif</button>
        <button type="button" data-mode="laban-subset" aria-pressed="${mode === "laban-subset" ? "true" : "false"}">laban-subset staff</button>
      </div>
      <div class="session-bar" role="group" aria-label="Session">
        <button type="button" data-action="session-save" aria-label="Save Motif session to local storage">Save session</button>
        <button type="button" data-action="session-load" aria-label="Load Motif session from local storage">Load session</button>
      </div>
    </section>

    <section id="document" aria-labelledby="doc-heading">
      <h2 id="doc-heading">Loaded Motif</h2>
      <p class="meta"><strong>id</strong> <code>${escapeHtml(doc.id)}</code></p>
      <p class="meta"><strong>profile</strong> <code>${escapeHtml(doc.profile)}</code> · <strong>completeness</strong> <code>${escapeHtml(doc.completeness)}</code></p>
      ${doc.title ? `<p class="meta"><strong>title</strong> ${escapeHtml(doc.title)}</p>` : ""}
      <p><strong>Items</strong> (${doc.items.length})</p>
      <ul class="motif-items" aria-label="Motif items">
${items}
      </ul>
      <h3 class="meta">Palette (keyboard: Enter / Space)</h3>
      <div class="palette" role="toolbar" aria-label="Motif symbol palette">
${palette}
      </div>
      <h3 class="meta">Canvas tiles</h3>
      ${tiles}
    </section>

    ${
      labanStaff
        ? `<section id="laban-subset" aria-labelledby="laban-heading"${mode === "laban-subset" ? "" : " hidden"}>
      <h2 id="laban-heading">laban-subset multi-staff</h2>
      <p class="meta">Pedagogical column staff: not professional Labanotation density.</p>
      ${labanStaff}
    </section>`
        : ""
    }

    <section id="honesty" aria-labelledby="honesty-heading">
      <h2 id="honesty-heading">Current scope</h2>
      <ul>
        <li>Partial Motif must validate against @practice-relay/movement-encode.</li>
        <li>Practice Relay is a separate handoff application that can carry MvEI references.</li>
        <li>MvEI Workbench is the focused authoring surface for the MvEI stack.</li>
      </ul>
    </section>
    </div>

    <footer>
      <p>${escapeHtml(BRAND)} · ${escapeHtml(STANDARD)} · local Motif editing · session localStorage</p>
    </footer>
  </main>
  <script type="module" src="./workbench-client.mjs"></script>
</body>
</html>
`;
}
