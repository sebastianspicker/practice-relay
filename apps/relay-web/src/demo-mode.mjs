/**
 * Static-demo boundary shared by the GitHub Pages build and local renderers.
 * Why: Pages must exercise the real visual system without contacting services
 * or presenting local UI state changes as product commands.
 */

/** Return whether a hostname belongs to the hosted GitHub Pages demo surface. */
export function isGitHubPagesHostname(hostname) {
  return typeof hostname === "string" && hostname.toLowerCase().endsWith(".github.io");
}

/** True only for the hosted GitHub Pages surface or an explicit test override. */
export const STATIC_DEMO =
  globalThis.PRACTICE_RELAY_STATIC_DEMO === true ||
  isGitHubPagesHostname(globalThis.location?.hostname);

/** Add an unambiguous visible prefix to a command-capable demo action. */
export function simulatedActionLabel(label) {
  return `Simulate: ${label}`;
}
