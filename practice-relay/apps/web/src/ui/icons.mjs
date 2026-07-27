/**
 * Minimal Practice Relay inline SVG icons for Quiet Dossier and handoff chrome.
 * Why residual: shared stroke paths keep status, package, and evidence glyphs
 * consistent without a third-party icon kit.
 */

/** Path fragments for the Quiet Dossier-facing icon set (stroke currentColor). */
const icons = Object.freeze({
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M10.3 3.6 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  file: '<path d="M6 2h8l4 4v16H6zM14 2v5h4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M19 13v7H4V5h7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  package: '<path d="m12 2 8 4.5v10L12 22l-8-5.5v-10Z"/><path d="m4 6.5 8 5 8-5M12 22V11.5"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
});

/** Render a named icon as an accessible-hidden SVG element. */
export function icon(name, className = "icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] ?? icons.file}</svg>`;
}
