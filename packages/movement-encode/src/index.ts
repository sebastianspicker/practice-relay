/**
 * @practice-relay/movement-encode - single source of truth for MvEI / annotation schemas.
 *
 * Why: MvEI Workbench and Practice Relay must not fork Motif JSON. All encoding schemas live
 * under ./schemas; this module exports types + helpers for loaders and tests.
 *
 * Honesty: movement_annotation is NOT Labanotation / symbolic MvEI (Q15).
 */

export const PACKAGE = "@practice-relay/movement-encode";
export const SCHEMA_VERSION = "0.2.0";
export const MOTIF_SCHEMA_VERSION = "0.2.0" as const;
export const MOTIF_SCHEMA_VERSION_LEGACY = "0.1.0-stub" as const;

import { MOTIF_SYMBOL_IDS } from "../vocab/motif-vocabulary.mjs";

/** Controlled Motif vocabulary ids derived from the shared browser-readable contract. */
export const MOTIF_SYMBOLS = MOTIF_SYMBOL_IDS;

/** Controlled identifier accepted by the Motif vocabulary. */
export type MotifSymbolId = (typeof MOTIF_SYMBOLS)[number];

/** Return whether an input belongs to the controlled Motif vocabulary. */
export function isMotifSymbol(id: string): id is MotifSymbolId {
  return (MOTIF_SYMBOLS as readonly string[]).includes(id);
}

/** Discriminator for track/document kind in dual annotation vs Motif strategy. */
export type MovementTrackKind =
  | "movement_annotation"
  | "mvei-motif"
  | "mvei-laban"
  | "mvei-laban-subset";

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

/**
 * Motif completeness. Incomplete scores (sketch/partial) must remain valid.
 */
export type MotifCompleteness = "sketch" | "partial" | "complete";

/** Optional time/music/media anchor on a Motif item. */
export interface MotifTimeAnchor {
  tMs?: number;
  musicMeasure?: string;
  mediaFragment?: string;
}

/** One Motif symbol cell in sequence order. */
export interface MotifItem {
  id: string;
  symbol: MotifSymbolId | string;
  order: number;
  durationHint?: string;
  timeAnchor?: MotifTimeAnchor;
}

/** Link to annotation culture systems (ELAN / Motion Bank) - dual strategy. */
export interface MotifAnnotationLink {
  system?: "elan" | "motion_bank" | "other";
  uri?: string;
}

/**
 * Music co-timeline annex v0 - places Motif beside MusicXML/MEI, not only under video.
 */
export interface MusicCoTimelineAnchor {
  motifItemId: string;
  musicMeasure?: string;
  tMs?: number;
  mediaFragment?: string;
}

/** Optional musical/media alignment annex kept beside the Motif document core. */
export interface MusicCoTimeline {
  schemaVersion: "0.1.0-annex";
  musicxmlRef?: string | null;
  meiRef?: string | null;
  anchors?: MusicCoTimelineAnchor[];
}

/** Motif document matching mvei-motif schema (0.2.0 preferred). */
export interface MotifDocument {
  schemaVersion: typeof MOTIF_SCHEMA_VERSION | typeof MOTIF_SCHEMA_VERSION_LEGACY;
  profile: "mvei-motif";
  id: string;
  title?: string;
  completeness: MotifCompleteness;
  items: MotifItem[];
  annotationLinks?: MotifAnnotationLink[];
  musicCoTimeline?: MusicCoTimeline;
}

/** Motif document projection that explicitly carries the co-timeline annex. */
export interface MotifDocumentWithCoTimeline extends MotifDocument {
  musicCoTimeline?: MusicCoTimeline;
}

/** Laban subset document (pedagogical; not full density). */
export interface LabanSubsetSymbol {
  id: string;
  kind:
    | "support"
    | "gesture"
    | "direction"
    | "level"
    | "turn"
    | "stillness"
    | "path";
  column: string;
  measureId: string;
  direction?: string;
  level?: string;
  durationBeats?: number;
  /** Optional beat position within the measure (0-based). */
  beatOffset?: number;
  /** Optional group id for multi-column simultaneity (ladder, not full density). */
  simultaneousGroup?: string;
  motifSymbol?: string;
  timeAnchor?: MotifTimeAnchor;
}

/** Pedagogical Laban-subset document, intentionally below full notation density. */
export interface LabanSubsetDocument {
  schemaVersion: "0.2.0";
  profile: "mvei-laban-subset";
  id: string;
  title?: string;
  completeness: MotifCompleteness;
  staff?: { columns?: string[] };
  measures: { id: string; index: number; beats?: number }[];
  symbols: LabanSubsetSymbol[];
  annotationLinks?: MotifAnnotationLink[];
  musicCoTimeline?: MusicCoTimeline;
  migrationProvenance?: { source?: string; warnings?: string[] };
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

/** Documented lossiness of Motif → laban-subset map (literacy ladder). */
export const MOTIF_TO_SUBSET_LOSSINESS = [
  "Effort symbols (effort_strong/light) collapse to level high/low without full Effort graph",
  "Phrase markers become stillness on body column - no phrasing barline model",
  "Locomotion walk/run alternate support columns; travel maps to path (shape still simplified)",
  "No floor plan / stage geography",
  "Multi-limb simultaneity approximated via simultaneousGroup + column; not full Laban staff density",
  "Not professional Labanotation density; not LabanWriter visual parity",
] as const;

function mapMotifSymbol(
  symbol: string,
  options: { supportIndex?: number } = {},
): {
  kind: LabanSubsetSymbol["kind"];
  column: string;
  direction: string;
  level: string;
  warnings: string[];
} {
  const fixed = motifFixedMapping(symbol);
  if (fixed) return fixed;
  if (symbol.startsWith("gesture")) return gestureMotifMapping(symbol);
  if (["jump", "fall", "rise"].includes(symbol)) return levelChangeMotifMapping(symbol);
  if (symbol === "travel") return travelMotifMapping();
  return locomotionMotifMapping(symbol, options.supportIndex);
}

/** Map a gesture token to its pedagogical limb column. */
function gestureMotifMapping(symbol: string): ReturnType<typeof mapMotifSymbol> {
  const warnings: string[] = [];
  return { kind: "gesture", column: symbol.includes("leg") ? "leg_right" : "arm_right", direction: "place", level: "middle", warnings };
}

/** Map vertical-level support tokens and retain their documented loss warning. */
function levelChangeMotifMapping(symbol: string): ReturnType<typeof mapMotifSymbol> {
  return { kind: "support", column: "support_right", direction: "place", level: symbol === "fall" ? "low" : "high", warnings: [`${symbol} → support level change only`] };
}

/** Map travel to the lossy forward path representation. */
function travelMotifMapping(): ReturnType<typeof mapMotifSymbol> {
  return { kind: "path", column: "body", direction: "forward", level: "middle", warnings: ["travel → path/forward (detailed path shape discarded)"] };
}

/** Map walk/run/default tokens while alternating support columns. */
function locomotionMotifMapping(symbol: string, supportIndex = 0): ReturnType<typeof mapMotifSymbol> {
  const supportColumn = supportIndex % 2 === 0 ? "support_right" : "support_left";
  return {
    kind: "support",
    column: supportColumn,
    direction: "forward",
    level: "middle",
    warnings:
      symbol === "run" ? [`${symbol} → support/forward (path discarded)`] : [],
  };
}

/** Map Motif tokens whose result is independent of alternating support state. */
function motifFixedMapping(symbol: string): ReturnType<typeof mapMotifSymbol> | undefined {
  const mappings: Record<string, ReturnType<typeof mapMotifSymbol>> = {
    effort_strong: { kind: "level", column: "body", direction: "place", level: "high", warnings: ["effort_strong → level high (lossy)"] },
    effort_light: { kind: "level", column: "body", direction: "place", level: "low", warnings: ["effort_light → level low (lossy)"] },
    phrase_begin: { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: ["phrase_begin → stillness (no phrasing barline)"] },
    phrase_end: { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: ["phrase_end → stillness (no phrasing barline)"] },
    turn: { kind: "turn", column: "body", direction: "right", level: "middle", warnings: [] },
    twist: { kind: "turn", column: "body", direction: "left", level: "middle", warnings: [] },
    stillness: { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: [] },
    balance: { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: [] },
  };
  return mappings[symbol];
}

/**
 * Best-effort Motif → laban-subset map (literacy ladder; lossy by design).
 * See MOTIF_TO_SUBSET_LOSSINESS and migrationProvenance.warnings.
 *
 * Items that land in the same measure share a `simultaneousGroup` so multi-column
 * reading is possible without claiming professional Laban density.
 */
export function motifToLabanSubset(doc: MotifDocument): LabanSubsetDocument {
  const measureCount = Math.max(1, Math.ceil(doc.items.length / 2));
  const measures = Array.from({ length: measureCount }, (_, index) => ({
    id: `m${index}`,
    index,
    beats: 4,
  }));
  const allWarnings: string[] = [...MOTIF_TO_SUBSET_LOSSINESS];
  let supportIndex = 0;
  const symbols: LabanSubsetSymbol[] = doc.items.map((item, i) => {
    const measureIndex = Math.min(Math.floor(i / 2), measures.length - 1);
    const measureId = measures[measureIndex]!.id;
    const isSupportLike =
      item.symbol === "walk" ||
      item.symbol === "run" ||
      item.symbol === "jump" ||
      item.symbol === "fall" ||
      item.symbol === "rise";
    const mapped = mapMotifSymbol(item.symbol, {
      supportIndex: isSupportLike ? supportIndex++ : undefined,
    });
    allWarnings.push(...mapped.warnings.map((w) => `${item.id}: ${w}`));
    const beatOffset = (i % 2) * 2;
    return {
      id: item.id,
      kind: mapped.kind,
      column: mapped.column,
      measureId,
      direction: mapped.direction,
      level: mapped.level,
      durationBeats: 2,
      beatOffset,
      simultaneousGroup: `g-m${measureIndex}`,
      motifSymbol: item.symbol,
      timeAnchor: item.timeAnchor,
    };
  });
  const columns = [
    ...new Set([
      "support_left",
      "support_right",
      "leg_right",
      "arm_right",
      "body",
      ...symbols.map((s) => s.column),
    ]),
  ];
  return {
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: `${doc.id}-laban-subset`,
    title: doc.title ? `${doc.title} (laban-subset)` : undefined,
    completeness: doc.completeness === "complete" ? "partial" : doc.completeness,
    staff: { columns },
    measures,
    symbols,
    annotationLinks: doc.annotationLinks,
    musicCoTimeline: doc.musicCoTimeline,
    migrationProvenance: {
      source: "motif-map",
      warnings: [...new Set(allWarnings)],
    },
  };
}

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
