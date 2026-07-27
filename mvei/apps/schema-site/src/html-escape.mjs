/**
 * MvEI schema-site HTML text escaping.
 *
 * Why: the schema-site keeps its rendering boundary independent while using a
 * complete five-character contract for generated text and attributes.
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
