/**
 * Stable diagnostics shared by bounded EAF and OTIO importers.
 * Why: callers need one loss taxonomy regardless of interchange format.
 */

/** Machine-stable warning codes documented in LOSS-TAXONOMY.md. */
export type ImportWarningCode =
  | "UNKNOWN_TIER"
  | "MISSING_MEDIA"
  | "UNSUPPORTED_OTIO_NODE"
  | "EMPTY_ANNOTATION"
  | "ORPHAN_COMMENT"
  | "MARKERS_NOT_IMPORTED"
  | "GAP_SKIPPED"
  | "TRANSITION_SKIPPED"
  | "MISSING_TIME_SLOT"
  | "EMPTY_DOCUMENT";

/** One lossy-import diagnostic with an optional source path. */
export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
  path?: string;
}

/** Extract stable codes for tests and UI summaries. */
export function warningCodes(
  warnings: ImportWarning[],
): ImportWarningCode[] {
  return warnings.map((warning) => warning.code);
}

/** Format one warning for logs without losing its stable code. */
export function formatImportWarning(warning: ImportWarning): string {
  return warning.path
    ? `[${warning.code}] ${warning.message} (${warning.path})`
    : `[${warning.code}] ${warning.message}`;
}

/** Append a normalized warning without emitting an undefined path field. */
export function pushWarning(
  warnings: ImportWarning[],
  code: ImportWarningCode,
  message: string,
  path?: string,
): void {
  warnings.push(path ? { code, message, path } : { code, message });
}

/** Create a caller-actionable bounded-input error. */
export function inputLimitError(
  format: "EAF" | "OTIO",
  detail: string,
): Error {
  return new Error(`${format} input exceeds maximum ${detail}`);
}
