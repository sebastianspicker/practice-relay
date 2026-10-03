/** Typed signatures for the shared browser projection implementation. */
import type { MotifDocument, UnvalidatedMotifDocument, LabanSubsetDocument } from "./contracts.mjs";
/** Known losses in the pedagogical Motif mapping. */
export const MOTIF_TO_SUBSET_LOSSINESS: readonly string[];
/** Project Motif with provenance and machine-readable warnings. */
export function motifToLabanSubset(doc: MotifDocument | UnvalidatedMotifDocument): LabanSubsetDocument;
