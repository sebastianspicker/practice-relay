/**
 * Browser-safe Motif and Laban-subset document parser.
 *
 * The canonical JSON Schemas remain the authority. This module interprets the
 * schema features used by the two browser-facing profiles without filesystem
 * access or a Node-only validator dependency.
 */
import labanSubsetSchema from "../schemas/mvei-laban-subset.schema.json" with { type: "json" };
import motifSchema from "../schemas/mvei-motif.schema.json" with { type: "json" };
import musicCoTimelineAnnexSchema from "../schemas/music-co-timeline-annex.schema.json" with { type: "json" };
import { MOTIF_SYMBOL_IDS } from "../vocabulary/motif-vocabulary.mjs";

export { MOTIF_SYMBOL_IDS };

const schemasByProfile = new Map([
  ["mvei-motif", motifSchema],
  ["mvei-laban-subset", labanSubsetSchema],
]);
const schemasById = new Map([
  [musicCoTimelineAnnexSchema.$id, musicCoTimelineAnnexSchema],
]);

/** Error raised when an input is not one of the canonical browser profiles. */
export class MovementDocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MovementDocumentValidationError";
  }
}

/**
 * Parse and validate a Motif or pedagogical Laban-subset document.
 *
 * The profile selects its canonical schema. Motif item symbols additionally
 * derive from the package's shared browser-readable vocabulary, so a schema
 * and vocabulary update cannot silently leave the Workbench permissive.
 *
 * @param {unknown} input JSON text or an already-decoded JSON value.
 * @returns {object}
 */
export function parseMovementDocument(input) {
  const document = parseInput(input);
  const profile = document.profile;
  const schema = schemasByProfile.get(profile);
  if (!schema) {
    throw new MovementDocumentValidationError(
      `Unsupported movement profile ${JSON.stringify(profile)}`,
    );
  }
  validateAgainstSchema(document, schema, "$", []);
  if (profile === "mvei-motif") validateMotifVocabulary(document);
  return document;
}

function parseInput(input) {
  if (typeof input === "string") {
    try {
      return requireObject(JSON.parse(input), "$", []);
    } catch (error) {
      if (error instanceof MovementDocumentValidationError) throw error;
      throw new MovementDocumentValidationError(
        `Movement document is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return requireObject(input, "$", []);
}

function validateMotifVocabulary(document) {
  const allowed = new Set(MOTIF_SYMBOL_IDS);
  for (const [index, item] of document.items.entries()) {
    if (!allowed.has(item.symbol)) {
      throw new MovementDocumentValidationError(
        `$.items[${index}].symbol must be a shared Motif vocabulary symbol, got ${JSON.stringify(item.symbol)}`,
      );
    }
  }
}

function validateAgainstSchema(value, schema, path, errors) {
  schema = resolveSchema(schema);
  validateType(value, schema.type, path, errors);
  if (errors.length > 0) return throwValidation(errors);
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map(JSON.stringify).join(", ")}`);
  }
  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path} must have at least ${schema.minLength} character(s)`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path} must be at least ${schema.minimum}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`, errors));
  }
  if (isObject(value)) validateObject(value, schema, path, errors);
  if (errors.length > 0) throwValidation(errors);
}

/** Resolve the package's canonical local schema references without Node I/O. */
function resolveSchema(schema) {
  if (typeof schema.$ref !== "string") return schema;
  const referencedSchema = schemasById.get(schema.$ref);
  if (!referencedSchema) {
    throw new MovementDocumentValidationError(`Unsupported schema reference ${JSON.stringify(schema.$ref)}`);
  }
  return referencedSchema;
}

function validateObject(value, schema, path, errors) {
  const properties = schema.properties ?? {};
  for (const required of schema.required ?? []) {
    if (!(required in value)) errors.push(`${path}.${required} is required`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
    }
  }
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (key in value) validateAgainstSchema(value[key], propertySchema, `${path}.${key}`, errors);
  }
}

function validateType(value, type, path, errors) {
  if (type === undefined) return;
  const accepted = Array.isArray(type) ? type : [type];
  if (!accepted.some((candidate) => hasType(value, candidate))) {
    errors.push(`${path} must be ${accepted.join(" or ")}`);
  }
}

function hasType(value, type) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return false;
}

function requireObject(value, path, errors) {
  if (isObject(value)) return value;
  errors.push(`${path} must be an object`);
  throwValidation(errors);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function throwValidation(errors) {
  throw new MovementDocumentValidationError(errors.join("; "));
}
