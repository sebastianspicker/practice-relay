/**
 * Static-demo boundary shared by the GitHub Pages build and local renderers.
 * Why: Pages must exercise the real visual system without contacting services
 * or presenting local UI state changes as product commands.
 */

/** True only for the hosted GitHub Pages surface or an explicit test override. */
export const STATIC_DEMO =
  globalThis.PRACTICE_RELAY_STATIC_DEMO === true ||
  globalThis.location?.hostname?.endsWith(".github.io") === true;

/** Add an unambiguous visible prefix to a command-capable demo action. */
export function simulatedActionLabel(label) {
  return STATIC_DEMO ? `Simulate: ${label}` : label;
}
