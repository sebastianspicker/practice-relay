/** Browser-safe public entrypoint for movement domain contracts and transforms. */
export * from "../transforms/index.js";
export {
  MovementDocumentValidationError,
  MOVEMENT_CORPUS,
  MOVEMENT_CORPUS_INDEX,
  MOVEMENT_PROFILE_SUMMARIES,
  MOTIF_SYMBOL_IDS,
  parseMovementDocument,
} from "#movement-browser";
