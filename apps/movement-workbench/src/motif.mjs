/**
 * MvEI Workbench Motif load / emit / item-edit helpers.
 *
 * Why: authoring UI must round-trip the shared Motif shape, not an app-local
 * JSON fork. Parsing and validation belong to @practice-relay/movement.
 *
 * Item ops (add / update / remove / reorder) are immutable pure transforms
 * so emit → shared-schema validate → load stays honest for sketch/partial.
 */
import { parseMovementDocument } from "@practice-relay/movement/browser/parser";

/** @typedef {import("@practice-relay/movement").MotifDocument} MotifDocument */
/** @typedef {import("@practice-relay/movement").MotifItem} MotifItem */

/**
 * Parse and basic-shape-check a Motif document.
 * @param {string | object} jsonStringOrObject
 * @returns {MotifDocument}
 */
export function loadMotif(jsonStringOrObject) {
  const doc = parseMovementDocument(jsonStringOrObject);
  if (doc.profile !== "mvei-motif") {
    throw new Error(`Expected Motif document, got ${JSON.stringify(doc.profile)}`);
  }
  return /** @type {MotifDocument} */ (doc);
}

/**
 * Stable JSON stringify for Motif emit (2-space indent + trailing newline).
 * @param {MotifDocument} doc
 * @returns {string}
 */
export function emitMotif(doc) {
  return `${JSON.stringify(loadMotif(doc), null, 2)}\n`;
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
  return loadMotif(doc);
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
  return loadMotif({
    ...doc,
    items: [...doc.items, nextItem],
  });
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
  return loadMotif({ ...doc, items });
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
  return loadMotif({
    ...doc,
    items: doc.items.filter((i) => i.id !== itemId),
  });
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
  return loadMotif({ ...doc, items });
}
