/**
 * Quiet Dossier record index list renderer.
 * Why: the left rail stays title + revision only - no dense cards or meta clutter.
 */
import { escapeHtml } from "../html-escape.mjs";
import { handoffChecks } from "../readiness.mjs";
import { NO_WORK_RECORDS } from "../ui/copy.mjs";

/**
 * Format a short revision label for the quiet index (`Rev 05`).
 * @param {object} record Workspace record.
 * @returns {string}
 */
function revisionLabel(record) {
  const n = Number(record?.revision);
  if (Number.isFinite(n) && n > 0) {
    return `Rev ${String(Math.trunc(n)).padStart(2, "0")}`;
  }
  const name = record?.versions?.[0]?.name;
  if (name) return String(name);
  return "Rev -";
}

/** Derive a compact, text-paired index status from the actual handoff checks. */
function indexStatus(record) {
  if (!Array.isArray(record?.policies)) return { className: "idle", label: "Details on selection" };
  const checks = handoffChecks(record);
  if (checks.length && checks.every((check) => check.complete)) return { className: "ok", label: "Ready" };
  const states = Array.isArray(record?.policies)
    ? record.policies.map((policy) => String(policy?.state ?? "").toLowerCase())
    : [];
  return states.some((state) => state === "denied" || state === "withdrawn")
    ? { className: "hold", label: "Hold" }
    : { className: "idle", label: "Review" };
}

/**
 * Render the quiet records list HTML (list items for the index rail).
 * @param {object[]} records Workspace records.
 * @param {string} selectedId Currently selected record id.
 * @param {string} [filterText=""] Optional title filter.
 * @returns {string} HTML string for the records list.
 */
export function renderRecordIndexHtml(records, selectedId, filterText = "") {
  const query = String(filterText ?? "").trim().toLowerCase();
  const list = Array.isArray(records) ? records : [];
  const visible = query
    ? list.filter((record) => String(record?.title ?? "").toLowerCase().includes(query))
    : list;

  if (!visible.length) {
    return `<li class="empty">${escapeHtml(NO_WORK_RECORDS)}</li>`;
  }

  return visible
    .map((record) => {
      const id = String(record?.id ?? "");
      const current = id === String(selectedId);
      const status = indexStatus(record);
      return `<li><button type="button" data-record="${escapeHtml(id)}" aria-current="${current ? "true" : "false"}"><strong class="r-title">${escapeHtml(String(record?.title ?? "Untitled work record"))}</strong><span class="r-sub"><span class="r-state"><span class="dot ${status.className}" aria-hidden="true"></span>${status.label}</span><span aria-hidden="true">·</span><span>${escapeHtml(revisionLabel(record))}</span></span></button></li>`;
    })
    .join("");
}
