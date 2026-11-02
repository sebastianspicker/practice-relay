/**
 * MvEI Workbench Motif load / emit helpers.
 *
 * Why: authoring UI must round-trip the shared Motif shape, not an app-local
 * JSON fork. Parsing, validation and editing belong to @practice-relay/movement.
 */
export { emitMotif, loadMotif } from "@practice-relay/movement/browser/authoring";
