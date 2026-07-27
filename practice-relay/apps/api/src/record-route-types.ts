/**
 * Parsed generic-record route values shared by record action modules.
 * Why: the path is decoded once before ordered action dispatch.
 */

/** Decoded record id and optional generic-record action segment. */
export type RecordRouteParams = {
  recordId: string;
  action: string | undefined;
};
