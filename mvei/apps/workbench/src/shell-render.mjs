/** Private HTML composition helpers for the MvEI Workbench shell facade. */
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
import { renderAriaLiveRegion } from "./shell-accessibility.mjs";

function renderModeDetails(opts) {
  const mode = opts.mode === "laban-subset" ? "laban-subset" : "motif";
  const message =
    mode === "laban-subset"
      ? "Editor mode: laban-subset staff. Pedagogical multi-column staff: not professional Labanotation density."
      : "Editor mode: Motif canvas. Sequence tiles with controlled vocabulary.";

  return { mode, message };
}

function renderMotifItemsHtml(doc) {
  return (doc.items ?? [])
    .map(
      (it) =>
        `          <li><code>${escapeHtml(it.id)}</code> · ${escapeHtml(it.symbol)}${
          it.durationHint ? ` · ${escapeHtml(it.durationHint)}` : ""
        }</li>`,
    )
    .join("\n");
}

function renderPaletteHtml() {
  return MOTIF_PALETTE.map((s) => `        ${renderPaletteButtonHtml(s)}`).join(
    "\n",
  );
}

function renderModeSectionHtml(mode) {
  return `    <section id="mode" aria-labelledby="mode-heading">
      <h2 id="mode-heading">Editor mode</h2>
      <div class="mode-bar" role="group" aria-label="Editor mode">
        <button type="button" data-mode="motif" aria-pressed="${mode === "motif" ? "true" : "false"}">Motif</button>
        <button type="button" data-mode="laban-subset" aria-pressed="${mode === "laban-subset" ? "true" : "false"}">laban-subset staff</button>
      </div>
      <div class="session-bar" role="group" aria-label="Session">
        <button type="button" data-action="session-save" aria-label="Save Motif session to local storage">Save session</button>
        <button type="button" data-action="session-load" aria-label="Load Motif session from local storage">Load session</button>
      </div>
    </section>`;
}

function renderDocumentSectionHtml(doc, items, palette, tiles) {
  return `    <section id="document" aria-labelledby="doc-heading">
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
    </section>`;
}

function renderLabanSectionHtml(labanStaff, mode) {
  return labanStaff
    ? `<section id="laban-subset" aria-labelledby="laban-heading"${mode === "laban-subset" ? "" : " hidden"}>
      <h2 id="laban-heading">laban-subset multi-staff</h2>
      <p class="meta">Pedagogical column staff: not professional Labanotation density.</p>
      ${labanStaff}
    </section>`
    : "";
}

/** Render the MvEI Workbench alpha shell around an optional Motif or laban-subset document. */
export function renderWorkbenchShellHtml(doc, opts, brand, standard) {
  const { mode, message } = renderModeDetails(opts);
  const items = renderMotifItemsHtml(doc);
  const palette = renderPaletteHtml();
  const tiles = renderCanvasTilesHtml(doc);
  const labanDoc = opts.labanDoc ?? loadCorpusLabanSubset();
  const labanStaff = renderLabanSubsetStaffHtml(labanDoc);

  return `<!DOCTYPE html>
<!-- MvEI Workbench shell. Why: Motif authoring is a focused MvEI round-trip surface. -->
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brand)}: ${escapeHtml(standard)} Motif editor</title>
  <link rel="stylesheet" href="./workbench.css" />
</head>
<body>
  ${renderAriaLiveRegion(message)}
  <header class="workbench-header">
    <div class="brand"><svg class="mark" viewBox="0 0 48 48" role="img" aria-label="Articulated movement path mark"><path d="M8 37C14 37 15 12 24 12s7 24 16 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><circle cx="8" cy="37" r="3" fill="currentColor"/><circle cx="24" cy="12" r="3" fill="currentColor"/><circle cx="40" cy="36" r="3" fill="currentColor"/><path d="M11 25h9m8 0h9" stroke="var(--cobalt-light)" stroke-width="2"/></svg><span>${escapeHtml(brand)}</span></div>
    <div class="std"><span class="std-label">Standard</span>${escapeHtml(standard)} · Motif authoring (alpha)</div>
  </header>
  <main>
    <div class="workspace-heading">
      <div>
        <h1>${escapeHtml(brand)}</h1>
        <p class="tagline">Edit a local Motif sequence and store it in this browser.</p>
      </div>
    </div>

    <div class="editor-shell">
${renderModeSectionHtml(mode)}

${renderDocumentSectionHtml(doc, items, palette, tiles)}

    ${renderLabanSectionHtml(labanStaff, mode)}

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
      <p>${escapeHtml(brand)} · ${escapeHtml(standard)} · local Motif editing · session localStorage</p>
    </footer>
  </main>
  <script type="module" src="./workbench-client.mjs"></script>
</body>
</html>
`;
}
