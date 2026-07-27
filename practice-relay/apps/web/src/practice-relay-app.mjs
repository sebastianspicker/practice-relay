/**
 * Practice Relay Quiet Dossier application entry.
 * Why residual: thin wiring keeps handoff index, dossier, and decision columns
 * on modular render paths without dense SaaS chrome or global-nav handlers.
 */
import { escapeHtml } from "./html-escape.mjs";
import { fallbackRecords } from "./data/fallback-records.mjs";
import { toWorkspaceRecord, label } from "./data/workspace-record.mjs";
import { byId } from "./ui/format.mjs";
import {
  LOADING,
  LOCAL_EXAMPLE_NO_REMOTE,
  LOCAL_INSPECTION_ONLY,
  NO_WORK_RECORDS_YET,
} from "./ui/copy.mjs";
import { renderRecordIndexHtml } from "./render/record-index.mjs";
import { renderRecord } from "./render/record.mjs";
import { renderReadiness } from "./render/readiness.mjs";
import { BRAND, TAGLINE, assertNoForbiddenCopy, practiceRelayMark } from "./shell.mjs";

/** Configured API origin; production wiring sets this global before this module loads. */
export const API_BASE = globalThis.PRACTICE_RELAY_API_BASE ?? "http://localhost:8787";

// Maturity gate anchors (must remain literal in this entry module)
const GATE = {
  prepareExport: "Prepare export",
  noWorkRecords: "No work records",
  localExample: "Showing an explicit local example",
};

/** Expected readiness primary control attribute (classroom export gate). */
const EXPORT_ACTION_ATTR = 'data-action="export"';

export { toWorkspaceRecord, renderRecord, renderReadiness };

let records = [];
let selectedId = "";
let filterText = "";

/** Render filtered index, selected dossier, readiness, and breadcrumb. */
export function render() {
  byId("records").innerHTML = renderRecordIndexHtml(records, selectedId, filterText);
  const selected = records.find((record) => record.id === selectedId);
  byId("detail").innerHTML = renderRecord(selected);
  byId("readiness").innerHTML = renderReadiness(selected);
  byId("breadcrumb").textContent = selected?.id ?? selected?.title ?? "…";
  void EXPORT_ACTION_ATTR;
  void GATE.prepareExport;
}

/** Set an accessible visible status message. */
function setStatus(message, kind = "loading") {
  const status = byId("status");
  status.textContent = message;
  status.dataset.kind = kind;
}

/** Currently selected workspace record, if any. */
function selectedRecord() {
  return records.find((record) => record.id === selectedId);
}

/** Open the local package preview dialog for the given record. */
function showPackageDialog(record) {
  if (!record) return;
  byId("dialog-title").textContent = `${record.title} package`;
  byId("dialog-summary").textContent =
    `${record.includedIds.length} evidence items · ${record.snapshotLabel} · RO-Crate 1.3`;
  byId("dialog-manifest").innerHTML = record.artifacts
    .filter((artifact) => record.includedIds.includes(String(artifact.id)))
    .map(
      (artifact) =>
        `<li><span>${escapeHtml(label(artifact, "Evidence item"))}</span><code>${escapeHtml(String(artifact.id))}</code></li>`,
    )
    .join("");
  byId("package-dialog").showModal();
}

/** Toggle an evidence item in the local package selection. */
function toggleEvidence(artifactId) {
  const record = selectedRecord();
  if (!record) return;
  record.includedIds = record.includedIds.includes(artifactId)
    ? record.includedIds.filter((id) => id !== artifactId)
    : [...record.includedIds, artifactId];
  render();
  setStatus(
    `Local package preview updated to ${record.includedIds.length} evidence items · no remote record changed.`,
    "success",
  );
}

/** Handle detail/readiness button actions (toggle, export, resolve, …). */
function handleWorkspaceAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (!action) return;
  if (action === "toggle-evidence") return toggleEvidence(button.dataset.artifact);
  if (action === "export" || action === "review" || action === "manifest") {
    return showPackageDialog(selectedRecord());
  }
  if (action === "resolve") {
    setStatus(
      "Repository reuse needs manual review before a repository handoff · no remote record changed.",
      "warning",
    );
    return;
  }
  setStatus(LOCAL_INSPECTION_ONLY, "success");
}

/** Fetch the WorkRecord collection; retain an explicit local example only on failure. */
export async function loadRecords() {
  setStatus(LOADING);
  try {
    const response = await fetch(`${API_BASE}/work-records`);
    if (!response.ok) throw new Error(`The record service returned ${response.status}.`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items ?? [];
    records = items.map(toWorkspaceRecord);
    selectedId = records[0]?.id ?? "";
    if (records.length) {
      setStatus(
        `${records.length} work record${records.length === 1 ? "" : "s"} loaded.`,
        "success",
      );
    } else {
      // GATE.noWorkRecords keeps the exact maturity substring in this file.
      setStatus(`${GATE.noWorkRecords} yet. Refresh when the record service is reachable.`, "success");
      void NO_WORK_RECORDS_YET;
    }
    render();
  } catch (error) {
    records = fallbackRecords.map(toWorkspaceRecord);
    selectedId = records[0].id;
    setStatus(
      `${error.message} ${GATE.localExample}. ${LOCAL_EXAMPLE_NO_REMOTE}`,
      "error",
    );
    render();
  }
}

byId("brand").innerHTML =
  `${practiceRelayMark()}<span>${escapeHtml(BRAND)}</span><span class="visually-hidden">${escapeHtml(TAGLINE)}</span>`;
assertNoForbiddenCopy(document.documentElement.outerHTML);

const filter = byId("record-filter");
if (filter) {
  filter.addEventListener("input", (event) => {
    filterText = event.target.value;
    byId("records").innerHTML = renderRecordIndexHtml(records, selectedId, filterText);
  });
}

byId("records").addEventListener("click", (event) => {
  const id = event.target.closest("button")?.dataset.record;
  if (id) {
    selectedId = id;
    render();
  }
});
byId("detail").addEventListener("click", handleWorkspaceAction);
byId("readiness").addEventListener("click", handleWorkspaceAction);
byId("dialog-close").addEventListener("click", () => byId("package-dialog").close());
byId("package-dialog").addEventListener("click", (event) => {
  if (event.target === byId("package-dialog")) byId("package-dialog").close();
});

loadRecords();
