/**
 * Quiet Dossier record index list renderer.
 * Why: the left rail stays title + revision only - no dense cards or meta clutter.
 */
import { escapeHtml } from "../html-escape.mjs";
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
      return `<li><button type="button" data-record="${escapeHtml(id)}" aria-current="${current ? "true" : "false"}"><strong>${escapeHtml(String(record?.title ?? "Untitled work record"))}</strong><small>${escapeHtml(revisionLabel(record))}</small></button></li>`;
    })
    .join("");
}
