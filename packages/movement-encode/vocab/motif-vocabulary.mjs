/**
 * MvEI Motif vocabulary - browser-readable shared contract for all local implementations.
 *
 * Why: the Workbench palette, glyph coverage, and movement encoding must derive from one
 * controlled vocabulary without coupling browser runtime code to a package build step.
 */

/** Ordered controlled Motif symbol identifiers from the published vocabulary contract. */
export const MOTIF_SYMBOL_IDS = Object.freeze([
  "walk", "run", "turn", "stillness", "gesture_arm", "gesture_leg", "travel", "jump",
  "fall", "rise", "twist", "balance", "effort_strong", "effort_light", "phrase_begin", "phrase_end",
]);
