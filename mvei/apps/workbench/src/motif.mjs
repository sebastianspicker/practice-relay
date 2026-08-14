/**
 * MvEI Workbench Motif load / emit / item-edit helpers.
 *
 * Why: authoring UI must round-trip the shared Motif shape
 * (mvei-motif-stub.schema.json), not an app-local JSON fork.
 * Shape checks here are structural; Ajv validation is validate-motif.mjs.
 *
 * Item ops (add / update / remove / reorder) are immutable pure transforms
 * so emit → shared-schema validate → load stays honest for sketch/partial.
 */
import { loadValidatedDocument } from "./document-validation.mjs";

/** @typedef {{ id: string, symbol: string, order: number, durationHint?: string, timeAnchor?: { tMs?: number, musicMeasure?: string, mediaFragment?: string } }} MotifItem */
/** @typedef {{ schemaVersion: "0.1.0-stub"|"0.2.0", profile: "mvei-motif", id: string, title?: string, completeness: "sketch"|"partial"|"complete", items: MotifItem[], annotationLinks?: Array<{ system?: string, uri?: string }> }} MotifDocument */

const MOTIF_SCHEMA_VERSIONS = new Set(["0.1.0-stub", "0.2.0"]);

/** Validate profile, schema version, and identifier shared by every Motif consumer. */
function validateMotifIdentity(doc) {
  if (doc.profile !== "mvei-motif") {
    throw new Error(`Expected profile "mvei-motif", got ${JSON.stringify(doc.profile)}`);
  }
  if (!MOTIF_SCHEMA_VERSIONS.has(doc.schemaVersion)) {
    throw new Error(
      `Expected schemaVersion 0.1.0-stub|0.2.0, got ${JSON.stringify(doc.schemaVersion)}`,
    );
  }
  if (typeof doc.id !== "string" || doc.id.length === 0) {
    throw new Error("Motif document requires non-empty string id");
  }
  if (!["sketch", "partial", "complete"].includes(doc.completeness)) {
    throw new Error(
      `completeness must be sketch|partial|complete, got ${JSON.stringify(doc.completeness)}`,
    );
  }
}

/** Validate the editable completeness state and item collection. */
function validateMotifContent(doc) {
  if (!['sketch', 'partial', 'complete'].includes(doc.completeness)) {
    throw new Error(`completeness must be sketch|partial|complete, got ${JSON.stringify(doc.completeness)}`);
  }
  if (!Array.isArray(doc.items)) throw new Error("Motif document requires items array");
}

const motifDocumentValidation = {
  objectErrorMessage: "Motif document must be a JSON object",
  validateIdentity: validateMotifIdentity,
  validateRequiredFields: validateMotifContent,
};

/**
 * Parse and basic-shape-check a Motif document.
 * @param {string | object} jsonStringOrObject
 * @returns {MotifDocument}
 */
export function loadMotif(jsonStringOrObject) {
  return /** @type {MotifDocument} */ (
    loadValidatedDocument(jsonStringOrObject, motifDocumentValidation)
  );
}

/**
 * Stable JSON stringify for Motif emit (2-space indent + trailing newline).
 * @param {MotifDocument} doc
 * @returns {string}
 */
export function emitMotif(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Create an empty sketch Motif document.
 * @param {string} id
 * @param {string} [title]
 * @returns {MotifDocument}
 */
export function createSketchMotif(id, title = "") {
  /** @type {MotifDocument} */
  const doc = {
    schemaVersion: "0.2.0",
    profile: "mvei-motif",
    id,
    completeness: "sketch",
    items: [],
    annotationLinks: [],
  };
  if (title) doc.title = title;
  return doc;
}

/**
 * Immutably append an item. Fills `order` from current length when omitted.
 * @param {MotifDocument} doc
 * @param {MotifItem | Omit<MotifItem, "order"> & { order?: number }} item
 * @returns {MotifDocument}
 */
export function addItem(doc, item) {
  const order = typeof item.order === "number" ? item.order : doc.items.length;
  /** @type {MotifItem} */
  const nextItem = {
    id: item.id,
    symbol: item.symbol,
    order,
  };
  if (item.durationHint !== undefined) nextItem.durationHint = item.durationHint;
  if (item.timeAnchor !== undefined) nextItem.timeAnchor = item.timeAnchor;
  return {
    ...doc,
    items: [...doc.items, nextItem],
  };
}

/**
 * Immutably update an item by id. `id` in patch is ignored (identity fixed).
 * @param {MotifDocument} doc
 * @param {string} itemId
 * @param {Partial<Omit<MotifItem, "id">>} patch
 * @returns {MotifDocument}
 */
export function updateItem(doc, itemId, patch) {
  const idx = doc.items.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    throw new Error(`item not found: ${itemId}`);
  }
  const items = doc.items.map((i) => {
    if (i.id !== itemId) return i;
    const next = { ...i, ...patch, id: i.id };
    return next;
  });
  return { ...doc, items };
}

/**
 * Immutably remove an item by id.
 * @param {MotifDocument} doc
 * @param {string} itemId
 * @returns {MotifDocument}
 */
export function removeItem(doc, itemId) {
  if (!doc.items.some((i) => i.id === itemId)) {
    throw new Error(`item not found: ${itemId}`);
  }
  return {
    ...doc,
    items: doc.items.filter((i) => i.id !== itemId),
  };
}

/**
 * Immutably reorder items to match `orderedIds` and reindex `order` 0..n-1.
 * `orderedIds` must be a permutation of current item ids.
 * @param {MotifDocument} doc
 * @param {string[]} orderedIds
 * @returns {MotifDocument}
 */
export function reorderItems(doc, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw new TypeError("orderedIds must be an array");
  }
  if (orderedIds.length !== doc.items.length) {
    throw new Error(
      `orderedIds length ${orderedIds.length} !== items length ${doc.items.length}`,
    );
  }
  const byId = new Map(doc.items.map((i) => [i.id, i]));
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("orderedIds must not contain duplicates");
  }
  const items = orderedIds.map((id, order) => {
    const item = byId.get(id);
    if (!item) {
      throw new Error(`item not found in reorder: ${id}`);
    }
    return { ...item, order };
  });
  return { ...doc, items };
}
