/**
 * Practice Relay shell contracts.
 * Why: one product identity keeps handoff work legible across institutional boundaries.
 */
import { escapeHtml } from "./html-escape.mjs";

/** Product name used by every rendered web surface. */
export const BRAND = "Practice Relay";
/** Exact programme statement supplied for the product surface. */
export const TAGLINE = "Carry the work, its evidence, and its permitted uses across institutional handoffs.";
/** Retired labels and claim fragments that must never return to the application UI. */
export const FORBIDDEN_UI_STRINGS = Object.freeze([
  "Partitura", "Kineme", "Continuum", "IWI", "PerformanceScore", "ARDP", "@mac/", "/scores",
  "first digital score", "first collaborative score", "AI coach", "AI feedback",
  "first browser Laban", "first LabanXML", "LabanLite", "replaces GoReact", "replaces Echo360",
  "replaces ossia", "replaces DigiScore", "replaces Motion Bank",
]);

/** Throw when rendered copy contains a retired name or prohibited claim. */
export function assertNoForbiddenCopy(text) {
  const lower = String(text).toLowerCase();
  for (const forbidden of FORBIDDEN_UI_STRINGS) {
    if (lower.includes(forbidden.toLowerCase())) {
      throw new Error(`Forbidden UI string present: "${forbidden}"`);
    }
  }
}

/** Return the relay-path product mark as accessible inline SVG. */
export function practiceRelayMark() {
  return `<svg class="mark" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(BRAND)} mark"><path d="M8 8h7.5a4.5 4.5 0 0 1 0 9H12a4 4 0 0 0 0 8h12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="8" r="3.25" fill="white" stroke="currentColor" stroke-width="2.4"/><circle cx="20" cy="12.5" r="3.25" fill="white" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="25" r="3.25" fill="white" stroke="currentColor" stroke-width="2.4"/></svg>`;
}
