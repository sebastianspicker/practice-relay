/**
 * Shared WorkRecord time spine for media and movement anchors.
 *
 * Why: multi-domain works need one clock (markers/regions) so video, Motif,
 * MusicXML measures, and comments can address the same moments. Schema source
 * of truth lives under ./schemas; this module exports consumable TS types.
 */

/** Contract version aligned with time-core.schema.json. */
export const TIME_SCHEMA_VERSION = "0.1.0";
export const SCHEMA_VERSION = TIME_SCHEMA_VERSION;

/**
 * Spine clock mode.
 * - absolute: ms from work start (MVP)
 * - hybrid: absolute milliseconds plus a required musical meter
 */
export type TimeMode = "absolute" | "hybrid";

/** Musical meter required by a hybrid time spine. */
export interface TimeMeter {
  tempoBpm: number;
  timeSignature: string;
}

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
 * Matches the WorkRecord `spine` and time-core.schema.json.
 */
interface BaseTimeSpine {
  schemaVersion: typeof TIME_SCHEMA_VERSION;
  durationMs: number;
  markers?: TimeMarker[];
  regions?: TimeRegion[];
}

/** Millisecond-only time spine used by the current WorkRecord factories. */
export interface AbsoluteTimeSpine extends BaseTimeSpine {
  mode: "absolute";
  meter?: never;
}

/** Combined millisecond and musical-meter spine. */
export interface HybridTimeSpine extends BaseTimeSpine {
  mode: "hybrid";
  meter: TimeMeter;
}

/** Time spine attached to a WorkRecord and mirrored by media anchors. */
export type TimeSpine = AbsoluteTimeSpine | HybridTimeSpine;

/**
 * Build a minimal absolute-mode spine for a known duration.
 * Prefer this over ad-hoc objects so schemaVersion stays consistent.
 */
export function createAbsoluteSpine(durationMs: number): AbsoluteTimeSpine {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("durationMs must be a finite non-negative number");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "absolute",
    durationMs,
  };
}
