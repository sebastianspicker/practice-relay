/**
 * LabanWriter migration path - intermediate JSON → mvei-laban-subset.
 *
 * Honest limit: proprietary binary .lw is not reverse-engineered here.
 * Users export/transcribe to the open intermediate format documented below.
 */
import type { LabanSubsetDocument } from "@practice-relay/movement-encode";

/** Open intermediate format for LW-derived content. */
export interface LabanWriterIntermediate {
  schemaVersion: "0.2.0-lw-intermediate";
  source: "labanwriter-intermediate";
  id: string;
  title?: string;
  measures: { id: string; index: number; beats?: number }[];
  cells: Array<{
    id: string;
    column:
      | "support_left"
      | "support_right"
      | "leg_left"
      | "leg_right"
      | "body"
      | "arm_left"
      | "arm_right"
      | "head";
    measureId: string;
    symbolHint:
      | "support"
      | "gesture"
      | "direction"
      | "level"
      | "turn"
      | "stillness"
      | "path";
    direction?: string;
    level?: string;
    durationBeats?: number;
    motifHint?: string;
  }>;
  notes?: string[];
}

/** Loss-aware conversion result for one open LabanWriter intermediate document. */
export interface ImportResult {
  document: LabanSubsetDocument;
  warnings: string[];
}

type IntermediateObject = { [key: string]: unknown };

const COLUMNS: ReadonlySet<string> = new Set([
  "support_left",
  "support_right",
  "leg_left",
  "leg_right",
  "body",
  "arm_left",
  "arm_right",
  "head",
]);

const SYMBOL_HINTS: ReadonlySet<string> = new Set([
  "support",
  "gesture",
  "direction",
  "level",
  "turn",
  "stillness",
  "path",
]);

const DIRECTIONS = new Set([
  "place",
  "forward",
  "backward",
  "left",
  "right",
  "diagonal_fl",
  "diagonal_fr",
  "diagonal_bl",
  "diagonal_br",
]);

const LEVELS = new Set(["low", "middle", "high"]);

/** Throw one stable boundary error for malformed open-intermediate input. */
function invalidIntermediate(detail: string): never {
  throw new TypeError(`Invalid LabanWriter intermediate: ${detail}`);
}

/** Require a non-empty identifier or other required string field. */
function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidIntermediate(`${path} must be a non-empty string`);
  }
  return value;
}

/** Require an optional field to be a string when present. */
function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "string") {
    invalidIntermediate(`${path} must be a string when provided`);
  }
}

/** Require a schema-compatible non-negative number. */
function optionalNonNegativeNumber(value: unknown, path: string): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0)
  ) {
    invalidIntermediate(`${path} must be a finite non-negative number when provided`);
  }
}

/** Validate the stable source/version identity of an intermediate document. */
const validateIntermediateIdentity = (value: IntermediateObject): void => {
  if (value.schemaVersion !== "0.2.0-lw-intermediate") {
    invalidIntermediate('schemaVersion must be "0.2.0-lw-intermediate"');
  }
  if (value.source !== "labanwriter-intermediate") {
    invalidIntermediate('source must be "labanwriter-intermediate"');
  }
  requiredString(value.id, "id");
  optionalString(value.title, "title");
};

/** Validate root collections before their items are projected. */
function validateIntermediateCollections(value: IntermediateObject): void {
  if (!Array.isArray(value.measures)) {
    invalidIntermediate("measures must be an array");
  }
  if (!Array.isArray(value.cells)) {
    invalidIntermediate("cells must be an array");
  }
  if (
    value.notes !== undefined &&
    (!Array.isArray(value.notes) || value.notes.some((note) => typeof note !== "string"))
  ) {
    invalidIntermediate("notes must be an array of strings when provided");
  }
}

/** Validate each declared measure against the open-intermediate contract. */
function validateIntermediateMeasures(measures: unknown): void {
  if (!Array.isArray(measures)) return;
  measures.forEach((measure, index) => validateIntermediateMeasure(measure, index));
}

/** Validate one measure while preserving its position in boundary errors. */
function validateIntermediateMeasure(measure: unknown, index: number): void {
  if (measure === null || typeof measure !== "object" || Array.isArray(measure)) {
    invalidIntermediate(`measures[${index}] must be an object`);
  }
  const item = measure as IntermediateObject;
  requiredString(item.id, `measures[${index}].id`);
  if (
    typeof item.index !== "number" ||
    !Number.isSafeInteger(item.index) ||
    item.index < 0
  ) {
    invalidIntermediate(`measures[${index}].index must be a non-negative safe integer`);
  }
  optionalNonNegativeNumber(item.beats, `measures[${index}].beats`);
}

/** Validate each declared cell against supported LabanWriter vocabulary. */
function validateIntermediateCells(cells: unknown): void {
  if (!Array.isArray(cells)) return;
  cells.forEach((cell, index) => validateIntermediateCell(cell, index));
}

/** Validate one cell while preserving its position in boundary errors. */
function validateIntermediateCell(cell: unknown, index: number): void {
  if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
    invalidIntermediate(`cells[${index}] must be an object`);
  }
  const item = cell as IntermediateObject;
  requiredString(item.id, `cells[${index}].id`);
  requiredString(item.measureId, `cells[${index}].measureId`);
  validateVocabulary(item.column, COLUMNS, `cells[${index}].column`);
  validateVocabulary(item.symbolHint, SYMBOL_HINTS, `cells[${index}].symbolHint`);
  validateOptionalVocabulary(item.direction, DIRECTIONS, `cells[${index}].direction`);
  validateOptionalVocabulary(item.level, LEVELS, `cells[${index}].level`);
  optionalNonNegativeNumber(item.durationBeats, `cells[${index}].durationBeats`);
  optionalString(item.motifHint, `cells[${index}].motifHint`);
}

/** Reject required enum-like fields that the importer cannot represent. */
function validateVocabulary(value: unknown, vocabulary: ReadonlySet<string>, path: string): void {
  if (typeof value !== "string" || !vocabulary.has(value)) {
    invalidIntermediate(`${path} is not supported`);
  }
}

/** Reject optional enum-like fields only when they are supplied and unsupported. */
function validateOptionalVocabulary(value: unknown, vocabulary: ReadonlySet<string>, path: string): void {
  if (value !== undefined && (typeof value !== "string" || !vocabulary.has(value))) {
    invalidIntermediate(`${path} is not supported`);
  }
}

/**
 * Map intermediate → laban-subset with warnings for unmapped fields.
 */
export function importLabanWriterIntermediate(
  input: unknown,
): ImportResult {
  const validated = validateIntermediate(input);
  const warnings = importWarnings(validated.notes);
  const measures = importMeasures(validated.measures, warnings);
  const symbols = importSymbols(validated.cells, warnings);
  const document: LabanSubsetDocument = {
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: validated.id,
    title: validated.title,
    completeness: "partial",
    staff: { columns: [...new Set(validated.cells.map((c) => c.column))] },
    measures,
    symbols,
    migrationProvenance: { source: "labanwriter-intermediate", warnings },
  };
  return { document, warnings };
}

/** Initialize loss-aware migration warnings from source notes. */
function importWarnings(notes: string[] | undefined): string[] {
  return [...(notes ?? []), "Imported via open intermediate - not binary .lw parse"];
}

/** Supply the historic default measure only when the source contains no measures. */
function importMeasures(
  measures: LabanWriterIntermediate["measures"],
  warnings: string[],
): LabanWriterIntermediate["measures"] {
  if (measures.length > 0) return measures;
  warnings.push("No measures; inserted default m0");
  return [{ id: "m0", index: 0, beats: 4 }];
}

/** Map source cells and retain warnings for each defaulted direction. */
function importSymbols(
  cells: LabanWriterIntermediate["cells"],
  warnings: string[],
): LabanSubsetDocument["symbols"] {
  return cells.map((c) => {
    if (!c.direction && c.symbolHint !== "stillness") {
      warnings.push(`Cell ${c.id}: missing direction; defaulted to place`);
    }
    return {
      id: c.id,
      kind: c.symbolHint,
      column: c.column,
      measureId: c.measureId,
      direction: c.direction ?? "place",
      level: c.level ?? "middle",
      durationBeats: c.durationBeats ?? 1,
      motifSymbol: c.motifHint,
    };
  });
}

/** Validate shared root fields and collection presence before item validation. */
function validateIntermediateHeader(value: IntermediateObject): void {
  validateIntermediateIdentity(value);
  validateIntermediateCollections(value);
}

/** Validate unknown JSON before mapping it into the shared MvEI target shape. */
function validateIntermediate(input: unknown): LabanWriterIntermediate {
  const value = intermediateObject(input);
  validateIntermediateHeader(value);
  validateIntermediateMeasures(value.measures);
  validateIntermediateCells(value.cells);
  return input as LabanWriterIntermediate;
}

/** Narrow an untrusted intermediate root to an object before reading its fields. */
function intermediateObject(input: unknown): IntermediateObject {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    invalidIntermediate("root must be a non-null JSON object");
  }
  return input as IntermediateObject;
}
