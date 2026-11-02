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
  | "EMPTY_DOCUMENT"
  | "REGION_DROPPED"
  | "MALFORMED_ANNOTATION"
  | "EXTRA_CLIPS_SKIPPED"
  | "WARNINGS_TRUNCATED";

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
  return warning.path !== undefined && warning.path !== ""
    ? `[${warning.code}] ${warning.message} (${warning.path})`
    : `[${warning.code}] ${warning.message}`;
}

/** Most warnings one import reports; input-sized names and node counts must not amplify the response. */
export const MAX_IMPORT_WARNINGS = 200;
const MAX_WARNING_TEXT = 256;

const boundedText = (text: string): string =>
  text.length > MAX_WARNING_TEXT ? `${text.slice(0, MAX_WARNING_TEXT)}…` : text;

/** Append a normalized, length-bounded warning; past the cap, record one truncation notice instead. */
export function pushWarning(
  warnings: ImportWarning[],
  code: ImportWarningCode,
  message: string,
  path?: string,
): void {
  if (warnings.length > MAX_IMPORT_WARNINGS) return;
  if (warnings.length === MAX_IMPORT_WARNINGS) {
    warnings.push({ code: "WARNINGS_TRUNCATED", message: `more than ${MAX_IMPORT_WARNINGS} warnings; the rest were suppressed` });
    return;
  }
  warnings.push(path !== undefined && path !== "" ? { code, message: boundedText(message), path: boundedText(path) } : { code, message: boundedText(message) });
}

/** Create a caller-actionable bounded-input error. */
export function inputLimitError(
  format: "EAF" | "OTIO",
  detail: string,
): Error {
  return new Error(`${format} input exceeds maximum ${detail}`);
}
