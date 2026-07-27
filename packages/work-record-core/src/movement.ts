/**
 * WorkRecord notation, co-timeline, and analysis-track mutations.
 * Why: MvEI/music integration remains separate from generic record editing.
 */
import type { Track, TrackType, WorkRecord } from "./index.ts";
import { assertResourceId, assertTrack } from "./validation.ts";

/** Attaches a real MvEI Motif reference as a movement-notation track. */
export function attachMveiMotifTrack(record: WorkRecord, track: { id: string; ref: string; label?: string }): WorkRecord {
  assertResourceId(track.id, "track id");
  if (typeof track.ref !== "string" || !track.ref.trim()) throw new Error("mvei motif ref required (path to real Motif JSON)");
  if (/(?:^|[^a-z])mock(?:[^a-z]|$)/i.test(track.ref)) throw new Error("mvei motif ref must be real Motif JSON, not a mock string");
  const nextTrack: Track = { id: track.id, type: "movement_notation", label: track.label ?? "MvEI Motif", ref: track.ref };
  assertTrack(nextTrack);
  const existing = record.tracks.find((candidate) => candidate.id === track.id);
  if (existing && existing.type !== "movement_notation") throw new Error("mvei track cannot overwrite a non-movement-notation track");
  return {
    ...record,
    tracks: existing ? record.tracks.map((candidate) => candidate.id === track.id ? nextTrack : candidate) : [...record.tracks, nextTrack],
    movementCapability: record.movementCapability === "none" || record.movementCapability === "annotation" ? "mvei_view" : record.movementCapability,
  };
}

/** Attaches a real MusicXML/MEI reference for co-timeline use. */
export function attachMusicNotationTrack(record: WorkRecord, track: { id: string; ref: string; label?: string }): WorkRecord {
  assertResourceId(track.id, "track id");
  if (typeof track.ref !== "string" || !track.ref.trim()) throw new Error("music notation ref required (path to MusicXML/MEI)");
  if (/(?:^|[^a-z])mock(?:[^a-z]|$)/i.test(track.ref)) throw new Error("music notation ref must be a real notation path, not a mock string");
  const nextTrack: Track = { id: track.id, type: "music_notation", label: track.label ?? "Music notation", ref: track.ref };
  assertTrack(nextTrack);
  const existing = record.tracks.find((candidate) => candidate.id === track.id);
  if (existing && existing.type !== "music_notation") throw new Error("music notation track cannot overwrite a different track type");
  return { ...record, tracks: existing ? record.tracks.map((candidate) => candidate.id === track.id ? nextTrack : candidate) : [...record.tracks, nextTrack] };
}

/** Minimal Motif annex shape for co-timeline alignment checks. */
export interface CoTimelineMotifLike {
  musicCoTimeline?: {
    musicxmlRef?: string | null;
    meiRef?: string | null;
    anchors?: Array<{ motifItemId: string; musicMeasure?: string; tMs?: number }>;
  };
}

/** Validates notation tracks and Motif anchors against a record measure count. */
export function validateRecordCoTimeline(record: WorkRecord, motif: CoTimelineMotifLike, measureCount: number): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  errors.push(...notationTrackErrors(record, measureCount));
  errors.push(...coTimelineAnnexErrors(record, motif.musicCoTimeline, measureCount));
  return { ok: errors.length === 0, errors };
}

/** Check required notation-track presence and a usable positive measure count. */
function notationTrackErrors(record: WorkRecord, measureCount: number): string[] {
  const errors: string[] = [];
  if (!record.tracks.some((track) => track.type === "music_notation")) errors.push("missing music_notation track");
  if (!record.tracks.some((track) => track.type === "movement_notation")) errors.push("missing movement_notation (MvEI Motif) track");
  if (measureCount < 1) errors.push("measureCount must be >= 1");
  return errors;
}

/** Check annex reference compatibility and anchor measure bounds. */
function coTimelineAnnexErrors(record: WorkRecord, annex: CoTimelineMotifLike["musicCoTimeline"], measureCount: number): string[] {
  const errors: string[] = [];
  const musicRef = record.tracks.find((track) => track.type === "music_notation")?.ref;
  if (musicRef && annex?.musicxmlRef && !matchingNotationRefs(musicRef, annex.musicxmlRef)) errors.push(`music_notation ref (${musicRef}) does not align with musicCoTimeline.musicxmlRef (${annex.musicxmlRef})`);
  for (const anchor of annex?.anchors ?? []) if (!validMusicMeasure(anchor.musicMeasure, measureCount)) errors.push(`anchor ${anchor.motifItemId}: musicMeasure ${anchor.musicMeasure} out of range 1..${measureCount}`);
  return errors;
}

/** Treat equal or suffix-equivalent music references as the same linked score. */
function matchingNotationRefs(left: string, right: string): boolean {
  return left === right || left.endsWith(right) || right.endsWith(left);
}

/** Accept omitted anchors and finite, 1-based in-range music measure numbers. */
function validMusicMeasure(value: string | undefined, measureCount: number): boolean {
  if (value == null || value === "") return true;
  const measure = Number(value);
  return Number.isFinite(measure) && measure >= 1 && measure <= measureCount;
}

/** Media track types that analysis plugins must never overwrite. */
export const MEDIA_TRACK_TYPES: ReadonlySet<TrackType> = new Set<TrackType>(["audio", "video", "music_notation", "movement_annotation", "movement_notation", "media_cues"]);

/** Adds or replaces an analysis-only track without touching media tracks. */
export function addAnalysisTrack(record: WorkRecord, track: Track): WorkRecord {
  assertTrack(track);
  if (track.type !== "analysis") throw new Error("analysis endpoint only allows type analysis");
  const existing = record.tracks.find((candidate) => candidate.id === track.id);
  if (existing && existing.type !== "analysis") throw new Error("cannot overwrite media track with analysis");
  return existing
    ? { ...record, tracks: record.tracks.map((candidate) => candidate.id === track.id ? track : candidate) }
    : { ...record, tracks: [...record.tracks, track] };
}
