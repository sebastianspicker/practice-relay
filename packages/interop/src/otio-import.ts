/**
 * Bounded OpenTimelineIO importer for Practice Relay tracks and takes.
 * Why: hostile graph traversal and lossy projection stay out of exporters.
 */
import {
  inputLimitError,
  pushWarning,
  type ImportWarning,
} from "./import-warnings.js";

const SUPPORTED_OTIO_SCHEMAS = new Set([
  "Timeline.1",
  "Stack.1",
  "Track.1",
  "Clip.1",
  "Marker.1",
  "TimeRange.1",
  "RationalTime.1",
  "ExternalReference.1",
]);
const MAX_OTIO_DEPTH = 128;
const MAX_OTIO_NODES = 100_000;
const EMPTY_OTIO_DURATION_MS = 0;

/** Track/take projection returned by an OTIO import. */
export interface OtioImportResult {
  takes: Array<{ id: string; label?: string; mediaPath?: string }>;
  tracks: Array<{ id: string; type: string; label?: string; ref?: string }>;
  durationMs: number;
  title?: string;
  workRecordId?: string;
  warnings: ImportWarning[];
}

function collectOtioSchemas(node: unknown, out: Set<string>): void {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: node, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  let nodeCount = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    nodeCount += 1;
    if (nodeCount > MAX_OTIO_NODES) {
      throw inputLimitError("OTIO", `nodes (${MAX_OTIO_NODES})`);
    }
    if (depth > MAX_OTIO_DEPTH) {
      throw inputLimitError("OTIO", `nesting depth (${MAX_OTIO_DEPTH})`);
    }
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) pending.push({ value: item, depth: depth + 1 });
      continue;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.OTIO_SCHEMA === "string") out.add(record.OTIO_SCHEMA);
    for (const child of Object.values(record)) {
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

function rationalTimeDurationMs(
  duration: { value?: unknown; rate?: unknown } | undefined,
): number | undefined {
  const value = duration?.value;
  const rate = duration?.rate;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return undefined;
  }
  const durationMs = (value / rate) * 1000;
  return Number.isFinite(durationMs) && durationMs >= 0
    ? durationMs
    : undefined;
}

/** Import OTIO-like JSON into bounded takes/tracks and stable warnings. */
export function importOtioToRecordParts(
  otioJson: string | object,
): OtioImportResult {
  const warnings: ImportWarning[] = [];
  const document = parseOtioDocument(otioJson);
  const schemas = new Set<string>();
  collectOtioSchemas(document, schemas);
  warnUnsupportedOtioSchemas(schemas, warnings);
  const imported = importOtioTracks(document, warnings);
  addOtioDocumentWarnings(document, imported, warnings);
  const metadata = (document.metadata ?? {}) as Record<string, unknown>;
  return {
    takes: imported.takes,
    tracks: imported.tracks,
    durationMs: imported.durationMs,
    title: typeof document.name === "string" ? document.name : undefined,
    workRecordId:
      typeof metadata.workRecordId === "string"
        ? metadata.workRecordId
        : undefined,
    warnings,
  };
}

/** Parse a JSON string only at the public OTIO import boundary. */
function parseOtioDocument(otioJson: string | object): Record<string, unknown> {
  return typeof otioJson === "string"
    ? (JSON.parse(otioJson) as Record<string, unknown>)
    : (otioJson as Record<string, unknown>);
}

/** Project all OTIO track children while retaining the maximum known duration. */
function importOtioTracks(
  document: Record<string, unknown>,
  warnings: ImportWarning[],
): Pick<OtioImportResult, "takes" | "tracks" | "durationMs"> {
  const container = document.tracks as
    | { children?: Array<Record<string, unknown>> }
    | undefined;
  const tracks: OtioImportResult["tracks"] = [];
  const takes: OtioImportResult["takes"] = [];
  let durationMs = EMPTY_OTIO_DURATION_MS;
  for (const [index, track] of (container?.children ?? []).entries()) {
    const imported = importOtioTrack(track, index, warnings);
    durationMs = Math.max(durationMs, imported.durationMs);
    tracks.push(imported.track);
    if (imported.take) takes.push(imported.take);
  }
  return { tracks, takes, durationMs };
}

/** Add document-level loss warnings after track projection is complete. */
function addOtioDocumentWarnings(
  document: Record<string, unknown>,
  imported: Pick<OtioImportResult, "takes" | "tracks">,
  warnings: ImportWarning[],
): void {
  if (Array.isArray(document.markers) && document.markers.length > 0) {
    pushWarning(warnings, "MARKERS_NOT_IMPORTED", `OTIO markers present (${document.markers.length}) but not imported into regions`);
  }
  if (imported.tracks.length === 0 && imported.takes.length === 0) {
    pushWarning(warnings, "EMPTY_DOCUMENT", "OTIO produced no tracks or takes after import");
  }
}

/** Warn for schema nodes the bounded OTIO projection deliberately does not model. */
function warnUnsupportedOtioSchemas(schemas: Set<string>, warnings: ImportWarning[]): void {
  for (const schema of schemas) {
    if (SUPPORTED_OTIO_SCHEMAS.has(schema) || schema.startsWith("Gap.") || schema.startsWith("Transition.")) continue;
    pushWarning(warnings, "UNSUPPORTED_OTIO_NODE", `unsupported OTIO schema node ignored: ${schema}`, schema);
  }
}

/** Project one OTIO track's first clip, retaining existing loss warnings. */
function importOtioTrack(track: Record<string, unknown>, index: number, warnings: ImportWarning[]) {
  const name = String(track.name ?? `track-${index}`);
  const clip = firstOtioClip(track.children, name, warnings);
  const media = clip?.media_reference as { target_url?: string } | null | undefined;
  const ref = media?.target_url;
  if (clip && (media == null || !ref)) pushWarning(warnings, "MISSING_MEDIA", `missing media on track "${name}" (clip has no target_url)`, name);
  const duration = rationalTimeDurationMs((clip?.source_range as { duration?: { value?: unknown; rate?: unknown } } | undefined)?.duration) ?? EMPTY_OTIO_DURATION_MS;
  return { durationMs: duration, track: { id: `otio-tr-${index}`, type: String(track.kind ?? "video"), label: name, ref }, take: ref ? { id: `otio-take-${index}`, label: name, mediaPath: ref } : undefined };
}

/** Find the first clip and report non-clip timeline nodes skipped by the importer. */
function firstOtioClip(children: unknown, name: string, warnings: ImportWarning[]): Record<string, unknown> | undefined {
  let clip: Record<string, unknown> | undefined;
  for (const child of Array.isArray(children) ? children as Array<Record<string, unknown>> : []) {
    const schema = String(child.OTIO_SCHEMA ?? "");
    if (schema.startsWith("Clip.")) clip ??= child;
    if (schema.startsWith("Gap.")) pushWarning(warnings, "GAP_SKIPPED", `Gap skipped on track "${name}"`, name);
    if (schema.startsWith("Transition.")) pushWarning(warnings, "TRANSITION_SKIPPED", `Transition skipped on track "${name}"`, name);
  }
  return clip;
}
