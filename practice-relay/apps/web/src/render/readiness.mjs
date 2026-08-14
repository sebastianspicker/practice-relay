/**
 * Quiet Dossier decision-column readiness renderer.
 * Why: one calm status list and a single seal-focused action - not a dense condition console.
 */
import { escapeHtml } from "../html-escape.mjs";
import { handoffChecks } from "../readiness.mjs";
import {
  ALPHA_LOCAL_ONLY,
  PREPARE_EXPORT,
  REVIEW_CONDITION,
} from "../ui/copy.mjs";
import { icon } from "../ui/icons.mjs";
import { simulatedActionLabel } from "../demo-mode.mjs";

/**
 * Render Quiet Dossier status list items from handoff checks.
 * @param {{ label: string, complete: boolean }[]} checks Handoff checks.
 * @returns {string}
 */
function renderStatusList(checks) {
  return `<ul class="status-list">${checks
    .map((check) => {
      const cls = check.complete ? "ok" : "block";
      return `<li class="${cls}">${escapeHtml(check.label)}</li>`;
    })
    .join("")}</ul>`;
}

/**
 * Render the hold card when at least one condition is incomplete.
 * @param {{ label: string, complete: boolean }} incomplete First incomplete check.
 * @returns {string}
 */
function renderHoldCard(incomplete, staticDemo = false) {
  return `<div class="hold-card">
      <p>One condition before seal</p>
      <p class="detail">${escapeHtml(incomplete.label)}. No silent grant.</p>
      <button class="primary" type="button" data-action="resolve">${escapeHtml(staticDemo ? simulatedActionLabel(REVIEW_CONDITION) : REVIEW_CONDITION)}</button>
    </div>`;
}

/** Render the export control using its complete or blocked presentation. */
function renderExportControl(allComplete, staticDemo) {
  const attributes = allComplete
    ? 'class="primary" type="button" data-action="export"'
    : 'type="button" class="quiet-link" data-action="export"';
  const label = staticDemo ? simulatedActionLabel(PREPARE_EXPORT) : PREPARE_EXPORT;
  return `<button ${attributes}>${escapeHtml(label)}</button>`;
}

/** Render the optional MvEI handoff target for a record with motion data. */
function renderMotionControl(motion, staticDemo) {
  if (!motion) return "";
  if (staticDemo) {
    return `<p><button class="quiet-link" type="button" data-action="open-workbench">${escapeHtml(simulatedActionLabel("Open in MvEI Workbench"))} ${icon("external")}</button></p>`;
  }
  return `<p><a class="quiet-link" href="http://127.0.0.1:5175/" target="_blank" rel="noopener">Open in MvEI Workbench ${icon("external")}</a></p>`;
}

/**
 * Render the Quiet Dossier decision column (status, hold, prepare export, package, optional MvEI).
 * @param {object | null | undefined} record Workspace record, or falsy for empty state.
 * @returns {string} HTML string for the decision column.
 */
export function renderReadiness(record, options = {}) {
  const staticDemo = options.staticDemo === true;
  if (!record) {
    return `<h2 id="readiness-heading">Handoff check</h2><p class="empty">Select a record to inspect its handoff state.</p>
      <button type="button" data-action="export">${escapeHtml(staticDemo ? simulatedActionLabel(PREPARE_EXPORT) : PREPARE_EXPORT)}</button>`;
  }

  const checks = handoffChecks(record);
  const incomplete = checks.find((check) => !check.complete);
  const allComplete = !incomplete;

  const prepareExport = renderExportControl(allComplete, staticDemo);

  const hold = incomplete ? renderHoldCard(incomplete, staticDemo) : "";

  const packageSection = `<section class="package-summary" id="package-summary">
      <button class="quiet-link" type="button" data-action="manifest">${escapeHtml(staticDemo ? simulatedActionLabel("Package preview") : "Package preview")}</button>
    </section>`;

  const motion = renderMotionControl(record.motion, staticDemo);

  return `<div class="decision-inner">
      <h2 id="readiness-heading" class="visually-hidden">Handoff check</h2>
      ${renderStatusList(checks)}
      ${hold}
      ${prepareExport}
      ${packageSection}
      ${motion}
      <p class="alpha-note">${escapeHtml(ALPHA_LOCAL_ONLY)}</p>
    </div>`;
}
