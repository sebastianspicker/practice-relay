/** Canonical browser and typed movement document contracts. */
import { MOTIF_SYMBOL_IDS } from "./vocabulary.mjs";

/** Controlled Motif vocabulary identifier. */
export type MotifSymbolId = (typeof MOTIF_SYMBOL_IDS)[number];

/** Discriminator separating annotation and symbolic movement tracks. */
export type MovementTrackKind =
  | "movement_annotation"
  | "mvei-motif"
  | "mvei-laban"
  | "mvei-laban-subset";

/** Declared document completeness, including valid partial scores. */
export type MotifCompleteness = "sketch" | "partial" | "complete";

/** Supported annotation link systems. */
export type MotifAnnotationSystem = "elan" | "motion_bank" | "other";

/** Optional media or music alignment for a Motif item. */
export interface MotifTimeAnchor {
  tMs?: number;
  musicMeasure?: string;
  mediaFragment?: string;
}

/** One ordered symbol in the canonical Motif sequence. */
export interface MotifItem {
  id: string;
  symbol: MotifSymbolId;
  order: number;
  durationHint?: string;
  timeAnchor?: MotifTimeAnchor;
}

/** External annotation reference retained through projections. */
export interface MotifAnnotationLink {
  system?: MotifAnnotationSystem;
  uri?: string;
}

/** Alignment from a Motif item to musical or media time. */
export interface MusicCoTimelineAnchor {
  motifItemId: string;
  musicMeasure?: string;
  tMs?: number;
  mediaFragment?: string;
}

/** Optional music co-timeline annex beside the canonical Motif. */
export interface MusicCoTimeline {
  schemaVersion: "0.1.0-annex";
  musicxmlRef?: string | null;
  meiRef?: string | null;
  anchors?: MusicCoTimelineAnchor[];
}

/** Canonical Motif document accepted by the shared schema. */
export interface MotifDocument {
  schemaVersion: "0.2.0";
  profile: "mvei-motif";
  id: string;
  title?: string;
  completeness: MotifCompleteness;
  items: MotifItem[];
  annotationLinks?: MotifAnnotationLink[];
  musicCoTimeline?: MusicCoTimeline;
}

/** Motif document with an optional music alignment annex. */
export interface MotifDocumentWithCoTimeline extends MotifDocument {
  musicCoTimeline?: MusicCoTimeline;
}

/** Input-only item accepting unknown symbols for best-effort conversion. */
export interface UnvalidatedMotifItem extends Omit<MotifItem, "symbol"> {
  symbol: string;
}

/** Input-only fallback transform shape; not a validated document. */
export interface UnvalidatedMotifDocument extends Omit<MotifDocument, "items"> {
  items: UnvalidatedMotifItem[];
}

/** Supported pedagogical staff column. */
export type LabanStaffColumn =
  | "support_left"
  | "support_right"
  | "leg_left"
  | "leg_right"
  | "body"
  | "arm_left"
  | "arm_right"
  | "head";

/** Staff column occupied by a projected symbol. */
export type LabanSymbolColumn = LabanStaffColumn;

/** Symbol kind in the bounded Laban subset. */
export type LabanSymbolKind =
  | "support"
  | "gesture"
  | "direction"
  | "level"
  | "turn"
  | "stillness"
  | "path";

/** Supported pedagogical direction. */
export type LabanDirection =
  | "place"
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "diagonal_fl"
  | "diagonal_fr"
  | "diagonal_bl"
  | "diagonal_br";

/** Supported vertical level. */
export type LabanLevel = "low" | "middle" | "high";

/** One symbol in the pedagogical Laban subset. */
export interface LabanSubsetSymbol {
  id: string;
  kind: LabanSymbolKind;
  column: LabanSymbolColumn;
  measureId: string;
  direction?: LabanDirection;
  level?: LabanLevel;
  durationBeats?: number;
  /** Optional beat position within the measure (0-based). */
  beatOffset?: number;
  /** Optional group id for multi-column simultaneity (ladder, not full density). */
  simultaneousGroup?: string;
  motifSymbol?: string;
  timeAnchor?: MotifTimeAnchor;
}

/** Pedagogical projection retaining provenance and declared losses. */
export interface LabanSubsetDocument {
  schemaVersion: "0.2.0";
  profile: "mvei-laban-subset";
  id: string;
  title?: string;
  completeness: MotifCompleteness;
  staff?: { columns?: LabanStaffColumn[] };
  measures: { id: string; index: number; beats?: number }[];
  symbols: LabanSubsetSymbol[];
  annotationLinks?: MotifAnnotationLink[];
  musicCoTimeline?: MusicCoTimeline;
  migrationProvenance?: { source?: string; warnings?: string[] };
}
