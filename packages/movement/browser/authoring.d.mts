/** Browser-safe immutable authoring API. */
import type { MotifDocument, MotifItem } from "./contracts.mjs";
export const MAX_MOTIF_BYTES: number;
/** Parse bounded canonical Motif JSON and isolate its data. */
export function loadMotif(input: unknown): MotifDocument;
/** Serialize a valid Motif without dropping permitted fields. */
export function emitMotif(document: MotifDocument): string;
/** Report schema errors without coercing input. */
export function validateMotif(document: unknown): { valid: boolean; errors: string[] };
/** Edit a selected array position while preserving identity. */
export function updateMotifItem(document: MotifDocument, index: number, patch: Partial<MotifItem>): MotifDocument;
/** Append a symbol with a unique identity. */
export function appendMotifItem(document: MotifDocument, id: string): MotifDocument;
/** Remove a selected array position. */
export function removeMotifItem(document: MotifDocument, index: number): MotifDocument;
/** Move a selected item in displayed order. */
export function moveMotifItem(document: MotifDocument, index: number, offset: number): MotifDocument;
/** Parse an optional finite millisecond anchor. */
export function parseTimeAnchor(value: string): number | undefined;
/** Create bounded isolated undo and redo snapshots. */
export function createMotifHistory(initial: MotifDocument, limit?: number): {
  get(): MotifDocument;
  canUndo(): boolean;
  canRedo(): boolean;
  push(next: MotifDocument): MotifDocument;
  undo(): MotifDocument;
  redo(): MotifDocument;
  reset(next: MotifDocument): MotifDocument;
};
