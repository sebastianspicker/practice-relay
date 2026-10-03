/** Evidence export presentation; server decisions remain the authorization source. */
import { escapeHtml as e } from "../html-escape.mjs";
import { icon } from "../ui/icons.mjs";

/** Render every artifact without selective-export controls. */
export function evidenceRows(record) {
  return `<ul class="handoff-evidence">${record.artifacts.map(artifact => `<li>${icon("file")}<span>${e(artifact.name ?? artifact.id)}<small>${e(artifact.mediaType ?? "Evidence reference")}</small></span><span class="reference-state">${artifact.contentUrl ? "Reference recorded" : "Reference not recorded"}${artifact.sha256 ? " · SHA-256 recorded" : ""}</span></li>`).join("")}</ul>`;
}

/** Present existing grants scoped to the currently typed purpose and destination. */
export function permissionRows(record, intent) {
  const ids = [...new Set(record.artifacts.flatMap(artifact => artifact.representedSubjectIds ?? []))];
  return ids.map(id => {
    const subject = record.subjects.find(item => item.id === id);
    const matching = record.policies.filter(policy => policy.representedSubjectId === id && policy.purpose === intent.purpose && policy.destination === intent.destination);
    const state = matching.some(p => p.state === "withdrawn") ? "Withdrawn" : matching.some(p => p.state === "denied") ? "Denied" : matching.some(p => p.state === "granted") ? "Granted" : "No matching grant";
    return `<li><span>${e(subject?.label ?? id)}</span><span class="permission-state">${state === "Granted" ? icon("check") : icon("warning")}${state}</span></li>`;
  }).join("") || '<li>No represented subjects are linked to the evidence.</li>';
}

/** Explicit faculty/admin policy entry; no decision is selected by default. */
function policyForm(record, intent) {
  return `<details class="policy-entry"><summary>Record an existing permission</summary><p>Record permission obtained elsewhere. This does not collect or verify consent.</p><form id="policy-form"><label>Represented subject<select name="representedSubjectId" required><option value="">Choose a represented subject</option>${record.subjects.map(subject => `<option value="${e(subject.id)}">${e(subject.label)}</option>`).join("")}</select></label><label>Purpose<input name="purpose" value="${e(intent.purpose)}" required></label><label>Destination<input name="destination" value="${e(intent.destination)}" required></label><label>Recorded decision<select name="state" required><option value="">Choose the recorded decision</option><option value="granted">Granted</option><option value="denied">Denied</option><option value="withdrawn">Withdrawn</option></select></label><label>Supporting evidence reference (optional)<input name="evidenceRef"></label><p>Denied or withdrawn permissions cannot be overridden by adding a grant.</p><p id="policy-error" role="alert"></p><button class="primary" type="submit">Save permission</button></form></details>`;
}

/** Render preparation with explicit purpose, destination, output scope and blockers. */
export function renderHandoffPreparation(record, state) {
  const { intent, decision, demo, canManage, draftPending, canExport } = state;
  const reasons = decision?.reasons ?? [];
  return `<div class="handoff-heading prepare-heading"><div><p class="step-label">02 / Prepare</p><h2 tabindex="-1">Prepare the handoff</h2><p>Review the evidence and intended use.</p></div>${demo && record.id === "synthetic-weight-study" ? '<img src="./assets/studio-rehearsal.png" alt="Synthetic rehearsal reference">' : ''}</div>${draftPending ? '<p class="export-blocker">Your movement draft has unsaved changes. This export uses the evidence already stored in the record. Choose Use in handoff to save the draft first.</p>' : ''}<section><h3>Evidence · ${record.artifacts.length} items</h3>${evidenceRows(record)}</section><form id="handoff-form"><div class="handoff-fields"><section><h3>Intended use</h3><label>Purpose<input name="purpose" id="handoff-purpose" value="${e(intent.purpose)}" required maxlength="500" autocomplete="off"></label><label>Destination<input name="destination" id="handoff-destination" value="${e(intent.destination)}" required maxlength="500" autocomplete="off"></label><p class="field-help">Use exact recorded values. A destination is a declaration, not a connected delivery service.</p></section><section><h3>Recorded permissions</h3><p class="field-help">For this purpose and destination.</p><ul class="permissions" id="permission-list">${permissionRows(record, intent)}</ul></section></div>${reasons.length ? `<div class="export-blocker" role="alert"><h3>Evidence export is blocked</h3><ul>${reasons.map(reason => `<li>${e(reason)}</li>`).join("")}</ul></div>` : ''}${canExport ? '' : '<p class="field-help">Your membership permits inspection. Generating an export requires student, faculty, or admin membership.</p>'}<div class="output-scope"><h3>Output</h3><p>Evidence metadata with file references. Media files are not bundled.</p></div><div class="handoff-actions"><button class="primary" type="submit" ${record.artifacts.length && canExport ? '' : 'disabled'}>${demo ? "Simulate: " : ""}Check and generate metadata ${icon("arrow")}</button><button type="button" data-return-movement>Back to movement</button></div></form>${canManage ? policyForm(record, intent) : '<p class="field-help">Recording explicit permissions requires faculty or admin membership on this record.</p>'}`;
}

/** Render the generated result without claiming media delivery or a completed browser download. */
export function renderHandoffSuccess(record, { intent, result, demo }) {
  const count = result.decision.includedArtifactIds.length;
  return `<div class="handoff-heading complete-heading"><span class="success-mark" aria-hidden="true">${icon("check")}</span><div><p class="step-label">03 / Complete</p><h2 tabindex="-1">Ready for your next review</h2><p>${demo ? "Simulated evidence metadata" : "Evidence metadata generated"}</p><p class="intent-summary">${e(intent.purpose)} · ${e(intent.destination)}</p></div>${demo && record.id === "synthetic-weight-study" ? '<img src="./assets/studio-rehearsal.png" alt="Synthetic rehearsal reference">' : ''}</div><section class="metadata-result"><div class="metadata-title">${icon("file")}<div><h3>${demo ? "simulated-" : ""}ro-crate-metadata.json</h3><p>${demo ? "Synthetic demonstration" : "RO-Crate 1.3"} · References ${count} evidence ${count === 1 ? "item" : "items"}</p></div></div>${evidenceRows(record)}<p>Includes file references, recorded hashes and represented subjects.</p><p class="field-help">Media bytes and permission records are not included.</p></section><p class="delivery-note">${icon("info")}Nothing has been sent to ${e(intent.destination)}.</p><div class="handoff-actions"><button class="primary" type="button" data-download-metadata>Download ${demo ? "simulation" : "metadata"} ${icon("arrow")}</button><button type="button" data-return-movement>Return to movement</button><button type="button" data-new-export>Prepare another export</button></div>`;
}
