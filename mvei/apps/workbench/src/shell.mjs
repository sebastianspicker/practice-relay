/**
 * MvEI Workbench shell: brand chrome, corpus load, emit/load round-trip.
 *
 * Why: the alpha authoring surface edits local Motif data against the shared corpus.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitMotif, loadMotif } from "./motif.mjs";
import {
  announceToLiveRegion,
  renderAriaLiveRegion,
} from "./shell-accessibility.mjs";
import { renderWorkbenchShellHtml } from "./shell-render.mjs";

export { announceToLiveRegion, renderAriaLiveRegion };

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
/** Render the MvEI Workbench alpha shell around an optional Motif or laban-subset document. */
export function renderShellHtml(doc = loadDemoMotif(), opts = {}) {
  return renderWorkbenchShellHtml(doc, opts, BRAND, STANDARD);
}
