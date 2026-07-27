/**
 * @practice-relay/time-core - shared time spine for Practice Relay WorkRecords and MvEI anchors.
 *
 * Why: multi-domain works need one clock (markers/regions) so video, Motif,
 * MusicXML measures, and comments can address the same moments. Schema source
 * of truth lives under ./schemas; this module exports consumable TS types.
 */

export const PACKAGE = "@practice-relay/time-core";
/** Contract version aligned with time-core.schema.json. */
export const SCHEMA_VERSION = "0.1.0";

/**
 * Spine clock mode.
 * - absolute: ms from work start (MVP)
 * - hybrid: absolute + musical meter (later)
 */
export type TimeMode = "absolute" | "hybrid";

/** Instant marker on the spine (cue / rehearsal point). */
export interface TimeMarker {
  id: string;
  /** Milliseconds from spine origin. */
  tMs: number;
  label: string;
}

/** Inclusive time span on the spine (comment/annotation anchor). */
export interface TimeRegion {
  id: string;
  startMs: number;
  endMs: number;
  label?: string;
}

/**
 * Time spine attached to a WorkRecord (and mirrored by media anchors).
 * Matches the WorkRecord Core `spine` and time-core.schema.json.
 */
export interface TimeSpine {
  schemaVersion: string;
  mode: TimeMode;
  durationMs: number;
  markers?: TimeMarker[];
  regions?: TimeRegion[];
}

/**
 * Build a minimal absolute-mode spine for a known duration.
 * Prefer this over ad-hoc objects so schemaVersion stays consistent.
 */
export function createAbsoluteSpine(durationMs: number): TimeSpine {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("durationMs must be a finite non-negative number");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "absolute",
    durationMs,
  };
}
