/** Evidence export presentation; server decisions remain the authorization source. */
import { escapeHtml as e } from "../html-escape.mjs";
import { icon } from "../ui/icons.mjs";

/** Render every artifact without selective-export controls. */
export function evidenceRows(record) {
  return `<ul class="handoff-evidence">${record.artifacts.map(artifact => `<li>${icon("file")}<span>${e(artifact.name ?? artifact.id)}<small>${e(artifact.mediaType ?? "Evidence reference")}</small></span><span class="reference-state">${artifact.contentUrl ? "Reference recorded" : "Reference not recorded"}${artifact.sha256 ? " · SHA-256 recorded" : ""}</span></li>`).join("")}</ul>`;
}

/** Tape class for each visible permission state; the word always travels with the colour. */
const STATE_TAPE = { Granted: "granted", Denied: "denied", Withdrawn: "withdrawn", "No matching grant": "hold" };

/** Present existing grants scoped to the currently typed purpose and destination. */
export function permissionRows(record, intent) {
  const ids = [...new Set(record.artifacts.flatMap(artifact => artifact.representedSubjectIds ?? []))];
  return ids.map(id => {
    const subject = record.subjects.find(item => item.id === id);
    const matching = record.policies.filter(policy => policy.representedSubjectId === id && policy.purpose === intent.purpose && policy.destination === intent.destination);
    const state = matching.some(p => p.state === "withdrawn") ? "Withdrawn" : matching.some(p => p.state === "denied") ? "Denied" : matching.some(p => p.state === "granted") ? "Granted" : "No matching grant";
    return `<li><span class="permission-subject">${e(subject?.label ?? id)}</span><span class="permission-state tape ${STATE_TAPE[state]}">${state === "Granted" ? icon("check") : ""}${state}</span></li>`;
  }).join("") || '<li class="permissions-empty">No represented subjects are linked to the evidence.</li>';
}

/** Explicit faculty/admin policy entry; no decision is selected by default. */
function policyForm(record, intent, open = false) {
  return `<details class="policy-entry"${open ? " open" : ""}><summary>Record an existing permission</summary><p>Record a permission that was obtained elsewhere. This does not collect or verify consent.</p><form id="policy-form"><label>Represented subject<select name="representedSubjectId" required><option value="">Choose a represented subject</option>${record.subjects.map(subject => `<option value="${e(subject.id)}">${e(subject.label)}</option>`).join("")}</select></label><label>Recorded decision<select name="state" required><option value="">Choose the recorded decision</option><option value="granted">Granted</option><option value="denied">Denied</option><option value="withdrawn">Withdrawn</option></select></label><label>Purpose<input name="purpose" value="${e(intent.purpose)}" required></label><label>Destination<input name="destination" value="${e(intent.destination)}" required></label><label class="policy-wide">Supporting evidence reference (optional)<input name="evidenceRef"></label><p class="policy-wide">Denied or withdrawn permissions cannot be overridden by adding a grant.</p><p id="policy-error" role="alert"></p><button class="primary" type="submit">Save permission</button></form></details>`;
}

/** Render the permission ledger: the decision column, with its output scope and action. */
function permissionLedger(record, { intent, decision, demo, canExport, canManage }) {
  const reasons = decision?.reasons ?? [];
  return `<section class="permission-ledger" aria-labelledby="permissions-heading"><h3 id="permissions-heading">Recorded permissions</h3><p class="field-help">For this exact purpose and destination.</p><ul class="permissions" id="permission-list">${permissionRows(record, intent)}</ul>${reasons.length ? `<div class="export-blocker" role="alert"><h3>Evidence export is blocked</h3><ul>${reasons.map(reason => `<li>${e(reason)}</li>`).join("")}</ul>${canManage ? '<p>If a permission was obtained elsewhere, record it below, then check again.</p>' : '<p>A faculty or admin member of this record can record a permission obtained elsewhere.</p>'}</div>` : ''}${canExport ? '' : '<p class="field-help">Your membership permits inspection. Generating an export requires student, faculty, or admin membership.</p>'}<div class="output-scope"><h3>Output</h3><p>Evidence metadata with file references. Media files are not bundled.</p></div><div class="handoff-actions"><button class="primary" type="submit" ${record.artifacts.length && canExport ? '' : 'disabled'}>${demo ? "Simulate: " : ""}Check and generate metadata ${icon("arrow")}</button><button type="button" data-return-movement>Back to movement</button></div></section>`;
}

/** Render preparation with explicit purpose, destination, output scope and blockers. */
export function renderHandoffPreparation(record, state) {
  const { intent, demo, canManage, draftPending } = state;
  return `<div class="handoff-heading prepare-heading"><p class="kicker">Step 1 of 2 · Check permissions</p><h2 tabindex="-1" class="display">Prepare the handoff</h2><p>Name one exact use. Every person represented in the evidence needs a matching recorded permission.</p></div>${draftPending ? '<p class="export-blocker">Your movement draft has unsaved changes. This export uses the evidence already stored in the record. Choose Use in handoff to save the draft first.</p>' : ''}<form id="handoff-form" class="handoff-grid"><section class="intended-use"><h3>Intended use</h3><div class="use-fields"><label>Purpose<input name="purpose" id="handoff-purpose" value="${e(intent.purpose)}" required maxlength="500" autocomplete="off" spellcheck="false"></label><label>Destination<input name="destination" id="handoff-destination" value="${e(intent.destination)}" required maxlength="500" autocomplete="off" spellcheck="false"></label></div><p class="field-help">Use exact recorded values. A destination is a declaration, not a connected delivery service.</p></section>${permissionLedger(record, { ...state, demo })}<section class="handoff-items"><h3>Evidence · ${record.artifacts.length} ${record.artifacts.length === 1 ? "item" : "items"}</h3>${evidenceRows(record)}</section></form>${canManage ? policyForm(record, intent, Boolean(state.decision?.reasons?.length)) : '<p class="field-help policy-note">Recording explicit permissions requires faculty or admin membership on this record.</p>'}`;
}

/** Render the generated result without claiming media delivery or a completed browser download. */
export function renderHandoffSuccess(record, { intent, result, demo }) {
  const count = result.decision.includedArtifactIds.length;
  return `<div class="handoff-heading complete-heading"><p class="kicker">Step 2 of 2 · Result</p><h2 tabindex="-1" class="display">Ready for your next review</h2><p>${demo ? "Simulated evidence metadata" : "Evidence metadata generated"}</p><dl class="intent-summary"><div><dt>Purpose</dt><dd>${e(intent.purpose)}</dd></div><div><dt>Destination</dt><dd>${e(intent.destination)}</dd></div></dl></div><div class="handoff-grid result-grid"><section class="metadata-result"><div class="metadata-title">${icon("file")}<div><h3>${demo ? "simulated-" : ""}ro-crate-metadata.json</h3><p>${demo ? "Synthetic demonstration" : "RO-Crate 1.3"} · References ${count} evidence ${count === 1 ? "item" : "items"}</p></div><span class="tape granted">${icon("check")}${demo ? "Simulated" : "Generated"}</span></div>${evidenceRows(record)}<p>Includes file references, recorded hashes and represented subjects.</p><p class="field-help">Media bytes and permission records are not included.</p></section><div class="result-next"><p class="delivery-note">${icon("info")}Nothing has been sent to ${e(intent.destination)}.</p><p class="field-help">Download the metadata and deliver it through the destination's own process.</p><div class="handoff-actions"><button class="primary" type="button" data-download-metadata>Download ${demo ? "simulation" : "metadata"} ${icon("arrow")}</button><button type="button" data-return-movement>Return to movement</button><button type="button" data-new-export>Prepare another export</button></div></div></div>`;
}
