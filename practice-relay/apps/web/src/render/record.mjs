/**
 * Quiet Dossier main-column record renderer.
 * Why: one calm dossier surface - kicker, title, path, and thin evidence list without tabs or provenance chrome.
 */
import { escapeHtml } from "../html-escape.mjs";
import { label } from "../data/workspace-record.mjs";
import { formatDate } from "../ui/format.mjs";
import { icon } from "../ui/icons.mjs";
import { simulatedActionLabel } from "../demo-mode.mjs";
import { DESTINATION, SOURCE_SYSTEMS_FOOTNOTE } from "../ui/copy.mjs";
import { renderPathHtml } from "./path.mjs";

/**
 * Derive a short glyph label from media type / artifact id.
 * @param {object} artifact Evidence artifact.
 * @returns {string}
 */
function glyphLabel(artifact) {
  const type = String(artifact?.mediaType ?? "").toLowerCase();
  const id = String(artifact?.id ?? "").toLowerCase();
  if (type.includes("musicxml") || type.includes("xml")) return "XML";
  if (type.startsWith("audio") || type.includes("wav")) return "WAV";
  if (type.includes("markdown") || type === "text/markdown") return "MD";
  if (type.includes("pdf")) return "PDF";
  if (type.includes("json") || id === "cues" || id === "movement") return "JSON";
  if (type.startsWith("image")) return "IMG";
  if (type.startsWith("video")) return "MP4";
  const slash = type.lastIndexOf("/");
  if (slash >= 0 && type.slice(slash + 1)) {
    const ext = type.slice(slash + 1).replace(/[^a-z0-9+]+/gi, "").slice(0, 4);
    if (ext) return ext.toUpperCase();
  }
  return "FILE";
}

/**
 * Whether this artifact uses the rehearsal photo thumb (video / movement).
 * @param {object} artifact Evidence artifact.
 * @returns {boolean}
 */
function usesPhotoThumb(artifact) {
  const type = String(artifact?.mediaType ?? "").toLowerCase();
  const id = String(artifact?.id ?? "").toLowerCase();
  return type.startsWith("video") || id === "movement" || type.includes("movement");
}

/**
 * Render one quiet evidence row (tick, thumb, name+detail, take).
 * @param {object} artifact Evidence artifact.
 * @param {boolean} included Whether the artifact is in the package selection.
 * @returns {string}
 */
function renderEvidenceItem(artifact, included, staticDemo = false) {
  const id = String(artifact?.id ?? "");
  const name = label(artifact, "Evidence item");
  const detail = artifact?.detail ?? artifact?.mediaType ?? "Retained evidence";
  const take = artifact?.preferredTake ? String(artifact.preferredTake) : "";
  const tickClass = included ? "tick" : "tick empty";
  const ariaPressed = included ? "true" : "false";
  const actionLabel = `${included ? "Exclude" : "Include"} ${name}`;
  const ariaLabel = staticDemo ? simulatedActionLabel(actionLabel) : actionLabel;
  const thumb = usesPhotoThumb(artifact)
    ? `<div class="thumb photo" role="img" aria-label=""></div>`
    : `<div class="thumb glyph" aria-hidden="true">${escapeHtml(glyphLabel(artifact))}</div>`;
  const takeHtml = take
    ? `<span class="take">${escapeHtml(take)}</span>`
    : `<span class="take none">-</span>`;
  const outClass = included ? "" : ` class="out"`;

  const simulationMarker = staticDemo ? `<span class="simulation-marker">Simulated</span>` : "";

  return `<li${outClass}>
      <button class="${tickClass}" type="button" data-action="toggle-evidence" data-artifact="${escapeHtml(id)}" aria-pressed="${ariaPressed}" aria-label="${escapeHtml(ariaLabel)}">${included ? icon("check") : ""}</button>
      ${thumb}
      <div class="item">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(String(detail))}${simulationMarker}</small>
      </div>
      ${takeHtml}
    </li>`;
}

/**
 * Render the Quiet Dossier main column for a workspace record.
 * @param {object | null | undefined} record Workspace record, or falsy for empty state.
 * @returns {string} HTML string for the dossier column.
 */
export function renderRecord(record, options = {}) {
  if (!record) {
    return `<div class="empty"><h1 id="record-title">No record selected</h1><p>Choose a work record from the index, or refresh when the record service is reachable.</p></div>`;
  }

  const versionName = record.versions?.[0]?.name ?? "Current record";
  const includedIds = Array.isArray(record.includedIds) ? record.includedIds.map(String) : [];
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const includedCount = artifacts.filter((artifact) => includedIds.includes(String(artifact.id))).length;

  const evidenceRows = artifacts
    .map((artifact) => renderEvidenceItem(
      artifact,
      includedIds.includes(String(artifact.id)),
      options.staticDemo === true,
    ))
    .join("");

  return `<p class="kicker">
      <span>${escapeHtml(String(record.profile ?? "WorkRecord"))}</span>
      <span>${escapeHtml(String(versionName))}</span>
      <span>${escapeHtml(formatDate(record.submitted))}</span>
    </p>
    <h1 id="record-title">${escapeHtml(String(record.title ?? "Untitled work record"))}</h1>
    <p class="destination">For <em>${escapeHtml(DESTINATION)}</em></p>
    ${renderPathHtml(record)}
    <div id="evidence-panel">
      <div class="section-label">
        <h2>Evidence</h2>
        <span>${includedCount} included</span>
      </div>
      <ul class="evidence">${evidenceRows}</ul>
    </div>
    <p class="footnote">${escapeHtml(SOURCE_SYSTEMS_FOOTNOTE)}</p>`;
}
