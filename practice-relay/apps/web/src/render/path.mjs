/**
 * Quiet Dossier handoff path stage helpers.
 * Why: Version / Evidence / Conditions / Recipient stay a sparse text path, not a progress widget.
 */
import { handoffChecks } from "../readiness.mjs";

/**
 * Return path stage descriptors with Quiet Dossier classes (`done` | `now` | "").
 * Conditions is `now` while any check is incomplete; when all pass, stages are done and Recipient is `now`.
 * @param {object | null | undefined} record Workspace record (or empty).
 * @returns {{ name: string, className: string }[]}
 */
export function pathStages(record) {
  const checks = handoffChecks(record);
  const versionOk = Boolean(checks[0]?.complete);
  const evidenceOk = Boolean(checks[1]?.complete);
  const allOk = checks.length > 0 && checks.every((check) => check.complete);

  if (allOk) {
    return [
      { name: "Version", className: "done" },
      { name: "Evidence", className: "done" },
      { name: "Conditions", className: "done" },
      { name: "Recipient", className: "now" },
    ];
  }

  // Any incomplete check keeps Conditions as the current seal step.
  return [
    { name: "Version", className: versionOk ? "done" : "" },
    { name: "Evidence", className: evidenceOk ? "done" : "" },
    { name: "Conditions", className: "now" },
    { name: "Recipient", className: "" },
  ];
}

/**
 * Render the Quiet Dossier `ol.path` for a workspace record.
 * @param {object | null | undefined} record Workspace record.
 * @returns {string} HTML for the handoff path list.
 */
export function renderPathHtml(record) {
  const stages = pathStages(record);
  return `<ol class="path" aria-label="Handoff path">${stages
    .map((stage) => {
      const cls = stage.className ? ` class="${stage.className}"` : "";
      return `<li${cls}>${stage.name}</li>`;
    })
    .join("")}</ol>`;
}
