/**
 * Practice Relay HTML text escaping.
 *
 * Why: every rendered Practice Relay surface must use one five-character
 * contract so text and attribute interpolation cannot drift between shells.
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
