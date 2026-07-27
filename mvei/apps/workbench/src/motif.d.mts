/**
 * Type surface for MvEI Workbench plain-ESM Motif round-trip helpers.
 *
 * Why: executable demos are TypeScript and must consume the same shared MvEI
 * document contract without treating the authoring boundary as `any`.
 */
import type {
  MotifDocument,
  MotifItem,
} from "../../../../packages/movement-encode/src/index.ts";

/** Parse and structurally validate a Motif JSON value. */
export function loadMotif(input: unknown): MotifDocument;

/** Serialize a Motif document using the stable MvEI Workbench wire format. */
export function emitMotif(doc: MotifDocument): string;

/** Create an empty, schema-current Motif sketch. */
export function createSketchMotif(id: string, title?: string): MotifDocument;

/** Append one Motif item without mutating the source document. */
export function addItem(
  doc: MotifDocument,
  item: MotifItem | (Omit<MotifItem, "order"> & { order?: number }),
): MotifDocument;

/** Update one Motif item while preserving its identity. */
export function updateItem(
  doc: MotifDocument,
  itemId: string,
  patch: Partial<Omit<MotifItem, "id">>,
): MotifDocument;

/** Remove one Motif item without mutating the source document. */
export function removeItem(doc: MotifDocument, itemId: string): MotifDocument;

/** Reorder every Motif item from an exact permutation of item identifiers. */
export function reorderItems(
  doc: MotifDocument,
  orderedIds: string[],
): MotifDocument;
