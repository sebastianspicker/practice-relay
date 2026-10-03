/** Type declarations for packaged examples and profile metadata. */
import type { ParsedMovementDocument } from "./parser.mjs";
export const MOVEMENT_CORPUS: Readonly<{
  motifSketch: ParsedMovementDocument;
  motifPartial: ParsedMovementDocument;
  workbenchDemo: ParsedMovementDocument;
  labanSubset04: ParsedMovementDocument;
}>;

/** One fixture described by the canonical movement corpus catalogue. */
export interface MovementCorpusEntry {
  readonly id: string;
  readonly file: string;
  readonly profile: string;
  readonly completeness: string | null;
  readonly schema: string;
  readonly title: string;
}

/** Package-owned catalogue for every published movement fixture. */
export interface MovementCorpusIndex {
  readonly schemaVersion: string;
  readonly description: string;
  readonly package: string;
  readonly basePath: string;
  readonly fixtures: readonly MovementCorpusEntry[];
}

/** Browser-readable description of one implemented movement profile. */
export interface MovementProfileSummary {
  readonly id: string;
  readonly status: string;
  readonly description: string;
}

/** The packaged corpus catalogue, sourced from fixtures/corpus/index.json. */
export const MOVEMENT_CORPUS_INDEX: MovementCorpusIndex;

/** Browser-readable profile metadata derived from the canonical schemas. */
export const MOVEMENT_PROFILE_SUMMARIES: readonly MovementProfileSummary[];
