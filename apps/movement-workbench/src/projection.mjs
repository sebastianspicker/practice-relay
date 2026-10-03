/** A read-only projection of the active canonical document. */
import { motifToLabanSubset } from "@practice-relay/movement/browser/transforms";
import { renderLabanSubsetStaffHtml } from "./laban-render.mjs";
import { escapeHtml } from "./html-escape.mjs";

/** Render the active Motif projection with source and loss reporting. */
export function renderProjectionHtml(doc) {
  const projection = motifToLabanSubset(doc);
  // JSON normalization removes optional undefined fields before schema validation.
  const staff = renderLabanSubsetStaffHtml(JSON.parse(JSON.stringify(projection)));
  const warnings = projection.migrationProvenance.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<p class="meta">Read-only projection of <code>${escapeHtml(doc.id)}</code> · source: ${escapeHtml(projection.migrationProvenance.source)}</p>${staff}<details><summary>Projection limitations and warnings</summary><ul>${warnings}</ul></details>`;
}

/** Replace the read-only projection panel after canonical state changes. */
export function renderProjectionState(document, doc) {
  const panel = document.querySelector("#laban-projection");
  if (panel) panel.innerHTML = renderProjectionHtml(doc);
}
