/** Accessibility helpers shared by the Workbench shell renderer and client-facing facade. */
import { escapeHtml } from "./html-escape.mjs";

/**
 * Live region HTML for mode / session announcements (full workflow a11y).
 * @param {string} [text]
 * @returns {string}
 */
export function renderAriaLiveRegion(text = "") {
  return `<div id="mvei-workbench-live" class="workbench-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(text)}</div>`;
}

/**
 * Apply text to an aria-live region element (DOM helper).
 * @param {{ textContent?: string } | null | undefined} el
 * @param {string} text
 */
export function announceToLiveRegion(el, text) {
  if (!el) return;
  el.textContent = String(text ?? "");
}
