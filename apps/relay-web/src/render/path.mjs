/**
 * Quiet Dossier handoff path stage helpers.
 * Why: Version / Evidence / Conditions / Recipient / Seal stay a sparse text path, not a progress widget.
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
  if (allOk) return [
    { name: "Version", className: "done" },
    { name: "Evidence", className: "done" },
    { name: "Conditions", className: "done" },
    { name: "Recipient", className: "done" },
    { name: "Seal", className: "now" },
  ];

  const conditionsOk = checks.slice(2).every((check) => check.complete);
  const currentStage = !versionOk ? "Version" : !evidenceOk ? "Evidence" : "Conditions";

  return [
    { name: "Version", className: versionOk ? "done" : currentStage === "Version" ? "now" : "" },
    { name: "Evidence", className: evidenceOk ? "done" : currentStage === "Evidence" ? "now" : "" },
    { name: "Conditions", className: conditionsOk && evidenceOk ? "done" : currentStage === "Conditions" ? "now" : "" },
    { name: "Recipient", className: "" },
    { name: "Seal", className: "" },
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
      return `<li${cls}><span class="step-dot" aria-hidden="true">${stage.className === "done" ? "✓" : ""}</span>${stage.name}</li>`;
    })
    .join("")}</ol>`;
}
