/** Type declarations for the browser-safe movement document parser. */

/** JSON object returned after a Motif or Laban-subset document is validated. */
export type ParsedMovementDocument = Record<string, unknown>;

export { MOTIF_SYMBOL_IDS } from "../vocabulary/motif-vocabulary.mjs";

/** Error raised when a document does not satisfy its canonical profile schema. */
export class MovementDocumentValidationError extends Error {}

/** Parse and validate one canonical browser-facing movement document. */
export function parseMovementDocument(input: unknown): ParsedMovementDocument;

