/** Typed movement helpers and public contracts backed by shared browser transforms. */
import type { MotifSymbolId, MovementTrackKind, MotifCompleteness, MusicCoTimelineAnchor, MusicCoTimeline, MotifDocument, MotifDocumentWithCoTimeline, LabanSubsetDocument } from "#movement-contracts";
export type { MotifSymbolId, MovementTrackKind, MotifCompleteness, MotifAnnotationSystem, MotifTimeAnchor, MotifItem, MotifAnnotationLink, MusicCoTimelineAnchor, MusicCoTimeline, MotifDocument, MotifDocumentWithCoTimeline, UnvalidatedMotifItem, UnvalidatedMotifDocument, LabanStaffColumn, LabanSymbolColumn, LabanSymbolKind, LabanDirection, LabanLevel, LabanSubsetSymbol, LabanSubsetDocument } from "#movement-contracts";
/**
 * @practice-relay/movement - single source of truth for MvEI / annotation schemas.
 *
 * Why: MvEI Workbench and Practice Relay must not fork Motif JSON. All encoding schemas live
 * under ./schemas; this module exports types + helpers for loaders and tests.
 *
 * Honesty: movement_annotation is NOT Labanotation / symbolic MvEI (Q15).
 */

export const PACKAGE = "@practice-relay/movement";
export const SCHEMA_VERSION = "0.2.0";
export const MOTIF_SCHEMA_VERSION = "0.2.0" as const;

import { MOTIF_SYMBOL_IDS } from "#movement-vocabulary";

/** Controlled Motif vocabulary ids derived from the shared browser-readable contract. */
export const MOTIF_SYMBOLS = MOTIF_SYMBOL_IDS;

/** Return whether an input belongs to the controlled Motif vocabulary. */
export function isMotifSymbol(id: string): id is MotifSymbolId {
  return (MOTIF_SYMBOLS as readonly string[]).includes(id);
}

/**
 * True for symbolic MvEI profiles (Motif / Laban subset).
 * False for movement_annotation - Practice Relay must not label that as Labanotation.
 */
export function isSymbolicMvEI(kind: MovementTrackKind): boolean {
  return (
    kind === "mvei-motif" ||
    kind === "mvei-laban" ||
    kind === "mvei-laban-subset"
  );
}

/** True when kind is the non-symbolic annotation peer (Motion Bank dual strategy). */
export function isAnnotationKind(kind: string): boolean {
  return kind === "movement_annotation";
}

/** Create a valid empty Motif document for incremental authoring. */
export function createEmptyMotif(
  id: string,
  title?: string,
  completeness: MotifCompleteness = "sketch",
): MotifDocument {
  const doc: MotifDocument = {
    schemaVersion: MOTIF_SCHEMA_VERSION,
    profile: "mvei-motif",
    id,
    completeness,
    items: [],
  };
  if (title !== undefined) {
    doc.title = title;
  }
  return doc;
}

/** Create a valid empty pedagogical Laban-subset document for authoring. */
export function createEmptyLabanSubset(
  id: string,
  title?: string,
  completeness: MotifCompleteness = "sketch",
): LabanSubsetDocument {
  return {
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id,
    title,
    completeness,
    staff: {
      columns: ["support_left", "support_right", "body"],
    },
    measures: [{ id: "m0", index: 0, beats: 4 }],
    symbols: [],
  };
}

export { MOTIF_TO_SUBSET_LOSSINESS, motifToLabanSubset } from "#movement-transforms";

/** Attach a normalized music co-timeline annex without mutating the source document. */
export function attachMusicCoTimeline(
  doc: MotifDocument,
  annex: Omit<MusicCoTimeline, "schemaVersion"> & {
    schemaVersion?: "0.1.0-annex";
  },
): MotifDocumentWithCoTimeline {
  return {
    ...doc,
    musicCoTimeline: {
      schemaVersion: "0.1.0-annex",
      musicxmlRef: annex.musicxmlRef ?? null,
      meiRef: annex.meiRef ?? null,
      anchors: annex.anchors ?? [],
    },
  };
}

/** Count `<measure …>` elements in MusicXML markup (simple structural check). */
export function countMusicXmlMeasures(musicxml: string): number {
  const matches = musicxml.match(/<measure\b[^>]*>/gi);
  return matches?.length ?? 0;
}

/** Count `<measure …>` elements in MEI markup (simple structural check). */
export function countMeiMeasures(mei: string): number {
  const matches = mei.match(/<measure\b[^>]*>/gi);
  return matches?.length ?? 0;
}

/**
 * Validate co-timeline anchors against a score measure count (1-based measure ids).
 * Does not parse full MusicXML/MEI semantics - measure count only.
 */
export function validateCoTimelineAnchors(
  annex: MusicCoTimeline | undefined | null,
  measureCount: number,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!annex) {
    return { ok: true, errors };
  }
  if (measureCount < 1) {
    errors.push("measureCount must be >= 1");
  }
  errors.push(...invalidCoTimelineAnchorErrors(annex.anchors ?? [], measureCount));
  return { ok: errors.length === 0, errors };
}

/** Return errors for music-measure references outside the supplied score range. */
function invalidCoTimelineAnchorErrors(anchors: MusicCoTimelineAnchor[], measureCount: number): string[] {
  return anchors.flatMap((anchor) => {
    if (anchor.musicMeasure == null || anchor.musicMeasure === "") return [];
    const measure = Number(anchor.musicMeasure);
    if (Number.isFinite(measure) && measure >= 1 && measure <= measureCount) return [];
    return [`anchor ${anchor.motifItemId}: musicMeasure ${anchor.musicMeasure} out of range 1..${measureCount}`];
  });
}
