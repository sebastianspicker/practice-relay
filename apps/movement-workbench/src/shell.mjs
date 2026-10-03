/**
 * MvEI Workbench shell: brand chrome, corpus load, emit/load round-trip.
 *
 * Why: the alpha authoring surface edits local Motif data against the shared corpus.
 */
import { MOVEMENT_CORPUS } from "@practice-relay/movement/browser/examples";
import { emitMotif, loadMotif } from "./motif.mjs";
import {
  announceToLiveRegion,
  renderAriaLiveRegion,
} from "./shell-accessibility.mjs";
import { renderWorkbenchShellHtml } from "./shell-render.mjs";

export { announceToLiveRegion, renderAriaLiveRegion };

export const BRAND = "MvEI Workbench";
export const STANDARD = "MvEI (Movement Encoding Initiative)";

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
  return loadMotif(JSON.stringify(MOVEMENT_CORPUS.motifSketch));
}

/**
 * Load the bundled demo Motif used by the alpha workspace.
 * @returns {import("./motif.mjs").MotifDocument}
 */
export function loadDemoMotif() {
  return loadMotif(JSON.stringify(MOVEMENT_CORPUS.workbenchDemo));
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
/** Render the MvEI Workbench alpha shell around an optional Motif or laban-subset document. */
export function renderShellHtml(doc = loadDemoMotif(), opts = {}) {
  return renderWorkbenchShellHtml(doc, opts, BRAND, STANDARD);
}
