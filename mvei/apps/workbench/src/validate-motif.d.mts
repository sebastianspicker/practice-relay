/**
 * Type surface for MvEI Workbench shared-schema Motif validator.
 *
 * Why: TypeScript demos need a checked result contract while the browser-ready
 * implementation remains dependency-light plain ESM.
 */

/** Absolute shared-schema path used by the MvEI Workbench validator. */
export const MOTIF_SCHEMA_PATH: string;

/** Validate an unknown document against the shared MvEI Motif schema. */
export function validateMotifAgainstSchema(
  doc: unknown,
): { ok: boolean; message: string };
