/**
 * MvEI Workbench HTML text escaping.
 *
 * Why: authoring UI renderers share one complete escaping contract without
 * coupling the Workbench to separate Practice Relay or MvEI infrastructure modules.
 */

/** Escape untrusted text before inserting it into generated HTML. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
