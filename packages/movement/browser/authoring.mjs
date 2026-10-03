/** Immutable, schema-validated Motif authoring without application or storage dependencies. */
import { parseMovementDocument } from "./parser.mjs";

/** Maximum UTF-8 JSON import size, shared with browser file selection. */
export const MAX_MOTIF_BYTES = 2 * 1024 * 1024;

/** Parse a bounded canonical Motif document and isolate it from the caller. */
export function loadMotif(input) {
  if (typeof input === "string" && new TextEncoder().encode(input).length > MAX_MOTIF_BYTES) {
    throw new Error("Motif files must be 2 MiB or smaller.");
  }
  const parsed = parseMovementDocument(input);
  if (parsed.profile !== "mvei-motif") throw new Error("Only Motif documents are editable here. Open Laban subsets in the standalone workbench.");
  return structuredClone(parsed);
}

/** Serialize only a valid canonical document, preserving permitted extension fields. */
export function emitMotif(document) {
  return `${JSON.stringify(loadMotif(document), null, 2)}\n`;
}

/** Return validation without changing or replacing invalid input. */
export function validateMotif(document) {
  try { loadMotif(document); return { valid: true, errors: [] }; }
  catch (error) { return { valid: false, errors: [error.message] }; }
}

/** Update one item by its array index, preserving identity and nested fields. */
export function updateMotifItem(document, index, patch) {
  if (!document.items[index]) throw new Error("Select an existing Motif item.");
  const items = document.items.map((item, position) => position === index
    ? { ...item, ...patch, id: item.id } : item);
  return loadMotif({ ...document, items });
}

/** Append a new symbol without modifying existing order or metadata. */
export function appendMotifItem(document, id) {
  if (document.items.some((item) => item.id === id)) throw new Error("Item identity already exists.");
  const order = document.items.reduce((max, item) => Math.max(max, item.order + 1), 0);
  return loadMotif({ ...document, items: [...document.items, { id, symbol: "walk", order }] });
}

/** Remove one selected item; all unrelated document fields remain intact. */
export function removeMotifItem(document, index) {
  if (!document.items[index]) throw new Error("Select an existing Motif item.");
  return loadMotif({ ...document, items: document.items.filter((_, position) => position !== index) });
}

/** Move an item in the displayed order and assign consecutive order positions. */
export function moveMotifItem(document, index, offset) {
  const ordered = document.items.map((item, position) => ({ item, position }))
    .sort((a, b) => a.item.order - b.item.order);
  const from = ordered.findIndex((entry) => entry.position === index);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ordered.length) throw new Error("Item cannot move further in that direction.");
  const [selected] = ordered.splice(from, 1);
  ordered.splice(to, 0, selected);
  return loadMotif({ ...document, items: ordered.map(({ item }, order) => ({ ...item, order })) });
}

/** Parse an optional millisecond anchor without coercing empty or invalid text to zero. */
export function parseTimeAnchor(value) {
  const text = String(value).trim();
  if (!text) return undefined;
  if (!/^-?\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) {
    throw new Error("Enter a finite time anchor in milliseconds, or leave it empty.");
  }
  return Number(text);
}

/** Bounded undo history with isolated snapshots; returned values cannot mutate history. */
export function createMotifHistory(initial, limit = 60) {
  let present = loadMotif(initial);
  let past = [];
  let future = [];
  return {
    get: () => structuredClone(present),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    push(next) {
      const validated = loadMotif(next);
      past = [...past, present].slice(-limit);
      present = validated;
      future = [];
      return structuredClone(present);
    },
    undo() {
      if (past.length) { future.push(present); present = past.pop(); }
      return structuredClone(present);
    },
    redo() {
      if (future.length) { past.push(present); present = future.pop(); }
      return structuredClone(present);
    },
    reset(next) {
      present = loadMotif(next);
      past = [];
      future = [];
      return structuredClone(present);
    },
  };
}
